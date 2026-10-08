#!/usr/bin/env python3
"""Fase B: agrega subtemas y las áreas 12 y 13 a config/taxonomy.json (idempotente).

Se conserva todo lo existente; solo se agregan subtemas cuyo id no exista todavía.
Uso: python3 tools/fase_b_taxonomia.py
"""
import json
import os

RUTA = os.path.join(os.path.dirname(__file__), "..", "config", "taxonomy.json")


def st(id_, nombre, es, en):
    return {"id": id_, "nombre": nombre, "palabras_clave": {"es": es, "en": en}}


NUEVOS_SUBTEMAS = {
    "geografia": [
        st("puertos_aeropuertos", "Puertos y aeropuertos estratégicos", ["puerto", "terminal portuaria", "aeropuerto", "puerto de aguas profundas"], ["port", "seaport", "port terminal", "airport"]),
        st("estrechos_trafico", "Estrechos con tráfico en tiempo real", ["tráfico marítimo", "tránsitos", "congestión portuaria", "buques en espera"], ["shipping traffic", "transits", "port congestion", "vessels waiting"]),
        st("zonas_exclusion", "Zonas de exclusión aérea y marítima", ["zona de exclusión", "espacio aéreo cerrado", "zona de exclusión aérea", "bloqueo naval", "notam"], ["exclusion zone", "no-fly zone", "airspace closed", "naval blockade", "notam"]),
    ],
    "seguridad": [
        st("instalaciones_militares", "Bases e instalaciones militares públicas", ["instalación militar", "cuartel", "base aérea", "base naval"], ["military installation", "garrison", "air base", "naval base"]),
        st("vuelos_militares", "Vuelos militares", ["aviones militares", "vuelo de reconocimiento", "bombarderos", "cazas", "incursión aérea"], ["military aircraft", "reconnaissance flight", "bombers", "fighter jets", "air incursion"]),
        st("buques_guerra", "Buques de guerra", ["buque de guerra", "destructor", "fragata", "submarino", "grupo de ataque"], ["warship", "destroyer", "frigate", "submarine", "strike group"]),
        st("protestas_disturbios", "Protestas y disturbios", ["disturbios", "enfrentamientos con la policía", "saqueos", "toque de queda"], ["riots", "unrest", "clashes with police", "looting", "curfew"]),
        st("pruebas_misiles", "Pruebas de misiles", ["prueba de misil", "lanzamiento de misil", "misil hipersónico", "icbm"], ["missile test", "missile launch", "hypersonic missile", "icbm"]),
    ],
    "geoeconomia": [
        st("mercados", "Mercados (índices, divisas, materias primas)", ["bolsa", "índice bursátil", "divisas", "materias primas", "peso mexicano", "caída de mercados"], ["stock market", "stock index", "currencies", "commodities", "market selloff"]),
        st("bolsas_valores", "Bolsas de valores", ["bolsa de valores", "bmv", "wall street", "nasdaq"], ["stock exchange", "wall street", "nasdaq", "nyse"]),
        st("indicadores_riesgo_financiero", "VIX, diferencial de alto rendimiento y GSCPI", ["índice de volatilidad", "vix", "diferencial de alto rendimiento", "presión de cadenas de suministro"], ["vix", "volatility index", "high-yield spread", "gscpi", "supply chain pressure"]),
        st("listas_sanciones", "Sanciones (OFAC SDN, UE, OpenSanctions)", ["lista sdn", "ofac", "sanciones de la ue", "opensanctions"], ["sdn list", "ofac", "eu sanctions", "opensanctions"]),
        st("comercio_comtrade", "Comercio (UN Comtrade)", ["balanza comercial", "déficit comercial", "superávit comercial", "comtrade"], ["trade balance", "trade deficit", "trade surplus", "comtrade"]),
    ],
    "energia": [
        st("precios_energia", "Precios de energía (EIA)", ["precio del petróleo", "precio del gas", "brent", "wti", "gasolina"], ["oil price", "gas price", "brent", "wti", "gasoline prices"]),
        st("centrales_combustible", "Centrales por tipo de combustible", ["central eléctrica", "termoeléctrica", "central nuclear", "parque solar", "parque eólico", "hidroeléctrica"], ["power plant", "thermal plant", "nuclear plant", "solar farm", "wind farm", "hydropower"]),
        st("minas_minerales", "Minas de minerales críticos", ["mina", "yacimiento", "concesión minera"], ["copper mine", "lithium mine", "gold mine", "coal mine", "deposit", "mining concession"]),
        st("petroleros", "Petroleros", ["petrolero", "buque tanque", "flota fantasma", "tanquero"], ["oil tanker", "tanker", "shadow fleet"]),
    ],
    "tecnologia": [
        st("vulnerabilidades", "Vulnerabilidades explotadas (CISA KEV, NVD)", ["vulnerabilidad", "día cero", "parche de seguridad", "cve"], ["vulnerability", "zero-day", "security patch", "cve", "exploited"]),
        st("lanzamientos", "Satélites y lanzamientos", ["lanzamiento", "cohete", "puesta en órbita", "constelación"], ["launch", "rocket", "into orbit", "constellation"]),
        st("clima_espacial", "Clima espacial (NOAA SWPC)", ["tormenta solar", "tormenta geomagnética", "llamarada solar"], ["solar storm", "geomagnetic storm", "solar flare"]),
        st("centros_datos_tipo", "Centros de datos por tipo", ["centro de datos", "hiperescala", "nube"], ["data center", "datacenter", "hyperscale", "cloud region"]),
    ],
    "demografia": [
        st("desplazamientos_forzados", "Desplazamientos forzados", ["desplazamiento forzado", "huyen", "éxodo", "evacuación masiva"], ["forced displacement", "fleeing", "exodus", "mass evacuation"]),
        st("crisis_humanitarias", "Crisis humanitarias (ReliefWeb)", ["crisis humanitaria", "ayuda humanitaria", "hambruna", "inseguridad alimentaria aguda"], ["humanitarian crisis", "humanitarian aid", "famine", "acute food insecurity"]),
    ],
    "clima": [
        st("incendios_firms", "Incendios (NASA FIRMS)", ["incendio forestal", "incendios", "focos de calor"], ["wildfire", "wildfires", "bushfire", "hotspots"]),
        st("sismos", "Sismos (USGS)", ["sismo", "terremoto", "temblor", "tsunami"], ["earthquake", "quake", "tsunami", "seismic"]),
        st("eventos_naturales", "Eventos naturales (NASA EONET, GDACS)", ["erupción volcánica", "volcán", "deslave", "inundaciones"], ["volcanic eruption", "volcano", "landslide", "floods"]),
        st("calidad_aire", "Calidad del aire", ["calidad del aire", "contingencia ambiental", "smog", "partículas pm2.5"], ["air quality", "smog", "air pollution", "pm2.5"]),
    ],
    "instituciones": [
        st("elecciones", "Elecciones", ["elecciones", "votación", "segunda vuelta", "resultados electorales"], ["elections", "vote", "runoff", "election results"]),
        st("cumbres_detalle", "Cumbres", ["cumbre", "reunión de líderes", "jefes de estado"], ["summit", "leaders meeting", "heads of state"]),
        st("votaciones_onu", "Votaciones en la ONU", ["resolución de la asamblea general", "votación en la onu", "abstención"], ["general assembly resolution", "un vote", "abstained"]),
        st("embajadas", "Embajadas", ["embajada", "embajador", "consulado", "relaciones diplomáticas", "expulsa diplomáticos"], ["embassy", "ambassador", "consulate", "diplomatic relations", "expels diplomats"]),
    ],
    "identidad": [
        st("telegram_publico", "Canales públicos de Telegram", ["canal de telegram", "telegram"], ["telegram channel", "telegram"]),
        st("bluesky", "Bluesky y redes abiertas", ["bluesky", "mastodon", "redes sociales"], ["bluesky", "mastodon", "social media"]),
        st("mercados_prediccion", "Mercados de predicción (expectativa agregada, no hecho)", ["mercado de predicción", "polymarket", "manifold", "probabilidad implícita"], ["prediction market", "polymarket", "manifold", "implied probability"]),
    ],
    "riesgo": [
        st("indice_inestabilidad", "Índice de Inestabilidad por País", ["índice de inestabilidad", "inestabilidad política"], ["instability index", "political instability"]),
        st("alertas", "Alertas", ["alerta", "nivel de alerta", "advertencia de viaje"], ["alert", "alert level", "travel advisory"]),
        st("listas_seguimiento", "Listas de seguimiento", ["lista de seguimiento", "vigilancia"], ["watchlist", "monitoring list"]),
    ],
}

AREAS_NUEVAS = [
    {
        "id": "infraestructura", "numero": 12, "nombre": "Infraestructura crítica y conectividad", "color": "#6B5B3E",
        "que_estudia": "Activos físicos y digitales de los que dependen millones de personas y las cadenas de suministro.",
        "pregunta_guia": "¿Qué infraestructura, si falla, afecta a millones de personas o a una cadena de suministro?",
        "ejemplo": "Apagón del 28 de abril de 2025 en España y Portugal, que detuvo trenes, telecomunicaciones y pagos durante horas.",
        "ejemplo_mexico": "Gasoductos que traen gas natural de Texas a la red eléctrica; puertos de Manzanillo y Lázaro Cárdenas; cruces fronterizos de carga.",
        "palabras_clave": {
            "es": ["infraestructura crítica", "apagón", "corte de energía", "caída de internet", "cable submarino", "gasoducto", "oleoducto", "presa", "puerto", "aeropuerto", "centro de datos", "red eléctrica", "falla masiva", "interrupción del servicio", "sin electricidad", "apagón masivo"],
            "en": ["critical infrastructure", "blackout", "power outage", "internet outage", "undersea cable", "gas pipeline", "pipeline", "dam", "port", "airport", "data center", "power grid", "massive failure", "service disruption", "without power", "massive blackout"],
        },
        "subtemas": [
            st("cables_submarinos_infra", "Cables submarinos", ["cable submarino", "punto de aterrizaje"], ["undersea cable", "subsea cable", "landing station"]),
            st("ductos", "Ductos de petróleo y gas", ["gasoducto", "oleoducto", "ducto"], ["gas pipeline", "oil pipeline", "pipeline"]),
            st("centrales_infra", "Centrales eléctricas", ["central eléctrica", "subestación", "red eléctrica"], ["power plant", "substation", "power grid"]),
            st("presas", "Presas", ["presa", "embalse", "represa"], ["dam", "reservoir"]),
            st("puertos_infra", "Puertos", ["puerto", "terminal de contenedores"], ["port", "container terminal"]),
            st("aeropuertos_infra", "Aeropuertos", ["aeropuerto", "pista", "cierre del aeropuerto"], ["airport", "runway", "airport closure"]),
            st("centros_datos_infra", "Centros de datos", ["centro de datos"], ["data center", "datacenter"]),
            st("caidas_internet", "Caídas de internet", ["caída de internet", "apagón digital", "corte de internet", "sin conexión"], ["internet outage", "internet shutdown", "connectivity loss", "network outage"]),
        ],
    },
    {
        "id": "salud_nrbq", "numero": 13, "nombre": "Salud pública y riesgos NRBQ", "color": "#8A3A5C",
        "que_estudia": "Brotes, emergencias sanitarias y riesgos nucleares, radiológicos, biológicos y químicos que cruzan fronteras.",
        "pregunta_guia": "¿Hay un riesgo sanitario o radiológico que cruce fronteras?",
        "ejemplo": "La OMS declaró el mpox emergencia de salud pública de importancia internacional el 14 de agosto de 2024.",
        "ejemplo_mexico": "Brotes de dengue y sarampión con impacto en la frontera y el turismo; resguardo de fuentes radiactivas robadas (alertas de Protección Civil).",
        "palabras_clave": {
            "es": ["brote", "epidemia", "pandemia", "oms", "emergencia sanitaria", "contagios", "radiación", "fuga radiactiva", "accidente nuclear", "derrame químico", "fuente radiactiva", "gripe aviar", "vacunación", "cuarentena"],
            "en": ["outbreak", "epidemic", "pandemic", "who", "health emergency", "infections", "radiation", "radioactive leak", "nuclear accident", "chemical spill", "radioactive source", "bird flu", "vaccination", "quarantine"],
        },
        "subtemas": [
            st("brotes", "Brotes de enfermedades", ["brote", "casos confirmados", "dengue", "sarampión", "cólera", "mpox", "ébola", "gripe aviar"], ["outbreak", "confirmed cases", "dengue", "measles", "cholera", "mpox", "ebola", "bird flu", "h5n1"]),
            st("alertas_oms", "Alertas OMS", ["emergencia de salud pública de importancia internacional", "alerta de la oms", "reglamento sanitario internacional"], ["public health emergency of international concern", "pheic", "who alert", "international health regulations"]),
            st("radiacion_ambiental", "Radiación ambiental", ["radiación", "niveles de radiación", "fuente radiactiva"], ["radiation", "radiation levels", "radioactive source"]),
            st("incidentes_nucleares_quimicos", "Incidentes nucleares o químicos", ["accidente nuclear", "fuga radiactiva", "derrame químico", "arma química", "fuga de gas tóxico"], ["nuclear accident", "radioactive leak", "chemical spill", "chemical weapon", "toxic gas leak"]),
        ],
    },
]


def main():
    with open(RUTA, encoding="utf-8") as f:
        tax = json.load(f)
    ids = {a["id"] for a in tax["areas"]}
    existentes = {s["id"] for a in tax["areas"] for s in a["subtemas"]}
    for area in tax["areas"]:
        for s in NUEVOS_SUBTEMAS.get(area["id"], []):
            if s["id"] not in existentes:
                area["subtemas"].append(s)
                existentes.add(s["id"])
    for nueva in AREAS_NUEVAS:
        if nueva["id"] not in ids:
            tax["areas"].append(nueva)
    reg = next(a for a in tax["areas"] if a["id"] == "regional")
    reg["nota"] = ("Cada subtema es un filtro de región (también en la barra superior). La región de un evento se asigna "
                   "por su país (config/regions.json); el área 10 es principal solo cuando el hecho trata de la dinámica de la región en conjunto.")
    tax["version"] = "2.0.0"
    tax["descripcion"] = ("Taxonomía de 13 áreas de la geopolítica (Eje 1: por qué importa). Cada evento tiene 1 área principal y "
                          "hasta 3 secundarias. Las palabras clave alimentan el clasificador por reglas (ingest/classify.py); se comparan "
                          "sin acentos y sin distinguir mayúsculas.")
    with open(RUTA, "w", encoding="utf-8") as f:
        json.dump(tax, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"áreas: {len(tax['areas'])} · subtemas: {sum(len(a['subtemas']) for a in tax['areas'])}")


if __name__ == "__main__":
    main()
