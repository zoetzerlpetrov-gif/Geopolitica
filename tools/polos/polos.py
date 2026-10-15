#!/usr/bin/env python3
"""Polos: Antártida, Groenlandia y Ártico.

Fuentes (todas permiten el acceso automático en su robots.txt o no publican uno; se cita cada una en la ficha):
  · Extensión del hielo marino (Ártico y Antártico): promedio mensual de NOAA NCEI (datos del Sea Ice Index de NSIDC),
    con su anomalía frente a 1991-2020. Los archivos diarios de NSIDC piden no ser rastreados (robots.txt), por eso se usa
    el resumen mensual de NCEI, que sí lo permite.
  · Agujero de ozono antártico: NASA Ozone Watch (área diaria en millones de km² y la climatología 1979-2025).
  · Groenlandia: balance de masa superficial diario y acumulado, y área con deshielo, del modelo del DMI que publica
    Polar Portal (download.dmi.dk; el sitio polarportal.dk pide no ser rastreado, por eso se lee solo el archivo de datos).
  · Icebergs antárticos de más de 10 millas náuticas: lista semanal del U.S. National Ice Center (USNIC).
  · Bases científicas polares (al sur de 60° S y al norte de 66° N): Wikidata (CC0), una vez por semana.
  · Sitios estratégicos de Groenlandia (bases, puertos, yacimientos): coordenadas de Wikidata; descripción propia.
  · Óvalo de aurora: modelo OVATION de NOAA SWPC (probabilidad de ver aurora en los próximos ~30-90 min).
Cada parte tiene su propio ritmo; si una fuente falla, se conserva su dato anterior.
Salidas: vivos/polos_indicadores.json, vivos/icebergs.geojson, vivos/polos_sitios.geojson, vivos/aurora_ovation.geojson.
"""
import csv
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

VIVOS = os.path.join(ROOT, "vivos")
OUT_IND = os.path.join(VIVOS, "polos_indicadores.json")
OUT_ICE = os.path.join(VIVOS, "icebergs.geojson")
OUT_SIT = os.path.join(VIVOS, "polos_sitios.geojson")
OUT_AUR = os.path.join(VIVOS, "aurora_ovation.geojson")

OZONO = "https://ozonewatch.gsfc.nasa.gov/meteorology/figures/ozone/to3areas_{anio}_toms+omi+omps.txt"
DMI_SMB = "https://download.dmi.dk/Research_Projects/polarportal/PP_GSMB/GSMB.txt"
DMI_MELT = "https://download.dmi.dk/Research_Projects/polarportal/PP_GSMB/GSMB_MELTA.txt"
USNIC = "https://usicecenter.gov/File/DownloadCurrent?pId=134"
NCEI = "https://www.ncei.noaa.gov/access/monitoring/snow-and-ice-extent/sea-ice/{h}/{m}.csv"
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
OVATION = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json"
ENTIDAD = "https://www.wikidata.org/wiki/Special:EntityData/{q}.json"
SPARQL = "https://query.wikidata.org/sparql?"

H = 3600
CADA = {"hielo": 24 * H, "ozono": 6 * H, "groenlandia": 6 * H, "icebergs": 24 * H, "sitios": 7 * 24 * H, "aurora": 30 * 60}

# Sitios estratégicos de Groenlandia: QID de Wikidata (coordenadas) y descripción propia.
GROENLANDIA = [
    ("Q131520504", "Base Espacial Pituffik (antes Thule)", "base", "Base de EUA: radar de alerta temprana de misiles y vigilancia espacial. Es la instalación militar de EUA más al norte."),
    ("Q2512856", "Camp Century", "base", "Base de EUA construida bajo el hielo (1959-1967). Quedaron enterrados residuos que, según un estudio de 2016, el deshielo podría exponer hacia finales de este siglo."),
    ("Q631430", "Aeropuerto de Kangerlussuaq", "aeropuerto", "Antigua base aérea de EUA (Sondrestrom, cerrada en 1992); principal aeropuerto civil de Groenlandia durante décadas."),
    ("Q2915005", "Aeropuerto de Narsarsuaq", "aeropuerto", "Antigua base de EUA de la Segunda Guerra Mundial (Bluie West One)."),
    ("Q226", "Nuuk", "capital", "Capital de Groenlandia, territorio autónomo del Reino de Dinamarca (Ley de Autogobierno de 2009)."),
    ("Q3398532", "Puerto de Nuuk", "puerto", "Puerto principal del país; la pesca es la mayor exportación de Groenlandia."),
    ("Q2907386", "Kvanefjeld (Kuannersuit)", "mineria", "Yacimiento de tierras raras y uranio. El proyecto quedó detenido por la ley groenlandesa de 2021 que prohíbe extraer uranio."),
    ("Q85752568", "Fiordo Citronen", "mineria", "Zona del yacimiento de zinc y plomo de Citronen, en el extremo norte de la isla."),
    ("Q828071", "Fiordo helado de Ilulissat", "glaciar", "Patrimonio Mundial. Lo alimenta el glaciar Sermeq Kujalleq (Jakobshavn), uno de los que más hielo vierten al mar en el hemisferio norte."),
]

Q_ESTACIONES = """
SELECT ?x ?xEs ?xEn ?coord ?paisEs ?paisEn ?inicio WHERE {
  ?x wdt:P31 wd:Q749622 ; wdt:P625 ?coord .
  FILTER NOT EXISTS { ?x wdt:P576 ?fin }
  OPTIONAL { ?x rdfs:label ?xEs FILTER(lang(?xEs) = "es") }
  OPTIONAL { ?x rdfs:label ?xEn FILTER(lang(?xEn) = "en") }
  OPTIONAL { ?x wdt:P17 ?pais . OPTIONAL { ?pais rdfs:label ?paisEs FILTER(lang(?paisEs) = "es") } OPTIONAL { ?pais rdfs:label ?paisEn FILTER(lang(?paisEn) = "en") } }
  OPTIONAL { ?x wdt:P571 ?inicio }
}"""


def iso(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def bajar(url, timeout=60, accept=None, robots=True):
    """GET respetando robots.txt. Las API oficiales de Wikidata (SPARQL y datos de entidades) se usan con User-Agent
    identificado según su política de uso, igual que en tools/capas y tools/entidades: su robots.txt es para rastreadores de páginas."""
    if robots and not F.permitido_por_robots(url):
        raise PermissionError(f"robots.txt no permite {url}")
    req = urllib.request.Request(url, headers={"User-Agent": F.UA, **({"Accept": accept} if accept else {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def leer_json(ruta, defecto):
    try:
        return json.load(open(ruta, encoding="utf-8"))
    except (OSError, ValueError):
        return defecto


def guardar(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    json.dump(datos, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


# ---------- Hielo marino ----------

def hielo_de(texto, mes):
    """CSV mensual de NCEI («Date,Value,Anomaly» por año) → último año con dato, anomalía, lugar entre los más bajos y serie."""
    media, filas = None, []
    for linea in texto.splitlines():
        if linea.startswith("1991-2020 Mean,"):
            media = float(linea.split(",")[1])
        m = re.match(r"(\d{4}),(-?[\d.]+),(-?[\d.]+)", linea.strip())
        if m and float(m.group(2)) > -9000:
            filas.append([int(m.group(1)), float(m.group(2)), float(m.group(3))])
    if not filas:
        raise ValueError("el archivo de hielo marino no trae datos")
    anio, valor, anom = filas[-1]
    orden = sorted(filas, key=lambda f: f[1])
    minimo = orden[0]
    return {"mes": MESES[mes - 1], "anio": anio, "valor": valor, "anomalia": anom, "media_1991_2020": media,
            "lugar_mas_bajo": [f[0] for f in orden].index(anio) + 1, "anios": len(filas), "record_minimo": [minimo[0], minimo[1]],
            "serie": [[f[0], f[1]] for f in filas], "unidad": "millones de km²"}


def hielo(ahora, bajar_=None):
    """Mes más reciente con dato (el anterior al actual; si aún no se publica, el de dos meses atrás) en ambos hemisferios."""
    bajar_ = bajar_ or (lambda u: bajar(u).decode("utf-8", "replace"))
    out = {}
    for h, nombre in (("N", "artico"), ("S", "antartico")):
        for atras in (1, 2):
            m = (ahora.month - atras - 1) % 12 + 1
            anio_esperado = ahora.year if ahora.month - atras >= 1 else ahora.year - 1
            d = hielo_de(bajar_(NCEI.format(h=h, m=m)), m)
            if d["anio"] == anio_esperado:
                break
        out[nombre] = {**d, "url": f"https://www.ncei.noaa.gov/access/monitoring/snow-and-ice-extent/sea-ice/{h}/{m}"}
    out["fuente"] = "NOAA NCEI con datos del Sea Ice Index (NSIDC)"
    return out


# ---------- Ozono ----------

def ozono_de(texto):
    """Archivo de Ozone Watch → {fecha, area, media, p10, p90, maximo_anio, fecha_maximo, serie: [[fecha, área, media, p10, p90]]}."""
    serie = []
    for linea in texto.splitlines():
        m = re.match(r"(\d{4}-\d{2}-\d{2})\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)", linea)
        if not m:
            continue
        d, dato, _mn, p10, _p30, media, _p70, p90, _mx = m.groups()
        serie.append([d, float(dato), float(media), float(p10), float(p90)])
    validos = [s for s in serie if s[1] > -9000]
    if not validos:
        raise ValueError("el archivo de ozono no trae datos")
    ult = validos[-1]
    mx = max(validos, key=lambda s: s[1])
    # Serie corta para la gráfica: de julio a diciembre (temporada del agujero), incluido lo que falta del año (solo la media).
    temporada = [[s[0], s[1] if s[1] > -9000 else None, s[2], s[3], s[4]] for s in serie if s[0][5:7] >= "07"]
    return {"fecha": ult[0], "area": ult[1], "media": ult[2], "p10": ult[3], "p90": ult[4], "maximo_anio": mx[1], "fecha_maximo": mx[0],
            "serie": temporada, "unidad": "millones de km²", "climatologia": "1979-2025",
            "fuente": "NASA Ozone Watch (TOMS, OMI y OMPS)", "url": "https://ozonewatch.gsfc.nasa.gov/meteorology/SH.html"}


# ---------- Groenlandia ----------

def tabla_dmi(texto):
    """Filas «AAAAMMDD  valor  valor» del DMI → [[AAAA-MM-DD, v1, v2…]]."""
    out = []
    for linea in texto.splitlines():
        m = re.match(r"\s*(\d{8})\s+(.*)$", linea)
        if not m:
            continue
        try:
            vals = [float(x) for x in m.group(2).replace("%", " ").split()]
        except ValueError:
            continue
        d = m.group(1)
        out.append([f"{d[:4]}-{d[4:6]}-{d[6:]}", *vals])
    return out


def groenlandia_de(smb_txt, melt_txt=""):
    smb = tabla_dmi(smb_txt)
    if not smb:
        raise ValueError("el archivo de balance de masa no trae datos")
    ult = smb[-1]
    out = {"fecha": ult[0], "smb_dia_gt": ult[1], "smb_acum_gt": ult[2] if len(ult) > 2 else None,
           "serie": [[r[0], r[1], r[2] if len(r) > 2 else None] for r in smb[-120:]],
           "fuente": "DMI / Polar Portal (modelo HARMONIE-AROME y modelo de balance de masa)", "url": "https://polarportal.dk/en/greenland/surface-conditions/"}
    melt = tabla_dmi(melt_txt) if melt_txt else []
    # GSMB_MELTA trae dos bloques seguidos; se usa el primero (las fechas vuelven a empezar donde inicia el segundo).
    for i in range(1, len(melt)):
        if melt[i][0] <= melt[i - 1][0]:
            melt = melt[:i]
            break
    if melt:
        out["deshielo_fecha"], out["deshielo_pct"] = melt[-1][0], melt[-1][1]
        out["deshielo_serie"] = [[r[0], r[1]] for r in melt[-120:]]
    return out


# ---------- Icebergs ----------

def icebergs_de(texto):
    """CSV semanal del USNIC → GeoJSON de puntos con nombre, largo, ancho y área."""
    feats = []
    for r in csv.DictReader(io.StringIO(texto.lstrip("﻿"))):
        try:
            lat, lon = float(r["Latitude"]), float(r["Longitude"])
            largo_km, ancho_km = float(r["Length (NM)"]) * 1.852, float(r["Width (NM)"]) * 1.852
            area = float(r.get("Area (sqKM)") or 0)
        except (KeyError, ValueError):
            continue
        m = re.match(r"(\d{2})/(\d{2})/(\d{4})", r.get("Last Update") or "")
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
                      "properties": {"id": r["Iceberg"], "nombre": r["Iceberg"], "largo_km": round(largo_km, 1), "ancho_km": round(ancho_km, 1),
                                     "area_km2": round(area), "actualizado": f"{m.group(3)}-{m.group(1)}-{m.group(2)}" if m else ""}})
    return feats


# ---------- Bases y sitios ----------

def estaciones_de(res):
    """SPARQL → estaciones científicas al sur de 60° S o al norte de 66° N (una por QID)."""
    out = {}
    for f in res["results"]["bindings"]:
        q = f["x"]["value"].rsplit("/", 1)[-1]
        m = re.match(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)", f["coord"]["value"])
        if not m or q in out:
            continue
        lon, lat = float(m.group(1)), float(m.group(2))
        if -60 <= lat <= 66:
            continue
        nombre = (f.get("xEs") or f.get("xEn") or {}).get("value", "")
        if not nombre or re.fullmatch(r"Q\d+", nombre):
            continue
        pais = (f.get("paisEs") or f.get("paisEn") or {}).get("value", "")
        inicio = (f.get("inicio") or {}).get("value", "")[:4]
        out[q] = {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]},
                  "properties": {"id": f"wd:{q}", "kind": "base", "nombre": nombre, "pais": pais, "desde": inicio.lstrip("+"),
                                 "region": "Antártida" if lat < -60 else "Ártico", "url": f"https://www.wikidata.org/wiki/{q}"}}
    return list(out.values())


def coord_entidad(datos, q):
    try:
        v = datos["entities"][q]["claims"]["P625"][0]["mainsnak"]["datavalue"]["value"]
        return round(v["longitude"], 4), round(v["latitude"], 4)
    except (KeyError, IndexError, TypeError):
        return None


def sitios(previo, consultar_sparql=None, entidad=None):
    """Bases (SPARQL) + sitios de Groenlandia (EntityData). Si una parte falla, se conservan sus objetos anteriores."""
    consultar_sparql = consultar_sparql or (lambda q: json.loads(bajar(SPARQL + urllib.parse.urlencode({"query": q, "format": "json"}), 120, "application/sparql-results+json", robots=False)))
    entidad = entidad or (lambda q: json.loads(bajar(ENTIDAD.format(q=q), 40, robots=False)))
    anteriores = previo.get("features", [])
    estado = {}
    try:
        bases = estaciones_de(consultar_sparql(Q_ESTACIONES))
        if len(bases) < 20:
            raise ValueError(f"solo {len(bases)} bases")
        estado["bases"] = len(bases)
    except Exception as e:  # noqa: BLE001
        bases = [f for f in anteriores if f["properties"].get("kind") == "base"]
        estado["bases"] = f"error: {e}"[:120]
    previos_gl = {f["properties"]["id"]: f for f in anteriores if f["properties"].get("kind") != "base"}
    gl = []
    for q, nombre, tipo, nota in GROENLANDIA:
        try:
            c = coord_entidad(entidad(q), q)
            if not c:
                raise ValueError("sin coordenada")
            gl.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": list(c)},
                       "properties": {"id": f"wd:{q}", "kind": tipo, "nombre": nombre, "nota": nota, "region": "Groenlandia", "url": f"https://www.wikidata.org/wiki/{q}"}})
        except Exception:  # noqa: BLE001
            if f"wd:{q}" in previos_gl:
                gl.append(previos_gl[f"wd:{q}"])
        time.sleep(0.5)
    estado["groenlandia"] = len(gl)
    return bases + gl, estado


# ---------- Aurora ----------

def aurora_de(d, minimo=10):
    """OVATION ([lon 0-359, lat, %]) → puntos con probabilidad ≥ mínimo, longitudes en −180…180."""
    feats = []
    for lon, lat, p in d.get("coordinates", []):
        if p >= minimo:
            feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon - 360 if lon > 180 else lon, lat]}, "properties": {"p": p}})
    return {"type": "FeatureCollection", "observado_utc": d.get("Observation Time"), "pronostico_utc": d.get("Forecast Time"),
            "fuente": "NOAA SWPC, modelo OVATION", "features": feats}


def toca(estado, parte, t):
    ultima = estado.get(parte, {}).get("t")
    return ultima is None or t - ultima >= CADA[parte]


def main():
    t = int(time.time())
    ind = leer_json(OUT_IND, {})
    ritmo = ind.get("_ritmo", {})
    resumen = {}

    if toca(ritmo, "hielo", t):
        try:
            ind["hielo"] = hielo(datetime.now(timezone.utc))
            ritmo["hielo"] = {"t": t, "ok": True}
        except Exception as e:  # noqa: BLE001
            ritmo["hielo"] = {"t": t, "ok": False, "error": str(e)[:150]}
        resumen["hielo"] = ritmo["hielo"]

    if toca(ritmo, "ozono", t):
        try:
            anio = datetime.now(timezone.utc).year
            ind["ozono"] = ozono_de(bajar(OZONO.format(anio=anio)).decode("utf-8", "replace"))
            ritmo["ozono"] = {"t": t, "ok": True}
        except Exception as e:  # noqa: BLE001
            ritmo["ozono"] = {"t": t, "ok": False, "error": str(e)[:150]}
        resumen["ozono"] = ritmo["ozono"]

    if toca(ritmo, "groenlandia", t):
        try:
            melt = ""
            try:
                melt = bajar(DMI_MELT).decode("utf-8", "replace")
            except Exception as e:  # noqa: BLE001
                print(f"deshielo de Groenlandia: {e}")
            ind["groenlandia"] = groenlandia_de(bajar(DMI_SMB).decode("utf-8", "replace"), melt)
            ritmo["groenlandia"] = {"t": t, "ok": True}
        except Exception as e:  # noqa: BLE001
            ritmo["groenlandia"] = {"t": t, "ok": False, "error": str(e)[:150]}
        resumen["groenlandia"] = ritmo["groenlandia"]

    if toca(ritmo, "icebergs", t):
        try:
            feats = icebergs_de(bajar(USNIC).decode("utf-8", "replace"))
            if not feats:
                raise ValueError("lista vacía")
            guardar(OUT_ICE, {"type": "FeatureCollection", "generado_utc": iso(t), "fuente": "U.S. National Ice Center", "features": feats})
            ritmo["icebergs"] = {"t": t, "ok": True, "n": len(feats)}
        except Exception as e:  # noqa: BLE001
            ritmo["icebergs"] = {"t": t, "ok": False, "error": str(e)[:150]}
        resumen["icebergs"] = ritmo["icebergs"]

    if toca(ritmo, "sitios", t):
        feats, estado = sitios(leer_json(OUT_SIT, {}))
        if feats:
            guardar(OUT_SIT, {"type": "FeatureCollection", "generado_utc": iso(t), "estado": estado, "features": feats})
        # Si las bases fallaron, se reintenta en 1 h en vez de una semana.
        ritmo["sitios"] = {"t": t if isinstance(estado.get("bases"), int) else t - CADA["sitios"] + H, "estado": estado}
        resumen["sitios"] = estado

    if toca(ritmo, "aurora", t):
        try:
            guardar(OUT_AUR, aurora_de(json.loads(bajar(OVATION))))
            ritmo["aurora"] = {"t": t, "ok": True}
        except Exception as e:  # noqa: BLE001
            ritmo["aurora"] = {"t": t, "ok": False, "error": str(e)[:150]}
        resumen["aurora"] = ritmo["aurora"]

    ind["_ritmo"] = ritmo
    ind["generado_utc"] = iso(t)
    guardar(OUT_IND, ind)
    print(f"polos: {resumen or 'nada que actualizar en esta corrida'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
