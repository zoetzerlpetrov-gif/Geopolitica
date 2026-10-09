#!/usr/bin/env python3
"""Construye las capas estáticas en PMTiles (Fase C1 y C5).

Para cada familia habilitada en config/capas.json:
  1. descarga la fuente (solo las de licencia verificada),
  2. la normaliza a GeoJSON por líneas con propiedades mínimas,
  3. asigna el zoom mínimo por subtipo (tippecanoe: {"minzoom": z}),
  4. la convierte a vector tiles con tippecanoe en data/capas/<familia>.pmtiles.

Propiedades por objeto (cortas a propósito, para que los mosaicos pesen poco):
  id  identificador estable (p. ej. "osm:n123", "ourairports:MMMX")
  n   nombre                st  subtipo (id de config/entities.json)
  p   país ISO3 o ""        x   dato extra según la familia (IATA, MW, tamaño, tipo…)

Uso:  python3 tools/capas/construir.py [familia ...]      (requiere tippecanoe en el PATH)
Diseñado para GitHub Actions: cada familia está aislada; si una falla, las demás se construyen.
"""
import csv
import io
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Salida en capas/ (no en data/): el workflow la publica en la rama huérfana "datos-capas", que se
# reescribe en cada reconstrucción, y Pages la copia a data/capas/. Así los binarios no inflan main.
SALIDA = os.path.join(ROOT, "capas")
TMP = os.environ.get("RUNNER_TEMP", "/tmp")
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
# Instancias públicas de Overpass (se prueban en orden; cada una tiene sus propios límites de uso).
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter"]
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"


def get(url, data=None, timeout=300, intentos=3):
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if i == intentos - 1:
                raise
            print(f"   reintento {i + 1} ({e})")
            time.sleep(10 * (i + 1))


ZOOM_MAX_PUNTOS = 8   # mosaicos hasta z8; arriba MapLibre amplía (overzoom) sin descargar más
ZOOM_MAX_AREAS = 6


def feat(geom, props, minzoom):
    """El zoom mínimo real va en la propiedad "z" (la GPU filtra con ella). En el mosaico se acota a
    ZOOM_MAX_PUNTOS para que objetos de zoom 9-11 (aeródromos, helipuertos) existan en los mosaicos z8."""
    return {"type": "Feature", "geometry": geom, "properties": {**props, "z": int(minzoom)},
            "tippecanoe": {"minzoom": min(int(minzoom), ZOOM_MAX_PUNTOS)}}


def punto(lon, lat):
    return {"type": "Point", "coordinates": [round(float(lon), 5), round(float(lat), 5)]}


# ------------------------------------------------------------ país por coordenada (punto en polígono)
class Paises:
    def __init__(self):
        with open(os.path.join(ROOT, "data", "base", "countries.geojson"), encoding="utf-8") as f:
            fc = json.load(f)
        self.pol = []
        for ft in fc["features"]:
            g = ft["geometry"]
            polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
            for p in polys:
                anillo = p[0]
                xs, ys = [c[0] for c in anillo], [c[1] for c in anillo]
                self.pol.append((min(xs), min(ys), max(xs), max(ys), anillo, ft["properties"]["iso3"]))

    @staticmethod
    def _dentro(x, y, anillo):
        dentro = False
        j = len(anillo) - 1
        for i in range(len(anillo)):
            xi, yi = anillo[i]
            xj, yj = anillo[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                dentro = not dentro
            j = i
        return dentro

    def de(self, lon, lat):
        for x0, y0, x1, y1, anillo, iso in self.pol:
            for x in (lon, lon + 360):
                if x0 <= x <= x1 and y0 <= lat <= y1 and self._dentro(x, lat, anillo):
                    return iso
        return ""


ISO2_3 = None


def iso3(iso2):
    global ISO2_3
    if ISO2_3 is None:
        gaz = json.load(open(os.path.join(ROOT, "config", "gazetteer.json"), encoding="utf-8"))
        ISO2_3 = gaz.get("iso2_a_iso3", {})
    return ISO2_3.get((iso2 or "").upper(), "")


# ------------------------------------------------------------ familias
def pr_(props, clave):
    """Lee una propiedad sin importar mayúsculas (Natural Earth usa NAME_ES en unos archivos y name_es en otros)."""
    return props.get(clave) or props.get(clave.upper()) or ""


def zonas():
    out = []
    marinas = {"ocean": ("oceanos", 0), "sea": ("mares", 2), "gulf": ("golfos_bahias", 3), "bay": ("golfos_bahias", 3),
               "strait": ("estrechos", 3), "channel": ("estrechos", 3), "sound": ("estrechos", 4), "lagoon": ("lagos", 4)}
    fc = json.loads(get(NE + "ne_10m_geography_marine_polys.geojson"))
    for i, f in enumerate(fc["features"]):
        pr = f["properties"]
        st, z = marinas.get(pr_(pr, "featurecla").lower(), ("mares", 3))
        out.append(feat(f["geometry"], {"id": f"ne:mar{i}", "n": pr_(pr, "name_es") or pr_(pr, "name"), "st": st, "p": ""}, z))
    terrestres = {"desert": ("desiertos", 2), "range/mtn": ("cordilleras", 2), "peninsula": ("peninsulas", 3), "pen/cape": ("peninsulas", 3)}
    fc = json.loads(get(NE + "ne_50m_geography_regions_polys.geojson"))
    for i, f in enumerate(fc["features"]):
        pr = f["properties"]
        if pr_(pr, "featurecla").lower() in ("continent", "island group"):
            continue  # polígonos enormes: su etiqueta se repetiría en cada mosaico
        st, z = terrestres.get(pr_(pr, "featurecla").lower(), ("regiones", 3))
        out.append(feat(f["geometry"], {"id": f"ne:reg{i}", "n": pr_(pr, "name_es") or pr_(pr, "name"), "st": st, "p": ""}, z))
    fc = json.loads(get(NE + "ne_50m_lakes.geojson"))
    for i, f in enumerate(fc["features"]):
        pr = f["properties"]
        out.append(feat(f["geometry"], {"id": f"ne:lago{i}", "n": pr_(pr, "name_es") or pr_(pr, "name"), "st": "lagos", "p": ""}, 4))
    fc = json.loads(get(NE + "ne_50m_rivers_lake_centerlines.geojson"))
    for i, f in enumerate(fc["features"]):
        pr = f["properties"]
        out.append(feat(f["geometry"], {"id": f"ne:rio{i}", "n": pr_(pr, "name_es") or pr_(pr, "name"), "st": "rios", "p": ""}, 4))
    return out


def aeropuertos():
    tipos = {"large_airport": ("aeropuerto_internacional", 3), "medium_airport": ("aeropuerto_regional", 6),
             "small_airport": ("aerodromo", 9), "heliport": ("helipuerto", 11)}
    texto = get("https://davidmegginson.github.io/ourairports-data/airports.csv").decode("utf-8")
    out = []
    for r in csv.DictReader(io.StringIO(texto)):
        if r["type"] not in tipos:
            continue
        st, z = tipos[r["type"]]
        out.append(feat(punto(r["longitude_deg"], r["latitude_deg"]),
                        {"id": f"ourairports:{r['ident']}", "n": r["name"], "st": st, "p": iso3(r["iso_country"]), "x": r.get("iata_code") or ""}, z))
    return out


def puertos():
    texto = get("https://msi.nga.mil/api/publications/download?type=view&key=16920959/SFH00000/UpdatedPub150.csv").decode("utf-8-sig")
    filas = list(csv.DictReader(io.StringIO(texto)))
    cols = {k.lower(): k for k in filas[0]}
    col = lambda *op: next((cols[c] for c in cols if all(o in c for o in op)), None)  # noqa: E731
    c_nom, c_tam, c_lat, c_lon = col("main port name") or col("port name"), col("harbor size"), col("latitude"), col("longitude")
    c_pais = col("country code") or col("country")
    tam = {"l": ("puerto_grande", 2), "large": ("puerto_grande", 2), "m": ("puerto_mediano", 5), "medium": ("puerto_mediano", 5)}
    pa = Paises()
    out = []
    for r in filas:
        try:
            lat, lon = float(r[c_lat]), float(r[c_lon])
        except (TypeError, ValueError):
            continue
        st, z = tam.get((r.get(c_tam) or "").strip().lower(), ("puerto_pequeno", 8))
        out.append(feat(punto(lon, lat), {"id": f"wpi:{len(out)}", "n": (r.get(c_nom) or "").title(), "st": st, "p": pa.de(lon, lat), "x": r.get(c_pais) or ""}, z))
    return out


def centrales():
    combustibles = {"solar": "solar", "hydro": "hidro", "wind": "eolica", "gas": "gas", "coal": "carbon", "oil": "petroleo",
                    "petcoke": "petroleo", "biomass": "biomasa", "waste": "residuos", "nuclear": "nuclear",
                    "geothermal": "geotermica", "storage": "almacenamiento"}
    z = zipfile.ZipFile(io.BytesIO(get("https://wri-dataportal-prod.s3.amazonaws.com/manual/global_power_plant_database_v_1_3.zip")))
    nombre = next(n for n in z.namelist() if n.endswith(".csv") and "global_power_plant_database" in n)
    out = []
    for r in csv.DictReader(io.TextIOWrapper(z.open(nombre), encoding="utf-8")):
        comb = combustibles.get((r["primary_fuel"] or "").lower(), "otros")
        mw = float(r["capacity_mw"] or 0)
        out.append(feat(punto(r["longitude"], r["latitude"]),
                        {"id": f"gppd:{r['gppd_idnr']}", "n": r["name"], "st": f"central_{comb}", "p": r["country"], "x": round(mw)},
                        3 if mw >= 500 else 5 if mw >= 100 else 7))
    return out


# ------------------------------------------------------------ cables submarinos (TeleGeography)
# Archivos GeoJSON públicos del Submarine Cable Map (sin clave). Licencia CC BY-NC-SA 3.0: uso no
# comercial, con atribución a TeleGeography; las rutas son esquemáticas, no el trazado exacto.
TELEGEOGRAPHY = "https://www.submarinecablemap.com/api/v3"


def _redondear(coords):
    if coords and isinstance(coords[0], (int, float)):
        return [round(float(coords[0]), 4), round(float(coords[1]), 4)]
    return [_redondear(c) for c in coords]


def cables_de_geojson(cables, aterrizajes):
    """GeoJSON de TeleGeography → features de la familia (líneas de cables y puntos de aterrizaje)."""
    out = []
    for f in cables.get("features", []):
        g, pr = f.get("geometry") or {}, f.get("properties") or {}
        if g.get("type") not in ("LineString", "MultiLineString") or not pr.get("id"):
            continue
        out.append(feat({"type": g["type"], "coordinates": _redondear(g["coordinates"])},
                        {"id": f"tgc:{pr['id']}", "n": pr.get("name") or pr["id"], "st": "cables_submarinos", "p": "", "x": ""}, 0))
    for f in aterrizajes.get("features", []):
        g, pr = f.get("geometry") or {}, f.get("properties") or {}
        if g.get("type") != "Point" or not pr.get("id"):
            continue
        lon, lat = g["coordinates"][:2]
        out.append(feat(punto(lon, lat), {"id": f"tgl:{pr['id']}", "n": pr.get("name") or pr["id"], "st": "aterrizajes_cable", "p": "", "x": ""}, 4))
    return out


def cables():
    c = json.loads(get(f"{TELEGEOGRAPHY}/cable/cable-geo.json", timeout=120))
    a = json.loads(get(f"{TELEGEOGRAPHY}/landing-point/landing-point-geo.json", timeout=120))
    return cables_de_geojson(c, a)


# ------------------------------------------------------------ cámaras públicas (lista curada)
def enlace_responde(url, robots=None, abrir=None):
    """'ok' si la página responde (< 400) y robots.txt lo permite; si no, el motivo. Sin reintentos."""
    import urllib.robotparser
    p = urllib.parse.urlparse(url)
    rp = urllib.robotparser.RobotFileParser()
    try:
        texto = robots(url) if robots else get(f"{p.scheme}://{p.netloc}/robots.txt", timeout=20, intentos=1).decode("utf-8", "replace")
        rp.parse(texto.splitlines())
    except Exception:  # noqa: BLE001  sin robots.txt: sin reglas
        rp.parse([])
    if not rp.can_fetch("Geopolitica-monitor", url):
        return "robots.txt no permite revisarlo"
    try:
        (abrir or (lambda u: get(u, timeout=30, intentos=1)))(url)
        return "ok"
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}"
    except Exception as e:  # noqa: BLE001
        return type(e).__name__


def robots_permite(url, robots=None):
    import urllib.robotparser
    p = urllib.parse.urlparse(url)
    rp = urllib.robotparser.RobotFileParser()
    try:
        texto = robots(url) if robots else get(f"{p.scheme}://{p.netloc}/robots.txt", timeout=20, intentos=1).decode("utf-8", "replace")
        rp.parse(texto.splitlines())
    except Exception:  # noqa: BLE001
        rp.parse([])
    return rp.can_fetch("Geopolitica-monitor", url)


# Cámaras de carretera publicadas como datos abiertos (sin clave). Las imágenes NO se descargan: la ficha
# las enlaza desde el servidor del operador, con su atribución.
DIGITRAFFIC = "https://tie.digitraffic.fi/api/weathercam/v1/stations"
DIGITRAFFIC_IMG = "https://weathercam.digitraffic.fi/{}.jpg"
CALTRANS = "https://cwwp2.dot.ca.gov/data/d{d}/cctv/cctvStatusD{d:02d}.json"
CAM_FUENTES = {}  # fuente -> "ok (n)" o el error, para el manifiesto


def camaras_digitraffic(d):
    """GeoJSON de estaciones de Digitraffic → puntos con hasta 4 imágenes (una por dirección)."""
    out = []
    for f in d.get("features", []):
        pr, g = f.get("properties") or {}, f.get("geometry") or {}
        coords = g.get("coordinates") or []
        presets = [x["id"] for x in pr.get("presets", []) if x.get("id") and x.get("inCollection", True)]
        if len(coords) < 2 or not presets or pr.get("collectionStatus", "GATHERING") != "GATHERING":
            continue
        out.append(feat(punto(coords[0], coords[1]), {
            "id": f"dt:{pr.get('id') or f.get('id')}", "n": (pr.get("name") or "").replace("_", " "), "st": "trafico", "p": "FIN",
            "x": "https://www.digitraffic.fi/en/road-traffic/", "o": "Fintraffic / digitraffic.fi", "t": "organismo_publico",
            "imgs": [DIGITRAFFIC_IMG.format(x) for x in presets[:4]], "lic": "CC BY 4.0", "nota": "Cámara de clima y tráfico en carretera."}, 5))
    return out


def camaras_caltrans(d):
    """cctvStatusDxx.json de Caltrans → puntos de cámaras en servicio con su imagen fija actual."""
    out = []
    for item in d.get("data", []):
        c = item.get("cctv") or {}
        loc = c.get("location") or {}
        img = ((c.get("imageData") or {}).get("static") or {}).get("currentImageURL") or ""
        try:
            lon, lat = float(loc["longitude"]), float(loc["latitude"])
        except (KeyError, TypeError, ValueError):
            continue
        if str(c.get("inService", "true")).lower() != "true" or not img.startswith("https://"):
            continue
        nombre = " · ".join(x for x in (loc.get("route"), loc.get("locationName") or loc.get("nearbyPlace")) if x)
        out.append(feat(punto(lon, lat), {
            "id": f"ct:{loc.get('district', '')}-{c.get('index', len(out))}", "n": nombre or "Cámara de Caltrans", "st": "trafico", "p": "USA",
            "x": "https://quickmap.dot.ca.gov/", "o": "Caltrans (Departamento de Transporte de California)", "t": "organismo_publico",
            "imgs": [img], "lic": "Datos públicos de Caltrans", "nota": "Cámara de tráfico en carretera estatal."}, 5))
    return out


def get_json_gzip(url):
    """JSON con Accept-Encoding: gzip (Digitraffic lo pide) e identificación del cliente."""
    import gzip
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip", "Digitraffic-User": "Geopolitica-monitor"})
    with urllib.request.urlopen(req, timeout=60) as r:
        datos = r.read()
        if r.headers.get("Content-Encoding") == "gzip" or datos[:2] == b"\x1f\x8b":
            datos = gzip.decompress(datos)
    return json.loads(datos)


def _fuente_camaras(nombre, urls, parser, leer=None):
    """Lee cada URL de una fuente; una URL caída no detiene las demás ni la capa."""
    feats, errores = [], []
    for u in urls:
        try:
            if not robots_permite(u):
                raise PermissionError("robots.txt no lo permite")
            feats += parser((leer or get_json_gzip)(u))
        except Exception as e:  # noqa: BLE001
            errores.append(f"{u.rsplit('/', 1)[-1]}: {e}"[:120])
    CAM_FUENTES[nombre] = (f"ok ({len(feats)})" if feats else "error") + (f"; fallaron {len(errores)} de {len(urls)}: {errores[0]}" if errores else "")
    print(f"   cámaras {nombre}: {CAM_FUENTES[nombre]}")
    return feats


def camaras(revisar=enlace_responde, externas=True):
    cfg = json.load(open(os.path.join(ROOT, "config", "camaras.json"), encoding="utf-8"))
    hoy = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    revisados = {}
    out = []
    for c in cfg["camaras"]:
        if c["url"] not in revisados:
            revisados[c["url"]] = revisar(c["url"])
        estado = revisados[c["url"]]
        out.append(feat(punto(c["lon"], c["lat"]), {
            "id": f"cam:{c['id']}", "n": c["nombre"], "st": c["subtipo"], "p": c.get("pais_iso3", ""), "x": c["url"],
            "o": c["operador"], "t": c["tipo_operador"], "nota": c.get("nota", ""),
            "v": f"{estado} ({hoy})"}, 1))
    CAM_FUENTES["curadas"] = f"ok ({len(out)})"
    if externas:
        out += _fuente_camaras("digitraffic", [DIGITRAFFIC], camaras_digitraffic)
        out += _fuente_camaras("caltrans", [CALTRANS.format(d=d) for d in range(1, 13)], camaras_caltrans)
    return out


FAMILIAS_GEOJSON = {"camaras", "conflicto", "religiones", "gobierno_forma", "gobierno_orientacion", "densidad_poblacion"}  # GeoJSON directo, sin tippecanoe


def conflicto():
    """Dominio o disputa de grupos armados no estatales (UCDP, últimos 24 meses, celdas de 1°)."""
    import dominio as D
    if not robots_permite(D.UCDP_PAGINA):
        raise PermissionError("robots.txt de UCDP no permite la descarga")
    ged, candidatos = D.enlaces_ucdp(get(D.UCDP_PAGINA, timeout=60).decode("utf-8", "replace"))
    if not ged and not candidatos:
        raise RuntimeError("no se encontraron enlaces de descarga en la página de UCDP")
    textos = []
    if ged:
        print(f"   UCDP GED: {ged}")
        textos += D.textos_de_zip(get(ged, timeout=600))
    for u in candidatos[-14:]:
        try:
            textos.append(get(u, timeout=300).decode("utf-8", "replace"))
            print(f"   UCDP Candidate: {u}")
        except Exception as e:  # noqa: BLE001
            print(f"   UCDP Candidate {u}: {e}")
    eventos = list(D.leer_eventos(textos, D.desde_ventana()))
    print(f"   {len(eventos)} eventos en la ventana de {D.VENTANA_MESES} meses")
    return D.cobertura_dominio(D.agregar_celdas(eventos))


def religiones():
    """Composición religiosa por país (Pew 2020 vía Our World in Data)."""
    import dominio as D
    if not robots_permite(D.OWID_RELIGION):
        raise PermissionError("robots.txt de Our World in Data no lo permite")
    slugs = D.slugs_religion(get(D.OWID_RELIGION, timeout=60).decode("utf-8", "replace"))
    print(f"   gráficos de OWID: {slugs}")
    por_pais = {}
    for slug in slugs:
        try:
            texto = get(f"https://ourworldindata.org/grapher/{slug}.csv?v=1&csvType=full&useColumnShortNames=false", timeout=60).decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            print(f"   {slug}: {e}")
            continue
        for iso, cats in D.leer_csv_owid(texto, slug).items():
            for cat, v in cats.items():
                por_pais.setdefault(iso, {}).setdefault(cat, v)
        time.sleep(1)
    if not por_pais:
        raise RuntimeError("OWID no devolvió datos de religión")
    paises = json.load(open(os.path.join(ROOT, "data", "base", "countries.geojson"), encoding="utf-8"))
    return D.features_religion(paises, por_pais)


def _sparql(consulta):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": consulta, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            print(f"   Wikidata reintento {i + 1}: {e}")
            time.sleep(20 * (i + 1))
    raise RuntimeError("Wikidata no respondió")


_GOBIERNOS = None


def _gobiernos():
    """Una sola descarga de Wikidata para las dos capas de gobierno (forma y orientación)."""
    global _GOBIERNOS
    if _GOBIERNOS is None:
        import gobiernos as G
        formas = G.leer_formas(_sparql(G.Q_FORMAS))
        time.sleep(2)
        jefes = G.leer_jefes(_sparql(G.Q_JEFES))
        partidos = {}
        lista = G.partidos_de(jefes)
        for i in range(0, len(lista), 150):
            time.sleep(2)
            partidos.update(G.leer_partidos(_sparql(G.Q_PARTIDOS % " ".join(f"wd:{q}" for q in lista[i:i + 150]))))
        print(f"   Wikidata: {len(formas)} países, {len(jefes)} con jefes, {len(partidos)} partidos")
        paises = json.load(open(os.path.join(ROOT, "data", "base", "countries.geojson"), encoding="utf-8"))
        _GOBIERNOS = G.features_gobierno(paises, formas, jefes, partidos, datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    return _GOBIERNOS


def gobierno_forma():
    """Forma de gobierno por país (Wikidata P122)."""
    return _gobiernos()[0]


def gobierno_orientacion():
    """Orientación política del partido que encabeza el gobierno (Wikidata P1387/P1142)."""
    return _gobiernos()[1]


def grupos_criminales():
    """Mafias, cárteles, pandillas y organizaciones terroristas vigentes con sede y países de operación."""
    import grupos as G
    tipo_de = {q: t for q, t in G.CLASES}
    grupos = {}
    for q, _ in G.CLASES:  # una consulta por clase: todas juntas exceden los 60 s del servicio
        try:
            for k, g in G.leer_grupos(_sparql(G.Q_GRUPOS % q), tipo_de).items():
                if k in grupos:
                    grupos[k]["tipos"] |= g["tipos"]; grupos[k]["paises"] |= g["paises"]; grupos[k]["pais_base"] |= g["pais_base"]
                    grupos[k]["sede"] = grupos[k]["sede"] or g["sede"]; grupos[k]["sede_iso"] = grupos[k]["sede_iso"] or g["sede_iso"]
                else:
                    grupos[k] = g
            print(f"   {q}: {len(grupos)} grupos acumulados")
        except Exception as e:  # noqa: BLE001
            print(f"   {q}: {e}")
        time.sleep(2)
    if not grupos:
        raise RuntimeError("Wikidata no devolvió grupos")
    print(f"   Wikidata: {len(grupos)} grupos")
    paises = json.load(open(os.path.join(ROOT, "data", "base", "countries.geojson"), encoding="utf-8"))
    gaz = json.load(open(os.path.join(ROOT, "config", "gazetteer.json"), encoding="utf-8"))["paises"]
    return G.features_grupos(grupos, G.centroides(paises), lambda iso: (gaz.get(iso) or {}).get("es") or iso, feat, punto)


def lugares_religiosos():
    """Catedrales, mezquitas, templos, sinagogas… con artículo en varias Wikipedias o Patrimonio Mundial."""
    import lugares_religiosos as L
    registros = {}
    for clase in L.CLASES:
        try:
            nuevos = L.leer_clase(_sparql(L.Q_CLASE % (clase[0], clase[3])), clase)
            for q, r in nuevos.items():
                registros.setdefault(q, r)  # la primera clase gana (catedral antes que iglesia)
            print(f"   {clase[1]}: {len(nuevos)}")
        except Exception as e:  # noqa: BLE001
            print(f"   {clase[1]}: {e}")
        time.sleep(2)
    if not registros:
        raise RuntimeError("Wikidata no devolvió lugares religiosos")
    return L.features_lugares(registros, feat, punto)


# El mundo en 8 cajas (sur, oeste, norte, este): una consulta global pesada provoca error 500 en Overpass.
CAJAS = [(-60, -180, 0, 0), (-60, 0, 0, 180), (0, -180, 30, 0), (0, 0, 30, 180),
         (30, -180, 50, 0), (30, 0, 50, 180), (50, -180, 85, 0), (50, 0, 85, 180)]


FALTANTES = {}  # familia -> cajas que no respondieron (se reporta en el manifiesto como "parcial")
# Plazo interno: el job de Actions muere a los 90 min y se perdería todo. Al agotarse el plazo ya no se
# hacen consultas nuevas; lo construido se publica y lo pendiente conserva su versión anterior.
PLAZO = time.time() + 60 * float(os.environ.get("PLAZO_MIN", "70"))
FAMILIAS_OSM = {"centros_datos", "embajadas", "recursos", "militar", "presas", "ductos", "farmaceuticas", "petroleo_gas",
                "fronteras", "desaladoras"}


def queda():
    return PLAZO - time.time()


def _overpass_caja(q, intentos=3):
    """Una consulta con espera respetuosa: ante 429 (límite) o 504 (saturación) espera 60-120 s."""
    ultimo = TimeoutError("plazo interno agotado")
    for intento in range(intentos):
        for url in OVERPASS:
            if queda() < 240:
                raise ultimo
            try:
                req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=200) as r:
                    return json.loads(r.read())["elements"]
            except Exception as ex:  # noqa: BLE001
                ultimo = ex
                print(f"   overpass {url} intento {intento + 1}: {ex}")
        if intento + 1 < intentos:
            time.sleep(max(0, min(60 * (intento + 1), queda() - 240)))
    raise ultimo


def dividir(caja):
    """Parte una caja (sur, oeste, norte, este) en 4 cuartos iguales."""
    s_, w, n, e = caja
    ml, mo = (s_ + n) / 2, (w + e) / 2
    return [(s_, w, ml, mo), (s_, mo, ml, e), (ml, w, n, mo), (ml, mo, n, e)]


MAX_DIVISIONES = 3  # una caja de 20°×180° puede llegar a 2.5°×22.5°


def overpass(selectores, familia="", salida="center"):
    """selectores: lista como ['nwr["office"="diplomatic"]', 'nwr["amenity"="embassy"]'].
    Se consultan como UNIÓN ( a; b; ) caja por caja y se eliminan duplicados por tipo+id.
    Si una caja no responde (consulta demasiado pesada), se parte en 4 cuartos y se reintenta,
    hasta 2 veces. Lo que siga sin responder se anota en FALTANTES."""
    vistos, out, fallidas = set(), [], []
    pendientes = [(c, 0) for c in CAJAS]
    while pendientes:
        caja, nivel = pendientes.pop(0)
        s_, w, n, e = caja
        union = "".join(f"{sel}({s_},{w},{n},{e});" for sel in selectores)
        try:
            # Las cajas divididas son más ligeras: basta un intento por instancia antes de volver a dividir.
            els = _overpass_caja(f"[out:json][timeout:180];({union});out {salida} tags;", intentos=3 if nivel == 0 else 1)
        except Exception as ex:  # noqa: BLE001
            if nivel < MAX_DIVISIONES and not isinstance(ex, TimeoutError):
                print(f"   caja {caja} sin datos ({ex}); se divide en 4")
                pendientes[:0] = [(c, nivel + 1) for c in dividir(caja)]
            else:
                fallidas.append(list(caja))
                print(f"   caja {caja} sin datos: {ex}")
            continue
        for el in els:
            k = (el["type"], el["id"])
            if k not in vistos:
                vistos.add(k)
                out.append(el)
        time.sleep(15)  # cortesía con la API pública
    if not out and fallidas:
        raise RuntimeError("Overpass no respondió en ninguna caja (límite de uso o saturación)")
    if fallidas:
        FALTANTES.setdefault(familia, []).extend(fallidas)
    return out


def _osm(elementos, subtipo_de, z_de, extra=lambda t: "", pa=None):
    out = []
    for el in elementos:
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        if lat is None:
            continue
        t = el.get("tags", {})
        st = subtipo_de(t)
        if not st:
            continue
        out.append(feat(punto(lon, lat), {"id": f"osm:{el['type'][0]}{el['id']}", "n": t.get("name:es") or t.get("name") or "",
                                          "st": st, "p": pa.de(lon, lat) if pa else "", "x": extra(t)}, z_de(st, t)))
    return out


HIPERESCALA = ("google", "amazon", "aws", "microsoft", "azure", "meta", "facebook", "oracle", "alibaba", "tencent", "apple", "baidu", "huawei")


def centros_datos():
    els = overpass(['nwr["telecom"="data_center"]'], "centros_datos")
    hip = lambda t: any(h in (t.get("operator", "") + " " + t.get("name", "")).lower() for h in HIPERESCALA)  # noqa: E731
    return _osm(els, lambda t: "datacenter_hiperescala" if hip(t) else "datacenter_otros",
                lambda st, t: 4 if st == "datacenter_hiperescala" else 8, lambda t: t.get("operator", ""), Paises())


def embajadas():
    els = overpass(['nwr["office"="diplomatic"]', 'nwr["amenity"="embassy"]'], "embajadas")
    return _osm(els, lambda t: "embajadas_consulados", lambda st, t: 7 if t.get("diplomatic", "embassy") == "embassy" else 9,
                lambda t: (t.get("diplomatic") or "embassy") + "|" + (t.get("country") or ""), Paises())


def recursos():
    pa = Paises()
    out = []
    consultas = [
        (['nwr["industrial"="refinery"]', 'nwr["man_made"="works"]["product"~"petroleum|oil"]'], lambda t: "energia_yacimientos", 4),
        (['nwr["industrial"="terminal"]["substance"~"gas|lng"]'], lambda t: "energia_yacimientos", 5),
        (['nwr["landuse"="quarry"]["resource"~"lithium|copper|cobalt|nickel|rare_earth|graphite|uranium|tungsten|tin"]'], lambda t: "mineria", 5),
        (['nwr["man_made"="works"]["product"~"semiconductor|chip|wafer",i]'], lambda t: "semiconductores", 3),
        (['nwr["man_made"="works"]["product"~"fertili[sz]er",i]'], lambda t: "agronomia", 5),
        (['nwr["man_made"="works"]["product"~"steel|aluminium|aluminum|cement",i]'], lambda t: "industria_pesada", 6),
    ]
    for sel, st, z in consultas:
        out += _osm(overpass(sel, "recursos"), st, lambda s, t, z=z: z, lambda t: t.get("product") or t.get("resource") or t.get("operator", ""), pa)
    return out


def presas():
    """Presas con ficha en Wikidata (filtro de relevancia: OSM tiene cientos de miles de bordos y diques)."""
    els = overpass(['nwr["waterway"="dam"]["wikidata"]'], "presas")
    def uso(t):
        txt = " ".join(t.get(k, "") for k in ("name", "name:es", "name:en", "operator", "description")).lower()
        if t.get("power") or "hydro" in txt or "hidroel" in txt or "hidroeléc" in txt:
            return "presa_hidro"
        if "irrigat" in txt or "riego" in txt:
            return "presa_riego"
        return "presa_otros"
    return _osm(els, uso, lambda st, t: 5 if st == "presa_hidro" else 6, lambda t: t.get("height", "") and f"{t['height']} m de altura", Paises())


def _linea_osm(el):
    """Way de Overpass con `out geom` → LineString (redondeado) o None."""
    g = el.get("geometry") or []
    pts = [[round(p["lon"], 4), round(p["lat"], 4)] for p in g if p]
    return {"type": "LineString", "coordinates": pts} if len(pts) >= 2 else None


def ductos():
    """Oleoductos y gasoductos con nombre en OSM (suelen ser los troncales; los sin nombre son locales)."""
    els = overpass(['way["man_made"="pipeline"]["substance"~"^(oil|crude_oil|gas|natural_gas|lng|fuel|petroleum)$"]["name"]'], "ductos", salida="geom")
    pa = Paises()
    out = []
    for el in els:
        geom = _linea_osm(el)
        if not geom:
            continue
        t = el.get("tags", {})
        st = "ductos_gas" if "gas" in t.get("substance", "") or t.get("substance") == "lng" else "ductos_petroleo"
        lon, lat = geom["coordinates"][len(geom["coordinates"]) // 2]
        out.append(feat(geom, {"id": f"osm:w{el['id']}", "n": t.get("name:es") or t.get("name", ""), "st": st, "p": pa.de(lon, lat),
                               "x": t.get("operator", "")}, 3))
    return out


def militar():
    tipos = {"headquarters": ("cuarteles_mando", 5), "naval_base": ("bases_navales", 4), "airfield": ("bases_aereas", 4),
             "base": ("bases_terrestres", 6), "barracks": ("bases_terrestres", 7), "nuclear_explosion_site": ("instalaciones_nucleares", 3)}
    els = overpass(['nwr["military"~"^(headquarters|naval_base|airfield|base|barracks|nuclear_explosion_site)$"]["name"]'], "militar")
    # Solo nombre, tipo, país y operador: no se copian otras etiquetas de OSM.
    return _osm(els, lambda t: tipos.get(t.get("military"), (None,))[0], lambda st, t: tipos[t["military"]][1],
                lambda t: t.get("operator", ""), Paises())


def ferrocarriles():
    """Vías férreas de Natural Earth 1:10 m (dominio público)."""
    import redes as R
    pa = Paises()
    return R.features_ferrocarriles(json.loads(get(NE + "ne_10m_railroads.geojson")), feat, pa.de)


def autopistas():
    """Autopistas y carreteras troncales de Natural Earth 1:10 m (dominio público)."""
    import redes as R
    return R.features_autopistas(json.loads(get(NE + "ne_10m_roads.geojson")), feat)


def _sitios_wikidata(fid, ajustar=None):
    import sitios as S
    registros = {}
    for clase in S.FAMILIAS[fid]:
        plantilla = {"sede": S.Q_SEDE, "patrimonio": S.Q_PATRIMONIO}.get(clase[3], S.Q_LUGAR)
        try:
            nuevos = S.leer(_sparql(plantilla % (clase[0], clase[2])), clase)
            for q, r in nuevos.items():
                registros.setdefault(q, r)  # la primera clase de la lista gana
            print(f"   {clase[0]} ({clase[1]}): {len(nuevos)}")
        except Exception as e:  # noqa: BLE001
            print(f"   {clase[0]} ({clase[1]}): {e}")
        time.sleep(2)
    if not registros:
        raise RuntimeError(f"Wikidata no devolvió datos para {fid}")
    return S.features(registros, feat, punto, ajustar)


def densidad_poblacion():
    """Habitantes por km² de tierra, valor más reciente de cada país (Banco Mundial EN.POP.DNST, CC BY 4.0)."""
    import indicadores as I
    paginas = [json.loads(get(I.API.format(ind="EN.POP.DNST"), timeout=120))]
    valores = I.leer_api(paginas)
    if not valores:
        raise RuntimeError("El Banco Mundial no devolvió densidades")
    paises = json.load(open(os.path.join(ROOT, "data", "base", "countries.geojson"), encoding="utf-8"))
    return I.features_indicador(paises, valores, I.DENSIDAD, "dens", lambda v: f"{I.num(v, 1)} hab/km²")


def nuclear():
    """Centrales nucleares (en operación, en construcción, cerradas) y reactores de investigación (Wikidata)."""
    import sitios as S
    return _sitios_wikidata("nuclear", lambda r: S.subtipo_nuclear(r) if r["st"] == "nuclear_operacion" else r["st"])


def investigacion():
    """Institutos de investigación con artículo en ≥ 4 Wikipedias y aceleradores de partículas (Wikidata)."""
    return _sitios_wikidata("investigacion")


def turismo():
    """Patrimonio Mundial de la UNESCO, parques nacionales y atracciones turísticas con artículo en varias Wikipedias."""
    return _sitios_wikidata("turismo")


def espacio():
    """Puertos espaciales y sitios de lanzamiento (Wikidata)."""
    return _sitios_wikidata("espacio")


def farmaceuticas():
    """Sedes de farmacéuticas (Wikidata) y plantas farmacéuticas o de vacunas mapeadas en OSM."""
    out = _sitios_wikidata("farmaceuticas")
    els = overpass(['nwr["man_made"="works"]["product"~"pharma|vaccin|medic|drug",i]', 'nwr["industrial"="pharmaceutical"]'], "farmaceuticas")
    return out + _osm(els, lambda t: "farma_planta", lambda st, t: 7, lambda t: t.get("operator") or t.get("product", ""), Paises())


def petroleo_gas():
    """Campos de petróleo y gas y plataformas marinas (Wikidata), más plataformas marinas de OSM.
    Los pozos individuales (≈ 340 mil en OSM) no se incluyen: a escala mundial son ruido y pesan demasiado."""
    out = _sitios_wikidata("petroleo_gas")
    els = overpass(['nwr["man_made"="offshore_platform"]'], "petroleo_gas")
    # Se omiten las subestaciones de parques eólicos marinos (también son «offshore_platform» en OSM).
    eolica = lambda t: bool(t.get("power")) or "wind" in (t.get("name", "") + t.get("operator", "")).lower()  # noqa: E731
    return out + _osm(els, lambda t: None if eolica(t) else "plataforma_marina", lambda st, t: 6,
                      lambda t: t.get("operator", ""), Paises())


def fronteras():
    """Cruces fronterizos con nombre (OSM barrier=border_control)."""
    els = overpass(['nwr["barrier"="border_control"]["name"]'], "fronteras")
    return _osm(els, lambda t: "cruce_fronterizo", lambda st, t: 6, lambda t: t.get("operator", ""), Paises())


def desaladoras():
    """Plantas desaladoras (OSM)."""
    els = overpass(['nwr["water_works"="desalination"]', 'nwr["man_made"="water_works"]["name"~"desal",i]'], "desaladoras")
    return _osm(els, lambda t: "desaladora", lambda st, t: 5, lambda t: t.get("operator", ""), Paises())


FAMILIAS = {"zonas": zonas, "aeropuertos": aeropuertos, "puertos": puertos, "centrales": centrales,
            "centros_datos": centros_datos, "embajadas": embajadas, "recursos": recursos, "militar": militar,
            "cables": cables, "camaras": camaras, "presas": presas, "ductos": ductos, "conflicto": conflicto, "religiones": religiones,
            "gobierno_forma": gobierno_forma, "gobierno_orientacion": gobierno_orientacion, "lugares_religiosos": lugares_religiosos,
            "grupos_criminales": grupos_criminales, "ferrocarriles": ferrocarriles, "autopistas": autopistas,
            "nuclear": nuclear, "investigacion": investigacion, "espacio": espacio, "farmaceuticas": farmaceuticas,
            "petroleo_gas": petroleo_gas, "fronteras": fronteras, "desaladoras": desaladoras,
            "densidad_poblacion": densidad_poblacion, "turismo": turismo}


def _punto_ref(ft):
    """Coordenada representativa de un feature (punto, o primer vértice de una línea o polígono)."""
    c = ft["geometry"]["coordinates"]
    while isinstance(c[0], list):
        c = c[0]
    return c[0], c[1]


def _en_caja(lon, lat, caja):
    s_, w, n, e = caja
    return s_ <= lat <= n and w <= lon <= e


def ruta_crudo(fid):
    return os.path.join(SALIDA, f"{fid}.crudo.ndjson.gz")


def leer_crudo(fid):
    import gzip
    ruta = ruta_crudo(fid)
    if not os.path.exists(ruta):
        return []
    with gzip.open(ruta, "rt", encoding="utf-8") as f:
        return [json.loads(x) for x in f if x.strip()]


def guardar_crudo(fid, feats):
    """Copia de los objetos de la familia (no se publica en el sitio): sirve para rellenar zonas que fallen después."""
    import gzip
    with gzip.open(ruta_crudo(fid), "wt", encoding="utf-8") as f:
        for ft in feats:
            f.write(json.dumps(ft, ensure_ascii=False, separators=(",", ":")) + "\n")


def rellenar_faltantes(feats, previos, cajas):
    """Agrega de la corrida anterior los objetos que caen en las cajas que no respondieron ahora.
    Devuelve (feats completos, cuántos se reusaron)."""
    ids = {ft["properties"]["id"] for ft in feats}
    extra = [ft for ft in previos if ft["properties"]["id"] not in ids and any(_en_caja(*_punto_ref(ft), c) for c in cajas)]
    return feats + extra, len(extra)


def tippecanoe(familia, ruta_ndjson, geometria):
    destino = os.path.join(SALIDA, f"{familia}.pmtiles")
    base = ["tippecanoe", "-o", destino, "--force", "-l", familia, "-Z0", "--quiet",
            "--maximum-tile-bytes=600000", "--attribution=Ver SOURCES.md"]
    if geometria == "punto":
        cmd = base + [f"-z{ZOOM_MAX_PUNTOS}", "-r1", "--no-feature-limit", "--drop-densest-as-needed"]
    else:
        cmd = base + [f"-z{ZOOM_MAX_AREAS}", "--simplification=10", "--coalesce-densest-as-needed", "--detect-shared-borders"]
    subprocess.run(cmd + [ruta_ndjson], check=True)
    return destino


def main(pedidas):
    os.makedirs(SALIDA, exist_ok=True)
    cfg = json.load(open(os.path.join(ROOT, "config", "capas.json"), encoding="utf-8"))
    ruta_manifest = os.path.join(SALIDA, "manifest.json")
    manifest = json.load(open(ruta_manifest, encoding="utf-8")) if os.path.exists(ruta_manifest) else {"familias": {}}

    def guardar():
        manifest["generado_utc"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        with open(ruta_manifest, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=1)

    # Primero las familias rápidas; luego las de Overpass, de la más antigua a la más reciente,
    # para que cada corrida avance aunque el plazo no alcance para todas.
    def orden(fam):
        osm = fam["id"] in FAMILIAS_OSM
        return (osm, manifest["familias"].get(fam["id"], {}).get("actualizado_utc", "") if osm else "")

    for fam in sorted(cfg["familias"], key=orden):
        fid = fam["id"]
        if pedidas and fid not in pedidas:
            continue
        if not fam["habilitada"] or fid not in FAMILIAS:
            if not fam["habilitada"]:
                manifest["familias"].pop(fid, None)  # una familia deshabilitada no se anuncia en el mapa
            print(f"[{fid}] omitida ({fam.get('motivo', 'sin constructor')})")
            continue
        if fid in FAMILIAS_OSM and queda() < 600:
            print(f"[{fid}] pendiente: el plazo interno no alcanza; se conserva la versión anterior")
            continue
        t0 = time.time()
        print(f"[{fid}] descargando… (quedan {queda() / 60:.0f} min de plazo)")
        try:
            feats = FAMILIAS[fid]()
            if not feats:
                # Sin objetos (p. ej. el plazo se agotó antes de la primera caja): tippecanoe fallaría y
                # dejaría un archivo inválido. Se conserva la versión anterior y la familia queda pendiente.
                print(f"[{fid}] sin objetos en esta corrida; se conserva la versión anterior")
                previo = manifest["familias"].get(fid, {})
                if not previo.get("archivo"):
                    previo = {"estado": "pendiente", "error": "Aún sin datos: Overpass no respondió a tiempo; se reintenta en la próxima corrida."}
                manifest["familias"][fid] = previo
                destino = os.path.join(SALIDA, f"{fid}.pmtiles")
                if not previo.get("archivo") and os.path.exists(destino):
                    os.remove(destino)
                guardar()
                continue
            reusados = 0
            if fid in FAMILIAS_OSM:
                if FALTANTES.get(fid):
                    feats, reusados = rellenar_faltantes(feats, leer_crudo(fid), FALTANTES[fid])
                    print(f"[{fid}] {reusados} objetos reusados de la corrida anterior en {len(FALTANTES[fid])} zona(s) sin respuesta")
                guardar_crudo(fid, feats)
            if fid in FAMILIAS_GEOJSON:
                destino = os.path.join(SALIDA, f"{fid}.geojson")
                with open(destino, "w", encoding="utf-8") as f:
                    json.dump({"type": "FeatureCollection", "features": [{k: v for k, v in ft.items() if k != "tippecanoe"} for ft in feats]},
                              f, ensure_ascii=False, separators=(",", ":"))
            else:
                ruta = os.path.join(TMP, f"{fid}.ndjson")
                with open(ruta, "w", encoding="utf-8") as f:
                    for ft in feats:
                        f.write(json.dumps(ft, ensure_ascii=False) + "\n")
                destino = tippecanoe(fid, ruta, fam["geometria"])
            subtipos = {}
            for ft in feats:
                subtipos[ft["properties"]["st"]] = subtipos.get(ft["properties"]["st"], 0) + 1
            manifest["familias"][fid] = {
                "archivo": f"data/capas/{os.path.basename(destino)}", "objetos": len(feats), "por_subtipo": subtipos,
                **({"formato": "geojson"} if fid in FAMILIAS_GEOJSON else {}),
                "bytes": os.path.getsize(destino), "fuente": fam["fuente"],
                **({"fuentes": dict(CAM_FUENTES)} if fid == "camaras" else {}),
                "estado": "parcial" if FALTANTES.get(fid) else "ok",
                "error": (f"sin respuesta en {len(FALTANTES[fid])} zona(s); se reusaron {reusados} objetos de la corrida anterior en esas zonas: {FALTANTES[fid]}"
                          if FALTANTES.get(fid) else None),
                "actualizado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "segundos": round(time.time() - t0),
            }
            print(f"[{fid}] {len(feats)} objetos → {os.path.getsize(destino) / 1e6:.2f} MB")
        except Exception as e:  # noqa: BLE001
            print(f"[{fid}] ERROR: {e}")
            previo = manifest["familias"].get(fid, {})
            if previo.get("archivo") and previo.get("estado") in ("ok", "parcial", "desactualizada"):
                # Hay una versión anterior buena: sigue visible en el mapa, marcada como desactualizada.
                previo.update({"estado": "desactualizada", "error": f"La actualización del {datetime.now(timezone.utc):%Y-%m-%d} falló: {e}"[:300]})
            else:
                previo.update({"estado": "error", "error": str(e)[:300]})
            manifest["familias"][fid] = previo
        guardar()  # tras cada familia: si el job muere, lo ya construido no se pierde
    guardar()
    return 0


if __name__ == "__main__":
    sys.exit(main(set(sys.argv[1:])))
