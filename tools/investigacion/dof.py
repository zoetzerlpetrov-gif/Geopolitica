#!/usr/bin/env python3
"""Leyes y publicaciones del Diario Oficial de la Federación (DOF), por mes y con historial.

Fuentes (verificadas el 21-oct-2026; el robots.txt de dof.gob.mx permite leerlas):
  - https://dof.gob.mx/sumario.xml: sumario del día (dependencia, descripción y enlace de cada publicación).
  - https://dof.gob.mx/index.php?year=AAAA&month=MM&day=DD: sumario de cualquier día anterior. Se usa para reconstruir
    el historial desde DESDE, como máximo POR_CORRIDA días por corrida y con una pausa entre consultas.

Cada publicación se clasifica por su descripción (decreto, ley o reforma legal, acuerdo, NOM, sentencia, aviso…). Se
guarda: fecha, código del DOF, tipo, dependencia (si el sumario la trae) y la descripción oficial (texto del Estado,
no protegido por derecho de autor), recortada.

Salidas:
  vivos/dof.json          historial completo por día (lo usa la siguiente corrida)
  vivos/dof_resumen.json  lo que carga la página: conteo por mes y tipo, leyes y reformas de todo el historial y las
                          publicaciones de los últimos 31 días
"""
import html
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

SUMARIO = "https://dof.gob.mx/sumario.xml"
DIA = "https://dof.gob.mx/index.php?year={a}&month={m:02d}&day={d:02d}"
NOTA = "https://dof.gob.mx/nota_detalle.php?codigo={c}&fecha={f}"
OUT = os.path.join(ROOT, "vivos", "dof.json")
RESUMEN = os.path.join(ROOT, "vivos", "dof_resumen.json")
DESDE = date(2025, 1, 1)
POR_CORRIDA = 30
PAUSA_S = 1.5
MAX_TEXTO = 300

# (tipo, expresión sobre la descripción en minúsculas). Gana la primera.
TIPOS = [
    ("Ley o reforma legal", r"se expide(n)? la ley|se expide el c[oó]digo|ley de ingresos|presupuesto de egresos|se reforma(n)?,? .{0,200}\b(ley|c[oó]digo|constituci[oó]n)\b|"
     r"se adiciona(n)?,? .{0,200}\b(ley|c[oó]digo|constituci[oó]n)\b|se deroga(n)?,? .{0,200}\b(ley|c[oó]digo)\b|se abroga"),
    ("Decreto", r"^decreto"),
    ("Norma Oficial Mexicana", r"norma oficial mexicana|\bnom-\d|proyecto de norma"),
    ("Indicador financiero", r"tipo de cambio|tasas? de inter[eé]s|valor (de la )?(unidad de inversi[oó]n|udi)|[ií]ndice nacional de precios|costo porcentual"),
    ("Sentencia o resolución judicial", r"sentencia|controversia constitucional|acci[oó]n de inconstitucionalidad|tribunal|jurisprudencia"),
    ("Reglamento, lineamientos o reglas", r"^reglamento|lineamientos|reglas de operaci[oó]n|^reglas|manual|^programa"),
    ("Acuerdo", r"^acuerdo"),
    ("Convenio", r"^convenio"),
    ("Aviso, convocatoria o edicto", r"^aviso|convocatoria|edicto|licitaci[oó]n|^resoluci[oó]n"),
]
_RX = [(t, re.compile(rx)) for t, rx in TIPOS]


def tipo_de(texto):
    t = texto.lower().strip()
    return next((tipo for tipo, rx in _RX if rx.search(t)), "Otro")


def limpiar(t):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t or ""))).strip()


def leer_sumario(xml_texto):
    """sumario.xml → {fecha ISO: [[código, tipo, dependencia, texto]]}."""
    out = {}
    for it in re.findall(r"<item>(.*?)</item>", xml_texto, re.S):
        enlace = re.search(r"codigo=(\d+)&(?:amp;)?fecha=(\d{2})/(\d{2})/(\d{4})", it)
        desc = re.search(r"<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</description>", it, re.S)
        tit = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", it, re.S)
        if not enlace or not desc:
            continue
        cod, d, m, a = enlace.groups()
        texto = limpiar(desc.group(1))
        out.setdefault(f"{a}-{m}-{d}", []).append([cod, tipo_de(texto), limpiar(tit.group(1)) if tit else "", texto[:MAX_TEXTO]])
    return out


def leer_dia(html_texto):
    """Página de un día del DOF → [[código, tipo, «», texto]] (sin repetir códigos; se queda el texto más largo)."""
    por = {}
    for cod, fecha, texto in re.findall(r'nota_detalle\.php\?codigo=(\d+)&(?:amp;)?fecha=(\d{2}/\d{2}/\d{4})[^>]*>(.*?)</a>', html_texto, re.S):
        t = limpiar(texto)
        if len(t) >= 15 and len(t) > len(por.get(cod, "")):
            por[cod] = t
    return [[c, tipo_de(t), "", t[:MAX_TEXTO]] for c, t in por.items()]


def faltantes(dias, hoy, desde=DESDE, n=POR_CORRIDA):
    """Días hábiles sin datos, del más reciente al más antiguo (el DOF no publica en fin de semana, salvo ediciones extra)."""
    out, d = [], hoy - timedelta(days=1)
    while d >= desde and len(out) < n:
        if d.weekday() < 5 and d.isoformat() not in dias:
            out.append(d)
        d -= timedelta(days=1)
    return out


def resumen(dias, hoy):
    """Conteo por mes y tipo, leyes y reformas de todo el historial y las publicaciones de los últimos 31 días."""
    por_mes, leyes, recientes = {}, [], []
    limite = (hoy - timedelta(days=31)).isoformat()
    for f in sorted(dias):
        mes = f[:7]
        for cod, tipo, dep, texto in dias[f]:
            por_mes.setdefault(mes, {}).setdefault(tipo, 0)
            por_mes[mes][tipo] += 1
            fila = {"f": f, "c": cod, "t": tipo, "d": dep, "x": texto, "u": NOTA.format(c=cod, f=f"{f[8:10]}/{f[5:7]}/{f[:4]}")}
            if tipo in ("Ley o reforma legal", "Decreto"):
                leyes.append(fila)
            if f >= limite:
                recientes.append(fila)
    return {"por_mes": por_mes, "leyes": leyes[::-1], "recientes": recientes[::-1]}


def main():
    ahora = datetime.now(timezone.utc)
    hoy = ahora.date()
    previo = {}
    if os.path.exists(OUT):
        try:
            previo = json.load(open(OUT, encoding="utf-8"))
        except ValueError:
            pass
    dias, errores = previo.get("dias", {}), []
    if not F.permitido_por_robots(SUMARIO):
        print("dof: el robots.txt no permite leer el DOF; se conserva lo anterior")
        return 0
    try:
        for f, items in leer_sumario(F.get(SUMARIO, timeout=40).decode("latin-1")).items():
            dias[f] = items
    except Exception as e:  # noqa: BLE001
        errores.append(f"sumario: {e}"[:160])
    # Historial: una vez por hora como máximo.
    if ahora.timestamp() - previo.get("marca_historial", 0) >= 3300:
        for d in faltantes(dias, hoy):
            try:
                items = leer_dia(F.get(DIA.format(a=d.year, m=d.month, d=d.day), timeout=40).decode("latin-1", "replace"))
                dias[d.isoformat()] = items  # lista vacía = día sin edición (no se vuelve a pedir)
            except Exception as e:  # noqa: BLE001
                errores.append(f"{d}: {e}"[:120])
            time.sleep(PAUSA_S)
        previo["marca_historial"] = ahora.timestamp()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "marca_historial": previo.get("marca_historial", 0), "dias": dias},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    r = resumen(dias, hoy)
    json.dump({"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "desde": min(dias) if dias else None, "dias_con_datos": len(dias),
               "fuente": "Diario Oficial de la Federación (dof.gob.mx)", "errores": errores[:10], **r},
              open(RESUMEN, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"dof: {len(dias)} días ({min(dias) if dias else '—'} a {max(dias) if dias else '—'}); {len(r['leyes'])} leyes, reformas y decretos; errores: {errores[:3]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
