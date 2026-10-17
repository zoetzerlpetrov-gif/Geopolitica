#!/usr/bin/env python3
"""Cámaras públicas OFICIALES de tráfico y clima, publicadas por sus operadores para que cualquiera las consulte.

- Finlandia: cámaras de clima en carreteras de Fintraffic (Digitraffic, `tie.digitraffic.fi/api/weathercam/v1/stations`,
  licencia CC BY 4.0). Imagen: `weathercam.digitraffic.fi/{preset}.jpg`, se renueva cada ~10 min.
- California (EUA): cámaras de carretera de Caltrans, 12 distritos (`cwwp2.dot.ca.gov/data/dNN/cctv/cctvStatusDNN.json`,
  datos públicos del gobierno de California). Imagen fija que se renueva y, en algunas, video.
- Nueva York (EUA): cámaras de tráfico del Departamento de Transporte (NYC DOT, `webcams.nyctmc.org/api/cameras`).
Son cámaras de vialidades y clima con baja resolución, pensadas para ver el tráfico y el estado del camino. No se
guardan imágenes: el navegador pide la imagen actual al operador solo al abrir la ficha.
Salida: vivos/camaras_oficiales.geojson (la lista de cámaras se renueva una vez al día).
"""
import gzip
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SALIDA = os.path.join(ROOT, "vivos", "camaras_oficiales.geojson")
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"


def get_json(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip", "Digitraffic-User": "Geopolitica-monitor"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        b = r.read()
        if r.headers.get("Content-Encoding") == "gzip" or b[:2] == b"\x1f\x8b":
            b = gzip.decompress(b)
        return json.loads(b)


def punto(lon, lat, props):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]}, "properties": props}


def finlandia(d):
    out = []
    for f in d.get("features", []):
        p, g = f.get("properties") or {}, (f.get("geometry") or {}).get("coordinates") or []
        presets = [x["id"] for x in p.get("presets") or [] if x.get("inCollection", True)]
        if len(g) < 2 or not presets or p.get("collectionStatus") not in (None, "GATHERING"):
            continue
        out.append(punto(g[0], g[1], {"kind": "fi", "nombre": p.get("name") or p.get("id"), "operador": "Fintraffic (Finlandia)",
                                      "img": f"https://weathercam.digitraffic.fi/{presets[0]}.jpg", "otras": [f"https://weathercam.digitraffic.fi/{x}.jpg" for x in presets[1:4]],
                                      "pagina": "https://www.digitraffic.fi/en/road-traffic/", "licencia": "CC BY 4.0 · Fintraffic / digitraffic.fi"}))
    return out


def _buscar(d, clave):
    if isinstance(d, dict):
        for k, v in d.items():
            if k == clave and isinstance(v, str) and v.startswith("http"):
                return v
            r = _buscar(v, clave)
            if r:
                return r
    elif isinstance(d, list):
        for v in d:
            r = _buscar(v, clave)
            if r:
                return r
    return ""


def caltrans(d):
    out = []
    for item in d.get("data", []):
        c = item.get("cctv") or {}
        loc = c.get("location") or {}
        try:
            lon, lat = float(loc.get("longitude")), float(loc.get("latitude"))
        except (TypeError, ValueError):
            continue
        img = _buscar(c.get("imageData"), "currentImageURL")
        if c.get("inService") != "true" or not img:
            continue
        video = _buscar(c.get("imageData"), "streamingVideoURL")
        out.append(punto(lon, lat, {"kind": "ca", "nombre": f"{loc.get('locationName') or ''}".strip() or loc.get("nearbyPlace"), "lugar": loc.get("nearbyPlace") or "",
                                    "operador": f"Caltrans, distrito {loc.get('district')} (California)", "img": img, "video": video if video.startswith("https") else "",
                                    "pagina": "https://cwwp2.dot.ca.gov/vm/iframemap.htm", "licencia": "Datos públicos de Caltrans"}))
    return out


def nyc(lista):
    out = []
    for c in lista or []:
        if str(c.get("isOnline")).lower() != "true" or c.get("latitude") is None:
            continue
        out.append(punto(c["longitude"], c["latitude"], {"kind": "ny", "nombre": c.get("name"), "lugar": c.get("area") or "", "operador": "NYC DOT (Nueva York)",
                                                         "img": c.get("imageUrl") or "", "pagina": "https://webcams.nyctmc.org/", "licencia": "NYC DOT, información pública"}))
    return out


def main():
    ahora = datetime.now(timezone.utc)
    try:
        prev = json.load(open(SALIDA, encoding="utf-8"))
        if ahora - datetime.strptime(prev["generado_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=24):
            print("cámaras oficiales: datos recientes")
            return 0
    except (OSError, ValueError, KeyError):
        prev = {"features": []}
    feats, detalle = [], []
    pasos = [("Finlandia", lambda: finlandia(get_json("https://tie.digitraffic.fi/api/weathercam/v1/stations"))), ("Nueva York", lambda: nyc(get_json("https://webcams.nyctmc.org/api/cameras")))]
    pasos += [(f"Caltrans D{n}", (lambda n=n: caltrans(get_json(f"https://cwwp2.dot.ca.gov/data/d{n}/cctv/cctvStatusD{n:02d}.json", 120)))) for n in range(1, 13)]
    for nombre, fn in pasos:
        try:
            f = fn()
            feats += f
            detalle.append(f"{nombre}: {len(f)}")
        except Exception as e:  # noqa: BLE001
            detalle.append(f"{nombre}: error {e}"[:100])
        time.sleep(1)
    if len(feats) < 100:
        print(f"cámaras oficiales: solo {len(feats)} ({'; '.join(detalle)}); se conserva el anterior")
        return 0
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "detalle": detalle, "features": feats},
              open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"cámaras oficiales: {len(feats)} ({'; '.join(detalle)}); {os.path.getsize(SALIDA) // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
