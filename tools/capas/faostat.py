"""Producción agrícola y ganadera por país (FAOSTAT, dominio QCL) y acuicultura (FishStat), ambas de la FAO.

Licencia: CC BY 4.0, según los términos de uso de las bases estadísticas de la FAO
(https://www.fao.org/contact-us/terms/db-terms-of-use/en/). Se usan los archivos de descarga masiva que la FAO publica
para eso: una descarga por corrida mensual, no una consulta por país. El servidor de descargas no publica robots.txt
(responde 403); según la norma RFC 9309, un robots.txt inaccesible por error 4xx no impone restricciones.

Por país se toma el último año con datos y se guardan los 5 productos con más toneladas; el color es el grupo del
producto principal (cereales, caña, frutas…).
"""
import csv
import io
import json
import os
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CULTIVOS_URL = "https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_All_Data_(Normalized).zip"

# Nombre en español de los productos más frecuentes en el top 5 de los países (el resto queda en inglés, como en FAOSTAT).
ES = {
    "Sugar cane": "Caña de azúcar", "Maize (corn)": "Maíz", "Rice": "Arroz", "Wheat": "Trigo", "Soya beans": "Soya",
    "Potatoes": "Papa", "Cassava, fresh": "Yuca", "Oil palm fruit": "Fruto de palma de aceite", "Sugar beet": "Remolacha azucarera",
    "Barley": "Cebada", "Tomatoes": "Jitomate", "Bananas": "Plátano", "Plantains and cooking bananas": "Plátano macho",
    "Raw milk of cattle": "Leche de vaca", "Raw milk of buffalo": "Leche de búfala", "Raw milk of goats": "Leche de cabra",
    "Raw milk of sheep": "Leche de oveja", "Watermelons": "Sandía", "Onions and shallots, dry (excluding dehydrated)": "Cebolla",
    "Sweet potatoes": "Camote", "Yams": "Ñame", "Sorghum": "Sorgo", "Millet": "Mijo", "Oranges": "Naranja", "Apples": "Manzana",
    "Grapes": "Uva", "Coconuts, in shell": "Coco", "Rape or colza seed": "Canola", "Sunflower seed": "Girasol", "Oats": "Avena",
    "Rye": "Centeno", "Cabbages": "Col", "Cucumbers and gherkins": "Pepino", "Mangoes, guavas and mangosteens": "Mango y guayaba",
    "Pineapples": "Piña", "Avocados": "Aguacate", "Coffee, green": "Café verde", "Cocoa beans": "Cacao", "Tea leaves": "Té",
    "Seed cotton, unginned": "Algodón", "Groundnuts, excluding shelled": "Cacahuate", "Olives": "Aceituna", "Dates": "Dátil",
    "Meat of chickens, fresh or chilled": "Carne de pollo", "Meat of cattle with the bone, fresh or chilled": "Carne de res",
    "Meat of pig with the bone, fresh or chilled": "Carne de cerdo", "Hen eggs in shell, fresh": "Huevo",
    "Chillies and peppers, green (Capsicum spp. and Pimenta spp.)": "Chile verde", "Lemons and limes": "Limón",
    "Taro": "Taro", "Beans, dry": "Frijol", "Carrots and turnips": "Zanahoria", "Pumpkins, squash and gourds": "Calabaza",
    "Papayas": "Papaya", "Natural rubber in primary forms": "Hule natural", "Sugar crops n.e.c.": "Otros cultivos azucareros",
}

# Grupo del producto principal → (subtipo, etiqueta, color). La primera regla que coincide gana.
GRUPOS = [
    ("cultivo_cana", "Caña de azúcar y remolacha", "#8E24AA", ("sugar cane", "sugar beet", "sugar crops")),
    ("cultivo_cereales", "Cereales (maíz, arroz, trigo…)", "#F9A825", ("maize", "rice", "wheat", "barley", "sorghum", "millet", "oats", "rye", "cereal")),
    ("cultivo_raices", "Raíces y tubérculos (papa, yuca…)", "#8D6E63", ("potato", "cassava", "yam", "taro", "sweet potato")),
    ("cultivo_oleaginosas", "Oleaginosas (soya, palma…)", "#558B2F", ("soya", "oil palm", "rape", "sunflower", "groundnut", "olive", "coconut")),
    ("cultivo_frutas", "Frutas (plátano, uva, cítricos…)", "#E65100", ("banana", "plantain", "grape", "orange", "apple", "mango", "pineapple", "watermelon", "date", "lemon", "avocado", "papaya")),
    ("cultivo_hortalizas", "Hortalizas", "#43A047", ("tomato", "onion", "cabbage", "cucumber", "chilli", "carrot", "pumpkin", "vegetable")),
    ("cultivo_ganaderia", "Leche, carne y huevo", "#1565C0", ("milk", "meat", "egg")),
    ("cultivo_otros", "Otros (café, cacao, algodón…)", "#757575", ()),
]


def grupo(item):
    t = item.lower()
    for st, etiqueta, color, claves in GRUPOS:
        if not claves or any(k in t for k in claves):
            return st, etiqueta, color
    return GRUPOS[-1][:3]


def tabla_m49():
    with open(os.path.join(ROOT, "config", "m49_iso3.json"), encoding="utf-8") as f:
        return json.load(f)["m49"]


def leer_cultivos(filas, m49, top=5):
    """Filas del CSV normalizado → {iso3: {"anio": año, "productos": [(nombre, toneladas)]}} (último año de cada país).
    Solo «Production» en toneladas y productos individuales (los códigos ≥ 1700 son agregados como «Cereals, primary»)."""
    por = {}
    for r in filas:
        if r.get("Element") != "Production" or r.get("Unit") != "t" or not r.get("Value"):
            continue
        try:
            codigo, anio, valor = int(r["Item Code"]), int(r["Year"]), float(r["Value"])
        except (KeyError, ValueError):
            continue
        iso = m49.get(str(r.get("Area Code (M49)", "")).strip("'"))  # viene como «'484»
        if codigo >= 1700 or valor <= 0 or not iso:
            continue
        d = por.setdefault(iso, {})
        d.setdefault(anio, {})[r["Item"]] = valor
    out = {}
    for iso, anios in por.items():
        anio = max(anios)
        prods = sorted(anios[anio].items(), key=lambda x: -x[1])[:top]
        out[iso] = {"anio": anio, "productos": prods}
    return out


def toneladas(v):
    return f"{v / 1e6:,.1f} millones de t" if v >= 1e6 else f"{v / 1e3:,.0f} mil t" if v >= 1e3 else f"{v:,.0f} t"


def features_cultivos(paises_fc, datos):
    out = []
    for f in paises_fc["features"]:
        iso = f["properties"].get("iso3")
        d = datos.get(iso)
        if not d or not d["productos"]:
            continue
        st, etiqueta, color = grupo(d["productos"][0][0])
        lista = ", ".join(f"{ES.get(n, n)} {toneladas(v)}" for n, v in d["productos"])
        out.append({"type": "Feature", "geometry": f["geometry"], "properties": {
            "id": f"cultivos:{iso}", "n": f["properties"].get("nombre") or iso, "st": st, "p": iso, "color": color,
            "x": f"Producto principal: {ES.get(d['productos'][0][0], d['productos'][0][0])} ({etiqueta}). Los 5 mayores en {d['anio']}: {lista}. "
                 "Fuente: FAOSTAT (FAO), CC BY 4.0", "z": 0}})
    return out


def abrir_zip(contenido, nombre_parcial, encoding="latin-1"):
    z = zipfile.ZipFile(io.BytesIO(contenido))
    nombre = next(n for n in z.namelist() if nombre_parcial in n and n.endswith(".csv"))
    return csv.DictReader(io.TextIOWrapper(z.open(nombre), encoding=encoding))


# ------------------------------------------------------------------ acuicultura (FishStat)
# El nombre del archivo lleva la versión anual (p. ej. Aquaculture_2025.1.0.zip): se prueba desde el año siguiente hacia atrás.
ACUI_URL = "https://www.fao.org/fishery/static/Data/Aquaculture_{v}.1.0.zip"

ACUICULTURA = [
    ("acuicultura_1", 1e3, "Menos de 1 mil t", "#E3F2FD"),
    ("acuicultura_2", 1e4, "1 mil a 10 mil t", "#90CAF9"),
    ("acuicultura_3", 1e5, "10 mil a 100 mil t", "#42A5F5"),
    ("acuicultura_4", 1e6, "100 mil a 1 millón de t", "#1E88E5"),
    ("acuicultura_5", 1e7, "1 a 10 millones de t", "#1565C0"),
    ("acuicultura_6", None, "10 millones de t o más", "#0D2C6B"),
]


def leer_acuicultura(cantidades, paises, especies, top=3):
    """CSV de FishStat → {iso3: {"anio", "total" (t de peso vivo), "especies": [(nombre, t)]}} del último año de cada país."""
    iso_de = {r["UN_Code"]: r["ISO3_Code"] for r in paises if r.get("ISO3_Code")}
    nombre_de = {r["3A_Code"]: (r.get("Name_Es") or r.get("Name_En") or r["3A_Code"]) for r in especies}
    por = {}
    for r in cantidades:
        if r.get("MEASURE") != "Q_tlw":
            continue
        try:
            anio, valor = int(r["PERIOD"]), float(r["VALUE"])
        except (KeyError, ValueError):
            continue
        iso = iso_de.get(r.get("COUNTRY.UN_CODE"))
        if not iso or valor <= 0:
            continue
        e = por.setdefault(iso, {}).setdefault(anio, {})
        sp = r.get("SPECIES.ALPHA_3_CODE")
        e[sp] = e.get(sp, 0) + valor
    out = {}
    for iso, anios in por.items():
        anio = max(anios)
        sp = sorted(anios[anio].items(), key=lambda x: -x[1])
        out[iso] = {"anio": anio, "total": sum(v for _, v in sp), "especies": [(nombre_de.get(c, c), v) for c, v in sp[:top]]}
    return out


def features_acuicultura(paises_fc, datos):
    import indicadores as I
    valores = {iso: (d["total"], str(d["anio"])) for iso, d in datos.items()}
    out = I.features_indicador(paises_fc, valores, ACUICULTURA, "acuicultura_pais", lambda v: f"{toneladas(v)} de acuicultura")
    for f in out:
        d = datos[f["properties"]["p"]]
        f["properties"]["x"] += " · Principales especies: " + ", ".join(f"{n} {toneladas(v)}" for n, v in d["especies"]) + " · Fuente: FishStat (FAO), CC BY 4.0"
    return out
