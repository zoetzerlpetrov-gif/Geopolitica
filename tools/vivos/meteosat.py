#!/usr/bin/env python3
"""Cuadros de los satélites europeos Meteosat (EUMETSAT) para los bucles animados del mapa.

Los bucles de «Nubes en vivo» y «Color real» usan NASA GIBS, que solo publica satélites geoestacionarios de América
(GOES Este y Oeste) y de Asia-Pacífico (Himawari): Europa, África, Medio Oriente, India y Rusia quedaban vacíos.
EUMETSAT los cubre con Meteosat (0° y océano Índico), pero su servidor de mapas (EUMETView) no permite que un
navegador cargue sus imágenes desde otro sitio (no envía CORS). Por eso este programa las baja en el servidor, cada
corrida de «Datos en movimiento», y las deja junto a los demás datos del sitio.

  - ir:    infrarrojo 10.8 µm de Meteosat 0° y océano Índico (msg_fes:ir108 + msg_iodc:ir108), cada 15 min.
  - color: color GeoColour del nuevo Meteosat de tercera generación (mtg_fd:rgb_geocolour) y color natural de Meteosat
           Índico (msg_iodc:rgb_naturalenhncd), cada 10-15 min.

Se pide una sola imagen por cuadro (WMS con dos capas encimadas) en proyección web Mercator, de 80° O a 150° E y de 75° S
a 75° N, cada 30 min (momento común a ambas series) y se guardan las últimas 6 (3 h) como WebP con transparencia.
Uso de datos de EUMETSAT: libre con atribución «© EUMETSAT». Salida: vivos/meteosat/indice.json y vivos/meteosat/*.webp.
"""
import io
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CARPETA = os.path.join(ROOT, "vivos", "meteosat")
WMS = "https://view.eumetsat.int/geoserver/wms"
UA = "DOMINUS-OSINT/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
PRODUCTOS = {"ir": "msg_fes:ir108,msg_iodc:ir108", "color": "mtg_fd:rgb_geocolour,msg_iodc:rgb_naturalenhncd"}
OESTE, ESTE, SUR, NORTE = -80.0, 150.0, -75.0, 75.0
ANCHO = 2048
PASO_MIN = 30
CUADROS = 6
RETRASO_MIN = 20  # EUMETView publica cada imagen ~10-15 min después de tomarla
MAX_NUEVOS = 4    # descargas nuevas por corrida y producto: EUMETView a veces tarda minutos por imagen (oct 2026)
LIMITE_S = 150    # tiempo total máximo de la corrida; lo que falte se baja en la siguiente (cada 20 min)


def merc(lon, lat):
    """Grados → metros de web Mercator (EPSG:3857)."""
    return lon * 20037508.342789244 / 180, math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * 6378137


def caja():
    (x0, y0), (x1, y1) = merc(OESTE, SUR), merc(ESTE, NORTE)
    return x0, y0, x1, y1, ANCHO, round(ANCHO * (y1 - y0) / (x1 - x0))


def momentos(ahora, n=CUADROS):
    """Últimos `n` momentos (UTC) en múltiplos de PASO_MIN ya publicados, del más antiguo al más reciente."""
    paso = PASO_MIN * 60
    ultimo = int((ahora - RETRASO_MIN * 60) // paso) * paso
    return [ultimo - (n - 1 - i) * paso for i in range(n)]


def iso(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def url_cuadro(capas, t):
    x0, y0, x1, y1, w, h = caja()
    q = {"service": "WMS", "version": "1.3.0", "request": "GetMap", "layers": capas, "styles": "", "crs": "EPSG:3857",
         "bbox": f"{x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}", "width": w, "height": h, "format": "image/png", "transparent": "true",
         "time": iso(t)}
    return WMS + "?" + urllib.parse.urlencode(q)


def a_webp(png):
    """PNG → WebP con transparencia (≈5 veces más ligero). None si no es imagen o viene vacía (sin datos a esa hora)."""
    from PIL import Image
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    if not im.getchannel("A").getbbox():
        return None
    out = io.BytesIO()
    im.save(out, "WEBP", quality=72, method=4)
    return out.getvalue()


def bajar(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        if not (r.headers.get("Content-Type") or "").startswith("image/"):
            raise ValueError(f"respuesta no es imagen: {r.read(200)!r}")
        return r.read()


def main():
    os.makedirs(CARPETA, exist_ok=True)
    ahora = time.time()
    previo = {}
    try:
        previo = json.load(open(os.path.join(CARPETA, "indice.json"), encoding="utf-8"))
    except (OSError, ValueError):
        pass
    indice = {"generado_utc": iso(ahora), "fuente": "© EUMETSAT (EUMETView WMS)", "limites": [OESTE, SUR, ESTE, NORTE], "productos": {}}
    estado = {}
    for prod, capas in PRODUCTOS.items():
        vistos = {c["t"]: c for c in (previo.get("productos") or {}).get(prod, [])}
        lista, nuevos = [], 0
        # Del más reciente al más antiguo: si el tiempo no alcanza, lo que falta son los cuadros viejos.
        for t in reversed(momentos(ahora)):
            nombre = f"{prod}_{datetime.fromtimestamp(t, timezone.utc):%Y%m%d%H%M}.webp"
            ruta = os.path.join(CARPETA, nombre)
            if iso(t) in vistos and os.path.exists(ruta):
                lista.append(vistos[iso(t)])
                continue
            if nuevos >= MAX_NUEVOS or time.time() - ahora > LIMITE_S:
                estado[f"{prod} {iso(t)}"] = "pendiente (siguiente corrida)"
                continue
            nuevos += 1
            try:
                webp = a_webp(bajar(url_cuadro(capas, t)))
            except Exception as e:  # noqa: BLE001  un cuadro faltante no detiene a los demás
                estado[f"{prod} {iso(t)}"] = f"error: {e}"[:140]
                continue
            if not webp:
                estado[f"{prod} {iso(t)}"] = "vacío"
                continue
            open(ruta, "wb").write(webp)
            lista.append({"t": iso(t), "archivo": nombre, "bytes": len(webp)})
            time.sleep(1)
        indice["productos"][prod] = sorted(lista, key=lambda c: c["t"])
    # Se borran los cuadros que ya no están en el índice (el directorio se reescribe en cada corrida).
    usados = {c["archivo"] for l in indice["productos"].values() for c in l}
    for f in os.listdir(CARPETA):
        if f.endswith(".webp") and f not in usados:
            os.remove(os.path.join(CARPETA, f))
    indice["errores"] = estado
    json.dump(indice, open(os.path.join(CARPETA, "indice.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("meteosat:", {p: len(l) for p, l in indice["productos"].items()}, estado or "")
    return 0


if __name__ == "__main__":
    sys.exit(main())
