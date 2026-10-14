"""Sitios de Wikidata (CC0) por clase: plantas nucleares, centros de investigación, farmacéuticas,
campos petroleros y de gas, puertos espaciales.

Cada familia es una lista de clases (QID de «instancia de», subtipo, mínimo de Wikipedias con artículo,
de dónde sale la coordenada). La coordenada es la del propio lugar (P625) o, para empresas, la de su
sede (P159 → P625): una farmacéutica se ubica en su sede corporativa, no en cada planta.

Se consulta una clase por vez (el servicio corta a los 60 s). El mínimo de Wikipedias (sitelinks) filtra
lo poco conocido; es una medida de notoriedad, no de tamaño ni de peligrosidad.
Solo se guardan nombre, subtipo, país, operador o estado y el enlace a Wikidata.
"""
import re

Q_LUGAR = """
SELECT ?x ?xEs ?xEn ?coord ?n ?iso ?estEs ?estEn ?opEs ?opEn WHERE {
  ?x wdt:P31 wd:%s ; wikibase:sitelinks ?n ; wdt:P625 ?coord .
  FILTER(?n >= %d)
  OPTIONAL { ?x rdfs:label ?xEs FILTER(lang(?xEs) = "es") }
  OPTIONAL { ?x rdfs:label ?xEn FILTER(lang(?xEn) = "en") }
  OPTIONAL { ?x wdt:P17 ?pais . ?pais wdt:P298 ?iso }
  OPTIONAL { ?x wdt:P5817 ?est . OPTIONAL { ?est rdfs:label ?estEs FILTER(lang(?estEs) = "es") }
             OPTIONAL { ?est rdfs:label ?estEn FILTER(lang(?estEn) = "en") } }
  OPTIONAL { ?x wdt:P137 ?op . OPTIONAL { ?op rdfs:label ?opEs FILTER(lang(?opEs) = "es") }
             OPTIONAL { ?op rdfs:label ?opEn FILTER(lang(?opEn) = "en") } }
}"""

Q_SEDE = """
SELECT ?x ?xEs ?xEn ?coord ?n ?iso ?sedeEs ?sedeEn WHERE {
  ?x wdt:P31 wd:%s ; wikibase:sitelinks ?n ; wdt:P159 ?sede .
  FILTER(?n >= %d)
  ?sede wdt:P625 ?coord .
  FILTER NOT EXISTS { ?x wdt:P576 ?fin }
  OPTIONAL { ?x rdfs:label ?xEs FILTER(lang(?xEs) = "es") }
  OPTIONAL { ?x rdfs:label ?xEn FILTER(lang(?xEn) = "en") }
  OPTIONAL { ?x wdt:P17 ?pais . ?pais wdt:P298 ?iso }
  OPTIONAL { ?sede rdfs:label ?sedeEs FILTER(lang(?sedeEs) = "es") }
  OPTIONAL { ?sede rdfs:label ?sedeEn FILTER(lang(?sedeEn) = "en") }
}"""

# Patrimonio Mundial: no es una clase («instancia de») sino una declaratoria (P1435 = Q9259).
Q_PATRIMONIO = Q_LUGAR.replace("?x wdt:P31 wd:%s ;", "?x wdt:P1435 wd:%s ;")

# familia → [(QID clase, subtipo, mínimo de sitelinks, "lugar" | "sede", zoom mínimo)]
# Conteos medidos en Wikidata el 2026-10-09 (con coordenada): plantas nucleares 379, institutos de
# investigación 4,694 (1,265 con ≥ 3 Wikipedias), farmacéuticas con sede ubicada 169, campos petroleros
# 5,760, puertos espaciales 92.
FAMILIAS = {
    "nuclear": [
        ("Q134447", "nuclear_operacion", 1, "lugar", 3),     # central nuclear (el subtipo se ajusta por estado)
        ("Q1438105", "reactor_investigacion", 1, "lugar", 5),
    ],
    "investigacion": [
        ("Q31855", "centro_investigacion", 4, "lugar", 6),   # instituto de investigación
        ("Q130825", "acelerador_particulas", 2, "lugar", 5),
    ],
    "farmaceuticas": [
        ("Q19644607", "farma_sede", 1, "sede", 5),
        ("Q12099571", "farma_sede", 1, "sede", 5),
    ],
    "petroleo_gas": [
        ("Q211748", "campo_petrolero", 1, "lugar", 5),
        ("Q1349255", "campo_gas", 1, "lugar", 5),
        ("Q689880", "plataforma_marina", 1, "lugar", 5),
    ],
    "turismo": [
        ("Q9259", "patrimonio_mundial", 0, "patrimonio", 3),   # 3,378 sitios con coordenada (oct 2026)
        ("Q46169", "parque_nacional", 5, "lugar", 5),
        ("Q570116", "atraccion_turistica", 4, "lugar", 5),
    ],
    "espacio": [
        ("Q194188", "puerto_espacial", 1, "lugar", 2),
        ("Q1933026", "puerto_espacial", 1, "lugar", 2),
    ],
}

# Estado de uso (P5817) en inglés → subtipo de planta nuclear. Sin dato se toma como «en operación»
# solo si no hay fecha de cierre; el texto del estado se muestra tal cual en la ficha.
ESTADO_NUCLEAR = [
    ("nuclear_construccion", r"under construction|planned|proposed|construction"),
    ("nuclear_cerrada", r"decommission|closed|shut|abandon|out of service|demolish|disused|former|retired"),
]


def _v(f, k):
    x = f.get(k)
    return x["value"] if x else None


def coord(wkt):
    m = re.match(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)", wkt or "")
    if not m:
        return None
    lon, lat = float(m.group(1)), float(m.group(2))
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        return None
    return round(lon, 5), round(lat, 5)


def leer(res, clase):
    """Filas SPARQL → {qid: registro}. Varias filas del mismo QID (varios operadores o estados) se unen."""
    qid_clase, st, _, modo, z = clase
    out = {}
    for f in res["results"]["bindings"]:
        q = (_v(f, "x") or "").rsplit("/", 1)[-1]
        c = coord(_v(f, "coord"))
        if not q or not c:
            continue
        r = out.setdefault(q, {"qid": q, "nombre": _v(f, "xEs") or _v(f, "xEn") or "", "lon": c[0], "lat": c[1],
                               "n": int(_v(f, "n") or 0), "st": st, "z": z, "iso": _v(f, "iso") or "",
                               "estado_en": [], "estado": [], "operador": [], "sede": ""})
        if not r["nombre"] or re.fullmatch(r"Q\d+", r["nombre"]):
            continue
        for k_es, k_en, dest in (("estEs", "estEn", "estado"), ("opEs", "opEn", "operador")):
            x = _v(f, k_es) or _v(f, k_en)
            if x and x not in r[dest]:
                r[dest].append(x)
        if _v(f, "estEn") and _v(f, "estEn") not in r["estado_en"]:
            r["estado_en"].append(_v(f, "estEn"))
        if modo == "sede" and not r["sede"]:
            r["sede"] = _v(f, "sedeEs") or _v(f, "sedeEn") or ""
    return {q: r for q, r in out.items() if r["nombre"] and not re.fullmatch(r"Q\d+", r["nombre"])}


def subtipo_nuclear(r):
    t = " | ".join(r["estado_en"]).lower()
    for st, rx in ESTADO_NUCLEAR:
        if re.search(rx, t):
            return st
    return "nuclear_operacion"


def features(registros, feat, punto, ajustar=None):
    """Registros de todas las clases (sin duplicar) → features. «ajustar» puede cambiar el subtipo (nuclear)."""
    out = []
    for r in sorted(registros.values(), key=lambda r: -r["n"]):
        st = ajustar(r) if ajustar else r["st"]
        partes = []
        if r["sede"]:
            partes.append(f"sede en {r['sede']}")
        if r["estado"]:
            partes.append(", ".join(r["estado"][:2]))
        if r["operador"]:
            partes.append("opera: " + ", ".join(r["operador"][:2]))
        partes.append(f"{r['n']} Wikipedias")
        # Los muy conocidos se ven desde más lejos: 2 niveles de zoom antes con ≥ 30 Wikipedias.
        z = max(1, r["z"] - (2 if r["n"] >= 30 else 1 if r["n"] >= 12 else 0))
        out.append(feat(punto(r["lon"], r["lat"]), {"id": f"wd:{r['qid']}", "n": r["nombre"], "st": st, "p": r["iso"],
                                                    "x": " · ".join(partes)}, z))
    return out


# ------------------------------------------------------------------ empresas por sector
# Sedes corporativas (P159 → P625) de empresas conocidas, con su industria (P452). Se consulta una clase por vez.
# «Conocida» = con artículo en muchas Wikipedias: es notoriedad, no tamaño. Las clases y mínimos se ajustaron para
# quedar en unos pocos miles de sedes (cifras en tools/capas/README o en la ficha de la familia).
Q_EMPRESAS = """
SELECT ?x ?xEs ?xEn ?coord ?n ?iso ?sedeEs ?sedeEn ?indEn WHERE {
  ?x wdt:P31 wd:%s ; wikibase:sitelinks ?n ; wdt:P159 ?sede .
  FILTER(?n >= %d)
  ?sede wdt:P625 ?coord .
  FILTER NOT EXISTS { ?x wdt:P576 ?fin }
  OPTIONAL { ?x rdfs:label ?xEs FILTER(lang(?xEs) = "es") }
  OPTIONAL { ?x rdfs:label ?xEn FILTER(lang(?xEn) = "en") }
  OPTIONAL { ?x wdt:P17 ?pais . ?pais wdt:P298 ?iso }
  OPTIONAL { ?sede rdfs:label ?sedeEs FILTER(lang(?sedeEs) = "es") }
  OPTIONAL { ?sede rdfs:label ?sedeEn FILTER(lang(?sedeEn) = "en") }
  OPTIONAL { ?x wdt:P452 ?ind . ?ind rdfs:label ?indEn FILTER(lang(?indEn) = "en") }
}"""
# (QID clase, mínimo de Wikipedias): empresa pública, empresa, negocio, empresa estatal, conglomerado.
CLASES_EMPRESA = [("Q891723", 12), ("Q4830453", 20), ("Q783794", 20), ("Q6881511", 20), ("Q270791", 10), ("Q778575", 10)]

# Industria (etiqueta en inglés de Wikidata) o nombre → sector. El primero que coincide gana.
SECTORES = [
    ("emp_automotriz", r"automotive|automobile|motor vehicle|car manufactur|truck|motorcycle|tyre|tire|auto parts"),
    ("emp_aeroespacial_defensa", r"aerospace|space industry|defen[cs]e|arms industry|weapon|aircraft manufactur|shipbuilding"),
    ("emp_farma_salud", r"pharma|biotech|health ?care|medical|\bhospitals?\b|life science|vaccine"),
    ("emp_tecnologia", r"software|internet|semiconductor|electronics|computer|information technology|video game|e-commerce|cloud|artificial intelligence|streaming"),
    ("emp_telecom", r"telecom|mobile phone|wireless|cable television|internet service|satellite communic"),
    ("emp_medios", r"media|entertainment|publishing|film|television|broadcast|music|newspaper|advertising|sport|football|animation"),
    ("emp_energia", r"\boil\b|petroleum|natural gas|energy|electric utility|electricity|electric power|power generation|utilit|coal|nuclear|renewable|solar|wind power|pipeline"),
    ("emp_mineria", r"mining|metal|steel|alumin|iron|copper|gold|diamond"),
    ("emp_quimica", r"chemical|plastic|fertili|paint|coating"),
    ("emp_transporte", r"airline|airways|air lines|aviation|shipping|logistic|rail|transport|courier|freight|maritime|port operat|airport"),
    ("emp_hospitalidad", r"hotel|hospitality|restaurant|fast food|food service|tourism|travel|casino|gambling|cruise|lodging|amusement"),
    ("emp_alimentos", r"food|beverage|drink|brew|beer|wine|spirits|dairy|agricult|agribusiness|meat|confection|tobacco|bottl|coffee|sugar|ice cream"),
    ("emp_finanzas", r"bank|financ|insurance|investment|asset management|private equity|payment|credit|stock exchange|reinsurance"),
    ("emp_comercio", r"retail|supermarket|wholesale|department store|fashion|clothing|apparel|luxury|cosmetic|consumer goods|furniture|electrical industry"),
    ("emp_construccion_inmobiliaria", r"construction|real estate|engineering|cement|building material|infrastructure|property"),
]


def sector_empresa(industrias, nombre=""):
    texto = " | ".join(industrias).lower()
    for st, patron in SECTORES:
        if re.search(patron, texto):
            return st
    nombre = (nombre or "").lower()
    if re.search(r"\bf\.?c\.?\b|football|fútbol|futbol|\bclub\b|calcio", nombre):
        return "emp_medios"                 # clubes deportivos registrados como empresas
    for st, patron in SECTORES:             # sin industria declarada: se prueba con el nombre («… Petroleum», «… Bank»)
        if re.search(patron, nombre):
            return st
    return "emp_otros"


def leer_empresas(res, registros, minimo):
    """Filas SPARQL → registros {qid: {...}} acumulando industrias (una fila por industria)."""
    for f in res["results"]["bindings"]:
        q = (_v(f, "x") or "").rsplit("/", 1)[-1]
        c = coord(_v(f, "coord"))
        nombre = _v(f, "xEs") or _v(f, "xEn") or ""
        if not q or not c or not nombre or re.fullmatch(r"Q\d+", nombre):
            continue
        r = registros.setdefault(q, {"qid": q, "nombre": nombre, "lon": c[0], "lat": c[1], "n": int(_v(f, "n") or 0), "iso": _v(f, "iso") or "",
                                     "sede": _v(f, "sedeEs") or _v(f, "sedeEn") or "", "industrias": []})
        ind = _v(f, "indEn")
        if ind and ind not in r["industrias"]:
            r["industrias"].append(ind)
    return registros


def features_empresas(registros, feat, punto):
    out = []
    for r in sorted(registros.values(), key=lambda r: -r["n"]):
        st = sector_empresa(r["industrias"], r["nombre"])
        z = 2 if r["n"] >= 80 else 3 if r["n"] >= 50 else 4 if r["n"] >= 30 else 5 if r["n"] >= 18 else 6
        partes = [f"sede en {r['sede']}" if r["sede"] else "", ", ".join(r["industrias"][:3]), f"{r['n']} Wikipedias"]
        out.append(feat(punto(r["lon"], r["lat"]), {"id": f"wd:{r['qid']}", "n": r["nombre"], "st": st, "p": r["iso"],
                                                    "x": " · ".join(p for p in partes if p)}, z))
    return out
