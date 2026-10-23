"""Emergencias aéreas reportadas por la prensa (cualquier aerolínea, todo el mundo).

El squawk 7700/7600/7500 solo se ve si un receptor voluntario de ADS-B capta al avión en ese momento; en buena parte de
México (y de África, Sudamérica o Asia) hay pocos receptores, y muchas emergencias se declaran por radio sin cambiar el
código. Por eso la capa también muestra titulares que informan de un aterrizaje de emergencia, un desvío o un regreso
al aeropuerto. Fuentes: medios mexicanos por RSS (config/fuentes_mx.json) y titulares de GDELT GKG de todo el mundo,
los mismos que ya lee tools/crimen/crimen.py, que es quien llama a este módulo.

Se guarda solo título, medio, fecha, enlace y lugar (sin texto de la nota). El lugar sale del título; una nota que no
nombra ciudad, estado o país no se pinta. Ventana: 48 h. Salida: vivos/emergencias_prensa.geojson, que
tools/transporte/emergencias_aereas.py une a la capa de squawk.
"""
import re
from datetime import datetime

# Frases que por sí solas describen una emergencia aérea.
FUERTE = re.compile(
    r"aterriz\w* de emergencia|aterrizaje (forzoso|de precauci[oó]n)|aterriz\w* (de )?forzos|amarizaje|emergencia a[eé]rea|emergencia en (pleno )?vuelo|"
    r"emergency landing|forced landing|precautionary landing|mid-?air emergency|in-?flight emergency|mayday|squawk\w* 7[057]00|"
    r"pouso de emerg[eê]ncia|pouso for[cç]ado|atterrissage d.urgence|atterraggio di emergenza|notlandung|aterragem de emerg[eê]ncia", re.I)
# Frases que necesitan además una palabra de aviación en el título.
DEBIL = re.compile(
    r"declar\w* (una |la )?emergencia|regres\w* (de emergencia )?a(l)? (aeropuerto|AIFA|AICM|tierra)|regres\w* .{0,30}por (una )?falla|retorn\w* al aeropuerto|"
    r"(vuelo|avi[oó]n|aeronave)\w* .{0,40}desv[ií][oa]|desv[ií][oa]\w* .{0,30}(vuelo|avi[oó]n)|"
    r"(falla|falla mec[aá]nica|humo|fuego|incendio|despresuriz\w*|turbulencia severa) .{0,40}(vuelo|avi[oó]n|aeronave)|"
    r"declare[sd]? (an? |a full )?emergency|returns? to (the )?(airport|gate)|(flight|plane|jet)s? .{0,40}(turn(s|ed)? back|divert)|"
    r"divert\w* .{0,30}(flight|plane)|\bdiverts? to\b|\bdesv[ií]ad[oa]s? (a|hacia)\b|"
    r"(engine|smoke|fire|depressuri[sz]ation|bird strike) .{0,40}(flight|plane|jet)|severe turbulence", re.I)
AVION = re.compile(r"\b(avi[oó]n|aviones|vuelo|aeronave|aerol[ií]nea|avioneta|jet|flight|plane|aircraft|airliner|airline|airbus|boeing|embraer|"
                   r"bombardier|atr|cessna|helic[oó]ptero|helicopter|aeropuerto|airport|voo|vol|volo|flug|a32\d|a33\d|b7[3-8]7|737|787)\b", re.I)
NO_ES = re.compile(r"simulacro|\bdrill\b|aniversario|anniversary|years? ago|hace \d+ años|pel[ií]cula|\bmovie\b|serie de|videojuego|"
                   r"cr[oó]nica de|documental|documentary|mercado|stock|acciones de|recursos|fondos|presupuesto|licitaci|contrato|corrupci|funds|budget", re.I)

# Aerolíneas que se reconocen en el título (solo informativo: la capa incluye cualquier aerolínea u operador).
AEROLINEAS = [
    "Mexicana de Aviación", "Mexicana", "Aeroméxico", "Aeromexico", "Volaris", "Viva Aerobus", "VivaAerobus", "Magnicharters", "TAR Aerolíneas", "Aeromar", "Calafia",
    "American Airlines", "United Airlines", "Delta", "Southwest", "Alaska Airlines", "JetBlue", "Spirit", "Frontier", "Allegiant", "Hawaiian",
    "Air Canada", "WestJet", "Avianca", "LATAM", "Copa Airlines", "Aerolíneas Argentinas", "JetSMART", "Sky Airline", "Arajet", "Gol", "Azul",
    "Iberia", "Air Europa", "Vueling", "Ryanair", "easyJet", "Wizz Air", "Lufthansa", "Air France", "KLM", "British Airways", "ITA Airways",
    "Turkish Airlines", "Pegasus", "Aeroflot", "Emirates", "Qatar Airways", "Etihad", "Saudia", "Ethiopian", "EgyptAir", "Air India", "IndiGo",
    "Singapore Airlines", "Cathay Pacific", "Qantas", "Virgin Australia", "Air New Zealand", "Air China", "China Eastern", "China Southern",
    "Japan Airlines", "ANA", "Korean Air", "Asiana", "Jeju Air", "Vietnam Airlines", "Thai Airways", "Philippine Airlines", "Cebu Pacific", "AirAsia",
]
_RX_AEROLINEA = re.compile(r"\b(" + "|".join(re.escape(a) for a in sorted(AEROLINEAS, key=len, reverse=True)) + r")\b")

# Aeropuertos de México que los titulares nombran por sigla o por su nombre (no siempre por la ciudad).
AEROPUERTOS_MX = [
    (r"\bAIFA\b|Felipe [ÁA]ngeles", "AIFA (Santa Lucía, Estado de México)", 19.741, -99.014),
    (r"\bAICM\b|Benito Ju[aá]rez de la Ciudad de M[eé]xico|aeropuerto de la (CDMX|Ciudad de M[eé]xico)", "AICM (Ciudad de México)", 19.436, -99.072),
]


def es_emergencia_aerea(titulo):
    """True si el titular informa de una emergencia de un avión o helicóptero."""
    t = titulo or ""
    if NO_ES.search(t):
        return False
    # Contexto de aviación: una palabra del oficio, el AIFA/AICM o una aerolínea («Mexicana» sola también es gentilicio).
    contexto = AVION.search(t) or re.search(r"\b(AIFA|AICM)\b", t) or (aerolinea_de(t) not in ("", "Mexicana", "Delta", "Gol", "Azul", "Spirit", "Frontier"))
    return bool(FUERTE.search(t) or (DEBIL.search(t) and contexto))


def aerolinea_de(titulo):
    m = _RX_AEROLINEA.search(titulo or "")
    return m.group(1) if m else ""


def ubicar_aeropuerto_mx(titulo):
    for rx, nombre, lat, lon in AEROPUERTOS_MX:
        if re.search(rx, titulo or ""):
            return lon, lat, nombre, "MEX", "aeropuerto"
    return None


def feature(titulo, url, medio, fecha, lugar, via):
    lon, lat, nombre, iso, precision = lugar
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3)]},
            "properties": {"title": titulo[:220], "url": url, "source": medio, "date": fecha, "lugar": nombre, "pais_iso3": iso or "",
                           "precision": precision, "aerolinea": aerolinea_de(titulo), "via": via}}


def de_titular(titulo, url, medio, fecha, ubicar, via):
    """Titular → feature, o None si no es una emergencia aérea o no nombra un lugar."""
    titulo = re.sub(r"\s+", " ", titulo or "").strip()
    if not titulo or not (url or "").startswith("http") or not es_emergencia_aerea(titulo):
        return None
    lugar = ubicar_aeropuerto_mx(titulo) or ubicar(_RX_AEROLINEA.sub(" ", titulo))
    if not lugar:
        return None
    return feature(titulo, url, medio, fecha, lugar, via)


def ubicar_mundo(titulo, nomenclator):
    """(lon, lat, lugar, iso3, precisión) con el nomenclátor de tools/clima/tornados.py. Antes se quitan los nombres de
    aerolíneas («Delta» es también un estado de Nigeria) y, si gana un estado que se llama igual que una ciudad
    («Mérida»), se toma la ciudad más poblada con ese nombre: en notas de aviación suele ser la del aeropuerto."""
    limpio = _RX_AEROLINEA.sub(" ", titulo)
    u = nomenclator.ubicar(limpio)
    if not u:
        return None
    nombre, lat, lon, prec, iso = u
    if prec == "estado":
        homonimas = [h for h in nomenclator.buscar(limpio) if h[0] == 0 and h[5] == nombre]
        if homonimas:
            h = max(homonimas, key=lambda x: x[6])
            return h[4], h[3], h[5], h[2], "ciudad"
    return lon, lat, nombre, iso, prec


def de_gkg(filas, nomenclator, titulo_de):
    """Filas del GKG (cualquier medio del mundo) → features. El lugar sale del título con el nomenclátor propio."""
    out = []
    for f in filas:
        if len(f) < 27 or not f[4].startswith("http"):
            continue
        titulo = titulo_de(f[26])
        if len(titulo) < 25 or not es_emergencia_aerea(titulo):
            continue
        try:
            fecha = datetime.strptime(f[1], "%Y%m%d%H%M%S").strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            continue
        # El nombre del medio suele ir al final tras « | » o « - »: no es el lugar.
        cuerpo = re.split(r"\s[|–—-]\s(?=[^|–—-]*$)", titulo)[0] if re.search(r"\s[|–—-]\s", titulo) else titulo

        def ubicar(t, cuerpo=cuerpo):
            return ubicar_mundo(cuerpo, nomenclator)
        ft = de_titular(titulo, f[4], f[3], fecha, ubicar, "GDELT GKG (titular; lugar mencionado en el título)")
        if ft:
            out.append(ft)
    return out
