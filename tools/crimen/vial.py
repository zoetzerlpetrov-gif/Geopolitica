"""Capa «Carreteras y calles»: robo a transporte de carga, a transporte público y de vehículos, tomas de casetas,
bloqueos y protestas (señales de noticias de las últimas 72 h, por verificar).

No hay una fuente oficial abierta y diaria de estos hechos: el SESNSP publica cifras mensuales por estado, sin
lugar ni hora. Aquí se juntan tres vías que tools/crimen/crimen.py ya descarga en la misma corrida:
  1. Titulares de medios mexicanos (config/fuentes_mx.json), clasificados por palabras clave y ubicados por la
     ciudad o el estado que nombran. Sin lugar en el título no se pinta (no se inventa el centro del país).
  2. Titulares de GDELT GKG de medios con dominio .mx (los archivos que también usa la capa de tornados).
  3. Eventos codificados de GDELT 2.0 con raíz CAMEO 14 (protestas) en todo el mundo, con coordenadas:
     144 = bloquear el paso, 143 = huelga o paro, 145 = protesta violenta o disturbios.
Qué se guarda: título, enlace, medio, fecha, tipo y lugar aproximado. Nunca el texto de la nota ni nombres de
personas. Salida: vivos/vial.geojson.
"""
import re
import unicodedata
import urllib.parse
from datetime import datetime, timezone

# (subtipo, nombre, expresión sobre el título sin acentos y en minúsculas). El orden importa: gana la primera.
TIPOS = [
    ("caseta", "Toma de caseta", r"\btoma(n|ron)? (de )?(la |las )?casetas?\b|\bcasetas? tomadas?\b|\bpaso libre en (la |las )?casetas?\b|\btoll ?booths? (seized|taken)"),
    ("robo_carga", "Robo a transporte de carga", r"\brob(o|an|aron) (a|de) (un |una |los |las )?(transporte de carga|tractocamion|trailer|traileres|transportistas?|carga|mercancia|tren(es)? de carga|pipas?|camion(es)? de carga)\b"
     r"|\basalt\w* (a|de) (un |una |los )?(trailer|tractocamion|transportistas?|pipa|tren de carga|camion de carga)\b|\broba(n|ron) (un |una |el |la )?(tractocamion|trailer|pipa|camion de carga|cargamento)\b|\bcargo theft|\btruck hijack|\bhijacked (truck|trailer|cargo)"),
    ("robo_publico", "Asalto en transporte público", r"\basalt\w* (en|a) (el |un |una |los )?(transporte publico|combis?|microbus(es)?|autobus(es)?|camion(es)? de pasajeros|metrobus|unidad(es)? de transporte|pasajeros|ruta)\b"
     r"|\brob(o|an|aron) (en|a) (el |un |una |los )?(transporte publico|pasajeros|combis?|microbus(es)?|autobus(es)?)\b|\bbus robbery"),
    ("robo_vehiculo", "Robo de vehículo", r"\brobo (de|del) (su )?(auto|automovil|vehiculo|camioneta|moto|motocicleta|coche|carro)s?\b|\brobo de (autos|vehiculos|camionetas|motos)\b"
     r"|\broban (un |una |su )?(auto|vehiculo|camioneta|moto|coche|carro)\b|\bcarjack|\bcar theft|\bstolen (car|vehicle)s?\b|\bdespoja(n|ron)? de su (vehiculo|camioneta|auto|coche|carro)\b"),
    ("bloqueo", "Bloqueo de carretera o calle", r"\bbloque(o|os|an|aron) (de |en |la |el |los |las )?(la |el )?(carretera|autopista|via|vias|avenida|calles?|tramo|vialidad|puente|acceso|paso|frontera|garita)\b"
     r"|\bnarcobloqueos?\b|\bbloqueos? carreteros?\b|\bcierra(n|ron) (la |el )?(carretera|autopista|via|puente)\b|\bquema(n|ron)? (de )?(vehiculos|autos|camiones|unidades)\b"
     r"|\broad ?blocks?\b|\bhighway blockade|\bblockade of (the )?(highway|road|border)"),
    ("protesta", "Protesta, marcha o paro", r"\bmarcha(n|ron)\b|\bmarcha (por|contra|hacia|en apoyo|feminista|del orgullo|de (protesta|madres|normalistas|transportistas|campesinos|trabajadores|estudiantes|maestros|docentes|la cnte))\b|\bmanifestacion(es)?\b|\bmanifestantes\b|\bprotest(a|an|aron|as)\b|\bplanton(es)?\b"
     r"|\bparo (nacional|de labores|de transportistas|indefinido)\b|\bhuelga\b|\bprotesters?\b|\bdemonstrat(ors|ion|ions)\b|\briots?\b|\bdisturbios\b"),
]
NOMBRES = {k: n for k, n, _ in TIPOS}
_RX = [(k, re.compile(rx)) for k, _, rx in TIPOS]
VIOLENTO = re.compile(r"muert|asesin|balacera|dispar|ejecut|herid|sicari|armad|quema|incendi|enfrentamiento|killed|dead|shot|gunmen|violent|riot|disturbios")
# CAMEO 14x → subtipo de esta capa.
CAMEO = {"144": "bloqueo", "1441": "bloqueo", "1442": "bloqueo", "1443": "bloqueo", "1444": "bloqueo", "143": "paro", "1431": "paro", "1432": "paro",
         "1433": "paro", "1434": "paro", "145": "protesta_violenta", "1451": "protesta_violenta", "1452": "protesta_violenta", "1453": "protesta_violenta",
         "1454": "protesta_violenta"}
NOMBRES.update({"paro": "Huelga o paro", "protesta_violenta": "Protesta violenta o disturbios"})
MIN_ARTICULOS = 5     # protestas en el mundo: muchas, se exige cobertura
MIN_ARTICULOS_MX = 1


def norm(t):
    t = unicodedata.normalize("NFD", str(t or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", t)


def clasificar(titulo):
    """Subtipo de la capa para un titular, o None."""
    t = norm(titulo)
    return next((k for k, rx in _RX if rx.search(t)), None)


def severidad(subtipo, titulo):
    base = {"caseta": 2, "protesta": 2, "paro": 2, "robo_vehiculo": 3, "robo_publico": 3, "robo_carga": 3, "bloqueo": 3, "protesta_violenta": 3}.get(subtipo, 2)
    t = norm(titulo)
    if subtipo == "bloqueo" and re.search(r"narcobloqueo|quema", t):
        base = 4
    return min(5, base + 1) if VIOLENTO.search(t) else base


def feature(lon, lat, titulo, url, medio, fecha, subtipo, lugar, iso, precision, via, extra=None):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3)]},
            "properties": {"title": titulo[:220], "url": url, "source": medio, "date": fecha, "st": subtipo, "tipo": NOMBRES[subtipo],
                           "severidad": severidad(subtipo, titulo), "lugar": lugar, "pais_iso3": iso or "", "precision": precision, "via": via, **(extra or {})}}


def de_titular(titulo, url, medio, fecha, ubicar, via):
    """Titular de un medio → feature, o None si no es de la capa o no nombra un lugar más fino que el país."""
    st = clasificar(titulo)
    if not st:
        return None
    lugar = ubicar(titulo)
    if not lugar or lugar[4] == "país":
        return None
    lon, lat, nombre, iso, precision = lugar
    return feature(lon, lat, titulo, url, medio, fecha, st, nombre, iso, precision, via)


def evento_protesta(f, paises, C, slug_de):
    """Fila de eventos de GDELT 2.0 con raíz CAMEO 14 → feature (sin eventos ubicados solo en el país)."""
    if len(f) < 61 or f[C["raiz"]] != "14" or f[C["geo_tipo"]] == "1":
        return None
    try:
        lat, lon, articulos = float(f[C["lat"]]), float(f[C["lon"]]), int(f[C["articulos"]])
    except ValueError:
        return None
    url = f[C["url"]]
    if not url.startswith("http"):
        return None
    iso = paises.de(lon, lat)
    if articulos < (MIN_ARTICULOS_MX if iso == "MEX" else MIN_ARTICULOS):
        return None
    slug = slug_de(url)
    st = CAMEO.get(f[C["codigo"]]) or (clasificar(slug) if clasificar(slug) in ("bloqueo", "caseta") else "protesta")
    titulo = slug.capitalize() if len(slug.split()) >= 4 else f"{NOMBRES[st]} ({f[C['lugar']]})"
    fecha = datetime.strptime(f[C["fecha"]], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    precision = {"2": "estado", "5": "estado"}.get(f[C["geo_tipo"]], "ciudad")
    return feature(lon, lat, titulo, url, urllib.parse.urlparse(url).netloc, fecha, st, f[C["lugar"]], iso, precision,
                   "GDELT 2.0 (evento codificado CAMEO; el título sale del enlace)", {"cameo": f[C["codigo"]], "articulos": articulos})


def de_gkg(filas, ubicar, titulo_de):
    """Filas del GKG de medios .mx → features (titular clasificado y ubicado)."""
    out = []
    for fila in filas:
        if len(fila) < 27 or not fila[3].endswith(".mx") or not fila[4].startswith("http"):
            continue
        titulo = titulo_de(fila[26])
        if len(titulo) < 25:
            continue
        try:
            fecha = datetime.strptime(fila[1], "%Y%m%d%H%M%S").strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            continue
        ft = de_titular(titulo, fila[4], fila[3], fecha, ubicar, "GDELT GKG (titular de un medio mexicano)")
        if ft:
            out.append(ft)
    return out
