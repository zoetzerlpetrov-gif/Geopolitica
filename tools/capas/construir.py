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
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
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


# El mundo en 8 cajas (sur, oeste, norte, este): una consulta global pesada provoca error 500 en Overpass.
CAJAS = [(-60, -180, 0, 0), (-60, 0, 0, 180), (0, -180, 30, 0), (0, 0, 30, 180),
         (30, -180, 50, 0), (30, 0, 50, 180), (50, -180, 85, 0), (50, 0, 85, 180)]


FALTANTES = {}  # familia -> cajas que no respondieron (se reporta en el manifiesto como "parcial")
# Plazo interno: el job de Actions muere a los 90 min y se perdería todo. Al agotarse el plazo ya no se
# hacen consultas nuevas; lo construido se publica y lo pendiente conserva su versión anterior.
PLAZO = time.time() + 60 * float(os.environ.get("PLAZO_MIN", "70"))
FAMILIAS_OSM = {"centros_datos", "embajadas", "recursos", "militar"}


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


MAX_DIVISIONES = 2  # una caja de 20°×180° puede llegar a cuartos de 5°×45°


def overpass(selectores, familia=""):
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
            els = _overpass_caja(f"[out:json][timeout:180];({union});out center tags;", intentos=3 if nivel == 0 else 1)
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


def militar():
    tipos = {"headquarters": ("cuarteles_mando", 5), "naval_base": ("bases_navales", 4), "airfield": ("bases_aereas", 4),
             "base": ("bases_terrestres", 6), "barracks": ("bases_terrestres", 7), "nuclear_explosion_site": ("instalaciones_nucleares", 3)}
    els = overpass(['nwr["military"~"^(headquarters|naval_base|airfield|base|barracks|nuclear_explosion_site)$"]["name"]'], "militar")
    # Solo nombre, tipo, país y operador: no se copian otras etiquetas de OSM.
    return _osm(els, lambda t: tipos.get(t.get("military"), (None,))[0], lambda st, t: tipos[t["military"]][1],
                lambda t: t.get("operator", ""), Paises())


FAMILIAS = {"zonas": zonas, "aeropuertos": aeropuertos, "puertos": puertos, "centrales": centrales,
            "centros_datos": centros_datos, "embajadas": embajadas, "recursos": recursos, "militar": militar}


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
            ruta = os.path.join(TMP, f"{fid}.ndjson")
            with open(ruta, "w", encoding="utf-8") as f:
                for ft in feats:
                    f.write(json.dumps(ft, ensure_ascii=False) + "\n")
            destino = tippecanoe(fid, ruta, fam["geometria"])
            subtipos = {}
            for ft in feats:
                subtipos[ft["properties"]["st"]] = subtipos.get(ft["properties"]["st"], 0) + 1
            manifest["familias"][fid] = {
                "archivo": f"data/capas/{fid}.pmtiles", "objetos": len(feats), "por_subtipo": subtipos,
                "bytes": os.path.getsize(destino), "fuente": fam["fuente"],
                "estado": "parcial" if FALTANTES.get(fid) else "ok",
                "error": f"sin datos en {len(FALTANTES[fid])} zona(s): {FALTANTES[fid]}" if FALTANTES.get(fid) else None,
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
