#!/usr/bin/env python3
"""Tsunamis: boletines oficiales de los centros de alerta de la NOAA (tsunami.gov), cada 20 min.

Fuentes (dominio público, gobierno de EUA; robots.txt de tsunami.gov permite /events/):
  · PTWC, Centro de Alerta de Tsunamis del Pacífico (Honolulu): https://www.tsunami.gov/events/xml/PHEBAtom.xml
  · NTWC, Centro Nacional de Alerta de Tsunamis (Palmer, Alaska): https://www.tsunami.gov/events/xml/PAAQAtom.xml
Cada canal trae su boletín más reciente: categoría (Information, Advisory, Watch, Warning, Threat,
Cancellation), magnitud preliminar, epicentro y el enlace al texto completo, que a veces trae:
  · «hazardous tsunami waves are possible for coasts located within N km» → zona de amenaza;
  · alturas pronosticadas («waves reaching 1 to 3 meters above the tide level … for some coasts of …»);
  · tabla de tiempos estimados de llegada (lugar, coordenadas, hora UTC);
  · tabla de observaciones de mareógrafos (lugar, coordenadas, hora, amplitud en metros).

Además se dibujan frentes de onda estimados cada hora: en mar abierto un tsunami viaja a √(g·h); con la
profundidad media del océano (≈ 4 km) son ≈ 700 km/h. Es una aproximación en círculos: la batimetría real
deforma el frente (avanza más lento cerca de la costa) y la tierra lo bloquea. Para tiempos reales de
llegada, la tabla del boletín o el mapa de tiempos de viaje de la NOAA.

Salida: vivos/tsunamis.geojson (epicentros, zonas de amenaza, frentes, llegadas y observaciones) y
vivos/tsunamis_estado.json (boletines acumulados por evento, 48 h tras el último).
"""
import json
import math
import os
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "vivos", "tsunamis.geojson")
ESTADO = os.path.join(ROOT, "vivos", "tsunamis_estado.json")
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
FEEDS = {"PTWC": "https://www.tsunami.gov/events/xml/PHEBAtom.xml", "NTWC": "https://www.tsunami.gov/events/xml/PAAQAtom.xml"}
NS = {"a": "http://www.w3.org/2005/Atom", "geo": "http://www.w3.org/2003/01/geo/wgs84_pos#"}
HORAS_VIGENCIA = 48
VEL_KMH = 700           # ≈ √(9.8 m/s² × 4,000 m) = 198 m/s
HORAS_FRENTE = 12       # frentes de 1 a 12 h (≈ 8,400 km) como máximo
BANDAS = 6              # el área de alcance se pinta en 6 bandas que se desvanecen con la distancia


def alcance_km(magnitud, radio_boletin=None):
    """Hasta dónde es probable que lleguen olas peligrosas. Si el boletín da la zona de amenaza, esa; si no, los
    umbrales con que el PTWC clasificaba la amenaza por magnitud (aproximados): M6.5-7.0 local (≈ 100 km),
    M7.1-7.5 regional (≈ 300 km), M7.6-7.8 regional amplia (≈ 1,000 km), M7.9+ toda la cuenca oceánica."""
    if radio_boletin:
        return float(radio_boletin)
    m = magnitud or 0
    if m >= 7.9:
        return VEL_KMH * HORAS_FRENTE
    if m >= 7.6:
        return 1000.0
    if m >= 7.1:
        return 300.0
    if m >= 6.5:
        return 100.0
    return 0.0


_TIERRA = None


def tierra():
    """Polígono de tierra firme (países de Natural Earth 1:50m, repetidos a ±360° para las longitudes continuas)."""
    global _TIERRA
    if _TIERRA is None:
        try:
            from shapely.affinity import translate
            from shapely.geometry import shape
            from shapely.ops import unary_union
            fc = json.load(open(os.path.join(ROOT, "data", "base", "countries.geojson"), encoding="utf-8"))
            base = unary_union([shape(f["geometry"]).buffer(0) for f in fc["features"]])
            _TIERRA = unary_union([base, translate(base, 360), translate(base, -360)])
        except Exception as e:  # noqa: BLE001  sin shapely se dibuja sin recortar la tierra
            print(f"   sin recorte de tierra: {e}")
            _TIERRA = False
    return _TIERRA


def mar_conectado(lon, lat, km):
    """Mar alcanzable desde el epicentro: el disco de `km` sin la tierra, y de sus pedazos solo el más cercano
    al epicentro. Así un sismo del lado del Pacífico no pinta el Caribe al otro lado del istmo de Panamá."""
    t = tierra()
    if not t:
        return None
    from shapely.geometry import Point, Polygon
    mar = Polygon(circulo(lon, lat, km)).buffer(0).difference(t)
    if mar.is_empty:
        return None
    partes = list(getattr(mar, "geoms", [mar]))
    epi = Point(lon, lat)
    return min(partes, key=lambda g: g.distance(epi))


def solo_mar(geom, mar=None):
    """Quita la tierra firme de un polígono o línea GeoJSON (el tsunami no avanza sobre el continente) y, si se
    da `mar`, recorta a ese mar conectado con el epicentro."""
    t = tierra()
    if not t:
        return geom
    from shapely.geometry import mapping, shape
    g = shape(geom).buffer(0) if geom["type"] == "Polygon" else shape(geom)
    r = g.intersection(mar) if mar is not None else g.difference(t)
    if r.is_empty:
        return None
    r = r.simplify(0.02, preserve_topology=True)
    return json.loads(json.dumps(mapping(r)))  # tuplas → listas
R = 6371.0

# Orden de gravedad de las categorías (en inglés, como las publica la NOAA) y su nombre en español.
CATEGORIAS = [("cancel", 0, "Cancelación"), ("information", 1, "Información"), ("statement", 1, "Información"), ("threat", 4, "Amenaza de tsunami"),
              ("watch", 3, "Vigilancia (watch)"), ("advisory", 3, "Aviso (advisory)"), ("warning", 5, "Alerta de tsunami (warning)")]


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def categoria(texto):
    """(nivel 0-5, nombre en español) de un texto como «Tsunami Warning Number 2»."""
    t = (texto or "").lower()
    for clave, nivel, nombre in sorted(CATEGORIAS, key=lambda c: -c[1]):
        if clave in t:
            return nivel, nombre
    return 1, "Información"


def sin_html(t):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t or "")).strip()


def leer_feed(xml, centro):
    """Atom de tsunami.gov → lista de boletines (dict)."""
    raiz = ET.fromstring(xml)
    titulo_feed = (raiz.findtext("a:title", "", NS) or "").strip()
    mapas = {l.get("title"): l.get("href", "").strip() for l in raiz.findall("a:link", NS)}
    out = []
    for e in raiz.findall("a:entry", NS):
        try:
            lat, lon = float(e.findtext("geo:lat", "", NS)), float(e.findtext("geo:long", "", NS))
        except ValueError:
            continue
        resumen = sin_html(ET.tostring(e.find("a:summary", NS), encoding="unicode", method="html") if e.find("a:summary", NS) is not None else "")
        enlaces = {l.get("title"): l.get("href", "").strip() for l in e.findall("a:link", NS)}
        m = re.search(r"Preliminary Magnitude:\s*([\d.]+)", resumen)
        cat = re.search(r"Category:\s*(\w+)", resumen)
        nivel, nombre = categoria(f"{titulo_feed} {cat.group(1) if cat else ''}")
        out.append({"centro": centro, "titulo": re.sub(r"\s+", " ", titulo_feed), "region": (e.findtext("a:title", "", NS) or "").strip(),
                    "actualizado": (e.findtext("a:updated", "", NS) or "").strip(), "lat": lat, "lon": lon,
                    "magnitud": float(m.group(1)) if m else None, "nivel": nivel, "categoria": nombre,
                    "nota": re.sub(r"\s*\*\s*", " · ", re.search(r"Note:\s*(.*?)\s*Definition:", resumen).group(1)).strip(" ·")
                    if re.search(r"Note:\s*(.*?)\s*Definition:", resumen) else "",
                    "boletin": enlaces.get("Bulletin", ""), "cap": enlaces.get("CapXML document", ""),
                    "mapa_tiempos": mapas.get("Travel Time Map", ""), "mapa_energia": mapas.get("Energy Map", "")})
    return out


# ---------------------------------------------------------------- texto del boletín
def _coord(v, h):
    x = float(v)
    return -x if h in "SW" else x


def leer_boletin(texto):
    """Datos útiles del texto de un boletín. Los formatos varían entre centros: todo es opcional."""
    t = texto.replace("\r", "")
    plano = re.sub(r"\s+", " ", t)
    d = {}
    m = re.search(r"WITHIN\s+([\d,]+)\s*(KM|KILOMETERS|MILES)\s+OF THE EARTHQUAKE EPICENTER", plano, re.I)
    if m:
        v = float(m.group(1).replace(",", ""))
        d["radio_km"] = round(v * (1.609 if m.group(2).upper() == "MILES" else 1))
    m = re.search(r"DEPTH\s+([\d.]+)\s*(MILES|KM|KILOMETERS)", plano, re.I)
    if m:
        d["profundidad_km"] = round(float(m.group(1)) * (1.609 if m.group(2).upper() == "MILES" else 1))
    m = re.search(r"(\d{3,4})\s+UTC\s+([A-Z]{3})\s+(\d{1,2})\s+(\d{4})", plano, re.I)
    if m:
        try:
            d["origen_utc"] = datetime.strptime(f"{m.group(4)} {m.group(2).title()} {int(m.group(3)):02d} {int(m.group(1)):04d}", "%Y %b %d %H%M").strftime("%Y-%m-%dT%H:%M:00Z")
        except ValueError:
            pass
    m = re.search(r"EARLIEST IMPACTS WOULD BE AROUND (.+?)\.", plano, re.I)
    if m:
        d["primer_impacto"] = m.group(1).strip()
    # Alturas pronosticadas: «* TSUNAMI WAVES REACHING 1 TO 3 METERS ABOVE THE TIDE LEVEL ARE POSSIBLE FOR SOME COASTS OF … PANAMA… COSTA RICA».
    alturas = []
    # La lista de costas es el párrafo que sigue a «COASTS OF» y termina en la siguiente línea en blanco.
    for m in re.finditer(r"WAVES REACHING\s+(.+?)\s+(?:ABOVE|BELOW).*?(?:FOR|ALONG)\s+(?:SOME\s+)?COASTS\s+OF[ \t]*\n?(?:[ \t]*\n)*(.+?)(?:\n[ \t]*\n|\Z)",
                         t, re.I | re.S):
        lugares = re.sub(r"\s*\.\.\.\s*", ", ", re.sub(r"\s+", " ", m.group(2))).strip(" .,")
        alturas.append({"altura": re.sub(r"\s+", " ", m.group(1)).strip().lower(), "costas": lugares.title()[:300]})
    if alturas:
        d["alturas"] = alturas
    # Tabla de llegadas: «PUNTARENAS   COSTA RICA   10.0N  84.8W   1810 10/09».
    llegadas = []
    for m in re.finditer(r"^\s*([A-Z][A-Z .'()/-]+?)\s{2,}([A-Z][A-Z .'()/-]+?)\s{2,}(\d{1,2}\.\d)\s*([NS])\s+(\d{1,3}\.\d)\s*([EW])\s+(\d{4})Z?\s+(\d{2}/\d{2})", t, re.M):
        llegadas.append({"lugar": m.group(1).strip().title(), "region": m.group(2).strip().title(), "lat": _coord(m.group(3), m.group(4)),
                         "lon": _coord(m.group(5), m.group(6)), "hora_utc": f"{m.group(8)} {m.group(7)[:2]}:{m.group(7)[2:]}"})
    if llegadas:
        d["llegadas"] = llegadas[:150]
    # Observaciones de mareógrafos: «BALBOA PA   8.9N  79.6W   1832   0.45M/ 1.5FT  14».
    obs = []
    for m in re.finditer(r"^\s*([A-Z][A-Z .'()/-]+?)\s{2,}(\d{1,2}\.\d)\s*([NS])\s+(\d{1,3}\.\d)\s*([EW])\s+(\d{4})Z?\s+([\d.]+)\s*M\b", t, re.M):
        obs.append({"lugar": m.group(1).strip().title(), "lat": _coord(m.group(2), m.group(3)), "lon": _coord(m.group(4), m.group(5)),
                    "hora_utc": f"{m.group(6)[:2]}:{m.group(6)[2:]}", "amplitud_m": float(m.group(7))})
    if obs:
        d["observaciones"] = obs[:100]
    return d


# ---------------------------------------------------------------- geometría
def destino(lon, lat, km, rumbo):
    d, b = km / R, math.radians(rumbo)
    f1, l1 = math.radians(lat), math.radians(lon)
    f2 = math.asin(math.sin(f1) * math.cos(d) + math.cos(f1) * math.sin(d) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(f1), math.cos(d) - math.sin(f1) * math.sin(f2))
    return math.degrees(l2), math.degrees(f2)


def circulo(lon, lat, km, n=96):
    """Círculo geodésico con longitudes continuas (no salta en el antimeridiano)."""
    pts, previo = [], None
    for i in range(n + 1):
        x, y = destino(lon, lat, km, 360 * i / n)
        if previo is not None:
            while x - previo > 180:
                x -= 360
            while x - previo < -180:
                x += 360
        previo = x
        pts.append([round(x, 3), round(max(-85, min(85, y)), 3)])
    return pts


# ---------------------------------------------------------------- eventos
def clave_evento(b):
    """Un mismo sismo llega por dos centros con coordenadas casi iguales: se agrupa por celda de ~0.5°."""
    return f"{round(b['lat'] * 2) / 2:.1f}_{round(b['lon'] * 2) / 2:.1f}"


def actualizar_estado(estado, boletines, ahora):
    for b in boletines:
        ev = estado.setdefault(clave_evento(b), {"boletines": {}})
        ev["boletines"][f"{b['centro']}|{b['actualizado']}"] = b
        ev["ultimo"] = max(ev.get("ultimo", ""), b["actualizado"])
    limite = (ahora - timedelta(hours=HORAS_VIGENCIA)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {k: v for k, v in estado.items() if v.get("ultimo", "") >= limite}


def features_evento(clave, ev, ahora):
    bs = sorted(ev["boletines"].values(), key=lambda b: b["actualizado"], reverse=True)
    ultimo = bs[0]
    # La categoría vigente es la del boletín más reciente de cada centro; se muestra la más grave.
    vigentes = {}
    for b in bs:
        vigentes.setdefault(b["centro"], b)
    peor = max(vigentes.values(), key=lambda b: b["nivel"])
    datos = {}
    for b in reversed(bs):  # lo más reciente pisa a lo anterior
        datos.update({k: v for k, v in b.get("texto", {}).items() if v})
    lon, lat = ultimo["lon"], ultimo["lat"]
    mag = next((b["magnitud"] for b in bs if b.get("magnitud")), None)
    # Hora del sismo (del boletín); si no viene, la del primer boletín (unos 10 min después del sismo).
    try:
        origen = datetime.strptime((datos.get("origen_utc") or min(b["actualizado"] for b in bs))[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        origen = ahora
    horas_desde = max(0.0, (ahora - origen).total_seconds() / 3600)
    comun = {"evento": clave, "region": ultimo["region"].title(), "magnitud": mag, "nivel": peor["nivel"], "categoria": peor["categoria"]}
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
              "properties": {**comun, "k": "epicentro", "titulo": f"{peor['categoria']} · M{mag or '?'} {ultimo['region'].title()}",
                             "actualizado": ultimo["actualizado"], "profundidad_km": datos.get("profundidad_km"), "radio_km": datos.get("radio_km"),
                             "primer_impacto": datos.get("primer_impacto", ""), "nota": next((b["nota"] for b in bs if b.get("nota")), ""),
                             "alturas": datos.get("alturas", []), "mapa_tiempos": next((b["mapa_tiempos"] for b in bs if b.get("mapa_tiempos")), ""),
                             "boletines": [{k: b[k] for k in ("centro", "titulo", "categoria", "actualizado", "boletin")} for b in bs[:8]],
                             "origen_utc": origen.strftime("%Y-%m-%dT%H:%M:%SZ"), "horas_desde": round(horas_desde, 1)}}]
    alcance = alcance_km(mag, datos.get("radio_km")) if peor["nivel"] >= 1 else 0
    feats[0]["properties"]["alcance_km"] = round(alcance)
    feats[0]["properties"]["alcance_fuente"] = "boletín" if datos.get("radio_km") else "magnitud"
    # Área probable en bandas: la más cercana, más intensa; se desvanece hacia el borde del alcance. Solo el mar
    # conectado con el epicentro.
    mar = mar_conectado(lon, lat, alcance) if alcance else None
    for i in range(BANDAS if alcance else 0):
        r0, r1 = alcance * i / BANDAS, alcance * (i + 1) / BANDAS
        anillo = circulo(lon, lat, r1)
        coords = [anillo] if i == 0 else [anillo, list(reversed(circulo(lon, lat, r0)))]
        geom = solo_mar({"type": "Polygon", "coordinates": coords}, mar)
        if geom:
            feats.append({"type": "Feature", "geometry": geom,
                          "properties": {**comun, "k": "zona", "banda": i + 1, "opacidad": round(0.5 - 0.42 * i / max(1, BANDAS - 1), 2),
                                         "titulo": f"Alcance probable: {round(r0):,} a {round(r1):,} km del epicentro"}})
    # Frentes de onda cada hora, solo dentro del alcance y sobre el mar.
    for h in range(1, HORAS_FRENTE + 1):
        if VEL_KMH * h > alcance:
            break
        geom = solo_mar({"type": "LineString", "coordinates": circulo(lon, lat, VEL_KMH * h)}, mar)
        if geom:
            feats.append({"type": "Feature", "geometry": geom,
                          "properties": {**comun, "k": "frente", "horas": h, "pasado": h <= horas_desde,
                                         "titulo": f"Frente estimado a {h} h ({VEL_KMH * h:,} km)"}})
    for l in datos.get("llegadas", []):
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [l["lon"], l["lat"]]},
                      "properties": {**comun, "k": "llegada", "titulo": f"Llegada estimada: {l['lugar']} ({l['region']})", "hora_utc": l["hora_utc"]}})
    for o in datos.get("observaciones", []):
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [o["lon"], o["lat"]]},
                      "properties": {**comun, "k": "observacion", "titulo": f"Ola medida en {o['lugar']}: {o['amplitud_m']} m",
                                     "hora_utc": o["hora_utc"], "amplitud_m": o["amplitud_m"]}})
    return feats


def main():
    ahora = datetime.now(timezone.utc)
    estado = json.load(open(ESTADO, encoding="utf-8")) if os.path.exists(ESTADO) else {}
    boletines, errores = [], []
    for centro, url in FEEDS.items():
        try:
            for b in leer_feed(get(url), centro):
                previo = estado.get(clave_evento(b), {}).get("boletines", {}).get(f"{centro}|{b['actualizado']}")
                if previo and previo.get("texto") is not None:
                    b["texto"] = previo["texto"]  # mismo boletín: no se vuelve a descargar
                elif b["boletin"]:
                    try:
                        b["texto"] = leer_boletin(get(b["boletin"]))
                    except Exception as e:  # noqa: BLE001
                        b["texto"] = {}
                        errores.append(f"{centro} boletín: {e}"[:160])
                boletines.append(b)
        except Exception as e:  # noqa: BLE001
            errores.append(f"{centro}: {e}"[:160])
        time.sleep(1)
    estado = actualizar_estado(estado, boletines, ahora)
    feats = [f for k, ev in estado.items() for f in features_evento(k, ev, ahora)]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(estado, open(ESTADO, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump({"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"),
               "fuente": "NOAA tsunami.gov (PTWC y NTWC), dominio público", "errores": errores, "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"tsunamis: {len(estado)} eventos vigentes, {len(feats)} objetos; errores: {errores}")
    for f in feats:
        if f["properties"]["k"] == "epicentro":
            print("  ", f["properties"]["titulo"], f["properties"].get("primer_impacto"), f["properties"].get("radio_km"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
