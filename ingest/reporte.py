"""Reportes diarios: «Panorama diario de México» y «Panorama geopolítico global».

Se generan en cada corrida de la ingesta (cada hora) a partir de los eventos ya clasificados; el reporte del día
se reescribe hasta que termina el día (hora del centro de México, UTC−6) y luego queda fijo. Por día y tipo:
  reportes/<tipo>/<AAAA-MM-DD>.json   datos del reporte (lo muestra reporte.html)
  reportes/<tipo>/<AAAA-MM-DD>.pdf    el mismo reporte en PDF (si fpdf2 y la fuente DejaVu están disponibles)
  reportes/indice.json                fechas disponibles (se conservan 30 días)

Qué contiene y de dónde sale:
  - Cifras y secciones: conteo por palabras clave (config/reportes.json) sobre título, resumen propio, subtemas y
    actores de cada evento. Tendencia: comparación con el promedio diario de los 7 días anteriores (historial).
  - Texto de panorama por reglas: solo cifras y temas con más actividad; no interpreta.
  - Panorama con IA (ingest/panorama_ia.py), opcional y marcado como hipótesis.
Del contenido de los medios solo se usan título, fuente, fecha y enlace; el resumen de cada evento es propio.
"""
import glob
import json
import os
import re
import urllib.request
from datetime import datetime, timedelta, timezone

from classify import normalizar

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TZ_MX = timezone(timedelta(hours=-6))  # centro de México, sin horario de verano desde 2022
BANXICO_FIX = "https://www.banxico.org.mx/rsscb/rss?BMXC_canal=fix&BMXC_idioma=es"
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
SEV_TXT = {5: "extrema", 4: "alta", 3: "media", 2: "baja", 1: "informativa"}


def cargar_config():
    with open(os.path.join(ROOT, "config", "reportes.json"), encoding="utf-8") as f:
        return json.load(f)


def _fecha(s):
    return datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


def texto_de(e):
    """Título y resumen propio, normalizados (sin acentos ni mayúsculas, con espacios en los extremos).
    Son los únicos campos que también guarda el historial: así hoy y los 7 días anteriores se miden igual."""
    return f" {normalizar(' '.join(p for p in (e.get('titulo'), e.get('resumen')) if p))} "


def coincide(texto, palabra):
    """Palabra completa (o su plural en -s/-es). Las de 6 letras o más también como inicio de palabra
    («desaparecid» → «desaparecidos»), para cubrir género y número sin listar cada forma."""
    p = normalizar(palabra).strip()
    if not p:
        return False
    if f" {p} " in texto or f" {p}s " in texto or f" {p}es " in texto:
        return True
    return len(p) >= 6 and f" {p}" in texto


def en_seccion(e, texto, sec):
    # Por área solo entran notas de medios: las señales de GDELT entran únicamente por palabra clave.
    return (e.get("area_principal") in sec.get("areas", ()) and _es_nota(e)) or any(coincide(texto, p) for p in sec["palabras"])


def _es_nota(e):
    return not str(e.get("fuente", "")).startswith("GDELT")


def util(e):
    """Las publicaciones de redes sociales (Mastodon) solo traen un título genérico: no entran a los reportes."""
    return e.get("tipo_fuente") != "red_social"


def de_mexico(e):
    """Ocurre en México o lo menciona de forma directa."""
    return e.get("pais_iso3") == "MEX" or str(e.get("impacto_mexico") or "").startswith(("Ocurre en México", "Menciona a México"))


def entorno_mexico(e):
    """Hecho en un socio o vecino que, por regla automática, podría afectar a México (no lo menciona)."""
    return bool(e.get("impacto_mexico")) and not de_mexico(e)


def orden_relevancia(e):
    """Primero notas de medios (no las señales automáticas de GDELT), luego severidad, fuentes y fecha."""
    return (_es_nota(e), e.get("severidad", 0), len(e.get("fuentes") or []), e.get("fecha_utc", ""))


def compacto(e):
    return {"id": e["id"], "titulo": e["titulo"], "resumen": e.get("resumen") or "", "fuente": e.get("fuente"), "url": e.get("url"),
            "fecha_utc": e.get("fecha_utc"), "severidad": e.get("severidad"), "pais_iso3": e.get("pais_iso3"),
            "area": e.get("area_principal"), "automatico": not _es_nota(e), "verificado": bool(e.get("verificado")),
            "resumen_ia": e.get("resumen_origen") == "ia"}


def tendencia(hoy, promedio, dias_base):
    if dias_base < 3:
        return "sin base"
    if hoy >= 3 and hoy >= 1.5 * max(promedio, 1):
        return "sube"
    if promedio >= 3 and hoy <= 0.5 * promedio:
        return "baja"
    return "estable"


def leer_historial(carpeta, desde, hasta):
    """Registros compactos del historial (un archivo por día) con fecha en [desde, hasta)."""
    out, dias = [], set()
    for ruta in sorted(glob.glob(os.path.join(carpeta, "*.json"))):
        dia = os.path.basename(ruta)[:10]
        if desde.strftime("%Y-%m-%d") <= dia <= hasta.strftime("%Y-%m-%d"):
            with open(ruta, encoding="utf-8") as f:
                regs = json.load(f)["eventos"]
            dentro = [r for r in regs if desde <= _fecha(r["fecha_utc"]) < hasta]
            out += dentro
            if dentro:
                dias.add(dia)
    return out, len(dias)


def construir(tipo, eventos, base, dias_base, t, cfg, indicadores=None):
    """Reporte de un tipo («mexico» o «global») con los eventos de las últimas `ventana_horas` horas.
    `base` son los registros de los 7 días anteriores (para la tendencia) y `dias_base` cuántos días tienen datos."""
    tcfg = cfg[tipo]
    desde = t - timedelta(hours=cfg["ventana_horas"])
    filtro = de_mexico if tipo == "mexico" else (lambda e: True)
    ventana = [e for e in eventos if util(e) and filtro(e) and _fecha(e["fecha_utc"]) >= desde]
    # La tendencia se mide solo con notas de medios: el historial guarda a lo más 2,000 registros por día y
    # recorta sobre todo señales de GDELT, así que contarlas inflaría la comparación.
    base = [e for e in base if util(e) and filtro(e) and _es_nota(e)]
    textos = {e["id"]: texto_de(e) for e in ventana}
    # Tendencia justa: solo fuentes presentes en los dos periodos (un medio recién agregado no debe contar como «sube»).
    fuentes_comunes = {e.get("fuente") for e in base} & {e.get("fuente") for e in ventana}
    textos_base = [(e, texto_de(e)) for e in base if e.get("fuente") in fuentes_comunes]
    n = cfg["eventos_por_seccion"]
    secciones, usados = [], set()
    for sec in tcfg["secciones"]:
        dentro = sorted((e for e in ventana if en_seccion(e, textos[e["id"]], sec)), key=orden_relevancia, reverse=True)
        prom = sum(1 for e, tx in textos_base if en_seccion(e, tx, sec)) / max(dias_base, 1)
        notas = [e for e in dentro if _es_nota(e)]
        secciones.append({
            "id": sec["id"], "nombre": sec["nombre"], "total": len(dentro), "notas": len(notas),
            "senales_automaticas": len(dentro) - len(notas), "promedio_7d": round(prom, 1),
            "tendencia": tendencia(sum(1 for e in notas if e.get("fuente") in fuentes_comunes), prom, dias_base),
            "alta_severidad": sum(1 for e in dentro if e.get("severidad", 0) >= 4),
            "eventos": [compacto(e) for e in dentro[:n]],
        })
        usados.update(e["id"] for e in dentro[:n])
    destacados = sorted((e for e in ventana if e.get("severidad", 0) >= 4), key=orden_relevancia, reverse=True)[:10]
    por_sev = {str(s): sum(1 for e in ventana if e.get("severidad") == s) for s in range(5, 0, -1)}
    rep = {
        "tipo": tipo, "titulo": tcfg["titulo"], "fecha": t.astimezone(TZ_MX).strftime("%Y-%m-%d"),
        "generado_utc": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "corte_mx": t.astimezone(TZ_MX).strftime("%H:%M"),
        "ventana": {"desde_utc": desde.strftime("%Y-%m-%dT%H:%M:%SZ"), "horas": cfg["ventana_horas"]},
        "cifras": {"total": len(ventana), "notas": sum(1 for e in ventana if _es_nota(e)),
                   "senales_automaticas": sum(1 for e in ventana if not _es_nota(e)), "por_severidad": por_sev,
                   "dias_base": dias_base, "promedio_notas_7d": round(len(base) / max(dias_base, 1), 1)},
        "secciones": secciones,
        "destacados": [compacto(e) for e in destacados],
        "indicadores": indicadores or {},
        "fuentes": _conteo_fuentes(ventana),
        "metodo": ("Conteo por palabras clave sobre título, resumen propio, subtemas y actores (config/reportes.json). "
                   "Las «señales automáticas» son eventos codificados por GDELT a partir de noticias; su texto es una plantilla "
                   "y pueden tener errores de ubicación. La tendencia compara con el promedio diario de los 7 días anteriores."),
    }
    if tipo == "global":
        rep["regiones"] = _por_region(ventana)
    else:
        externos = sorted((e for e in eventos if util(e) and entorno_mexico(e) and _es_nota(e) and _fecha(e["fecha_utc"]) >= desde),
                          key=orden_relevancia, reverse=True)
        rep["entorno"] = {"nombre": "Entorno externo con posible efecto en México", "total": len(externos),
                          "nota": "Hechos en socios o vecinos (EUA, Canadá, China, Centroamérica…) que no mencionan a México; "
                                  "el posible efecto es una regla automática sin verificar.",
                          "eventos": [compacto(e) for e in externos[:n]]}
    rep["panorama_reglas"] = panorama_reglas(rep)
    return rep


def _conteo_fuentes(ventana):
    c = {}
    for e in ventana:
        c[e.get("fuente") or "?"] = c.get(e.get("fuente") or "?", 0) + 1
    return sorted(([k, v] for k, v in c.items()), key=lambda x: -x[1])[:15]


def _por_region(ventana):
    reg = {}
    for e in ventana:
        reg.setdefault(e.get("region") or "sin_region", []).append(e)
    return sorted(({"region": r, "total": len(l), "alta_severidad": sum(1 for e in l if e.get("severidad", 0) >= 4),
                    "eventos": [compacto(e) for e in sorted(l, key=orden_relevancia, reverse=True)[:3]]}
                   for r, l in reg.items()), key=lambda x: -x["total"])


def panorama_reglas(rep):
    """Dos a cuatro frases con cifras; no interpreta causas ni consecuencias."""
    c, ambito = rep["cifras"], "relacionados con México" if rep["tipo"] == "mexico" else "en el mundo"
    alta = int(c["por_severidad"]["5"]) + int(c["por_severidad"]["4"])
    frases = [f"En las últimas {rep['ventana']['horas']} horas se registraron {c['total']} eventos {ambito}: "
              f"{c['notas']} notas de medios y {c['senales_automaticas']} señales automáticas; {alta} de severidad alta o extrema."]
    activas = sorted((s for s in rep["secciones"] if s["total"]), key=lambda s: -s["total"])[:3]
    if activas:
        frases.append("Temas con más actividad: " + "; ".join(f"{s['nombre'].lower()} ({s['total']})" for s in activas) + ".")
    suben = [s["nombre"].lower() for s in rep["secciones"] if s["tendencia"] == "sube"]
    if suben:
        frases.append("Por encima de su promedio de 7 días: " + ", ".join(suben) + ".")
    if c["dias_base"] < 3:
        frases.append("Aún no hay 3 días de historial para comparar tendencias.")
    return " ".join(frases)


# ---------------------------------------------------------------- indicadores (con red)
def banxico_fix(leer=None):
    """Tipo de cambio FIX de Banxico (RSS oficial): {"valor": 18.41, "fecha": "2026-10-09", "fuente", "url"} o None."""
    try:
        if leer is None:
            req = urllib.request.Request(BANXICO_FIX, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                leer = r.read().decode("utf-8", "replace")
        m = re.search(r"MX:\s*([\d.]+)\s*MXN\s*=\s*1\s*USD\s*(\d{4}-\d{2}-\d{2})", leer)
        return {"nombre": "Tipo de cambio FIX (pesos por dólar)", "valor": float(m.group(1)), "fecha": m.group(2),
                "fuente": "Banco de México", "url": "https://www.banxico.org.mx/tipcamb/main.do?page=tip&idioma=sp"} if m else None
    except Exception:  # noqa: BLE001  el reporte sale sin el indicador
        return None


# ---------------------------------------------------------------- archivos
def guardar(salida, rep, pdf_fn=None):
    carpeta = os.path.join(salida, "reportes", rep["tipo"])
    os.makedirs(carpeta, exist_ok=True)
    base = os.path.join(carpeta, rep["fecha"])
    if pdf_fn:
        try:
            pdf_fn(rep, base + ".pdf")
            rep["pdf"] = f"reportes/{rep['tipo']}/{rep['fecha']}.pdf"
        except Exception as e:  # noqa: BLE001  sin PDF el reporte sigue disponible en la web
            rep["pdf_error"] = f"{type(e).__name__}: {e}"[:200]
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=False, separators=(",", ":"))


def leer_previo(salida, tipo, fecha):
    ruta = os.path.join(salida, "reportes", tipo, f"{fecha}.json")
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    return None


def indice_y_limpieza(salida, dias):
    """Borra reportes de más de `dias` días y escribe reportes/indice.json."""
    raiz = os.path.join(salida, "reportes")
    corte = (datetime.now(TZ_MX) - timedelta(days=dias)).strftime("%Y-%m-%d")
    indice = {}
    for tipo in ("mexico", "global"):
        lista = []
        for ruta in sorted(glob.glob(os.path.join(raiz, tipo, "*.json")), reverse=True):
            fecha = os.path.basename(ruta)[:10]
            if fecha < corte:
                os.remove(ruta)
                if os.path.exists(ruta[:-5] + ".pdf"):
                    os.remove(ruta[:-5] + ".pdf")
                continue
            with open(ruta, encoding="utf-8") as f:
                r = json.load(f)
            lista.append({"fecha": fecha, "generado_utc": r["generado_utc"], "total": r["cifras"]["total"],
                          "pdf": r.get("pdf"), "ia": bool(r.get("panorama_ia"))})
        indice[tipo] = lista
    os.makedirs(raiz, exist_ok=True)
    with open(os.path.join(raiz, "indice.json"), "w", encoding="utf-8") as f:
        json.dump({"generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), **indice}, f, ensure_ascii=False, indent=1)
    return indice


def generar(salida, eventos, t, panorama_fn=None, pdf_fn=None, fix_fn=banxico_fix):
    """Punto de entrada desde run.py. `panorama_fn(rep, previo)` devuelve el panorama con IA (o el previo si es reciente)."""
    cfg = cargar_config()
    base, dias_base = leer_historial(os.path.join(salida, "historial"), t - timedelta(days=8), t - timedelta(hours=cfg["ventana_horas"]))
    fix = fix_fn() if fix_fn else None
    hechos = {}
    for tipo in ("mexico", "global"):
        ind = {"fix": fix} if tipo == "mexico" and fix else {}
        rep = construir(tipo, eventos, base, dias_base, t, cfg, ind)
        previo = leer_previo(salida, tipo, rep["fecha"])
        if panorama_fn:
            rep["panorama_ia"] = panorama_fn(rep, previo)
        elif previo and previo.get("panorama_ia"):
            rep["panorama_ia"] = previo["panorama_ia"]
        guardar(salida, rep, pdf_fn)
        hechos[tipo] = {"fecha": rep["fecha"], "total": rep["cifras"]["total"], "pdf": bool(rep.get("pdf")),
                        "ia": bool(rep.get("panorama_ia")), **({"pdf_error": rep["pdf_error"]} if rep.get("pdf_error") else {})}
    indice_y_limpieza(salida, cfg["dias_conservados"])
    return hechos
