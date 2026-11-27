"""Áreas aproximadas para dibujar en el mapa lo que abarca un fenómeno (no solo su punto central).

Dos formas de obtener la máscara de celdas que abarca:
  * Rejilla del modelo (GFS, 1°): `region_conectada` crece desde el centro del fenómeno por las celdas vecinas que
    cumplen la condición (p. ej. anomalía de altura ≥ la mitad de la del centro), hasta un radio máximo.
  * Estaciones o ciudades: `mascara_de_puntos` marca las celdas cercanas a puntos que cumplen la condición cuando el
    punto más cercano a esa celda también la cumple (así el área no invade zonas con estaciones normales).
Después, `poligonos` convierte cada grupo de celdas en su contorno (unión de cuadros), lo suaviza (Chaikin) y lo
devuelve como anillos [[lon, lat], …] listos para GeoJSON. Es una ESTIMACIÓN visual, no un límite oficial.
Sin dependencias fuera de la biblioteca estándar (numpy es opcional para la entrada).
"""
import math
from collections import deque

RADIO_TIERRA_KM = 6371.0


def km_entre(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(((lon2 - lon1 + 180) % 360) - 180)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * RADIO_TIERRA_KM * math.asin(min(1.0, math.sqrt(a)))


def region_conectada(cumple, i0, j0, max_dist=25):
    """Celdas (i, j) conectadas a (i0, j0) que cumplen `cumple(i, j)`, sin alejarse más de `max_dist` celdas del inicio.
    No cruza el antimeridiano (la región se corta ahí). Devuelve un conjunto; vacío si el inicio no cumple."""
    if not cumple(i0, j0):
        return set()
    vistos, cola = {(i0, j0)}, deque([(i0, j0)])
    while cola:
        i, j = cola.popleft()
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = i + di, j + dj
            if (a, b) in vistos or abs(a - i0) > max_dist or abs(b - j0) > max_dist:
                continue
            try:
                ok = cumple(a, b)
            except IndexError:
                ok = False
            if ok and a >= 0 and b >= 0:
                vistos.add((a, b))
                cola.append((a, b))
    return vistos


def mascara_de_puntos(puntos, cumple, paso=1.0, radio_km=180.0):
    """puntos: [(lon, lat, props)]; cumple(props) → bool. Celdas (fila, col) de una rejilla de `paso` grados (fila 0 = 90°N,
    col 0 = 180°O) que caen a menos de `radio_km` de un punto que cumple y cuyo punto más cercano también cumple."""
    bins = {}
    for lon, lat, p in puntos:
        bins.setdefault((math.floor(lat / 2), math.floor(lon / 2)), []).append((lon, lat, cumple(p)))
    celdas, alcance = set(), max(1, math.ceil(radio_km / 111 / paso))
    for lon, lat, p in puntos:
        if not cumple(p):
            continue
        f0, c0 = int((90 - lat) // paso), int((lon + 180) // paso)
        for f in range(f0 - alcance, f0 + alcance + 1):
            for c in range(c0 - alcance - 2, c0 + alcance + 3):
                if (f, c) in celdas or not (0 <= f < round(180 / paso)) or not (0 <= c < round(360 / paso)):
                    continue
                clat, clon = 90 - (f + 0.5) * paso, -180 + (c + 0.5) * paso
                if km_entre(lon, lat, clon, clat) > radio_km:
                    continue
                cerca = min(((km_entre(x, y, clon, clat), ok) for bi in (-1, 0, 1) for bj in (-1, 0, 1)
                             for x, y, ok in bins.get((math.floor(clat / 2) + bi, math.floor(clon / 2) + bj), [])), default=(0, True))
                if cerca[1]:
                    celdas.add((f, c))
    return celdas


def grupos(celdas):
    """Separa un conjunto de celdas en grupos conectados (vecinos de lado o de esquina)."""
    resto, out = set(celdas), []
    while resto:
        semilla = resto.pop()
        grupo, cola = {semilla}, deque([semilla])
        while cola:
            i, j = cola.popleft()
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    v = (i + di, j + dj)
                    if v in resto:
                        resto.discard(v)
                        grupo.add(v)
                        cola.append(v)
        out.append(grupo)
    return out


def _anillos(celdas):
    """Contorno de la unión de celdas: aristas que no comparten dos celdas, encadenadas en anillos (en índices de esquina)."""
    aristas = {}
    for i, j in celdas:
        for a, b in (((i, j), (i, j + 1)), ((i, j + 1), (i + 1, j + 1)), ((i + 1, j + 1), (i + 1, j)), ((i + 1, j), (i, j))):
            clave = frozenset((a, b))
            if clave in aristas:
                del aristas[clave]
            else:
                aristas[clave] = (a, b)
    siguiente = {}
    for a, b in aristas.values():
        siguiente.setdefault(a, []).append(b)
    anillos = []
    while siguiente:
        inicio = next(iter(siguiente))
        anillo, actual = [inicio], inicio
        while True:
            opciones = siguiente.get(actual)
            if not opciones:
                break
            sig = opciones.pop()
            if not opciones:
                del siguiente[actual]
            if sig == inicio:
                break
            anillo.append(sig)
            actual = sig
        if len(anillo) >= 3:
            anillos.append(anillo)
    return anillos


def _chaikin(puntos, vueltas=2):
    for _ in range(vueltas):
        nuevo = []
        for k in range(len(puntos)):
            (x0, y0), (x1, y1) = puntos[k], puntos[(k + 1) % len(puntos)]
            nuevo += [(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1), (0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1)]
        puntos = nuevo
    return puntos


def _area(anillo):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(anillo, anillo[1:] + anillo[:1]))) / 2


def poligonos(celdas, paso=1.0, min_celdas=2, suavizar=2, origen=(-180.0, 90.0), decimales=2):
    """Grupos de celdas → lista de (anillo exterior [[lon, lat], …, cerrado], celdas del grupo). Se omite lo muy pequeño.
    `origen`: lon y lat de la esquina superior izquierda de la celda (0, 0). Para una rejilla cuyos puntos son los centros
    (GFS: fila 0 = 90°N, columna 0 = 180°O) usa (-180 - paso/2, 90 + paso/2)."""
    out = []
    for g in grupos(celdas):
        if len(g) < min_celdas:
            continue
        anillos = _anillos(g)
        if not anillos:
            continue
        exterior = max(anillos, key=lambda a: _area(a))   # los huecos interiores se ignoran: es un área aproximada
        pts = _chaikin([(origen[0] + j * paso, origen[1] - i * paso) for i, j in exterior], suavizar)
        anillo = []
        for x, y in pts:
            q = [round(x, decimales), round(max(-89.9, min(89.9, y)), decimales)]
            if not anillo or anillo[-1] != q:
                anillo.append(q)
        out.append((anillo + [anillo[0]], g))
    return out


def circulo(lon, lat, radio_km, n=48):
    """Anillo aproximado de un círculo de `radio_km` alrededor de un punto."""
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        dlat = radio_km / 111.32 * math.cos(a)
        dlon = radio_km / (111.32 * max(0.05, math.cos(math.radians(lat)))) * math.sin(a)
        pts.append([round(lon + dlon, 4), round(lat + dlat, 4)])
    return pts + [pts[0]]


def feature_area(anillo, props):
    return {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [anillo]}, "properties": {**props, "es_area": True}}


ORIGEN_GFS = (-180.5, 90.5)   # rejilla de 1° con puntos en los centros de las celdas
