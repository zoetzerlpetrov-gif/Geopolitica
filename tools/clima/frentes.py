#!/usr/bin/env python3
"""Frentes fríos y cálidos (América del Norte y océanos vecinos) y eventos de «Norte» en el Golfo de México.

1. Frentes: boletín codificado de posiciones frontales (CODSUS, versión de alta resolución) del Weather Prediction
   Center de NOAA (`wpc.ncep.noaa.gov/discussions/codsus_hr`). Es un producto del gobierno de EUA (dominio público), se
   publica cada 3 h y cubre de ~10° N al Ártico, del Pacífico central al Atlántico. Cada línea trae un tipo (COLD,
   WARM, STNRY, OCFNT, TROF) y una lista de puntos «LLLOOOO»: latitud en décimas de grado norte y longitud en décimas
   de grado oeste (p. ej. 3051001 = 30.5° N, 100.1° O). HIGHS/LOWS traen la presión en hPa y el centro.
   Se consulta como mucho una vez por hora.
2. Nortes: el SMN de México avisa de «evento de Norte» cuando, tras un frente frío, el viento del norte sopla fuerte
   en el Golfo de México y el Istmo de Tehuantepec («Tehuano»). El SMN no tiene una API abierta, así que aquí se
   estima con el pronóstico horario de Open-Meteo (7 días) en puertos del Golfo y del Istmo: hay «Norte» cuando la
   dirección del viento está entre 300° y 60° (del NO al NE) y la ráfaga llega a 50 km/h o más. Es una ESTIMACIÓN
   propia; el aviso oficial es el del SMN (smn.conagua.gob.mx). Se consulta cada 3 h (1 petición).

Salidas: vivos/frentes.geojson y vivos/nortes.geojson. Si una fuente falla se conserva el archivo anterior.
"""
import json
import math
import os
import re
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT_FRENTES = os.path.join(ROOT, "vivos", "frentes.geojson")
OUT_NORTES = os.path.join(ROOT, "vivos", "nortes.geojson")
URL_WPC = "https://www.wpc.ncep.noaa.gov/discussions/codsus_hr"
URL_PRONOSTICO = "https://api.open-meteo.com/v1/forecast"
TIPOS = {"COLD": ("frio", "Frente frío"), "WARM": ("calido", "Frente cálido"), "STNRY": ("estacionario", "Frente estacionario"),
         "OCFNT": ("ocluido", "Frente ocluido"), "TROF": ("vaguada", "Vaguada"), "DRYLINE": ("linea_seca", "Línea seca"),
         "SQLN": ("linea_turbonada", "Línea de turbonada")}

# Puertos y costas donde el SMN suele avisar de Norte (Golfo de México, Península de Yucatán e Istmo de Tehuantepec).
PUERTOS = [("Matamoros, Tamps.", 25.87, -97.50), ("La Pesca, Tamps.", 23.78, -97.75), ("Tampico, Tamps.", 22.25, -97.85),
           ("Tuxpan, Ver.", 20.96, -97.40), ("Nautla, Ver.", 20.21, -96.77), ("Veracruz, Ver.", 19.20, -96.13),
           ("Alvarado, Ver.", 18.77, -95.76), ("Coatzacoalcos, Ver.", 18.15, -94.42), ("Paraíso, Tab.", 18.40, -93.21),
           ("Ciudad del Carmen, Camp.", 18.65, -91.83), ("Campeche, Camp.", 19.85, -90.53), ("Celestún, Yuc.", 20.86, -90.40),
           ("Progreso, Yuc.", 21.28, -89.66), ("Río Lagartos, Yuc.", 21.60, -88.16), ("Cancún, Q. Roo", 21.16, -86.85),
           ("Salina Cruz, Oax. (Istmo)", 16.17, -95.20), ("Juchitán, Oax. (Istmo)", 16.43, -95.02), ("La Ventosa, Oax. (Istmo)", 16.55, -94.95),
           ("Puerto Chiapas, Chis.", 14.70, -92.40)]
ISTMO = "Istmo"
RAFAGA_NORTE = 50   # km/h
RAFAGA_FUERTE = 70
RAFAGA_MUY_FUERTE = 90


def viejo(ruta, horas, ahora):
    try:
        gen = json.load(open(ruta, encoding="utf-8")).get("generado_utc", "")
        return ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) >= timedelta(hours=horas)
    except (OSError, ValueError):
        return True


def guardar(ruta, fc):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    json.dump(fc, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


def punto(cod):
    """«LLLOOOO» (alta resolución) o «LLOOO» (normal) → (lon, lat) en grados; longitud oeste negativa."""
    if len(cod) == 7:
        lat, lon_o = int(cod[:3]) / 10, int(cod[3:]) / 10
    elif len(cod) in (4, 5):
        lat, lon_o = int(cod[:2]), int(cod[2:])
    else:
        return None
    lon = -lon_o if lon_o <= 180 else 360 - lon_o
    return [round(lon, 1), lat]


def valido_de(texto, ahora):
    """«VALID 101600Z» = mes 10, día 16, 00 UTC."""
    m = re.search(r"VALID\s+(\d{2})(\d{2})(\d{2})Z", texto)
    if not m:
        return None
    mes, dia, hora = map(int, m.groups())
    anio = ahora.year - (1 if mes > ahora.month + 6 else 0)
    try:
        return datetime(anio, mes, dia, hora, tzinfo=timezone.utc)
    except ValueError:
        return None


def frentes_de(texto, ahora=None):
    """Texto CODSUS → lista de features (líneas de frentes y puntos de altas/bajas presiones)."""
    ahora = ahora or datetime.now(timezone.utc)
    valido = valido_de(texto, ahora)
    vfecha = valido.strftime("%Y-%m-%dT%H:%M:%SZ") if valido else ""
    # Las líneas que no empiezan con palabra clave continúan la anterior.
    bloques, actual = [], None
    for linea in texto.splitlines():
        partes = linea.split()
        if not partes:
            continue
        if re.fullmatch(r"[A-Z]+", partes[0]) and (partes[0] in TIPOS or partes[0] in ("HIGHS", "LOWS")):
            actual = [partes[0], partes[1:]]
            bloques.append(actual)
        elif actual and all(re.fullmatch(r"\d+", p) for p in partes):
            actual[1].extend(partes)
        else:
            actual = None
    feats = []
    for clave, toks in bloques:
        if clave in ("HIGHS", "LOWS"):
            for i in range(0, len(toks) - 1, 2):
                p = punto(toks[i + 1])
                if not p:
                    continue
                feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": p}, "properties": {
                    "kind": "alta" if clave == "HIGHS" else "baja", "presion_hpa": int(toks[i]), "valido_utc": vfecha,
                    "nombre": f"{'Alta' if clave == 'HIGHS' else 'Baja'} presión {toks[i]} hPa"}})
            continue
        pts = [p for p in (punto(t) for t in toks) if p]
        # Quita puntos repetidos seguidos (el boletín a veces repite el último).
        pts = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
        if len(pts) < 2:
            continue
        kind, nombre = TIPOS[clave]
        mexico = any(14 <= lat <= 32.7 and -118 <= lon <= -86 for lon, lat in pts)
        feats.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": pts}, "properties": {
            "kind": kind, "nombre": nombre, "valido_utc": vfecha, "toca_mexico": mexico,
            "lat_min": min(lat for _, lat in pts)}})
    return feats, vfecha


def nivel_rafaga(r):
    return 3 if r >= RAFAGA_MUY_FUERTE else 2 if r >= RAFAGA_FUERTE else 1 if r >= RAFAGA_NORTE else 0


def del_norte(d):
    return d is not None and (d >= 300 or d <= 60)


def nortes_de(respuestas, puertos=PUERTOS):
    """Respuestas de Open-Meteo (una por puerto, mismo orden) → features con las horas de Norte de los próximos 7 días."""
    feats = []
    for (nombre, lat, lon), r in zip(puertos, respuestas):
        h = (r or {}).get("hourly") or {}
        horas = []
        for t, d, v, g in zip(h.get("time", []), h.get("wind_direction_10m", []), h.get("wind_speed_10m", []), h.get("wind_gusts_10m", [])):
            if g is not None and del_norte(d) and g >= RAFAGA_NORTE:
                horas.append([t, round(d), round(v or 0), round(g)])
        maxr = max((x[3] for x in horas), default=0)
        dias = sorted({x[0][:10] for x in horas})
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": {
            "name": nombre, "istmo": ISTMO in nombre, "nivel": nivel_rafaga(maxr), "rafaga_max_kmh": maxr,
            "inicio": horas[0][0] if horas else "", "fin": horas[-1][0] if horas else "", "dias": dias, "horas": len(horas),
            "serie": [[x[0], x[3]] for x in horas[:: max(1, len(horas) // 40)]]}})
    return feats


# ---------------------------------------------------------------- movimiento y zona de influencia
# NOAA no publica la velocidad de cada frente en este boletín. Se ESTIMA comparando el análisis actual con el anterior
# (cada 3 h): para cada punto del frente se busca el punto más cercano del mismo frente en el análisis previo; el
# promedio de esos desplazamientos da dirección y velocidad. Con eso se dibuja una posición tentativa a 12 h.
# Zona de influencia (franja aproximada, no un aviso): delante del frente frío ~150 km (lluvia y tormentas en la línea)
# y detrás ~350 km (aire frío, viento del norte); en el cálido al revés (las nubes y lluvia van delante, ~300 km).
FRONTALES = {"frio", "calido", "estacionario", "ocluido"}
ANCHO_ZONA = {"frio": (150, 350), "calido": (300, 100), "estacionario": (150, 150), "ocluido": (200, 200)}  # km (delante, detrás)
VEL_MAX_KMH = 90
RUMBOS = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"]


def a_km(lon, lat, lat0):
    return lon * 111.32 * math.cos(math.radians(lat0)), lat * 110.57


def de_km(x, y, lat0):
    return x / (111.32 * math.cos(math.radians(lat0))), y / 110.57


def punto_mas_cercano(p, linea, lat0):
    """Vector (dx, dy) en km desde el punto más cercano de `linea` hasta `p` (coordenadas lon/lat)."""
    px, py = a_km(*p, lat0)
    mejor = None
    for (ax, ay), (bx, by) in zip(linea, linea[1:]):
        ax, ay = a_km(ax, ay, lat0)
        bx, by = a_km(bx, by, lat0)
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
        v = (px - (ax + t * dx), py - (ay + t * dy))
        if mejor is None or v[0] ** 2 + v[1] ** 2 < mejor[0] ** 2 + mejor[1] ** 2:
            mejor = v
    return mejor


def movimiento(coords, previas, horas):
    """→ (vx, vy) en km/h, o None si ningún frente previo corresponde a este. `previas`: listas de coordenadas."""
    if not previas or not 0 < horas <= 12:
        return None
    maxd = VEL_MAX_KMH * horas
    mejor = None
    for prev in previas:
        if len(prev) < 2 or abs(prev[0][0] - coords[0][0]) > 60:
            continue
        vs = [punto_mas_cercano(p, prev, p[1]) for p in coords]
        cerca = [v for v in vs if math.hypot(*v) <= maxd]
        if len(cerca) < max(2, len(coords) / 2):
            continue
        prom = (sum(v[0] for v in cerca) / len(cerca), sum(v[1] for v in cerca) / len(cerca))
        err = sum(math.hypot(*v) for v in cerca) / len(cerca)
        if mejor is None or err < mejor[0]:
            mejor = (err, prom)
    return (mejor[1][0] / horas, mejor[1][1] / horas) if mejor else None


def rumbo(vx, vy):
    """Dirección HACIA la que se mueve (0 = norte, 90 = este) y su nombre."""
    g = (math.degrees(math.atan2(vx, vy)) + 360) % 360
    return round(g), RUMBOS[round(g / 45) % 8]


def zona(coords, kind, v=None):
    """Polígono de la franja de influencia alrededor del frente (km convertidos a grados en cada vértice)."""
    if len(coords) < 2 or max(c[0] for c in coords) - min(c[0] for c in coords) > 180:
        return None
    delante, detras = ANCHO_ZONA[kind]
    if not v or math.hypot(*v) < 3:  # sin movimiento claro: franja simétrica
        delante = detras = max(delante, detras) * 0.6
    a, b = [], []
    for i, (lon, lat) in enumerate(coords):
        p0, p1 = coords[max(0, i - 1)], coords[min(len(coords) - 1, i + 1)]
        x0, y0 = a_km(*p0, lat)
        x1, y1 = a_km(*p1, lat)
        tx, ty = x1 - x0, y1 - y0
        n = math.hypot(tx, ty) or 1
        nx, ny = -ty / n, tx / n  # normal izquierda
        if v and nx * v[0] + ny * v[1] < 0:
            nx, ny = -nx, -ny  # que la normal apunte hacia donde avanza el frente
        dla, dfa = de_km(nx * delante, ny * delante, lat)
        dlb, dfb = de_km(-nx * detras, -ny * detras, lat)
        a.append([round(lon + dla, 2), round(max(-89, min(89, lat + dfa)), 2)])
        b.append([round(lon + dlb, 2), round(max(-89, min(89, lat + dfb)), 2)])
    anillo = a + b[::-1] + [a[0]]
    return {"type": "Polygon", "coordinates": [anillo]}


def trasladar(coords, v, horas):
    out = []
    for lon, lat in coords:
        dl, df = de_km(v[0] * horas, v[1] * horas, lat)
        out.append([round(lon + dl, 2), round(lat + df, 2)])
    return out


def enriquecer(feats, previo, valido):
    """Agrega a cada frente su movimiento estimado, su zona de influencia y la posición tentativa a 12 h."""
    horas = 0
    try:
        horas = (datetime.strptime(valido, "%Y-%m-%dT%H:%M:%SZ") - datetime.strptime(previo.get("valido_utc", ""), "%Y-%m-%dT%H:%M:%SZ")).total_seconds() / 3600
    except (ValueError, AttributeError):
        pass
    previas = [l["coords"] for l in (previo or {}).get("lineas", [])]
    extra = []
    for f in feats:
        p = f["properties"]
        if f["geometry"]["type"] != "LineString" or p["kind"] not in FRONTALES:
            continue
        c = f["geometry"]["coordinates"]
        v = movimiento(c, previas, horas)
        if v:
            g, nombre = rumbo(*v)
            vel = round(math.hypot(*v))
            p.update({"mov_kmh": vel, "mov_grados": g, "mov_hacia": nombre if vel >= 3 else "", "mov_horas_base": round(horas, 1)})
            if vel >= 3:
                extra.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": trasladar(c, v, 12)}, "properties": {
                    "kind": "tentativo_12h", "de": p["kind"], "nombre": f"{p['nombre']}: posición tentativa en 12 h", "valido_utc": p["valido_utc"],
                    "mov_kmh": vel, "mov_hacia": nombre, "toca_mexico": False}})
        z = zona(c, p["kind"], v)
        if z:
            extra.append({"type": "Feature", "geometry": z, "properties": {
                "kind": "zona", "opacidad": 0.12, "de": p["kind"], "nombre": f"Zona de influencia: {p['nombre'].lower()}", "valido_utc": p["valido_utc"],
                "ancho_km": ANCHO_ZONA[p["kind"]], "con_movimiento": bool(v and math.hypot(*v) >= 3), "toca_mexico": p.get("toca_mexico", False),
                **({k: p[k] for k in ("mov_kmh", "mov_hacia") if k in p})}})
    # Zonas primero (quedan debajo de las líneas al dibujar).
    return [f for f in extra if f["properties"]["kind"] == "zona"] + feats + [f for f in extra if f["properties"]["kind"] != "zona"]


def actualizar_frentes(ahora):
    if not viejo(OUT_FRENTES, 1, ahora):
        return "frentes: datos recientes"
    if not F.permitido_por_robots(URL_WPC):
        return "frentes: robots.txt no lo permite"
    texto = F.get(URL_WPC, timeout=40).decode("utf-8", "replace")
    feats, valido = frentes_de(texto, ahora)
    if not any(f["geometry"]["type"] == "LineString" for f in feats):
        return "frentes: boletín sin frentes; se conserva el anterior"
    # Análisis anterior: si el boletín cambió, el que estaba publicado pasa a ser «previo»; si es el mismo, se conserva el previo.
    anterior = {}
    try:
        anterior = json.load(open(OUT_FRENTES, encoding="utf-8"))
    except (OSError, ValueError):
        pass
    if anterior.get("valido_utc") and anterior.get("valido_utc") != valido:
        previo = {"valido_utc": anterior["valido_utc"], "lineas": [{"kind": f["properties"]["kind"], "coords": f["geometry"]["coordinates"]}
                                                               for f in anterior.get("features", []) if f["geometry"]["type"] == "LineString"
                                                               and f["properties"].get("kind") in FRONTALES]}
    else:
        previo = anterior.get("previo") or {}
    feats = enriquecer(feats, previo, valido)
    guardar(OUT_FRENTES, {"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "valido_utc": valido,
                          "fuente": "NOAA WPC, posiciones frontales codificadas (CODSUS)", "previo": previo, "features": feats})
    frios = [f for f in feats if f["properties"]["kind"] == "frio"]
    con_mov = sum(1 for f in feats if "mov_kmh" in f["properties"] and f["geometry"]["type"] == "LineString" and f["properties"]["kind"] in FRONTALES)
    return (f"frentes: {len(feats)} objetos, {len(frios)} frentes fríos ({sum(f['properties']['toca_mexico'] for f in frios)} sobre México), "
            f"válido {valido}; con movimiento estimado: {con_mov} (análisis previo {previo.get('valido_utc') or 'ninguno aún'})")


def actualizar_nortes(ahora):
    if not viejo(OUT_NORTES, 3, ahora):
        return "nortes: datos recientes"
    q = {"latitude": ",".join(str(p[1]) for p in PUERTOS), "longitude": ",".join(str(p[2]) for p in PUERTOS),
         "hourly": "wind_speed_10m,wind_direction_10m,wind_gusts_10m", "forecast_days": 7, "timezone": "UTC"}
    datos = json.loads(F.get(f"{URL_PRONOSTICO}?{urllib.parse.urlencode(q)}", timeout=60))
    datos = datos if isinstance(datos, list) else [datos]
    if len(datos) != len(PUERTOS):
        return f"nortes: respuesta con {len(datos)} puntos (se esperaban {len(PUERTOS)}); se conserva el anterior"
    feats = nortes_de(datos)
    guardar(OUT_NORTES, {"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"),
                         "fuente": "Estimación propia con el pronóstico de Open-Meteo (el aviso oficial es del SMN)",
                         "umbral": f"viento del NO al NE con ráfagas de {RAFAGA_NORTE} km/h o más", "features": feats})
    con = [f["properties"]["name"] for f in feats if f["properties"]["nivel"]]
    return f"nortes: {len(con)} de {len(feats)} puertos con Norte en 7 días: {', '.join(con[:8])}"


def main():
    ahora = datetime.now(timezone.utc)
    for paso in (actualizar_frentes, actualizar_nortes):
        try:
            print(paso(ahora))
        except Exception as e:  # noqa: BLE001  se conserva el archivo anterior
            print(f"{paso.__name__}: error {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
