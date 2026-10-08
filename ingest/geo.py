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
    "USA": ["eua", "ee uu", "eeuu", "estados unidos", "us", "u s", "usa", "united states", "washington", "casa blanca", "white house", "pentagono", "pentagon"],
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

    def pais_en_texto(self, texto):
        """ISO3 del país mencionado primero en el texto, o None."""
        t = normalizar(texto)
        mejor = None
        for k in self._claves:
            if k in IGNORAR and not re.search(r"\b(US|U\.S\.)\b", texto):
                continue
            i = t.find(f" {k} ")
            if i >= 0 and (mejor is None or i < mejor[0]):
                mejor = (i, self._nombres[k])
        return mejor[1] if mejor else None

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
