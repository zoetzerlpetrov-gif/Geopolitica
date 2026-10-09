#!/usr/bin/env python3
"""Genera config/monumentos.json: lista de lugares famosos para «Reconocer lugar» (Herramientas → Foto).

De dónde sale:
  1. Wikidata (CC0): monumentos, edificios, puentes, templos, castillos, sitios arqueológicos, montañas y otros
     lugares con coordenadas y con artículo en al menos 45 Wikipedias (medida aproximada de lo famosos que son,
     y por lo tanto de cuántas fotos suyas vio el modelo CLIP al entrenarse).
  2. Una lista curada (EXTRA) de lugares muy fotografiados que la consulta no trae por su clase en Wikidata
     (p. ej. el Taj Mahal o el Big Ben) o que interesan en México y América Latina.
Se quitan los que no se reconocen en una foto (regiones, rutas, ciudades antiguas sin ruinas visibles, edificios
destruidos). A cada lugar se le asigna la ciudad más cercana de config/ciudades.json (Natural Earth).

Uso: python3 tools/monumentos/construir.py              (consulta Wikidata)
     python3 tools/monumentos/construir.py lista.json   (usa una lista ya descargada con el mismo formato)
Formato de salida: [en, es, iso3, lat, lon, sitelinks, qid, ciudad_es, ciudad_en]
"""
import json
import math
import os
import sys
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "config", "monumentos.json")
CIUDADES = os.path.join(ROOT, "config", "ciudades.json")
UA = {"User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)", "Accept": "application/sparql-results+json"}
MIN_SITELINKS = 45
# Clases de Wikidata: monumento, edificio, puente, castillo, sitio arqueológico, templo, mezquita, iglesia, palacio,
# torre, rascacielos, plaza, estatua, montaña, cueva, catedral, pirámide, estadio, museo, fortaleza, etc.
Q = """SELECT ?item ?en ?es ?coord ?iso ?sl WHERE {
  VALUES ?clase { wd:Q4989906 wd:Q179700 wd:Q12518 wd:Q12280 wd:Q2977 wd:Q32815 wd:Q44539 wd:Q23413 wd:Q16560 wd:Q11303 wd:Q839954
                  wd:Q57821 wd:Q54831 wd:Q174782 wd:Q16970 wd:Q2319498 wd:Q160742 wd:Q1440476 wd:Q11707 wd:Q1497375 wd:Q2111088 wd:Q1060829 wd:Q35509 wd:Q12570 }
  ?item wdt:P31 ?clase ; wdt:P625 ?coord ; wikibase:sitelinks ?sl . FILTER(?sl >= %d)
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?es FILTER(lang(?es) = "es") }
  OPTIONAL { ?item wdt:P17 ?p . ?p wdt:P298 ?iso }
}"""

# No se reconocen en una foto: regiones, rutas, ciudades antiguas sin una imagen característica, edificios que ya
# no existen o resultados que no son lugares.
QUITAR = {
    "Way of Saint James", "Aysén Region", "Veliky Ustyug", "Königsberg", "Asyut", "Salt", "Suwayda", "Manbij", "Poggiomarino",
    "Temple in Jerusalem", "Bastille", "Tuileries Palace", "The Crystal Palace", "Palace of Whitehall", "Platonic Academy",
    "Thebes", "Heliopolis", "Sais", "Nicomedia", "Sirmium", "Halicarnassus", "Hira", "Ecbatana", "Isin", "Larsa", "Sippar",
    "Eridu", "Nippur", "Uruk", "Kadesh", "Mehrgarh", "Napata", "Birka", "Pella", "Cumae", "Karakorum", "Xanadu", "Yinxu",
    "Susa", "Assur", "Samarra", "Harappa", "Lothal", "Dholavira", "Taxila", "Merv", "Nisa", "Tanis", "Abydos", "Amarna",
    "Mari", "Arwad", "Bethsaida", "Capernaum", "Sardis", "Miletus", "Ctesiphon", "Nimrud", "Dur-Sharrukin", "Kernavė",
    "Tsodilo", "Monza Circuit", "Wikipedia Monument", "Russian State Library", "Moscow Conservatory", "National Library of Sweden",
    "Thermopylae", "Grand Canal", "Dead Cities", "Shahr-e Sukhteh", "Hegra", "Tadrart Acacus", "Tassili n'Ajjer", "M'zab",
    "Old City of Baku", "Cyrene", "Nineveh", "Babylon", "Ur", "Byblos", "Anuradhapura", "Chersonesus", "Abu Mena",
}

# Curados: [en, es, iso3, lat, lon]
EXTRA = [
    ["Taj Mahal", "Taj Mahal", "IND", 27.1751, 78.0421], ["Big Ben", "Big Ben", "GBR", 51.5007, -0.1246],
    ["Great Wall of China at Badaling", "Gran Muralla China (Badaling)", "CHN", 40.3594, 116.0204],
    ["Sagrada Família", "Sagrada Familia", "ESP", 41.4036, 2.1744], ["Notre-Dame de Paris", "Catedral de Notre Dame de París", "FRA", 48.8530, 2.3499],
    ["Leaning Tower of Pisa", "Torre inclinada de Pisa", "ITA", 43.7230, 10.3966], ["Mount Fuji", "Monte Fuji", "JPN", 35.3606, 138.7274],
    ["Arc de Triomphe", "Arco de Triunfo de París", "FRA", 48.8738, 2.2950], ["Louvre Pyramid", "Pirámide del Louvre", "FRA", 48.8610, 2.3358],
    ["Angel of Independence in Mexico City", "Ángel de la Independencia", "MEX", 19.4270, -99.1676],
    ["Palacio de Bellas Artes in Mexico City", "Palacio de Bellas Artes", "MEX", 19.4352, -99.1412],
    ["Mount Rushmore", "Monte Rushmore", "USA", 43.8791, -103.4591], ["Moai statues of Easter Island", "Moáis de Isla de Pascua", "CHL", -27.1258, -109.2769],
    ["Hollywood Sign", "Letrero de Hollywood", "USA", 34.1341, -118.3215], ["Space Needle", "Space Needle", "USA", 47.6205, -122.3493],
    ["Sydney Harbour Bridge", "Puente de la Bahía de Sídney", "AUS", -33.8523, 151.2108], ["Golden Temple of Amritsar", "Templo Dorado de Amritsar", "IND", 31.6200, 74.8765],
    ["Marina Bay Sands", "Marina Bay Sands", "SGP", 1.2834, 103.8607], ["Merlion", "Merlión", "SGP", 1.2868, 103.8545],
    ["Trevi Fountain", "Fontana de Trevi", "ITA", 41.9009, 12.4833], ["Pantheon in Rome", "Panteón de Agripa", "ITA", 41.8986, 12.4769],
    ["Parthenon", "Partenón", "GRC", 37.9715, 23.7267], ["Niagara Falls", "Cataratas del Niágara", "CAN", 43.0799, -79.0747],
    ["Grand Canyon", "Gran Cañón", "USA", 36.1069, -112.1129], ["Iguazu Falls", "Cataratas del Iguazú", "ARG", -25.6953, -54.4367],
    ["Table Mountain", "Montaña de la Mesa", "ZAF", -33.9628, 18.4098], ["Matterhorn", "Cervino (Matterhorn)", "CHE", 45.9763, 7.6586],
    ["Uluru", "Uluru", "AUS", -25.3444, 131.0369], ["Mont-Saint-Michel", "Monte Saint-Michel", "FRA", 48.6361, -1.5115],
    ["Cologne Cathedral", "Catedral de Colonia", "DEU", 50.9413, 6.9583], ["Westminster Abbey", "Abadía de Westminster", "GBR", 51.4993, -0.1273],
    ["Buckingham Palace", "Palacio de Buckingham", "GBR", 51.5014, -0.1419], ["London Eye", "London Eye", "GBR", 51.5033, -0.1196],
    ["Washington Monument", "Monumento a Washington", "USA", 38.8895, -77.0353], ["Lincoln Memorial", "Monumento a Lincoln", "USA", 38.8893, -77.0502],
    ["United States Capitol", "Capitolio de los Estados Unidos", "USA", 38.8899, -77.0091], ["White House", "Casa Blanca", "USA", 38.8977, -77.0365],
    ["Gateway Arch in St. Louis", "Gateway Arch de San Luis", "USA", 38.6247, -90.1848],
    ["Mexico City Metropolitan Cathedral", "Catedral Metropolitana de la Ciudad de México", "MEX", 19.4344, -99.1332],
    ["Monument to the Revolution in Mexico City", "Monumento a la Revolución", "MEX", 19.4361, -99.1546],
    ["Basilica of Our Lady of Guadalupe", "Basílica de Guadalupe", "MEX", 19.4847, -99.1176],
    ["Obelisk of Buenos Aires", "Obelisco de Buenos Aires", "ARG", -34.6037, -58.3816], ["Casa Rosada", "Casa Rosada", "ARG", -34.6081, -58.3703],
    ["Sugarloaf Mountain", "Pan de Azúcar", "BRA", -22.9486, -43.1566], ["Burj Al Arab", "Burj al Arab", "ARE", 25.1412, 55.1853],
    ["Manneken Pis", "Manneken Pis", "BEL", 50.8450, 4.3500], ["Little Mermaid statue in Copenhagen", "La Sirenita de Copenhague", "DNK", 55.6929, 12.5993],
    ["Charles Bridge", "Puente de Carlos", "CZE", 50.0865, 14.4114], ["Reichstag building", "Edificio del Reichstag", "DEU", 52.5186, 13.3762],
    ["Berlin TV Tower", "Torre de Televisión de Berlín", "DEU", 52.5208, 13.4094], ["Tokyo Skytree", "Tokyo Skytree", "JPN", 35.7101, 139.8107],
    ["Fushimi Inari Shrine torii gates", "Santuario Fushimi Inari", "JPN", 34.9671, 135.7727], ["Kinkaku-ji Golden Pavilion", "Kinkaku-ji (Pabellón Dorado)", "JPN", 35.0394, 135.7292],
    ["Great Buddha of Kamakura", "Gran Buda de Kamakura", "JPN", 35.3167, 139.5358], ["Shwedagon Pagoda", "Pagoda de Shwedagon", "MMR", 16.7983, 96.1496],
    ["Wat Arun", "Wat Arun", "THA", 13.7437, 100.4888], ["Ha Long Bay", "Bahía de Ha Long", "VNM", 20.9101, 107.1839],
    ["Gardens by the Bay Supertrees", "Gardens by the Bay", "SGP", 1.2816, 103.8636], ["Fairy chimneys of Göreme, Cappadocia", "Chimeneas de hadas de Capadocia", "TUR", 38.6431, 34.8289],
    ["Las Vegas Strip", "Las Vegas Strip", "USA", 36.1147, -115.1728], ["Central Park", "Central Park", "USA", 40.7829, -73.9654],
    ["Flatiron Building", "Edificio Flatiron", "USA", 40.7411, -73.9897], ["Hoover Dam", "Presa Hoover", "USA", 36.0160, -114.7377],
    ["Alcatraz Island", "Isla de Alcatraz", "USA", 37.8267, -122.4230], ["Rialto Bridge", "Puente de Rialto", "ITA", 45.4380, 12.3359],
    ["Belém Tower", "Torre de Belém", "PRT", 38.6916, -9.2160], ["Park Güell", "Parque Güell", "ESP", 41.4145, 2.1527],
    ["Plaza de España in Seville", "Plaza de España de Sevilla", "ESP", 37.3772, -5.9869], ["Aqueduct of Segovia", "Acueducto de Segovia", "ESP", 40.9481, -4.1184],
    ["Guggenheim Museum Bilbao", "Museo Guggenheim Bilbao", "ESP", 43.2687, -2.9340],
]


def leer_wikidata():
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": Q % MIN_SITELINKS, "format": "json"})
    r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180))
    vistos = {}
    for f in r["results"]["bindings"]:
        q = f["item"]["value"].rsplit("/", 1)[1]
        if q in vistos:
            continue
        lon, lat = f["coord"]["value"].replace("Point(", "").replace(")", "").split()[:2]
        vistos[q] = [f.get("en", {}).get("value", ""), f.get("es", {}).get("value", ""), f.get("iso", {}).get("value", ""),
                     round(float(lat), 4), round(float(lon), 4), int(f["sl"]["value"]), q]
    return sorted(vistos.values(), key=lambda x: -x[5])


def km(a, b, c, d):
    r = math.pi / 180
    h = math.sin((c - a) * r / 2) ** 2 + math.cos(a * r) * math.cos(c * r) * math.sin((d - b) * r / 2) ** 2
    return 6371 * 2 * math.asin(min(1, math.sqrt(h)))


def ciudad_cercana(lat, lon, ciudades, max_km=150):
    """Ciudad más cercana; entre las que están a < 25 km de la más cercana, gana la más poblada (Giza → El Cairo no)."""
    con_d = sorted(((km(lat, lon, c[3], c[4]), c) for c in ciudades), key=lambda x: x[0])
    if not con_d or con_d[0][0] > max_km:
        return "", ""
    d0 = con_d[0][0]
    c = max((c for d, c in con_d[:20] if d <= d0 + 25), key=lambda c: c[6] or 0)
    return c[1] or c[0], c[0]


def construir(wd, ciudades):
    out, nombres = [], set()
    for m in wd:
        en = m[0].strip()
        if not en or en in QUITAR or en.startswith("Q") and en[1:].isdigit():
            continue
        out.append([en, m[1] or en, m[2], m[3], m[4], m[5], m[6]])
        nombres.add(en.lower())
    for en, es, iso, lat, lon in EXTRA:
        if en.lower() not in nombres:
            out.append([en, es, iso, lat, lon, 0, ""])
    for m in out:
        m.extend(ciudad_cercana(m[3], m[4], ciudades))
    return out


def main():
    wd = json.load(open(sys.argv[1], encoding="utf-8")) if len(sys.argv) > 1 else leer_wikidata()
    ciudades = json.load(open(CIUDADES, encoding="utf-8"))["ciudades"]
    lista = construir(wd, ciudades)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write('{"fuente":"Wikidata (CC0), lugares con ≥ %d Wikipedias, más una lista curada del proyecto; ciudad más cercana de Natural Earth",\n'
                ' "campos":["en","es","iso3","lat","lon","sitelinks","qid","ciudad_es","ciudad_en"],\n "monumentos":[\n' % MIN_SITELINKS)
        f.write(",\n".join(json.dumps(m, ensure_ascii=False) for m in lista))
        f.write("\n]}\n")
    print(f"monumentos: {len(lista)}")


if __name__ == "__main__":
    sys.exit(main())
