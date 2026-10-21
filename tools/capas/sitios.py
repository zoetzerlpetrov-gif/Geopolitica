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
SELECT ?x ?xEs ?xEn ?coord ?n ?iso ?estEs ?estEn ?opEs ?opEn ?opA2 ?opA3 WHERE {
  ?x wdt:P31 wd:%s ; wikibase:sitelinks ?n ; wdt:P625 ?coord .
  FILTER(?n >= %d)
  OPTIONAL { ?x rdfs:label ?xEs FILTER(lang(?xEs) = "es") }
  OPTIONAL { ?x rdfs:label ?xEn FILTER(lang(?xEn) = "en") }
  OPTIONAL { ?x wdt:P17 ?pais . ?pais wdt:P298 ?iso }
  OPTIONAL { ?x wdt:P5817 ?est . OPTIONAL { ?est rdfs:label ?estEs FILTER(lang(?estEs) = "es") }
             OPTIONAL { ?est rdfs:label ?estEn FILTER(lang(?estEn) = "en") } }
  OPTIONAL { ?x wdt:P137 ?op . OPTIONAL { ?op rdfs:label ?opEs FILTER(lang(?opEs) = "es") }
             OPTIONAL { ?op rdfs:label ?opEn FILTER(lang(?opEn) = "en") }
             OPTIONAL { ?op wdt:P17 ?opP . ?opP wdt:P297 ?opA2 ; wdt:P298 ?opA3 } }
}"""

# Recursos (minas, campos, plataformas): operador (P137) o, si no hay, dueño (P127), con el país de la compañía, y el
# producto o mineral (P1056). Para clases con subclases (mina de cobre, de oro…) se usa P31/P279*.
Q_RECURSO = """
SELECT ?x ?xEs ?xEn ?coord ?n ?iso ?opEs ?opEn ?opA2 ?opA3 ?prodEs ?prodEn WHERE {
  ?x wdt:P31 wd:%s ; wikibase:sitelinks ?n ; wdt:P625 ?coord .
  FILTER(?n >= %d)
  FILTER NOT EXISTS { ?x wdt:P576 ?fin }
  OPTIONAL { ?x rdfs:label ?xEs FILTER(lang(?xEs) = "es") }
  OPTIONAL { ?x rdfs:label ?xEn FILTER(lang(?xEn) = "en") }
  OPTIONAL { ?x wdt:P17 ?pais . ?pais wdt:P298 ?iso }
  OPTIONAL { ?x wdt:P137|wdt:P127 ?op . OPTIONAL { ?op rdfs:label ?opEs FILTER(lang(?opEs) = "es") }
             OPTIONAL { ?op rdfs:label ?opEn FILTER(lang(?opEn) = "en") }
             OPTIONAL { ?op wdt:P17 ?opP . ?opP wdt:P297 ?opA2 ; wdt:P298 ?opA3 } }
  OPTIONAL { ?x wdt:P1056 ?prod . OPTIONAL { ?prod rdfs:label ?prodEs FILTER(lang(?prodEs) = "es") }
             OPTIONAL { ?prod rdfs:label ?prodEn FILTER(lang(?prodEn) = "en") } }
}"""
Q_RECURSO_SUB = Q_RECURSO.replace("?x wdt:P31 wd:%s ;", "?x wdt:P31/wdt:P279* wd:%s ;")
# Solo los que registran mineral, operador o dueño (≈ 4,500 de las 50 mil minas con coordenada, medido el 21-oct-2026).
Q_RECURSO_DATO = Q_RECURSO.replace("FILTER NOT EXISTS { ?x wdt:P576 ?fin }",
                                   "FILTER NOT EXISTS { ?x wdt:P576 ?fin }\n  FILTER EXISTS { ?x wdt:P1056|wdt:P137|wdt:P127 [] }")

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

# Empresas por industria (P452) en vez de por clase: así entran farmacéuticas que Wikidata registra como «empresa»,
# «empresa pública», etc. Misma salida que Q_SEDE.
Q_INDUSTRIA = Q_SEDE.replace("?x wdt:P31 wd:%s ;", "?x wdt:P452 wd:%s ;")

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
    # Ampliación (oct 2026): todo tipo de investigación, con o sin artículo en Wikipedia. Conteos con coordenada:
    # institutos 4,701 (+3,433 con sede ubicada), centros de investigación 1,006, observatorios astronómicos 2,750,
    # unidades mixtas francesas 557, estaciones de investigación 192, institutos de investigación médica 50.
    # El subtipo final (salud, ambiente, tecnología…) lo pone subtipo_investigacion() por el nombre.
    "investigacion": [
        ("Q130825", "acelerador_particulas", 1, "lugar", 5),
        ("Q1254933", "observatorio", 0, "lugar", 6),          # observatorio astronómico
        ("Q195339", "estacion_investigacion", 0, "lugar", 6),
        ("Q66737615", "investigacion_salud", 0, "lugar", 6),  # instituto de investigación médica
        ("Q66737615", "investigacion_salud", 0, "sede", 6),
        ("Q31855", "centro_investigacion", 0, "lugar", 6),    # instituto de investigación
        ("Q31855", "centro_investigacion", 0, "sede", 7),
        ("Q7315155", "centro_investigacion", 0, "lugar", 6),  # centro de investigación
        ("Q7315155", "centro_investigacion", 0, "sede", 7),
        ("Q483242", "laboratorio", 0, "lugar", 7),
        ("Q3550864", "laboratorio", 0, "lugar", 7),           # unidad mixta de investigación (Francia)
        ("Q16519632", "centro_investigacion", 0, "sede", 7),  # organización científica
    ],
    "farmaceuticas": [
        ("Q19644607", "farma_sede", 0, "sede", 5),            # farmacéutica (clase)
        ("Q12099571", "farma_sede", 0, "sede", 5),
        ("Q90298876", "farma_sede", 0, "sede", 6),            # empresa de biotecnología
        ("Q507443", "farma_sede", 0, "industria", 5),         # cualquier empresa cuya industria sea la farmacéutica
    ],
    "petroleo_gas": [
        ("Q211748", "campo_petrolero", 1, "recurso", 5),   # 5,709 con coordenada; 139 con operador (oct 2026)
        ("Q1349255", "campo_gas", 1, "recurso", 5),        # 357; 93 con operador
        ("Q689880", "plataforma_marina", 1, "recurso", 5),
    ],
    # Minas (Wikidata, 50,059 con coordenada en oct 2026): las que registran mineral, operador o dueño, y las conocidas
    # (≥ 3 Wikipedias). Las demás son sobre todo minas históricas o de carbón sin datos útiles para esta capa.
    "recursos_minas": [
        ("Q820477", "mineria", 0, "recurso_dato", 6),
        ("Q820477", "mineria", 3, "recurso", 6),
    ],
    "turismo": [
        ("Q9259", "patrimonio_mundial", 0, "patrimonio", 3),   # 3,378 sitios con coordenada (oct 2026)
        ("Q46169", "parque_nacional", 5, "lugar", 5),
        ("Q570116", "atraccion_turistica", 4, "lugar", 5),
        # Ampliación (oct 2026). Conteos con coordenada medidos en Wikidata: sitios arqueológicos ≥ 3 Wikipedias 9,383;
        # playas ≥ 2: 3,699; cascadas ≥ 3: 2,086; cuevas ≥ 4: 1,014; castillos ≥ 6: 2,324; palacios ≥ 6: 1,217;
        # monumentos ≥ 6: 1,213; zoológicos 1,049; parques de diversiones 666; acuarios 249.
        ("Q268998", "pueblo_magico", 0, "patrimonio", 4),      # Pueblos Mágicos de México (declaratoria)
        ("Q676050", "centro_historico", 3, "lugar", 5),
        ("Q839954", "sitio_arqueologico", 3, "lugar", 5),
        ("Q33506", "museo", 6, "lugar", 6),
        ("Q23413", "castillo_palacio", 6, "lugar", 6),
        ("Q16560", "castillo_palacio", 6, "lugar", 6),
        ("Q4989906", "monumento", 6, "lugar", 6),
        ("Q40080", "playa", 2, "lugar", 6),
        ("Q334743", "cenote_cueva", 0, "lugar", 6),
        ("Q35509", "cenote_cueva", 4, "lugar", 6),
        ("Q34038", "cascada_turistica", 3, "lugar", 6),
        ("Q194195", "parque_ocio", 3, "lugar", 6),
        ("Q43501", "parque_ocio", 3, "lugar", 6),
        ("Q2281788", "parque_ocio", 3, "lugar", 6),
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
                               "estado_en": [], "estado": [], "operador": [], "op_pais": [], "producto": [], "sede": ""})
        if not r["nombre"] or re.fullmatch(r"Q\d+", r["nombre"]):
            continue
        for k_es, k_en, dest in (("estEs", "estEn", "estado"), ("opEs", "opEn", "operador")):
            x = _v(f, k_es) or _v(f, k_en)
            if x and x not in r[dest]:
                r[dest].append(x)
        if _v(f, "opA2") and _v(f, "opA3") and (_v(f, "opA2"), _v(f, "opA3")) not in r["op_pais"]:
            r["op_pais"].append((_v(f, "opA2"), _v(f, "opA3")))
        x = _v(f, "prodEs") or _v(f, "prodEn")
        if x and x not in r["producto"] and not re.fullmatch(r"Q\d+", x):
            r["producto"].append(x)
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


# Nombre → área de investigación. El primero que coincide gana; los demás institutos quedan como «ciencias y tecnología».
AREAS_INVESTIGACION = [
    ("investigacion_salud", r"salud|health|m[eé]dic|medic|biom[eé]d|c[aá]ncer|cancer|oncol|cardio|neuro|genom|gen[eé]tic|vacun|vaccin|"
     r"epidemi|infect|virol|immun|inmun|pharma|farmac|nutri|pediatr|psiqui|psychiat|hospital|cl[ií]nic|clinic|disease|enfermedad|tropical med"),
    ("investigacion_ambiente", r"agr[io]|agron|forest|bosque|ocean|oc[eé]an|marin|mar\b|sea\b|pesca|fisher|clima|climat|meteor|atmosf|"
     r"atmosph|ambient|environment|ecolog|biodivers|water|agua|hidr|hydro|soil|suelo|geolog|geof[ií]s|geophys|polar|antar|glaci|volc|seism|s[ií]sm"),
    ("investigacion_tecnologia", r"tecnol|technolog|ingenier|engineer|energ|nuclear|f[ií]sic|physic|aero|space|espacial|comput|inform|"
     r"electr[oó]n|robot|material|qu[ií]mic|chemi|laser|fusion|quantum|cu[aá]ntic|nano|semicon|telecom|matem|math|optic|[oó]ptic"),
]


def subtipo_investigacion(r):
    """Institutos y centros genéricos → área por su nombre (en español o inglés). Los demás subtipos quedan igual."""
    if r["st"] != "centro_investigacion":
        return r["st"]
    t = r["nombre"].lower()
    for st, rx in AREAS_INVESTIGACION:
        if re.search(rx, t):
            return st
    return "centro_investigacion"


# ------------------------------------------------------------------ representaciones diplomáticas
# Embajadas, consulados y misiones (Wikidata). La coordenada es la del edificio (P625) o, si no hay, la de la ciudad
# sede (P159 → P625): en ese caso la ubicación es aproximada y la ficha lo dice. ?envia = país que envía (P137, ISO 2).
Q_DIPLOMATICO = """
SELECT ?x ?xEs ?xEn ?coord ?exacta ?iso ?envia WHERE {
  ?x wdt:P31 wd:%s .
  { ?x wdt:P625 ?coord . BIND(true AS ?exacta) } UNION { ?x wdt:P159 ?sede . ?sede wdt:P625 ?coord . BIND(false AS ?exacta) }
  FILTER NOT EXISTS { ?x wdt:P576 ?fin }
  OPTIONAL { ?x rdfs:label ?xEs FILTER(lang(?xEs) = "es") }
  OPTIONAL { ?x rdfs:label ?xEn FILTER(lang(?xEn) = "en") }
  OPTIONAL { ?x wdt:P17 ?pais . ?pais wdt:P298 ?iso }
  OPTIONAL { ?x wdt:P137 ?op . ?op wdt:P297 ?envia }
}"""
# Conteos (oct 2026): embajadas 8,091 (casi todas solo con ciudad sede), consulados generales 671, consulados 146,
# altos comisionados, misiones permanentes 85 y misiones diplomáticas genéricas 91.
CLASES_DIPLOMATICAS = [("Q3917681", "embassy"), ("Q372690", "consulate_general"), ("Q7843791", "consulate"),
                       ("Q12143816", "high_commission"), ("Q2360219", "permanent_mission"), ("Q213283", "embassy")]


def leer_diplomaticos(filas, tipo, registros):
    """Filas SPARQL → registros {qid: {...}}; con dos coordenadas gana la exacta (P625)."""
    for f in filas:
        q = (_v(f, "x") or "").rsplit("/", 1)[-1]
        c = coord(_v(f, "coord"))
        nombre = _v(f, "xEs") or _v(f, "xEn") or ""
        if not q or not c or not nombre or re.fullmatch(r"Q\d+", nombre):
            continue
        exacta = (_v(f, "exacta") or "") == "true"
        r = registros.get(q)
        if r and (r["exacta"] or not exacta):
            continue
        registros[q] = {"qid": q, "nombre": nombre, "lon": c[0], "lat": c[1], "exacta": exacta, "tipo": tipo,
                        "iso": _v(f, "iso") or (r or {}).get("iso", ""), "envia": (_v(f, "envia") or (r or {}).get("envia", "")).upper()}
    return registros


def _km(a, b):
    import math
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(math.radians(b[0] - a[0]) / 2) ** 2
    return 12742 * math.asin(min(1, math.sqrt(h)))


def fusionar_diplomaticos(osm, registros, feat, punto, pais_de=lambda lon, lat: ""):
    """OSM (ubicación exacta) + Wikidata sin duplicar: se omite el registro de Wikidata si a menos de 25 km hay una
    representación de OSM del mismo país que envía (o, sin país conocido, con el mismo nombre)."""
    def norm(t):
        return re.sub(r"[^a-z0-9 ]", "", (t or "").lower())
    celdas = {}
    for f in osm:
        lon, lat = f["geometry"]["coordinates"]
        celdas.setdefault((round(lat), round(lon)), []).append(f)
    out = list(osm)
    for r in sorted(registros.values(), key=lambda r: r["qid"]):
        cerca = [g for dl in (-1, 0, 1) for do in (-1, 0, 1) for g in celdas.get((round(r["lat"]) + dl, round(r["lon"]) + do), [])
                 if _km(g["geometry"]["coordinates"], (r["lon"], r["lat"])) < 25]
        def mismo(g):
            tipo_pais = (g["properties"].get("x") or "").split("|")
            pais_osm = tipo_pais[1].upper() if len(tipo_pais) > 1 else ""
            return (r["envia"] and pais_osm == r["envia"]) or norm(g["properties"].get("n")) == norm(r["nombre"])
        if any(mismo(g) for g in cerca):
            continue
        x = f"{r['tipo']}|{r['envia']}" + ("" if r["exacta"] else "|aprox")
        out.append(feat(punto(r["lon"], r["lat"]), {"id": f"wd:{r['qid']}", "n": r["nombre"], "st": "embajadas_consulados",
                                                    "p": r["iso"] or pais_de(r["lon"], r["lat"]), "x": x}, 7 if r["tipo"] == "embassy" else 9))
    return out


def features(registros, feat, punto, ajustar=None, con_operador=False):
    """Registros de todas las clases (sin duplicar) → features. «ajustar» puede cambiar el subtipo (nuclear)."""
    out = []
    for r in sorted(registros.values(), key=lambda r: -r["n"]):
        st = ajustar(r) if ajustar else r["st"]
        partes = []
        if r["sede"]:
            partes.append(f"sede en {r['sede']}")
        if r["estado"]:
            partes.append(", ".join(r["estado"][:2]))
        if r.get("producto"):
            partes.append(", ".join(r["producto"][:3]))
        if r["operador"]:
            partes.append("opera: " + ", ".join(r["operador"][:2]))
        partes.append(f"{r['n']} Wikipedias")
        # Los muy conocidos se ven desde más lejos: 2 niveles de zoom antes con ≥ 30 Wikipedias.
        z = max(1, r["z"] - (2 if r["n"] >= 30 else 1 if r["n"] >= 12 else 0))
        props = {"id": f"wd:{r['qid']}", "n": r["nombre"], "st": st, "p": r["iso"], "x": " · ".join(partes)}
        if con_operador:
            import operadores as OP
            props.update(OP.propiedades(r["iso"], r["operador"][:3], r.get("op_pais", [])))
        out.append(feat(punto(r["lon"], r["lat"]), props, z))
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
# Mínimos bajados en oct 2026 (antes 12/20/20/20/10/10, unas 3 mil sedes) para cubrir empresas medianas conocidas.
CLASES_EMPRESA = [("Q891723", 8), ("Q4830453", 12), ("Q783794", 12), ("Q6881511", 12), ("Q270791", 6), ("Q778575", 6)]

# Países con cobertura completa (cualquier empresa con sede ubicada y al menos N Wikipedias): México primero.
# Se usan las clases directas (sin subclases) para que la consulta no exceda los 60 s del servicio.
PAISES_EMPRESA = [("Q96", 1)]
Q_EMPRESAS_PAIS = Q_EMPRESAS.replace("?x wdt:P31 wd:%s ;", "VALUES ?c { " + " ".join(f"wd:{q}" for q, _ in CLASES_EMPRESA)
                                     + " wd:Q19644607 wd:Q1589009 wd:Q22687 wd:Q46970 } ?x wdt:P31 ?c ; wdt:P17 wd:%s ;")

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
