#!/usr/bin/env python3
"""Contraste de fuentes (Monitor México): lo que reporta cada institución sobre el mismo tema, lado a lado.

1. Comercio exterior (UN Comtrade, API pública sin llave, 1 mes por consulta; con COMTRADE_API_KEY, si existe, igual):
   lo que México reporta a la ONU por país socio. Para el capítulo 27 (petróleo y combustibles) se separa
   Estados Unidos, países identificados y destinos SIN PAÍS («áreas no especificadas», zonas francas, categorías
   especiales: config/comtrade_socios.json) y se compara el total con Banxico (vivos/monitor_mx.json: exportaciones
   totales y petroleras del mismo mes).
2. Seguridad (SESNSP, víctimas del fuero común 2015 a hoy, archivos de datos abiertos): totales nacionales por
   categoría. Para ver si una baja es real o un cambio de categoría se compara cada delito con sus «vecinos»
   (homicidio doloso frente a feminicidio, homicidio culposo y «otros delitos que atentan contra la vida»): si uno
   baja y el vecino sube en el mismo periodo, se marca «posible reclasificación» (señal para revisar, no prueba).
   El año en curso se compara con los mismos meses del año anterior.
Salida: vivos/contraste_mx.json (comercio cada 7 días, seguridad cada 3; si una parte falla se conserva la anterior).
"""
import csv
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "crimen"))
OUT = os.path.join(ROOT, "vivos", "contraste_mx.json")
MONITOR = os.path.join(ROOT, "vivos", "monitor_mx.json")
SOCIOS = json.load(open(os.path.join(ROOT, "config", "comtrade_socios.json"), encoding="utf-8"))
AGENTE = "DOMINUS-OSINT contraste (github.com/zoetzerlpetrov-gif/Geopolitica)"
COMTRADE = "https://comtradeapi.un.org/{ruta}/C/M/HS?reporterCode=484&flowCode={flujo}&cmdCode={cmd}&period={per}{extra}"
MESES_COMERCIO = 18
PAUSA = 6  # la API pública sin llave responde 429 si se le pide rápido
MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]


def norm(t):
    return unicodedata.normalize("NFD", str(t or "")).encode("ascii", "ignore").decode().lower().strip()


# ------------------------------------------------------------------ 1. comercio
def pedir_json(url, pedir=None):
    if pedir:
        return pedir(url)
    llave = os.environ.get("COMTRADE_API_KEY", "").strip()
    h = {"User-Agent": AGENTE}
    if llave:
        h["Ocp-Apim-Subscription-Key"] = llave
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=90) as r:
        return json.loads(r.read())


def url_comtrade(flujo, cmd, per, extra=""):
    ruta = "data/v1/get" if os.environ.get("COMTRADE_API_KEY", "").strip() else "public/v1/preview"
    return COMTRADE.format(ruta=ruta, flujo=flujo, cmd=cmd, per=per, extra=extra)


def resumen_petroleo(filas):
    """Filas de Comtrade (capítulo 27, todos los socios, un mes) → reparto en millones de USD."""
    total, eua, sin_pais, cuba, otros = 0.0, 0.0, 0.0, 0.0, {}
    detalle_sin = {}
    for f in filas:
        if f.get("motCode") not in (0, None) or f.get("customsCode") not in ("C00", None) or f.get("partner2Code") not in (0, None):
            continue
        c, v = str(f.get("partnerCode")), float(f.get("primaryValue") or 0) / 1e6
        if c == "0":
            total = v
        elif c == "842":
            eua += v
        elif c in SOCIOS["sin_pais"]:
            sin_pais += v
            detalle_sin[SOCIOS["sin_pais"][c]] = round(detalle_sin.get(SOCIOS["sin_pais"][c], 0) + v, 2)
        else:
            if c == "192":
                cuba = v
            otros[c] = otros.get(c, 0) + v
    identificados = sum(otros.values())
    total = total or (eua + sin_pais + identificados)
    top = sorted(otros.items(), key=lambda x: -x[1])[:8]
    return {"total": round(total, 2), "eua": round(eua, 2), "paises_identificados": round(identificados, 2), "sin_pais": round(sin_pais, 2),
            "sin_pais_pct": round(sin_pais / total * 100, 1) if total else None, "cuba": round(cuba, 3), "detalle_sin_pais": detalle_sin,
            "principales": [{"iso3": SOCIOS["iso3"].get(c, ""), "nombre": SOCIOS["nombres"].get(c, c), "musd": round(v, 2)} for c, v in top]}


def meses_atras(hoy, n):
    a, m = hoy.year, hoy.month
    out = []
    for _ in range(n):
        m -= 1
        if not m:
            a, m = a - 1, 12
        out.append(f"{a}{m:02d}")
    return out


def banxico_mes(monitor, id_serie, mes):
    """Valor de una serie de vivos/monitor_mx.json para «AAAA-MM» (millones de USD) o None."""
    for i in (monitor or {}).get("indicadores", []):
        if i.get("id") == id_serie:
            return next((v for p, v in i.get("serie", []) if p == mes), None)
    return None


def comercio(previo, ahora, pedir=None, dormir=time.sleep):
    meses = dict((previo or {}).get("meses") or {})
    errores = []
    pendientes = [p for p in meses_atras(ahora.date(), MESES_COMERCIO) if p not in meses or p >= meses_atras(ahora.date(), 5)[-1]]
    for per in pendientes:
        try:
            pet = pedir_json(url_comtrade("X", "27", per), pedir)
            tot = pedir_json(url_comtrade("X", "TOTAL", per, "&partnerCode=0"), pedir)
            if pet.get("error") or tot.get("error"):
                raise RuntimeError(pet.get("error") or tot.get("error"))
            if not pet.get("data"):
                continue  # México aún no reporta ese mes
            r = resumen_petroleo(pet["data"])
            r["exportaciones_totales"] = round(sum(float(f.get("primaryValue") or 0) for f in tot.get("data", [])
                                                   if str(f.get("partnerCode")) == "0" and f.get("motCode") in (0, None) and f.get("customsCode") in ("C00", None)) / 1e6, 2)
            meses[per] = r
        except Exception as e:  # noqa: BLE001  un mes con error no detiene a los demás
            errores.append(f"{per}: {type(e).__name__}")
        dormir(PAUSA)
    try:
        monitor = json.load(open(MONITOR, encoding="utf-8"))
    except (OSError, ValueError):
        monitor = None
    for per, r in meses.items():
        mes = f"{per[:4]}-{per[4:]}"
        r["banxico_petroleras"] = banxico_mes(monitor, "SE32150", mes)
        r["banxico_totales"] = banxico_mes(monitor, "SE36593", mes)
    return {"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": "UN Comtrade (lo que México reporta a la ONU) y Banxico (SIE)",
            "meses": dict(sorted(meses.items())), "errores": errores}


# ------------------------------------------------------------------ 2. seguridad
# Familias para ver reclasificaciones: (clave, nombre, expresión sobre «tipo subtipo modalidad» normalizado)
CATEGORIAS = [
    ("homicidio_doloso", "Homicidio doloso", r"homicidio doloso"),
    ("feminicidio", "Feminicidio", r"feminicidio"),
    ("homicidio_culposo", "Homicidio culposo", r"homicidio culposo"),
    ("otros_vida", "Otros delitos que atentan contra la vida y la integridad corporal", r"otros delitos que atentan contra la vida"),
    ("lesiones_dolosas", "Lesiones dolosas", r"lesiones dolosas"),
    ("secuestro", "Secuestro", r"\bsecuestro\b"),
    ("extorsion", "Extorsión", r"\bextorsion\b"),
    ("trata", "Trata de personas", r"trata de personas"),
    ("trafico_menores", "Tráfico de menores", r"trafico de menores"),
    ("rapto", "Rapto", r"\brapto\b"),
]
VECINOS = {"homicidio_doloso": ["homicidio_culposo", "otros_vida", "feminicidio"], "feminicidio": ["homicidio_doloso", "otros_vida"],
           "otros_vida": ["homicidio_doloso", "feminicidio", "homicidio_culposo"],
           "secuestro": ["extorsion", "rapto", "trafico_menores"], "lesiones_dolosas": ["otros_vida"]}


def categoria(fila):
    t = norm(" ".join(str(fila.get(k, "")) for k in ("Tipo de delito", "Subtipo de delito", "Modalidad")))
    return next((k for k, _, rx in CATEGORIAS if re.search(rx, t)), None)


def acumular(filas, destino):
    """Suma nacional por categoría, año y mes: destino[cat][año] = [12 valores]."""
    for f in filas:
        cat = categoria(f)
        if not cat:
            continue
        anio = str(f.get("Año") or f.get("Ano") or f.get("AÑO") or "").strip()
        if not anio.isdigit():
            continue
        fila = destino.setdefault(cat, {}).setdefault(anio, [0] * 12)
        for i, mes in enumerate(MESES):
            v = str(f.get(mes) or f.get(mes.upper()) or "").strip()
            if re.fullmatch(r"\d+(\.0+)?", v):
                fila[i] += int(float(v))
    return destino


def comparar(series, ultimo_mes):
    """Totales por año (el año en curso solo hasta `ultimo_mes`, igual que el anterior) y señales de reclasificación."""
    anios = sorted({a for c in series.values() for a in c})
    if not anios:
        return {}, []
    actual = anios[-1]
    tot = {c: {a: sum(v) for a, v in s.items() if a != actual} for c, s in series.items()}
    # Mismo periodo: enero a `ultimo_mes` del año en curso y del anterior.
    periodo = {c: {a: sum(s.get(a, [0] * 12)[:ultimo_mes]) for a in anios[-2:]} for c, s in series.items()}
    senales = []
    for c, vecinos in VECINOS.items():
        p = periodo.get(c, {})
        if len(p) < 2 or not p.get(anios[-2]):
            continue
        cambio = (p[actual] - p[anios[-2]]) / p[anios[-2]] * 100
        if cambio > -5:
            continue
        for v in vecinos:
            q = periodo.get(v, {})
            if q.get(anios[-2]) and (q[actual] - q[anios[-2]]) / q[anios[-2]] * 100 >= 5:
                senales.append({"baja": c, "sube": v, "cambio_baja_pct": round(cambio, 1),
                                "cambio_sube_pct": round((q[actual] - q[anios[-2]]) / q[anios[-2]] * 100, 1),
                                "periodo": f"enero a {MESES[ultimo_mes - 1].lower()} {actual} vs {anios[-2]}",
                                "absorbe_pct": round(min(100, (q[actual] - q[anios[-2]]) / max(1, p[anios[-2]] - p[actual]) * 100), 0)})
    senales += tendencias(tot)
    return {"anuales": tot, "mismo_periodo": periodo, "anio_actual": actual, "ultimo_mes": ultimo_mes}, senales


VERSION_SEGURIDAD = 2  # subir al cambiar el cálculo: la siguiente corrida rehace la parte de seguridad
BASE_TENDENCIA = "2019"  # último año completo antes de la pandemia y del cambio de gobierno de 2018-2019


def tendencias(anuales):
    """Señales de varios años: del año base al último año completo, una categoría baja ≥10 % y su vecina sube ≥10 %."""
    out = []
    for c, vecinos in VECINOS.items():
        serie = anuales.get(c, {})
        if BASE_TENDENCIA not in serie or not serie[BASE_TENDENCIA]:
            continue
        fin = max(serie)
        cambio = (serie[fin] - serie[BASE_TENDENCIA]) / serie[BASE_TENDENCIA] * 100
        if cambio > -10:
            continue
        for v in vecinos:
            q = anuales.get(v, {})
            if q.get(BASE_TENDENCIA) and fin in q and (q[fin] - q[BASE_TENDENCIA]) / q[BASE_TENDENCIA] * 100 >= 10:
                out.append({"baja": c, "sube": v, "cambio_baja_pct": round(cambio, 1), "cambio_sube_pct": round((q[fin] - q[BASE_TENDENCIA]) / q[BASE_TENDENCIA] * 100, 1),
                            "periodo": f"{BASE_TENDENCIA} a {fin} (años completos)", "tipo": "tendencia",
                            "absorbe_pct": round(min(100, (q[fin] - q[BASE_TENDENCIA]) / max(1, serie[BASE_TENDENCIA] - serie[fin]) * 100), 0)})
    return out


def leer_csv_zip(datos):
    z = zipfile.ZipFile(io.BytesIO(datos))
    nombre = next(n for n in z.namelist() if n.lower().endswith(".csv"))
    crudo = z.read(nombre)
    try:
        texto = crudo.decode("utf-8-sig")
    except UnicodeDecodeError:
        texto = crudo.decode("latin-1")
    return csv.DictReader(io.StringIO(texto))


def enlaces_victimas(html):
    """Enlaces de víctimas, nivel estatal: el histórico (2015 - AAAA) y el del año en curso."""
    limpio = html.replace("&nbsp;", " ").replace("&uacute;", "u").replace("&oacute;", "o").replace("&iacute;", "i")
    out = []
    for m in re.finditer(r'<a[^>]+href="(https://[^"]*sharepoint\.com/[^"]+)"[^>]*>(.*?)</a>', limpio, re.S):
        t = norm(re.sub(r"<[^>]+>|\s+", " ", m.group(2)))
        if "victimas" in t and "estatal" in t and "tablero" not in t and "fuero comun" in t:
            out.append((m.group(1).replace("&amp;", "&"), re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", m.group(2))).strip()))
    return out


def seguridad(descargar=None, html=None):
    import sesnsp as S
    descargar = descargar or S.descargar
    if html is None:
        html = urllib.request.urlopen(urllib.request.Request(S.PAGINA, headers={"User-Agent": S.UA}), timeout=60).read().decode("utf-8", "replace")
    enlaces = enlaces_victimas(html)
    series, archivos, ultimo_mes, errores = {}, [], 12, []
    for url, nombre in enlaces:
        if not (re.search(r"\b20\d\d\s*-\s*20\d\d\b", nombre) or "enero" in norm(nombre)):
            continue  # solo el histórico reciente (2015 - …) y el año en curso
        if re.search(r"\b(19\d\d|201[0-4])\s*-", nombre):
            continue
        try:
            datos = descargar(url)
            if datos[:2] != b"PK":
                raise ValueError("la descarga no es un ZIP")
            acumular(leer_csv_zip(datos), series)
            archivos.append(nombre)
            if "enero" in norm(nombre):
                ultimo_mes = S.meses_publicados(nombre) or ultimo_mes
        except Exception as e:  # noqa: BLE001
            errores.append(f"{nombre}: {type(e).__name__}")
    datos, senales = comparar(series, ultimo_mes)
    return {"fuente": "SESNSP, víctimas del fuero común (datos abiertos)", "pagina": S.PAGINA, "archivos": archivos,
            "categorias": {k: n for k, n, _ in CATEGORIAS}, **datos, "senales": senales, "errores": errores}


# ------------------------------------------------------------------
def vigente(parte, horas, ahora):
    try:
        return ahora - datetime.strptime(parte["generado_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=horas)
    except (KeyError, TypeError, ValueError):
        return False


def main(ahora=None):
    ahora = ahora or datetime.now(timezone.utc)
    try:
        previo = json.load(open(OUT, encoding="utf-8"))
    except (OSError, ValueError):
        previo = {}
    out = dict(previo)
    horas_comercio = 20 if (previo.get("comercio") or {}).get("errores") else 24 * 7  # meses pendientes: reintento diario
    if not vigente(previo.get("comercio"), horas_comercio, ahora):
        try:
            out["comercio"] = comercio(previo.get("comercio"), ahora)
        except Exception as e:  # noqa: BLE001
            print(f"contraste: comercio falló ({type(e).__name__}); se conserva el anterior")
    if not vigente(previo.get("seguridad"), 24 * 3, ahora) or (previo.get("seguridad") or {}).get("version") != VERSION_SEGURIDAD:
        try:
            s = seguridad()
            if s.get("anuales"):
                out["seguridad"] = {"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "version": VERSION_SEGURIDAD, **s}
            else:
                print("contraste: seguridad sin datos; se conserva el anterior. " + "; ".join(s.get("errores", [])[:3]))
        except Exception as e:  # noqa: BLE001
            print(f"contraste: seguridad falló ({type(e).__name__}); se conserva el anterior")
    out["generado_utc"] = ahora.strftime("%Y-%m-%dT%H:%M:%SZ")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    c, s = out.get("comercio") or {}, out.get("seguridad") or {}
    print(f"contraste: comercio {len(c.get('meses', {}))} meses; seguridad {len(s.get('anuales', {}))} categorías, {len(s.get('senales', []))} señales")
    return 0


if __name__ == "__main__":
    sys.exit(main())
