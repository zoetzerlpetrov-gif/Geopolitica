"""Cámaras en vivo de Webcams de México (webcamsdemexico.com), empresa privada que transmite desde plazas, playas,
volcanes y Pueblos Mágicos. Se lee su API pública de WordPress (/wp-json/wp/v2/, permitida por su robots.txt): nombre,
categoría, ciudad, estado y coordenadas. El video es su transmisión de YouTube, que la página de cada cámara inserta;
en el mapa se muestra con el reproductor oficial de YouTube y se enlaza siempre a su página (crédito).
"""
import json
import re

API = "https://webcamsdemexico.com/wp-json/wp/v2/"
# Categoría del sitio → subtipo del mapa (una cámara con varias categorías toma la primera de esta lista).
CATEGORIAS = [("volcanes", "wcmx_volcanes"), ("pueblos-magicos", "wcmx_pueblos_magicos"), ("playas", "wcmx_playas"),
              ("cdmx", "wcmx_cdmx"), ("plazas", "wcmx_plazas"), ("ciudades", "wcmx_ciudades"), ("panoramicas", "wcmx_panoramicas")]
YT = re.compile(r"youtube(?:-nocookie)?\.com/embed/([\w-]{11})")


def subtipo(slugs):
    for slug, st in CATEGORIAS:
        if slug in slugs:
            return st
    return "wcmx_panoramicas"


def youtube_de(html):
    m = YT.search(html or "")
    return m.group(1) if m else ""


def camaras(posts, cats, youtube=lambda url: ""):
    """posts: lista de la API (webcammx); cats: {id: slug}; youtube(url) → id del video (lee la página de la cámara)."""
    out = []
    for p in posts:
        c = (p.get("cmb2") or {}).get("webcammx_single_settings") or {}
        try:
            lat, lon = float(c.get("webcammx_latitud")), float(c.get("webcammx_longitud"))
        except (TypeError, ValueError):
            continue
        if c.get("webcammx_enable") not in (None, "1", 1) or not (14 <= lat <= 33 and -119 <= lon <= -86):
            continue  # apagada o fuera de México (el sitio tiene alguna de España)
        slugs = [cats.get(i, "") for i in p.get("webcam_category") or []]
        titulo = re.sub(r"<[^>]+>", "", (p.get("title") or {}).get("rendered", "")).replace("&#8211;", "–").replace("&amp;", "&").strip()
        out.append({"id": f"wdm:{p.get('id')}", "n": titulo or c.get("webcammx_titulo", ""), "st": subtipo(slugs), "lon": lon, "lat": lat,
                    "ciudad": c.get("webcammx_ciudad", ""), "estado": c.get("webcammx_estado", ""), "url": p.get("link", ""),
                    "host": c.get("webcammx_host", ""), "yt": youtube(p.get("link", ""))})
    return out


def leer_json(b):
    return json.loads(b.decode("utf-8") if isinstance(b, bytes) else b)
