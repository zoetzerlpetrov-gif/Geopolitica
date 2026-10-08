"""Geocodificación local (sin servicios externos, sin Nominatim).

- Paises.de(lon, lat): país ISO3 por punto en polígono (Natural Earth 1:50m del proyecto).
- pais_en_texto(texto): primer país mencionado en un título (nombres ES/EN del gazetteer + alias).
- centroide(iso3) y region(iso3): para eventos que solo traen país.
"""
import json
import os
import re

from classify import normalizar

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Formas cortas o habituales en titulares que no coinciden con el nombre oficial del gazetteer.
ALIAS = {
    "USA": ["new mexico", "nuevo mexico", "eua", "ee uu", "eeuu", "estados unidos", "us", "u s", "usa", "united states", "washington", "casa blanca", "white house", "pentagono", "pentagon"],
    "RUS": ["rusia", "russia", "kremlin", "moscu", "moscow"],
    "GBR": ["reino unido", "uk", "u k", "britain", "gran bretana", "londres", "london"],
    "IRN": ["iran", "teheran", "tehran"],
    "KOR": ["corea del sur", "south korea", "seul", "seoul"],
    "PRK": ["corea del norte", "north korea", "pyongyang"],
    "SYR": ["siria", "syria", "damasco", "damascus"],
    "COD": ["rd congo", "rdc", "drc", "congo democratico", "kinshasa"],
    "TZA": ["tanzania"],
    "LAO": ["laos"],
    "MDA": ["moldavia", "moldova"],
    "PSE": ["palestina", "palestine", "gaza", "cisjordania", "west bank"],
    "ISR": ["israel", "tel aviv", "jerusalen", "jerusalem"],
    "UKR": ["ucrania", "ukraine", "kiev", "kyiv"],
    "CHN": ["china", "pekin", "beijing"],
    "TWN": ["taiwan", "taipei"],
    "CZE": ["chequia", "czechia"],
    "MKD": ["macedonia del norte", "north macedonia"],
    "CIV": ["costa de marfil", "ivory coast"],
    "TUR": ["turquia", "turkey", "turkiye", "ankara"],
    "NLD": ["paises bajos", "holanda", "netherlands"],
    "MEX": ["mexico", "cdmx", "ciudad de mexico", "mexico city", "sheinbaum"],
    "VEN": ["venezuela", "caracas"],
    "YEM": ["yemen", "huties", "houthi", "houthis"],
    "SAU": ["arabia saudi", "arabia saudita", "saudi arabia", "riad", "riyadh"],
    "ARE": ["emiratos", "uae", "dubai", "abu dabi", "abu dhabi"],
    "VNM": ["vietnam", "viet nam"],
    "BRN": ["brunei"],
    "CUB": ["cuba", "la habana", "havana", "guantanamo"],
    "BRA": ["brasil", "brazil", "brasilia", "rio de janeiro", "sao paulo", "bolsonaro", "lula"],
    "ARG": ["argentina", "buenos aires", "milei"],
    "CAF": ["republica centroafricana", "central african republic"],
    # Gentilicios, regiones y líderes frecuentes en titulares (revisión con la ingesta real del 8 oct 2026).
    # Límite conocido: «Russian missile kills 19 in Kyiv» queda en Rusia porque el gentilicio va primero.
    "ESP": ["espanol", "espanola", "espanoles", "spanish", "madrid", "barcelona", "cataluna", "catalonia", "andalucia"],
    "DEU": ["aleman", "alemana", "alemanes", "german", "berlin", "sajonia", "saxony", "baviera", "bavaria"],
    "FRA": ["frances", "francesa", "franceses", "french", "paris", "macron", "lecornu"],
    "ETH": ["etiope", "etiopes", "ethiopian", "tigray", "adis abeba", "addis ababa"],
    "SDN": ["sudanes", "sudanese", "darfur", "jartum", "khartoum"],
    "ITA": ["italiano", "italiana", "italian", "rome", "meloni"],
    "JPN": ["japones", "japonesa", "japanese", "tokio", "tokyo"],
    "IND": ["nueva delhi", "new delhi", "modi"],
    "PAK": ["paquistani", "pakistani", "islamabad"],
    "AFG": ["afgano", "afgana", "afghan", "kabul", "taliban", "talibanes"],
    "IRQ": ["iraqui", "iraqi", "bagdad", "baghdad"],
    "LBN": ["libanes", "libanesa", "lebanese", "beirut", "hezbollah", "hezbola"],
    "EGY": ["egipcio", "egipcia", "egyptian", "el cairo", "cairo"],
}
# Gentilicios y líderes de países que ya tienen alias arriba (se agregan a su lista).
EXTRA = {
    "USA": ["estadounidense", "estadounidenses", "trump", "texas", "california", "florida", "nueva york", "new york"],
    "RUS": ["ruso", "rusa", "rusos", "rusas", "russian", "russians", "putin", "siberia"],
    "UKR": ["ucraniano", "ucraniana", "ucranianos", "ukrainian", "ukrainians", "zelensky", "zelenski", "donbas", "donbass", "jarkov", "kharkiv", "crimea"],
    "ISR": ["israeli", "israelies", "israelis", "netanyahu"],
    "IRN": ["irani", "iranies", "iranian", "iranians", "jamenei", "khamenei"],
    "CHN": ["chino", "chinos", "chinese", "xi jinping"],
    "GBR": ["britanico", "britanica", "british", "starmer"],
    "PSE": ["palestino", "palestina", "palestinos", "palestinian", "palestinians", "hamas"],
    "SYR": ["sirio", "siria", "sirios", "syrian"],
    "TUR": ["turco", "turca", "turkish", "erdogan"],
    "VEN": ["venezolano", "venezolana", "venezuelan", "maduro"],
    "BRA": ["brasileno", "brasilena", "brazilian"],  # "rio" no: en español es «río»
    "ARG": ["argentino", "argentina", "argentine"],
    "CUB": ["cubano", "cubana", "cuban"],
    "MEX": ["mexicano", "mexicana", "mexicanos", "mexican"],
}
for _iso, _lista in EXTRA.items():
    ALIAS.setdefault(_iso, []).extend(_lista)

# Alias que nombran a un ACTOR (gentilicio, líder, grupo, sede de gobierno), no a un LUGAR. Para ubicar
# el hecho gana un lugar: «ataques rusos en el norte de Ucrania» → Ucrania; «Houthi strikes on Saudi
# airports» → Arabia Saudita. Un actor solo cuenta si el texto no menciona ningún lugar.
ACTORES = {
    "huties", "houthi", "houthis", "hamas", "hezbollah", "hezbola", "taliban", "talibanes", "kremlin", "casa blanca",
    "white house", "pentagono", "pentagon", "sheinbaum", "trump", "putin", "zelensky", "zelenski", "netanyahu", "jamenei",
    "khamenei", "xi jinping", "starmer", "erdogan", "maduro", "macron", "lecornu", "meloni", "modi", "milei", "bolsonaro", "lula",
    "estadounidense", "estadounidenses", "ruso", "rusa", "rusos", "rusas", "russian", "russians", "ucraniano", "ucraniana",
    "ucranianos", "ukrainian", "ukrainians", "israeli", "israelies", "israelis", "irani", "iranies", "iranian", "iranians",
    "chino", "chinos", "chinese", "britanico", "britanica", "british", "palestino", "palestinos", "palestinian", "palestinians",
    "sirio", "sirios", "syrian", "turco", "turca", "turkish", "venezolano", "venezolana", "venezuelan", "brasileno",
    "brasilena", "brazilian", "argentino", "argentine", "cubano", "cubana", "cuban", "mexicano", "mexicana", "mexicanos",
    "mexican", "espanol", "espanola", "espanoles", "spanish", "aleman", "alemana", "alemanes", "german", "frances", "francesa",
    "franceses", "french", "etiope", "etiopes", "ethiopian", "sudanes", "sudanese", "italiano", "italiana", "italian",
    "japones", "japonesa", "japanese", "paquistani", "pakistani", "afgano", "afgana", "afghan", "iraqui", "iraqi",
    "libanes", "libanesa", "lebanese", "egipcio", "egipcia", "egyptian",
}

# Palabras de 2 letras o muy comunes que no deben confundirse con un país.
IGNORAR = {"us", "u s"}  # "us" solo cuenta si va en mayúsculas en el original (se revisa aparte)


class Gazetteer:
    def __init__(self):
        with open(os.path.join(ROOT, "config", "gazetteer.json"), encoding="utf-8") as f:
            gaz = json.load(f)
        with open(os.path.join(ROOT, "config", "regions.json"), encoding="utf-8") as f:
            reg = json.load(f)["regiones"]
        self.paises = gaz["paises"]
        self.region_de = {iso: rid for rid, r in reg.items() for iso in r["paises"]}
        nombres = {}
        for iso, p in self.paises.items():
            for n in (p["es"], p["en"]):
                k = normalizar(n).strip()
                if len(k) > 3:
                    nombres[k] = iso
        for iso, lista in ALIAS.items():
            for n in lista:
                nombres[normalizar(n).strip()] = iso
        # Más largos primero: "republica dominicana" antes que "dominica".
        self._claves = sorted(nombres, key=len, reverse=True)
        self._nombres = nombres

    def paises_en_texto(self, texto, con_posicion=False):
        """ISO3 de todos los países mencionados, en orden de aparición y sin repetir."""
        t = normalizar(texto)
        hallados = {}
        ocupado = []  # tramos ya usados: "republica dominicana" no cuenta también como "dominica"
        for k in self._claves:  # más largos primero
            if k in IGNORAR and not re.search(r"\b(US|U\.S\.)\b", texto):
                continue
            ini = 0
            while (i := t.find(f" {k} ", ini)) >= 0:
                fin = i + len(k) + 1
                if not any(a <= i < b or a < fin <= b for a, b in ocupado):
                    ocupado.append((i, fin))
                    iso = self._nombres[k]
                    previo = hallados.get(iso)
                    lugar = k not in ACTORES
                    # Por país se guarda la primera mención y si alguna mención es un lugar.
                    hallados[iso] = (min(i, previo[0]) if previo else i, lugar or (previo[1] if previo else False),
                                     min([x for x in (previo[2] if previo else None, i if lugar else None) if x is not None], default=None))
                ini = i + 1
        orden = sorted(hallados.items(), key=lambda x: x[1][0])
        if con_posicion:  # [(iso, primera_posicion, es_lugar, posicion_como_lugar)]
            return [(iso, v[0], v[1], v[2]) for iso, v in orden]
        return [iso for iso, _ in orden]

    # Preposiciones de lugar: «… kills 19 in Kyiv», «refinería en Rusia», «tanker hit off Qatar».
    RX_LUGAR = re.compile(r" (in|en|near|off|at|cerca de|frente a|coast of|costa de|costas de) $")

    def pais_en_texto(self, texto):
        """País donde ocurre el hecho: el primero precedido por una preposición de lugar
        («in», «en», «near», «off»…); si no hay, el primero mencionado. None si no hay país."""
        lista = self.paises_en_texto(texto, con_posicion=True)
        if not lista:
            return None
        t = normalizar(texto)
        lugares = sorted([(pos, iso) for iso, _, es_lugar, pos in lista if es_lugar])
        for pos, iso in lugares:
            if self.RX_LUGAR.search(t[max(0, pos - 12):pos + 1]):
                return iso
        return lugares[0][1] if lugares else lista[0][0]

    def centroide(self, iso3):
        p = self.paises.get(iso3)
        return (p["lon"], p["lat"]) if p else (None, None)

    def region(self, iso3):
        return self.region_de.get(iso3)


class Paises:
    """País por coordenada (punto en polígono) con prefiltro por rectángulo."""

    def __init__(self):
        with open(os.path.join(ROOT, "data", "base", "countries.geojson"), encoding="utf-8") as f:
            fc = json.load(f)
        self.pol = []
        for ft in fc["features"]:
            g = ft["geometry"]
            for p in [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]:
                anillo = p[0]
                xs, ys = [c[0] for c in anillo], [c[1] for c in anillo]
                self.pol.append((min(xs), min(ys), max(xs), max(ys), anillo, ft["properties"]["iso3"]))

    @staticmethod
    def _dentro(x, y, anillo):
        dentro, j = False, len(anillo) - 1
        for i in range(len(anillo)):
            xi, yi = anillo[i]
            xj, yj = anillo[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                dentro = not dentro
            j = i
        return dentro

    def de(self, lon, lat):
        for x0, y0, x1, y1, anillo, iso in self.pol:
            for x in (lon, lon + 360):  # anillos desenvueltos más allá de 180° (Rusia, Fiyi)
                if x0 <= x <= x1 and y0 <= lat <= y1 and self._dentro(x, lat, anillo):
                    return iso
        return None
