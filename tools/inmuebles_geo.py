"""Corrige y verifica las coordenadas de los inmuebles en seguimiento con OpenStreetMap Nominatim.

1. Geocodifica el texto «geocodificar» de cada inmueble (o colonia, ciudad, estado y país) y, si el inmueble no trae la
   ubicación exacta del proyecto, usa ese punto (centro de la colonia o de la ciudad).
2. Verifica con geocodificación inversa que cada punto caiga en tierra y en su país; si cae en el mar o en otro país, lo
   reemplaza por el centro de su colonia o ciudad.
3. Para los desarrollos de ARA y SADASI (repositorio InmueblesAraSadasi) escribe correcciones en
   config/inmuebles_desarrollos/_ara_sadasi_geo.json, que aplica la construcción de capas.

Política de uso de Nominatim: una consulta por segundo, User-Agent identificable y caché local de resultados
(config/inmuebles_desarrollos/_geocache.json), para no repetir consultas en corridas futuras.

Uso: python3 tools/inmuebles_geo.py [--max 900]
"""
import argparse
import glob
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CARPETA = os.path.join(ROOT, "config", "inmuebles_desarrollos")
CACHE = os.path.join(CARPETA, "_geocache.json")
UA = "DOMINUS-OSINT/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica; inmuebles en seguimiento)"
ARA = "https://raw.githubusercontent.com/zoetzerlpetrov-gif/InmueblesAraSadasi/main/data/developments.json"
ULTIMA = [0.0]


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def pedir(url):
    espera = 1.1 - (time.time() - ULTIMA[0])
    if espera > 0:
        time.sleep(espera)
    ULTIMA[0] = time.time()
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "es"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def adelante(q, iso2, cache):
    k = f"f|{iso2}|{q}"
    if k not in cache:
        p = {"format": "jsonv2", "limit": "1", "q": q}
        if iso2:
            p["countrycodes"] = iso2.lower()
        try:
            r = pedir("https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(p))
            cache[k] = {"lat": float(r[0]["lat"]), "lon": float(r[0]["lon"]), "tipo": r[0].get("addresstype", "")} if r else None
        except Exception as e:  # noqa: BLE001
            print(f"   búsqueda falló «{q}»: {e}")
            return None
    return cache[k]


def inversa(lat, lon, cache):
    """País (ISO2 en minúsculas) del punto, o None si cae en el mar."""
    k = f"r|{lat:.5f}|{lon:.5f}"
    if k not in cache:
        try:
            r = pedir("https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode({"format": "jsonv2", "lat": lat, "lon": lon, "zoom": 14}))
            cc = (r.get("address") or {}).get("country_code")
            agua = r.get("category") in ("natural", "water", "waterway") and r.get("type") in ("water", "bay", "strait", "coastline", "sea", "ocean", "lake")
            cache[k] = None if (r.get("error") or not cc or agua) else cc
        except Exception as e:  # noqa: BLE001
            print(f"   inversa falló {lat},{lon}: {e}")
            return "?"
    return cache[k]


def texto(x, pais_nombre):
    if x.get("geocodificar"):
        return [x["geocodificar"], ", ".join(v for v in (x.get("ciudad"), x.get("estado"), pais_nombre) if v)]
    return [", ".join(v for v in (x.get("zona"), x.get("ciudad"), x.get("estado"), pais_nombre) if v),
            ", ".join(v for v in (x.get("ciudad"), x.get("estado"), pais_nombre) if v)]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=2000, help="máximo de inmuebles a revisar (por corrida)")
    a = ap.parse_args(argv)
    gz = json.load(open(os.path.join(ROOT, "config", "gazetteer.json"), encoding="utf-8"))
    iso2de = {v: k for k, v in gz.get("iso2_a_iso3", {}).items()}
    nombres = {k: v.get("en") or v.get("es") for k, v in gz.get("paises", {}).items()}
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    cambios, revisados = [], 0
    for ruta in sorted(glob.glob(os.path.join(CARPETA, "*.json"))):
        if os.path.basename(ruta).startswith("_"):
            continue
        d = json.load(open(ruta, encoding="utf-8"))
        for x in d.get("inmuebles", []):
            if revisados >= a.max:
                break
            revisados += 1
            iso2 = (iso2de.get(x.get("pais_iso3")) or "").lower()
            original = (x.get("lat"), x.get("lon"))
            cand = None
            consultas = texto(x, nombres.get(x.get("pais_iso3"), ""))
            centro = adelante(consultas[-1], iso2, cache) if consultas[-1] else None
            for q in consultas:
                c = adelante(q, iso2, cache) if q else None
                # Un resultado a más de 40 km del centro de su ciudad es otro lugar con el mismo nombre.
                if c and (not centro or km((c["lat"], c["lon"]), (centro["lat"], centro["lon"])) <= 40):
                    cand = c
                    break
            ok = original[0] is not None and inversa(original[0], original[1], cache) in (iso2, "?")
            # Se usa el punto de OpenStreetMap si el original cae en el mar u otro país, si no es la ubicación exacta del
            # proyecto, o si está a más de 30 km de su colonia o ciudad (dato probablemente equivocado).
            usar = cand and (not ok or x.get("precision") != "proyecto" or km(original, (cand["lat"], cand["lon"])) > 30)
            if usar:
                nuevo = (round(cand["lat"], 6), round(cand["lon"], 6))
                if inversa(nuevo[0], nuevo[1], cache) in (iso2, "?"):
                    if original[0] is None or km(original, nuevo) > 0.05:
                        cambios.append(f"{x['id']}: {original} → {nuevo} ({cand['tipo']}){'' if ok else ' [estaba en el mar u otro país]'}")
                    x["lat"], x["lon"] = nuevo
                    if x.get("precision") != "proyecto" or not ok:
                        x["precision"] = "colonia" if cand["tipo"] in ("suburb", "neighbourhood", "quarter", "city_district", "borough", "village", "hamlet") else "ciudad"
                    x["geo_fuente"] = "OpenStreetMap Nominatim"
            elif not ok:
                print(f"   ⚠️ {x['id']} cae en el mar u otro país y no se encontró su colonia o ciudad")
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
            f.write("\n")
        json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    # ARA y SADASI: solo se corrigen los que caen en el mar o lejos de su ciudad.
    try:
        req = urllib.request.Request(ARA, headers={"User-Agent": UA})
        devs = json.loads(urllib.request.urlopen(req, timeout=60).read())["developments"]
        corr = {}
        for x in devs:
            if x.get("lat") is None:
                continue
            ok = inversa(x["lat"], x["lon"], cache) in ("mx", "?")
            cand = adelante(f"{x.get('city')}, {x.get('state')}, México", "mx", cache)
            if cand and (not ok or km((x["lat"], x["lon"]), (cand["lat"], cand["lon"])) > 30):
                corr[x["id"]] = [round(cand["lat"], 6), round(cand["lon"], 6)]
                cambios.append(f"ARA/SADASI {x['id']}: ({x['lat']}, {x['lon']}) → {corr[x['id']]}{'' if ok else ' [estaba en el mar]'}")
        json.dump({"nota": "Correcciones de coordenadas para desarrollos de InmueblesAraSadasi que caían en el mar o lejos de su ciudad (tools/inmuebles_geo.py).", "coords": corr},
                  open(os.path.join(CARPETA, "_ara_sadasi_geo.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    except Exception as e:  # noqa: BLE001
        print(f"   ARA/SADASI no disponible: {e}")
    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"Revisados {revisados}; cambios {len(cambios)}")
    for c in cambios:
        print("  ", c)
    return 0


if __name__ == "__main__":
    sys.exit(main())
