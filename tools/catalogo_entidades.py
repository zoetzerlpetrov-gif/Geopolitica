#!/usr/bin/env python3
"""Genera config/entities.json: catálogo de entidades (Eje 2: qué es).

Cada subtipo declara de dónde sale el dato, su licencia, cada cuánto se actualiza, cómo se dibuja
y desde qué zoom aparece. El campo "licencia_verificada" distingue lo que se confirmó contra la
fuente de lo que falta revisar antes de integrar.

Uso: python3 tools/catalogo_entidades.py
"""
import json
import os

RUTA = os.path.join(os.path.dirname(__file__), "..", "config", "entities.json")

FUENTES = {
    "wikidata": {"nombre": "Wikidata", "url": "https://www.wikidata.org", "licencia": "CC0 1.0", "uso_comercial": True, "licencia_verificada": True},
    "gleif": {"nombre": "GLEIF (Legal Entity Identifier)", "url": "https://www.gleif.org", "licencia": "CC0 1.0", "uso_comercial": True, "licencia_verificada": True},
    "osm": {"nombre": "OpenStreetMap (vía Overpass API)", "url": "https://www.openstreetmap.org/copyright", "licencia": "ODbL 1.0 (atribución y compartir igual para bases derivadas)", "uso_comercial": True, "licencia_verificada": True},
    "ourairports": {"nombre": "OurAirports", "url": "https://ourairports.com/data/", "licencia": "Dominio público", "uso_comercial": True, "licencia_verificada": True},
    "wpi": {"nombre": "World Port Index (NGA, Pub. 150)", "url": "https://msi.nga.mil/Publications/WPI", "licencia": "Dominio público (gobierno de EUA)", "uso_comercial": True, "licencia_verificada": True},
    "gppd": {"nombre": "Global Power Plant Database (WRI) v1.3.0", "url": "https://datasets.wri.org/dataset/globalpowerplantdatabase", "licencia": "CC BY 4.0", "uso_comercial": True, "licencia_verificada": True, "nota": "Última versión publicada en 2021; no incluye centrales posteriores."},
    "gem": {"nombre": "Global Energy Monitor (trackers)", "url": "https://globalenergymonitor.org", "licencia": "CC BY 4.0", "uso_comercial": True, "licencia_verificada": False, "nota": "La descarga exige llenar un formulario; no se puede automatizar sin acuerdo."},
    "iaea_pris": {"nombre": "OIEA PRIS (reactores nucleares)", "url": "https://pris.iaea.org", "licencia": "Términos del OIEA", "uso_comercial": None, "licencia_verificada": False},
    "epoch": {"nombre": "Epoch AI (supercomputadoras de IA)", "url": "https://epoch.ai/data", "licencia": "CC BY 4.0", "uso_comercial": True, "licencia_verificada": False},
    "grand": {"nombre": "GRanD / GOODD (Global Dam Watch)", "url": "https://www.globaldamwatch.org", "licencia": "CC BY 4.0", "uso_comercial": True, "licencia_verificada": False},
    "telegeography": {"nombre": "TeleGeography Submarine Cable Map", "url": "https://www.submarinecablemap.com", "licencia": "CC BY-NC-SA 3.0", "uso_comercial": False, "licencia_verificada": False, "nota": "No comercial: si el proyecto se vuelve comercial hay que retirarla o licenciarla."},
    "opensky": {"nombre": "OpenSky Network", "url": "https://opensky-network.org", "licencia": "Términos de OpenSky (uso no comercial y de investigación)", "uso_comercial": False, "licencia_verificada": False},
    "adsblol": {"nombre": "adsb.lol", "url": "https://adsb.lol", "licencia": "ODbL 1.0", "uso_comercial": True, "licencia_verificada": False},
    "aisstream": {"nombre": "AISStream.io", "url": "https://aisstream.io", "licencia": "Términos de AISStream (clave gratuita)", "uso_comercial": None, "licencia_verificada": False},
    "celestrak": {"nombre": "CelesTrak (grupos GP/OMM)", "url": "https://celestrak.org", "licencia": "Uso libre con atribución; no más de una descarga por grupo cada 2 h", "uso_comercial": True, "licencia_verificada": False},
    "ofac": {"nombre": "OFAC SDN (Tesoro de EUA)", "url": "https://ofac.treasury.gov", "licencia": "Dominio público (gobierno de EUA)", "uso_comercial": True, "licencia_verificada": True},
    "opensanctions": {"nombre": "OpenSanctions", "url": "https://www.opensanctions.org", "licencia": "CC BY-NC 4.0 (uso comercial requiere licencia)", "uso_comercial": False, "licencia_verificada": True},
    "mrds": {"nombre": "USGS Mineral Resources Data System", "url": "https://mrdata.usgs.gov/mrds/", "licencia": "Dominio público (gobierno de EUA)", "uso_comercial": True, "licencia_verificada": True, "nota": "Base histórica: USGS dejó de actualizarla."},
    "natural_earth": {"nombre": "Natural Earth", "url": "https://www.naturalearthdata.com", "licencia": "Dominio público", "uso_comercial": True, "licencia_verificada": True},
    "marine_regions": {"nombre": "Marine Regions", "url": "https://www.marineregions.org", "licencia": "CC BY 4.0", "uso_comercial": True, "licencia_verificada": False},
    "gibs": {"nombre": "NASA GIBS", "url": "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api", "licencia": "Datos abiertos de la NASA, sin llave", "uso_comercial": True, "licencia_verificada": False},
    "chokepoints": {"nombre": "Lista curada del proyecto (config/chokepoints.json)", "url": "https://github.com/zoetzerlpetrov-gif/Geopolitica", "licencia": "Propia", "uso_comercial": True, "licencia_verificada": True},
    "ucdp": {"nombre": "UCDP Georeferenced Event Dataset y Candidate Events (Universidad de Uppsala)", "url": "https://ucdp.uu.se/downloads/", "licencia": "CC BY 4.0", "uso_comercial": True, "licencia_verificada": True,
             "nota": "Citar: Sundberg y Melander (2013); Hegre et al. (2020) para Candidate."},
    "pew_owid": {"nombre": "Pew Research Center, composición religiosa 2020 (vía Our World in Data)", "url": "https://ourworldindata.org/religion", "licencia": "CC BY 4.0 (OWID)", "uso_comercial": True, "licencia_verificada": False},
    "camaras_publicas": {"nombre": "Cámaras publicadas para verse en abierto (lista curada en config/camaras.json)", "url": "", "licencia": "Solo enlace: la imagen se ve en el sitio de cada operador", "uso_comercial": None, "licencia_verificada": False},
}


def sub(id_, es, en, icono, color, fuente, frecuencia, tipo_capa, estado_dato, zoom_min, areas, **extra):
    d = {"id": id_, "nombre": {"es": es, "en": en}, "icono": icono, "color": color, "fuente": fuente,
         "licencia": FUENTES[fuente]["licencia"], "frecuencia": frecuencia, "tipo_capa": tipo_capa,
         "estado_dato": estado_dato, "zoom_min": zoom_min, "areas": areas}
    d.update(extra)
    return d


CATEGORIAS = [
    {
        "id": "personas", "nombre": {"es": "Personas (rol público)", "en": "People (public role)"}, "fase": "C2",
        "dibujable": False,
        "reglas": [
            "Solo datos de rol público: nombre, cargo, organización, país y enlace a Wikidata.",
            "No se guardan coordenadas, domicilios, ubicaciones en tiempo real, familiares, datos de contacto ni vida personal.",
            "No se vinculan aeronaves ni carteras de criptomonedas privadas a personas con nombre.",
            "No tienen marcador en el mapa: aparecen solo en la ficha de organizaciones y eventos donde participan.",
        ],
        "campos_permitidos": ["id", "nombre", "cargo", "organizacion_id", "pais_iso3", "wikidata", "subtipo", "fuente", "actualizado_utc"],
        "subtipos": [
            sub("jefes_estado_gobierno", "Jefes de Estado y de gobierno", "Heads of state and government", "👤", "#4A6B8A", "wikidata", "semanal", "ficha", "estatico", None, ["instituciones", "seguridad"]),
            sub("ministros_legisladores", "Ministros y legisladores", "Ministers and legislators", "👤", "#4A6B8A", "wikidata", "semanal", "ficha", "estatico", None, ["instituciones"]),
            sub("lideres_organismos", "Líderes de organismos internacionales", "Leaders of international organizations", "👤", "#4A6B8A", "wikidata", "semanal", "ficha", "estatico", None, ["instituciones"]),
            sub("ceos_directivos", "CEOs y directivos de empresas", "CEOs and executives", "👤", "#7A6A2F", "wikidata", "mensual", "ficha", "estatico", None, ["geoeconomia", "riesgo"]),
            sub("inversionistas", "Inversionistas y multimillonarios", "Investors and billionaires", "👤", "#7A6A2F", "wikidata", "mensual", "ficha", "estatico", None, ["geoeconomia"]),
            sub("otras_figuras", "Otras figuras públicas", "Other public figures", "👤", "#9E4A7A", "wikidata", "mensual", "ficha", "estatico", None, ["identidad"]),
        ],
    },
    {
        "id": "organizaciones", "nombre": {"es": "Organizaciones", "en": "Organizations"}, "fase": "C2", "dibujable": True,
        "subtipos": [
            sub("empresas", "Empresas (por sector)", "Companies (by sector)", "🏢", "#7A6A2F", "gleif", "mensual", "ficha", "estatico", None, ["geoeconomia", "riesgo"], nota="Sin marcador propio: se ven en fichas; la sede se usa solo para relacionarla con eventos."),
            sub("gobiernos_ministerios", "Gobiernos y ministerios", "Governments and ministries", "🏛", "#4A6B8A", "wikidata", "mensual", "ficha", "estatico", None, ["instituciones"]),
            sub("embajadas_consulados", "Embajadas y consulados", "Embassies and consulates", "🏳", "#4A6B8A", "osm", "mensual", "estatica", "estatico", 7, ["instituciones"], familia="embajadas"),
            sub("organismos_internacionales", "Organismos internacionales", "International organizations", "🌐", "#4A6B8A", "wikidata", "semanal", "estatica", "estatico", 2, ["instituciones"], familia="organismos"),
            sub("bolsas_valores", "Bolsas de valores (sede e índices)", "Stock exchanges", "📈", "#7A6A2F", "wikidata", "semanal", "estatica", "estatico", 2, ["geoeconomia"], familia="organismos"),
        ],
    },
    {
        "id": "aeronaves", "nombre": {"es": "Aeronaves", "en": "Aircraft"}, "fase": "C4", "dibujable": True,
        "reglas": ["\"De Estado\" solo para aeronaves registradas a gobiernos.", "No se vinculan aviones privados a personas con nombre."],
        "subtipos": [
            sub("civil_comercial", "Civil comercial", "Commercial airliner", "✈", "#3b82c4", "adsblol", "1 min", "movimiento", "retrasado", 5, ["geografia", "geoeconomia"]),
            sub("carga", "Carga", "Cargo", "✈", "#7A6A2F", "adsblol", "1 min", "movimiento", "retrasado", 5, ["geoeconomia"]),
            sub("aviacion_general", "Aviación general", "General aviation", "✈", "#8a8f94", "adsblol", "1 min", "movimiento", "retrasado", 7, ["geografia"]),
            sub("militar", "Militar", "Military", "✈", "#A3392F", "adsblol", "1 min", "movimiento", "retrasado", 3, ["seguridad"]),
            sub("estado", "De Estado (gobiernos)", "State aircraft (governments)", "✈", "#4A6B8A", "adsblol", "1 min", "movimiento", "retrasado", 3, ["instituciones", "seguridad"]),
            sub("en_tierra", "En tierra", "On ground", "✈", "#b9c2c9", "adsblol", "1 min", "movimiento", "retrasado", 9, ["geografia"]),
            sub("sancionada", "Sancionada", "Sanctioned", "✈", "#c0392b", "ofac", "diaria", "movimiento", "retrasado", 2, ["geoeconomia", "riesgo"]),
        ],
    },
    {
        "id": "buques", "nombre": {"es": "Buques", "en": "Vessels"}, "fase": "C4", "dibujable": True,
        "subtipos": [
            sub("carga", "Carga", "Cargo", "🚢", "#7A6A2F", "aisstream", "15 min", "movimiento", "retrasado", 4, ["geoeconomia", "geografia"], ais=[70, 79]),
            sub("pasaje", "Pasaje", "Passenger", "🚢", "#3b82c4", "aisstream", "15 min", "movimiento", "retrasado", 5, ["geografia"], ais=[60, 69]),
            sub("tanqueros", "Petroleros y tanqueros", "Tankers", "🚢", "#C27C1E", "aisstream", "15 min", "movimiento", "retrasado", 3, ["energia", "geoeconomia"], ais=[80, 89]),
            sub("vela_recreo", "Vela y recreo", "Sailing and pleasure", "⛵", "#8a8f94", "aisstream", "15 min", "movimiento", "retrasado", 8, ["geografia"], ais=[36, 37]),
            sub("pesca", "Pesca", "Fishing", "🚢", "#1F8A8A", "aisstream", "15 min", "movimiento", "retrasado", 6, ["energia", "clima"], ais=[30, 30]),
            sub("militares", "Militares", "Military", "🚢", "#A3392F", "aisstream", "15 min", "movimiento", "retrasado", 3, ["seguridad"], ais=[35, 35]),
            sub("remolque_servicio", "Remolque y servicio", "Tug and service", "🚢", "#556B2F", "aisstream", "15 min", "movimiento", "retrasado", 8, ["geografia"], ais=[31, 32]),
            sub("otros", "Otros", "Other", "🚢", "#b9c2c9", "aisstream", "15 min", "movimiento", "retrasado", 7, ["geografia"]),
            sub("sancionados", "Sancionados", "Sanctioned", "🚢", "#c0392b", "ofac", "diaria", "movimiento", "retrasado", 2, ["geoeconomia", "riesgo"]),
        ],
    },
    {
        "id": "satelites", "nombre": {"es": "Satélites", "en": "Satellites"}, "fase": "C3", "dibujable": True,
        "subtipos": [
            sub("estaciones", "Estaciones espaciales e ISS", "Space stations and ISS", "🛰", "#5B4A9E", "celestrak", "cada 6 h (posición calculada en el navegador)", "movimiento", "estimado", 0, ["tecnologia"], grupo="stations"),
            sub("gnss", "Navegación GNSS (GPS, Galileo, GLONASS, BeiDou)", "GNSS navigation", "🛰", "#2E6F8E", "celestrak", "cada 6 h", "movimiento", "estimado", 0, ["tecnologia", "seguridad"], grupo="gnss"),
            sub("starlink", "Starlink (≈8,000; apagado al inicio)", "Starlink", "🛰", "#8a8f94", "celestrak", "cada 6 h", "movimiento", "estimado", 0, ["tecnologia", "seguridad"], grupo="starlink", inicial=False),
            sub("oneweb", "Internet satelital OneWeb", "OneWeb", "🛰", "#6B5BA8", "celestrak", "cada 6 h", "movimiento", "estimado", 0, ["tecnologia"], grupo="oneweb"),
            sub("iridium", "Telefonía satelital Iridium", "Iridium", "🛰", "#8a7fb8", "celestrak", "cada 6 h", "movimiento", "estimado", 0, ["tecnologia"], grupo="iridium-NEXT"),
            sub("observacion", "Observación de la Tierra y recursos", "Earth resources", "🛰", "#2F7A4A", "celestrak", "cada 6 h", "movimiento", "estimado", 0, ["clima", "energia"], grupo="resource"),
            sub("planet", "Imágenes comerciales (Planet)", "Planet imaging", "🛰", "#4F8A3A", "celestrak", "cada 6 h", "movimiento", "estimado", 0, ["tecnologia", "seguridad"], grupo="planet"),
            sub("cientificos", "Científicos", "Science", "🛰", "#1F6FB2", "celestrak", "cada 6 h", "movimiento", "estimado", 0, ["tecnologia"], grupo="science"),
            sub("meteorologicos_eo", "Meteorológicos y observación de la Tierra", "Weather and Earth observation", "🛰", "#1F8A8A", "celestrak", "cada 6 h", "movimiento", "estimado", 0, ["clima", "tecnologia"], grupo="weather"),
            sub("geoestacionarios", "Geoestacionarios (TV y comunicaciones, fijos sobre el Ecuador)", "Geostationary", "🛰", "#4A6B8A", "celestrak", "cada 6 h", "movimiento", "estimado", 0, ["tecnologia"], grupo="geo"),
            sub("militares", "Militares (solo catalogados públicamente)", "Military (publicly cataloged only)", "🛰", "#A3392F", "celestrak", "cada 6 h", "movimiento", "estimado", 0, ["seguridad", "tecnologia"], grupo="military"),
            sub("visibles", "Más brillantes / visibles", "Brightest", "🛰", "#C27C1E", "celestrak", "cada 6 h", "movimiento", "estimado", 0, ["tecnologia"], grupo="visual"),
        ],
    },
    {
        "id": "infraestructura", "nombre": {"es": "Infraestructura", "en": "Infrastructure"}, "fase": "C1", "dibujable": True,
        "subtipos": [
            sub("aeropuerto_internacional", "Aeropuertos internacionales", "International airports", "✈", "#6B5B3E", "ourairports", "mensual", "estatica", "estatico", 3, ["infraestructura", "geografia"], familia="aeropuertos"),
            sub("aeropuerto_regional", "Aeropuertos regionales", "Regional airports", "✈", "#6B5B3E", "ourairports", "mensual", "estatica", "estatico", 6, ["infraestructura"], familia="aeropuertos"),
            sub("aerodromo", "Aeródromos", "Airfields", "✈", "#8a7a5a", "ourairports", "mensual", "estatica", "estatico", 9, ["infraestructura"], familia="aeropuertos"),
            sub("helipuerto", "Helipuertos", "Heliports", "H", "#8a7a5a", "ourairports", "mensual", "estatica", "estatico", 11, ["infraestructura"], familia="aeropuertos"),
            sub("puerto_grande", "Puertos grandes", "Large ports", "⚓", "#2E6F8E", "wpi", "anual", "estatica", "estatico", 2, ["infraestructura", "geografia", "geoeconomia"], familia="puertos"),
            sub("puerto_mediano", "Puertos medianos", "Medium ports", "⚓", "#2E6F8E", "wpi", "anual", "estatica", "estatico", 5, ["infraestructura", "geografia"], familia="puertos"),
            sub("puerto_pequeno", "Puertos pequeños", "Small ports", "⚓", "#6f97ab", "wpi", "anual", "estatica", "estatico", 8, ["infraestructura"], familia="puertos"),
            *[sub(f"central_{c}", f"Centrales: {n}", f"Power plants: {e}", "⚡", col, "gppd", "estática (2021)", "estatica", "estatico", 7, ["energia", "infraestructura"], familia="centrales", combustible=c, zoom_min_grandes=3)
              for c, n, e, col in [
                  ("solar", "solar", "solar", "#e0b100"), ("hidro", "hidroeléctrica", "hydro", "#1f6fb2"), ("eolica", "eólica", "wind", "#62b0c9"),
                  ("gas", "gas", "gas", "#C27C1E"), ("carbon", "carbón", "coal", "#4a4a4a"), ("petroleo", "petróleo", "oil", "#7a4b1e"),
                  ("biomasa", "biomasa", "biomass", "#5d8a3a"), ("residuos", "residuos", "waste", "#8a6d5a"), ("nuclear", "nuclear", "nuclear", "#8A3A5C"),
                  ("geotermica", "geotérmica", "geothermal", "#b5523b"), ("almacenamiento", "almacenamiento", "storage", "#5B4A9E"), ("otros", "otros", "other", "#8a8f94")]],
            sub("datacenter_ia", "Centros de datos: IA de frontera", "Data centers: frontier AI", "🖥", "#5B4A9E", "epoch", "trimestral", "estatica", "estatico", 2, ["tecnologia", "infraestructura"], familia="centros_datos"),
            sub("datacenter_hiperescala", "Centros de datos: hiperescala", "Data centers: hyperscale", "🖥", "#5B4A9E", "osm", "mensual", "estatica", "estatico", 4, ["tecnologia", "infraestructura"], familia="centros_datos"),
            sub("datacenter_otros", "Centros de datos: otros", "Data centers: other", "🖥", "#8a7fb8", "osm", "mensual", "estatica", "estatico", 8, ["infraestructura"], familia="centros_datos"),
            *[sub(f"presa_{u}", f"Presas: {n}", f"Dams: {e}", "▲", "#1f6fb2", "osm", "mensual", "estatica", "estatico", 5 if u == "hidro" else 6, ["infraestructura", "energia", "clima"], familia="presas", uso=u)
              for u, n, e in [("hidro", "hidroeléctrica", "hydropower"), ("riego", "riego", "irrigation"), ("otros", "otros usos o sin dato", "other or unknown")]],
            sub("cables_submarinos", "Cables submarinos", "Submarine cables", "〰", "#5B4A9E", "telegeography", "mensual", "estatica", "estatico", 1, ["tecnologia", "infraestructura"], familia="cables", geometria="linea"),
            sub("aterrizajes_cable", "Puntos de aterrizaje de cables", "Cable landing points", "•", "#5B4A9E", "telegeography", "mensual", "estatica", "estatico", 4, ["infraestructura"], familia="cables"),
            sub("ductos_petroleo", "Oleoductos", "Oil pipelines", "〰", "#7a4b1e", "osm", "mensual", "estatica", "estatico", 3, ["energia", "infraestructura"], familia="ductos", geometria="linea"),
            sub("ductos_gas", "Gasoductos", "Gas pipelines", "〰", "#C27C1E", "osm", "mensual", "estatica", "estatico", 3, ["energia", "infraestructura"], familia="ductos", geometria="linea"),
        ],
    },
    {
        "id": "recursos", "nombre": {"es": "Recursos estratégicos", "en": "Strategic resources"}, "fase": "C5", "dibujable": True,
        "subtipos": [
            sub("mineria", "Minería (minerales críticos, metales)", "Mining", "⛏", "#C27C1E", "mrds", "estática", "estatica", "estatico", 5, ["energia", "geoeconomia"], familia="recursos"),
            sub("energia_yacimientos", "Energía (yacimientos, refinerías, terminales de GNL)", "Energy (fields, refineries, LNG terminals)", "🛢", "#7a4b1e", "osm", "mensual", "estatica", "estatico", 4, ["energia"], familia="recursos"),
            sub("agronomia", "Agronomía (granos y fertilizantes)", "Agronomy (grains, fertilizers)", "🌾", "#5d8a3a", "osm", "mensual", "estatica", "estatico", 5, ["energia", "demografia"], familia="recursos"),
            sub("semiconductores", "Fábricas de semiconductores", "Semiconductor fabs", "▣", "#5B4A9E", "osm", "mensual", "estatica", "estatico", 3, ["tecnologia", "geoeconomia"], familia="recursos"),
            sub("estrechos_canales", "Estrechos y canales", "Straits and canals", "◎", "#2E6F8E", "chokepoints", "estática", "estatica", "estatico", 0, ["geografia"], familia="chokepoints"),
            sub("industria_pesada", "Industria pesada", "Heavy industry", "🏭", "#4a4a4a", "osm", "mensual", "estatica", "estatico", 6, ["geoeconomia"], familia="recursos"),
            sub("otros", "Otros", "Other", "•", "#8a8f94", "osm", "mensual", "estatica", "estatico", 7, ["geoeconomia"], familia="recursos"),
        ],
    },
    {
        "id": "militar", "nombre": {"es": "Instalaciones militares (solo información pública)", "en": "Military facilities (public only)"}, "fase": "C5", "dibujable": True,
        "reglas": ["Solo nombre, tipo, país, operador y enlace a la fuente pública.", "No se publican detalles operativos más allá de lo ya publicado por la fuente."],
        "campos_permitidos": ["id", "nombre", "subtipo", "pais_iso3", "operador", "fuente", "url_fuente", "lat", "lon"],
        "subtipos": [
            sub("cuarteles_mando", "Cuarteles generales de mando", "Command headquarters", "★", "#A3392F", "osm", "mensual", "estatica", "estatico", 5, ["seguridad"], familia="militar"),
            sub("bases_navales", "Bases navales", "Naval bases", "⚓", "#A3392F", "osm", "mensual", "estatica", "estatico", 4, ["seguridad", "geografia"], familia="militar"),
            sub("bases_aereas", "Bases aéreas", "Air bases", "✈", "#A3392F", "osm", "mensual", "estatica", "estatico", 4, ["seguridad"], familia="militar"),
            sub("bases_terrestres", "Bases terrestres", "Army bases", "■", "#A3392F", "osm", "mensual", "estatica", "estatico", 6, ["seguridad"], familia="militar"),
            sub("instalaciones_nucleares", "Instalaciones nucleares", "Nuclear facilities", "☢", "#8A3A5C", "osm", "mensual", "estatica", "estatico", 3, ["seguridad", "salud_nrbq"], familia="militar"),
            sub("industria_defensa", "Fábricas e industria de defensa", "Defense industry", "🏭", "#A3392F", "wikidata", "mensual", "estatica", "estatico", 6, ["seguridad", "geoeconomia"], familia="militar"),
        ],
    },
    {
        "id": "zonas", "nombre": {"es": "Zonas geográficas", "en": "Geographic zones"}, "fase": "C1", "dibujable": True,
        "uso": "Etiquetas, búsqueda y relación de eventos con zonas (\"cerca del Golfo de México\").",
        "subtipos": [
            sub("paises", "Países", "Countries", "▭", "#556B2F", "natural_earth", "estática", "estatica", "estatico", 0, ["regional", "geografia"], familia="zonas"),
            *[sub(z, n, e, "〜", "#2E6F8E", "natural_earth", "estática", "estatica", "estatico", zm, ["geografia"], familia="zonas")
              for z, n, e, zm in [("oceanos", "Océanos", "Oceans", 0), ("mares", "Mares", "Seas", 2), ("golfos_bahias", "Golfos y bahías", "Gulfs and bays", 3),
                                  ("estrechos", "Estrechos", "Straits", 3), ("lagos", "Lagos y lagunas", "Lakes", 4), ("rios", "Ríos", "Rivers", 4)]],
            *[sub(z, n, e, "▲", "#7a6a50", "natural_earth", "estática", "estatica", "estatico", zm, ["geografia"], familia="zonas")
              for z, n, e, zm in [("peninsulas", "Penínsulas", "Peninsulas", 3), ("desiertos", "Desiertos", "Deserts", 2), ("cordilleras", "Cordilleras", "Mountain ranges", 2), ("regiones", "Regiones", "Regions", 2)]],
        ],
    },
    {
        "id": "seguimiento", "nombre": {"es": "Seguimiento (listas personales)", "en": "Watchlists"}, "fase": "C6", "dibujable": False,
        "uso": "El usuario marca una entidad o zona y ve sus eventos y cambios recientes. Se guarda solo en el navegador (localStorage).",
        "subtipos": [sub("lista_personal", "Lista personal", "Personal watchlist", "☆", "#333F48", "chokepoints", "al momento", "ficha", "tiempo_real", None, ["riesgo"])],
    },
    {
        "id": "imagenes", "nombre": {"es": "Imágenes satelitales (bajo demanda)", "en": "Satellite imagery (on demand)"}, "fase": "C6", "dibujable": True,
        "subtipos": [
            sub("viirs_noche", "Luces nocturnas VIIRS (apagones)", "VIIRS night lights", "🌃", "#333F48", "gibs", "diaria", "raster", "retrasado", 0, ["infraestructura", "energia"]),
            sub("viirs_color", "Color verdadero VIIRS (NOAA-20)", "VIIRS true color (NOAA-20)", "🌍", "#1F8A8A", "gibs", "diaria", "raster", "retrasado", 0, ["clima"]),
            sub("modis_color", "Color verdadero MODIS Terra", "MODIS Terra true color", "🌍", "#1F8A8A", "gibs", "diaria", "raster", "retrasado", 0, ["clima"]),
            sub("modis_aqua", "Color verdadero MODIS Aqua", "MODIS Aqua true color", "🌍", "#1F8A8A", "gibs", "diaria", "raster", "retrasado", 0, ["clima"]),
        ],
    },
    {
        "id": "conflicto", "nombre": {"es": "Dominio y disputa de grupos armados", "en": "Armed group dominance and contestation"}, "fase": "C7", "dibujable": True,
        "reglas": ["Violencia organizada registrada por UCDP (eventos con al menos una muerte), no control territorial.",
                   "Solo actores no estatales (cárteles, insurgencias, yihadistas, milicias); los gobiernos no se colorean."],
        "subtipos": [
            sub("conflicto_dominio", "Zona con un grupo dominante (≥ 70 % de la violencia)", "Dominated by one group", "▣", "#C0392B", "ucdp", "mensual", "estatica", "retrasado", 1, ["seguridad", "regional"], familia="conflicto"),
            sub("conflicto_disputa", "Zona en disputa (dos o más grupos)", "Contested", "▣", "#4D4D4D", "ucdp", "mensual", "estatica", "retrasado", 1, ["seguridad", "regional"], familia="conflicto"),
        ],
    },
    {
        "id": "religiones", "nombre": {"es": "Religiones", "en": "Religions"}, "fase": "C7", "dibujable": True,
        "reglas": ["Composición por país según Pew Research Center (2020). Brujería y esoterismo no se miden por separado: quedan en «populares» u «otras»."],
        "subtipos": [
            sub("religion_cristianismo", "Mayoría cristiana", "Christian majority", "✝", "#3B6FB6", "pew_owid", "anual", "estatica", "estatico", 0, ["identidad"], familia="religiones"),
            sub("religion_islam", "Mayoría musulmana", "Muslim majority", "☪", "#1E8449", "pew_owid", "anual", "estatica", "estatico", 0, ["identidad"], familia="religiones"),
            sub("religion_hinduismo", "Mayoría hindú", "Hindu majority", "ॐ", "#E67E22", "pew_owid", "anual", "estatica", "estatico", 0, ["identidad"], familia="religiones"),
            sub("religion_budismo", "Mayoría budista", "Buddhist majority", "☸", "#F1C40F", "pew_owid", "anual", "estatica", "estatico", 0, ["identidad"], familia="religiones"),
            sub("religion_judaismo", "Mayoría judía", "Jewish majority", "✡", "#5DADE2", "pew_owid", "anual", "estatica", "estatico", 0, ["identidad"], familia="religiones"),
            sub("religion_populares", "Mayoría de religiones populares o tradicionales", "Folk religion majority", "◉", "#A0522D", "pew_owid", "anual", "estatica", "estatico", 0, ["identidad"], familia="religiones"),
            sub("religion_otras", "Mayoría de otras religiones", "Other religions majority", "◇", "#8E44AD", "pew_owid", "anual", "estatica", "estatico", 0, ["identidad"], familia="religiones"),
            sub("religion_sin_religion", "Mayoría sin afiliación religiosa", "Unaffiliated majority", "○", "#95A5A6", "pew_owid", "anual", "estatica", "estatico", 0, ["identidad"], familia="religiones"),
        ],
    },
    {
        "id": "gobierno_forma", "nombre": {"es": "Forma de gobierno", "en": "Form of government"}, "fase": "C7", "dibujable": True,
        "reglas": ["Forma de gobierno registrada en Wikidata (P122). Si un país tiene varias, se colorea la de mayor prioridad (militar, teocracia, partido único, monarquía absoluta, monarquía constitucional, semipresidencial, presidencial, parlamentaria)."],
        "subtipos": [
            sub("gobforma_militar", "Junta o gobierno militar", "Military junta", "🎖", "#4E5B31", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_forma"),
            sub("gobforma_teocracia", "Teocracia", "Theocracy", "☪", "#6C3483", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_forma"),
            sub("gobforma_partido_unico", "Estado de partido único", "One-party state", "★", "#8B1A1A", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_forma"),
            sub("gobforma_monarquia_absoluta", "Monarquía absoluta", "Absolute monarchy", "👑", "#B7950B", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_forma"),
            sub("gobforma_monarquia_constitucional", "Monarquía constitucional o parlamentaria", "Constitutional monarchy", "♛", "#D4AC0D", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_forma"),
            sub("gobforma_semipresidencial", "República semipresidencial", "Semi-presidential republic", "⚖", "#16A085", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_forma"),
            sub("gobforma_presidencial", "República presidencial", "Presidential republic", "🏛", "#2471A3", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_forma"),
            sub("gobforma_parlamentaria", "República parlamentaria", "Parliamentary republic", "🏛", "#48C9B0", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_forma"),
            sub("gobforma_otra", "Otra o sin dato", "Other or no data", "?", "#AAB7B8", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_forma"),
        ],
    },
    {
        "id": "gobierno_orientacion", "nombre": {"es": "Orientación política del gobierno", "en": "Government political orientation"}, "fase": "C7", "dibujable": True,
        "reglas": ["Alineación (P1387) e ideología (P1142) del partido de quien encabeza el gobierno, según Wikidata. Es la clasificación registrada allí, editable por cualquiera; no es una opinión del proyecto.",
                   "Solo personas con rol público (jefes de Estado y de gobierno) y su partido."],
        "subtipos": [
            sub("gobor_comunista", "Comunista (partido único)", "Communist (one-party)", "■", "#7B0A0A", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_orientacion"),
            sub("gobor_extrema_izquierda", "Extrema izquierda", "Far left", "■", "#B71C1C", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_orientacion"),
            sub("gobor_izquierda", "Izquierda", "Left", "■", "#E53935", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_orientacion"),
            sub("gobor_centroizquierda", "Centroizquierda", "Centre-left", "■", "#F28B82", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_orientacion"),
            sub("gobor_centro", "Centro o amplio espectro", "Centre or big tent", "■", "#F2C94C", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_orientacion"),
            sub("gobor_centroderecha", "Centroderecha", "Centre-right", "■", "#7FB3E0", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_orientacion"),
            sub("gobor_derecha", "Derecha", "Right", "■", "#2E6DB4", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_orientacion"),
            sub("gobor_extrema_derecha", "Extrema derecha", "Far right", "■", "#0D2B5E", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_orientacion"),
            sub("gobor_sin_partido", "Sin partido (monarca, militar o independiente)", "No party", "■", "#8E8E8E", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_orientacion"),
            sub("gobor_sin_dato", "Sin dato de orientación", "No data", "■", "#C9C9C9", "wikidata", "semanal", "estatica", "estatico", 0, ["instituciones"], familia="gobierno_orientacion"),
        ],
    },
    {
        "id": "lugares_religiosos", "nombre": {"es": "Lugares religiosos relevantes", "en": "Notable religious sites"}, "fase": "C7", "dibujable": True,
        "reglas": ["Catedrales, basílicas, mezquitas, templos, sinagogas y santuarios con artículo en varias Wikipedias o declarados Patrimonio Mundial. Las iglesias de barrio no se incluyen."],
        "subtipos": [
            sub("culto_cristianismo", "Cristianismo", "Christian sites", "✝", "#3B6FB6", "wikidata", "semanal", "estatica", "estatico", 1, ["identidad"], familia="lugares_religiosos"),
            sub("culto_islam", "Islam", "Islamic sites", "☪", "#1E8449", "wikidata", "semanal", "estatica", "estatico", 1, ["identidad"], familia="lugares_religiosos"),
            sub("culto_judaismo", "Judaísmo", "Jewish sites", "✡", "#5DADE2", "wikidata", "semanal", "estatica", "estatico", 1, ["identidad"], familia="lugares_religiosos"),
            sub("culto_hinduismo", "Hinduismo", "Hindu sites", "ॐ", "#E67E22", "wikidata", "semanal", "estatica", "estatico", 1, ["identidad"], familia="lugares_religiosos"),
            sub("culto_budismo", "Budismo", "Buddhist sites", "☸", "#D4AC0D", "wikidata", "semanal", "estatica", "estatico", 1, ["identidad"], familia="lugares_religiosos"),
            sub("culto_sintoismo", "Sintoísmo", "Shinto sites", "⛩", "#C0392B", "wikidata", "semanal", "estatica", "estatico", 1, ["identidad"], familia="lugares_religiosos"),
            sub("culto_sij", "Sijismo", "Sikh sites", "☬", "#F39C12", "wikidata", "semanal", "estatica", "estatico", 1, ["identidad"], familia="lugares_religiosos"),
            sub("culto_otras", "Otras religiones", "Other sites", "◇", "#8E44AD", "wikidata", "semanal", "estatica", "estatico", 1, ["identidad"], familia="lugares_religiosos"),
        ],
    },
    {
        "id": "camaras", "nombre": {"es": "Cámaras públicas", "en": "Public cameras"}, "fase": "C6", "dibujable": True,
        "reglas": [
            "Solo cámaras que un gobierno u organismo publica para verse en abierto (tráfico, incendios forestales, clima, volcanes, canales), o que un operador turístico publica de forma intencional en su propio sitio.",
            "Nunca cámaras privadas, cámaras expuestas por error de configuración ni enlaces obtenidos por escaneo.",
            "El mapa solo enlaza a la página oficial del operador; no se copia ni se retransmite la imagen.",
            "Estado visible: en_vivo, disponible_24h, repeticion o inactiva (con tiempo de inactividad).",
        ],
        "estados": ["en_vivo", "disponible_24h", "repeticion", "inactiva"],
        "subtipos": [
            sub("trafico", "Tráfico", "Traffic", "📷", "#333F48", "camaras_publicas", "5 min", "estatica", "retrasado", 5, ["infraestructura"], familia="camaras"),
            sub("incendios", "Vigilancia de incendios forestales", "Wildfire watch", "📷", "#b5523b", "camaras_publicas", "5 min", "estatica", "retrasado", 5, ["clima"], familia="camaras"),
            sub("volcanes_clima", "Volcanes y clima", "Volcanoes and weather", "📷", "#1F8A8A", "camaras_publicas", "5 min", "estatica", "retrasado", 1, ["clima"], familia="camaras"),
            sub("canales_puertos", "Canales y puertos", "Canals and ports", "📷", "#2E6F8E", "camaras_publicas", "5 min", "estatica", "retrasado", 1, ["infraestructura", "geoeconomia"], familia="camaras"),
            sub("turismo", "Turismo y paisaje", "Tourism and landscape", "📷", "#7A6A2F", "camaras_publicas", "5 min", "estatica", "retrasado", 1, ["infraestructura"], familia="camaras"),
        ],
    },
]


def main():
    data = {
        "version": "1.0.0",
        "descripcion": "Catálogo de entidades (Eje 2: qué es). tipo_capa: estatica | movimiento | indicador | raster | ficha (ficha = solo aparece dentro de otras fichas, sin marcador).",
        "fuentes": FUENTES,
        "categorias": CATEGORIAS,
    }
    with open(RUTA, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"categorías: {len(CATEGORIAS)} · subtipos: {sum(len(c['subtipos']) for c in CATEGORIAS)}")


if __name__ == "__main__":
    main()
