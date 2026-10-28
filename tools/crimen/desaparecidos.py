"""Capa «Personas desaparecidas y fosas clandestinas»: señales de noticias de los últimos 7 días (verificar).

Fuentes: las mismas que ya descarga tools/crimen/crimen.py en cada corrida (sin consultas nuevas):
  1. Titulares de medios mexicanos por RSS (config/fuentes_mx.json), ubicados por la ciudad o el estado del título.
  2. Titulares de GDELT GKG de todo el mundo, ubicados con el nomenclátor propio (tools/clima/tornados.py).

Privacidad (personas en situación de vulnerabilidad y sus familias):
  - Las notas de casos individuales («desaparece joven…», fichas de búsqueda, Alerta Amber) NO guardan el título,
    que suele traer el nombre: se guarda una etiqueta genérica, el lugar aproximado, el medio, la fecha y el enlace.
  - Los hallazgos (fosas, restos, crematorios clandestinos), las búsquedas de colectivos y las identificaciones
    guardan el título, que describe el hecho y no a una persona. Nunca se guarda el texto de la nota.
  - No se guardan fotos, edades, rasgos ni datos de contacto. Para buscar a una persona se enlaza a los registros
    oficiales (ver la ficha de la capa).
Salida: vivos/desaparecidos.geojson.
"""
import re
import unicodedata

TIPOS = [
    ("fosa", "Fosa clandestina o hallazgo de restos",
     r"\bfosas? (clandestinas?|comun(es)?)\b|\bnarcofosas?\b|\bcrematorio clandestino\b|\bcampo de exterminio\b|\bhallazgo de (restos|cuerpos|osamentas)\b"
     r"|\b(hallan|localizan|encuentran|descubren|hallaron|localizaron|encontraron) (\w+ ){0,3}(restos|cuerpos|osamentas|bolsas con restos)\b"
     r"|\bmass graves?\b|\bclandestine graves?\b|\bhuman remains (found|discovered)\b"),
    ("busqueda", "Búsqueda de colectivos y comisiones",
     r"\b(madres|colectivos?|familias|brigadas?) (de )?buscador(as|es)\b|\bcolectivos? de (busqueda|familias)\b|\bbrigada (nacional )?de busqueda\b"
     r"|\bcomision (nacional|estatal|local) de busqueda\b|\bjornada de busqueda\b|\bbusqueda en vida\b|\bsearch(ing)? mothers\b"),
    ("identificacion", "Identificación de restos y registros",
     r"\bidentifica(n|ron|cion)? (de )?(restos|cuerpos|osamentas)\b|\bbanco (nacional )?de datos forenses\b|\bcentro (regional )?de identificacion humana\b"
     r"|\bcrisis forense\b|\bcuerpos sin identificar\b|\bregistro nacional de personas desaparecidas\b|\brnpdno\b|\bunidentified (bodies|remains)\b"),
    ("desaparicion", "Desaparición de personas",
     r"\bdesaparicion(es)? (forzada|de personas|de (un|una|dos|tres|\d+) )|\bpersonas? desaparecidas?\b|\bdesaparecid[oa]s\b|\bno localizad[oa]s?\b"
     r"|\b(desaparece|desaparecen|desaparecio|desaparecieron)\b|\bficha de busqueda\b|\balerta amber\b|\benforced disappearances?\b|\bmissing persons?\b"),
]
NOMBRES = {k: n for k, n, _ in TIPOS}
_RX = [(k, re.compile(rx)) for k, _, rx in TIPOS]
# Titulares que mencionan desapariciones pero no son de esta capa.
NO_ES = re.compile(r"desaparec\w* (el|la|los) (empleo|dinero|fondos|archivos|documentos|especie|glaciar|lago|rio|tradicion|marca|empresa|programa|partido)"
                   r"|missing (out|link|piece|the)|aviones? desaparecid|vuelo desaparecid|especie|dinosauri|serie|pelicula|novela|documental|videojuego")
# Hechos que describen a una persona: el título no se guarda.
INDIVIDUAL = {"desaparicion"}


def norm(t):
    t = unicodedata.normalize("NFD", str(t or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", t)


def clasificar(titulo):
    t = norm(titulo)
    if NO_ES.search(t):
        return None
    return next((k for k, rx in _RX if rx.search(t)), None)


def feature(titulo, url, medio, fecha, st, lugar, via):
    lon, lat, nombre, iso, precision = lugar
    guardar_titulo = st not in INDIVIDUAL
    titulo_pub = titulo[:220] if guardar_titulo else f"{NOMBRES[st]} reportada en {nombre} (sin datos personales: abre la nota en el medio)"
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3)]},
            "properties": {"title": titulo_pub, "url": url, "source": medio, "date": fecha, "st": st, "tipo": NOMBRES[st],
                           "lugar": nombre, "pais_iso3": iso or "", "precision": precision, "via": via, "titulo_omitido": not guardar_titulo}}


def de_titular(titulo, url, medio, fecha, ubicar, via):
    """Titular → feature, o None si no es de la capa o no nombra un lugar más fino que el país."""
    titulo = re.sub(r"\s+", " ", titulo or "").strip()
    if not titulo or not (url or "").startswith("http"):
        return None
    st = clasificar(titulo)
    if not st:
        return None
    lugar = ubicar(titulo)
    if not lugar or lugar[4] == "país":
        return None
    return feature(titulo, url, medio, fecha, st, lugar, via)


def lugar_completo(titulo, lugar):
    """El lugar solo vale si su nombre aparece como palabra completa en el título («Guarda» no está en «Guardia Civil»)."""
    if not lugar:
        return None
    nombre = norm(str(lugar[2]).split(",")[0])
    return lugar if nombre and re.search(rf"\b{re.escape(nombre)}\b", norm(titulo)) else None


def de_gkg(filas, ubicar, titulo_de, fecha_de):
    """Filas del GKG (cualquier medio del mundo) → features."""
    out = []
    for f in filas:
        if len(f) < 27 or not f[4].startswith("http"):
            continue
        titulo = titulo_de(f[26])
        if len(titulo) < 25:
            continue
        fecha = fecha_de(f[1])
        if not fecha:
            continue
        ft = de_titular(titulo, f[4], f[3], fecha, lambda t: lugar_completo(t, ubicar(t)), "GDELT GKG (titular; lugar mencionado en el título)")
        if ft:
            out.append(ft)
    return out
