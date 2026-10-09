"""Forma de gobierno y orientación política del gobierno de cada país (Wikidata, CC0).

Se hacen tres consultas SPARQL pequeñas (una gigante agota el tiempo del servicio):
  1. Formas de gobierno (P122) de cada Estado soberano (Q3624078) con su código ISO 3166-1 alfa-3 (P298).
  2. Jefe de gobierno (P6) y jefe de Estado (P35) actuales y su partido vigente (P102 sin fecha de fin).
  3. Para esos partidos: alineación política (P1387: extrema izquierda … extrema derecha) e ideología (P1142).

Quién cuenta como «el gobierno»: en sistemas parlamentarios y monarquías constitucionales, el jefe de
gobierno (primer ministro); en los demás, el jefe de Estado (presidente, monarca, líder supremo). Si esa
persona no tiene partido se prueba con la otra.

Orientación: promedio de las alineaciones del partido en la escala −3 (extrema izquierda) … +3 (extrema
derecha). Si su ideología incluye comunismo o marxismo-leninismo y el país es de partido único, se marca
«comunista (partido único)». Sin partido → «sin partido» (monarquías absolutas, juntas militares,
independientes). Es la clasificación registrada en Wikidata (editable por cualquiera, con fuentes
variables), no una opinión del proyecto; la ficha lo dice y enlaza cada dato.
"""
import json
import re
from collections import defaultdict

SPARQL = "https://query.wikidata.org/sparql"

Q_FORMAS = """
SELECT ?iso ?pais ?paisEs ?forma ?formaEn ?formaEs WHERE {
  ?pais wdt:P31 wd:Q3624078 ; wdt:P298 ?iso .
  FILTER NOT EXISTS { ?pais wdt:P576 ?fin }
  OPTIONAL { ?pais rdfs:label ?paisEs FILTER(lang(?paisEs) = "es") }
  OPTIONAL { ?pais wdt:P122 ?forma .
             OPTIONAL { ?forma rdfs:label ?formaEn FILTER(lang(?formaEn) = "en") }
             OPTIONAL { ?forma rdfs:label ?formaEs FILTER(lang(?formaEs) = "es") } }
}"""

Q_JEFES = """
SELECT ?iso ?rol ?jefe ?jefeNombre ?jefeEn ?partido ?ini WHERE {
  ?pais wdt:P31 wd:Q3624078 ; wdt:P298 ?iso .
  FILTER NOT EXISTS { ?pais wdt:P576 ?fin }
  { ?pais wdt:P6 ?jefe . BIND("gobierno" AS ?rol) } UNION { ?pais wdt:P35 ?jefe . BIND("estado" AS ?rol) }
  OPTIONAL { ?jefe rdfs:label ?jefeNombre FILTER(lang(?jefeNombre) = "es") }
  OPTIONAL { ?jefe rdfs:label ?jefeEn FILTER(lang(?jefeEn) = "en" || lang(?jefeEn) = "mul") }
  OPTIONAL { ?jefe p:P102 ?st . ?st ps:P102 ?partido . FILTER NOT EXISTS { ?st pq:P582 ?hasta }
             OPTIONAL { ?st pq:P580 ?ini } }
}"""

Q_PARTIDOS = """
SELECT ?partido ?partidoEs ?partidoEn ?alin ?alinEn ?ideo ?ideoEn ?ideoEs WHERE {
  VALUES ?partido { %s }
  OPTIONAL { ?partido rdfs:label ?partidoEs FILTER(lang(?partidoEs) = "es") }
  OPTIONAL { ?partido rdfs:label ?partidoEn FILTER(lang(?partidoEn) = "en") }
  OPTIONAL { ?partido wdt:P1387 ?alin . OPTIONAL { ?alin rdfs:label ?alinEn FILTER(lang(?alinEn) = "en") } }
  OPTIONAL { ?partido wdt:P1142 ?ideo .
             OPTIONAL { ?ideo rdfs:label ?ideoEn FILTER(lang(?ideoEn) = "en") }
             OPTIONAL { ?ideo rdfs:label ?ideoEs FILTER(lang(?ideoEs) = "es") } }
}"""

# Instituciones: órgano ejecutivo (P208) con su sitio oficial (P856) y órgano legislativo (P194). Se intentó traer el
# gabinete completo (ministros con cargo vigente), pero el servicio de Wikidata agota el tiempo (504) con cualquier
# forma de esa consulta; el sitio oficial del gobierno es la fuente para ver el gabinete al día.
Q_INSTITUCIONES = """
SELECT ?iso ?ejec ?ejecEs ?ejecEn ?web ?leg ?legEs ?legEn WHERE {
  ?pais wdt:P31 wd:Q3624078 ; wdt:P298 ?iso .
  FILTER NOT EXISTS { ?pais wdt:P576 ?fin }
  OPTIONAL { ?pais wdt:P208 ?ejec .
             OPTIONAL { ?ejec rdfs:label ?ejecEs FILTER(lang(?ejecEs) = "es") }
             OPTIONAL { ?ejec rdfs:label ?ejecEn FILTER(lang(?ejecEn) = "en") }
             OPTIONAL { ?ejec wdt:P856 ?web } }
  OPTIONAL { ?pais wdt:P194 ?leg .
             OPTIONAL { ?leg rdfs:label ?legEs FILTER(lang(?legEs) = "es") }
             OPTIONAL { ?leg rdfs:label ?legEn FILTER(lang(?legEn) = "en") } }
}"""


def leer_instituciones(res):
    """{iso: {"ejecutivo": [nombre, qid, web], "legislativo": [nombre, qid]}} (el primero de cada uno)."""
    out = {}
    for f in res["results"]["bindings"]:
        iso = _v(f, "iso")
        if not iso:
            continue
        d = out.setdefault(iso, {})
        if _v(f, "ejec") and "ejecutivo" not in d:
            d["ejecutivo"] = [_v(f, "ejecEs") or _v(f, "ejecEn") or _qid(_v(f, "ejec")), _qid(_v(f, "ejec")), ""]
        if _v(f, "web") and d.get("ejecutivo") and not d["ejecutivo"][2] and _v(f, "web").startswith("https://"):
            d["ejecutivo"][2] = _v(f, "web")
        if _v(f, "leg") and "legislativo" not in d:
            d["legislativo"] = [_v(f, "legEs") or _v(f, "legEn") or _qid(_v(f, "leg")), _qid(_v(f, "leg"))]
    return out


# ---------------------------------------------------------------- forma de gobierno
# (id, nombre, patrón sobre la etiqueta en inglés). El orden es la prioridad cuando hay varias formas.
FORMAS = [
    ("militar", "Junta o gobierno militar", r"military (junta|dictatorship|government|rule)|stratocracy"),
    ("teocracia", "Teocracia", r"theocra|islamic republic|islamic emirate"),
    ("partido_unico", "Estado de partido único", r"one-party|single-party|communist state|communist dictatorship|marxist.leninist state|socialist state"),
    ("monarquia_absoluta", "Monarquía absoluta", r"absolute monarchy"),
    ("monarquia_constitucional", "Monarquía constitucional o parlamentaria", r"constitutional monarchy|parliamentary monarchy|commonwealth realm|semi-constitutional monarchy|elective monarchy"),
    ("semipresidencial", "República semipresidencial", r"semi-presidential"),
    ("presidencial", "República presidencial", r"presidential|presidentialism"),
    ("parlamentaria", "República parlamentaria", r"parliamentary (system|republic|democracy)|directorial|assembly-independent"),
]
NOMBRE_FORMA = {f[0]: f[1] for f in FORMAS} | {"otra": "República u otra forma sin detalle"}


def inferir_forma(forma, etiquetas_en, roles, partido):
    """Cuando Wikidata solo dice «república» (EUA, China, Argentina…), se deduce con lo que sí registra:
    partido comunista gobernante en una «república popular», «socialista» o «Estado unitario» → partido único
    (una república multipartidista gobernada por un partido marxista, como Sri Lanka, no lo es); la misma persona encabeza Estado y gobierno → presidencial.
    Devuelve (forma, inferida)."""
    if forma != "otra":
        return forma, False
    if partido and "comunista o marxista" in corrientes(partido.get("ideologias_en", [])) and any(
            re.search(r"people's republic|socialist|unitary state", e or "", re.I) for e in etiquetas_en):
        return "partido_unico", True
    estado = {j["qid"] for j in roles.get("estado", [])}
    gobierno = {j["qid"] for j in roles.get("gobierno", [])}
    if estado and estado == gobierno and any(re.search(r"republic", e or "", re.I) for e in etiquetas_en):
        return "presidencial", True
    return forma, False


def forma_principal(etiquetas_en):
    for fid, _, rx in FORMAS:
        if any(re.search(rx, e or "", re.I) for e in etiquetas_en):
            return fid
    return "otra"


def es_federal(etiquetas_en):
    return any(re.search(r"\bfederal|federation|confedera", e or "", re.I) for e in etiquetas_en)


# ---------------------------------------------------------------- orientación
ESCALA = [(r"alt.right", 3), (r"right.libertarian|libertarian right", 2), (r"left.libertarian", -2),
          (r"far.left|extreme.left|radical left", -3), (r"centre.left|center.left", -1), (r"left.wing|^left$", -2),
          (r"far.right|extreme.right|radical right", 3), (r"centre.right|center.right", 1), (r"right.wing|^right$", 2),
          (r"^cent(re|er)$|centrism|radical centre", 0), (r"big tent|syncretic", 0)]
ESPECTRO = [  # (id, nombre, color)
    ("comunista", "Comunista (partido único)", "#7B0A0A"),
    ("extrema_izquierda", "Extrema izquierda", "#B71C1C"),
    ("izquierda", "Izquierda", "#E53935"),
    ("centroizquierda", "Centroizquierda", "#F28B82"),
    ("centro", "Centro o amplio espectro", "#F2C94C"),
    ("centroderecha", "Centroderecha", "#7FB3E0"),
    ("derecha", "Derecha", "#2E6DB4"),
    ("extrema_derecha", "Extrema derecha", "#0D2B5E"),
    ("sin_partido", "Sin partido (monarca, militar o independiente)", "#8E8E8E"),
    ("sin_dato", "Sin dato de orientación", "#C9C9C9"),
]
NOMBRE_ESPECTRO = {e[0]: e[1] for e in ESPECTRO}
_POR_VALOR = {-3: "extrema_izquierda", -2: "izquierda", -1: "centroizquierda", 0: "centro", 1: "centroderecha", 2: "derecha", 3: "extrema_derecha"}


def valor_alineacion(etiqueta_en):
    t = (etiqueta_en or "").strip().lower()
    for rx, v in ESCALA:
        if re.search(rx, t):
            return v
    return None


# Si el partido no tiene alineación registrada, se estima con sus ideologías (se avisa en la ficha).
IDEOLOGIA_VALOR = [
    (r"far.right|neo.?fascis|neo.?nazi|ultranational", 3),
    (r"right.wing populism|national conservatism|right.libertarian|paleolibertarian|anarcho.capitalis|hindutva", 2),
    (r"^conservatism|liberal conservatism|christian democracy|economic liberalism|neoliberalism|conservatism", 1),
    (r"^liberalism$|centrism|social liberalism|third way|radicalism", 0),
    (r"social democracy|democratic socialism", -1),
    (r"^socialism$|left.wing populism|chavism|bolivarian|kirchnerism|labou?r movement|eco.?socialism", -2),
    (r"communism|marxism|leninism|maoism|juche|trotsky|castroism|guevarism", -3),
]


def _sin_anti(ideologias_en):
    """Quita las posturas «anti…» (anticomunismo, antifascismo…): nombran lo que el partido rechaza."""
    return [i for i in ideologias_en if i and not re.match(r"\s*anti", i, re.I)]


def valor_ideologias(ideologias_en):
    vals = []
    for i in _sin_anti(ideologias_en):
        t = (i or "").strip().lower()
        for rx, v in IDEOLOGIA_VALOR:
            if re.search(rx, t):
                vals.append(v)
                break
    return sum(vals) / len(vals) if vals else None


def corrientes(ideologias_en):
    """Rasgos de la ideología del partido: comunista, socialista, socialdemócrata, etc."""
    t = " | ".join(_sin_anti(ideologias_en)).lower()
    out = []
    if re.search(r"communis|marxism|leninis|maois|juche|chavism|bolivarian", t):
        out.append("comunista o marxista")
    if re.search(r"(?<!democratic )socialis(m|t)(?! market)", t) and "comunista o marxista" not in out:
        out.append("socialista")
    if re.search(r"social democra|democratic socialis", t):
        out.append("socialdemócrata")
    if re.search(r"conservatis", t):
        out.append("conservadora")
    if re.search(r"liberalis|libertarian", t):
        out.append("liberal")
    if re.search(r"nationalis", t):
        out.append("nacionalista")
    if re.search(r"populis", t):
        out.append("populista")
    if re.search(r"islamis|christian democra|religious", t):
        out.append("religiosa")
    if re.search(r"green politics|environmentalis", t):
        out.append("ecologista")
    return out


def espectro_de(partido, forma):
    """partido = {alineaciones_en: [...], ideologias_en: [...]} o None."""
    return espectro_y_origen(partido, forma)[0]


def espectro_y_origen(partido, forma):
    """(espectro, origen) con origen «alineación», «ideología» o «»."""
    if not partido:
        return "sin_partido", ""
    if forma == "partido_unico" and "comunista o marxista" in corrientes(partido.get("ideologias_en", [])):
        return "comunista", "ideología"
    vals = [v for v in (valor_alineacion(a) for a in partido.get("alineaciones_en", [])) if v is not None]
    if vals:
        m, origen = sum(vals) / len(vals), "alineación"
    else:
        m, origen = valor_ideologias(partido.get("ideologias_en", [])), "ideología"
        if m is None:
            return "sin_dato", ""
    return _redondear(m), origen


def _redondear(m):
    # Medio punto exacto va hacia el centro («derecha a extrema derecha» → derecha): no se exagera la
    # clasificación; la ficha muestra las alineaciones tal como están en Wikidata.
    v = abs(m)
    r = int(v) if v - int(v) == 0.5 else int(v + 0.5)
    return _POR_VALOR[r * (1 if m >= 0 else -1)]


# «Político independiente» aparece en Wikidata como si fuera un partido (P102); se trata como sin partido.
INDEPENDIENTE = {"Q327591"}


# ---------------------------------------------------------------- lectura de respuestas
def _v(fila, k):
    x = fila.get(k)
    return x["value"] if x else None


def _qid(uri):
    return uri.rsplit("/", 1)[-1] if uri else None


def leer_formas(res):
    paises = {}
    for f in res["results"]["bindings"]:
        iso = _v(f, "iso")
        if not iso or len(iso) != 3:
            continue
        p = paises.setdefault(iso, {"qid": _qid(_v(f, "pais")), "nombre": _v(f, "paisEs") or iso, "formas_en": [], "formas_es": []})
        if _v(f, "forma"):
            en, es = _v(f, "formaEn") or "", _v(f, "formaEs") or _v(f, "formaEn") or ""
            if en not in p["formas_en"]:
                p["formas_en"].append(en)
            if es and es not in p["formas_es"]:
                p["formas_es"].append(es)
    return paises


def leer_jefes(res):
    """{iso: {"gobierno": [{qid, nombre, partidos:[qid], inicio:{qid: fecha}}], "estado": [...]}}"""
    out = defaultdict(lambda: {"gobierno": {}, "estado": {}})
    for f in res["results"]["bindings"]:
        iso, rol, jefe = _v(f, "iso"), _v(f, "rol"), _qid(_v(f, "jefe"))
        if not iso or not jefe:
            continue
        j = out[iso][rol].setdefault(jefe, {"qid": jefe, "nombre": _v(f, "jefeNombre") or _v(f, "jefeEn") or jefe, "partidos": [], "inicio": {}})
        p = _qid(_v(f, "partido"))
        if p and p not in j["partidos"]:
            j["partidos"].append(p)
        if p and _v(f, "ini"):
            j["inicio"][p] = max(j["inicio"].get(p, ""), _v(f, "ini"))
    return {iso: {r: list(d.values()) for r, d in roles.items()} for iso, roles in out.items()}


def leer_partidos(res):
    out = {}
    for f in res["results"]["bindings"]:
        q = _qid(_v(f, "partido"))
        p = out.setdefault(q, {"qid": q, "nombre": _v(f, "partidoEs") or _v(f, "partidoEn") or q, "alineaciones_en": [], "ideologias_en": [], "ideologias_es": []})
        for k, dest in (("alinEn", "alineaciones_en"), ("ideoEn", "ideologias_en")):
            x = _v(f, k)
            if x and x not in p[dest]:
                p[dest].append(x)
        es = _v(f, "ideoEs") or _v(f, "ideoEn")
        if es and es not in p["ideologias_es"]:
            p["ideologias_es"].append(es)
    return out


def partidos_de(jefes):
    return sorted({p for roles in jefes.values() for lista in roles.values() for j in lista for p in j["partidos"]})


def partido_vigente(persona, partidos=None):
    """De los partidos sin fecha de fin, el de afiliación más reciente; si empatan, el que tiene datos de orientación.
    (Hay personas con una afiliación vieja sin fecha de fin: se prefiere la que empezó después.)"""
    partidos = partidos or {}
    def clave(q):
        d = partidos.get(q, {})
        return (persona.get("inicio", {}).get(q, ""), bool(d.get("alineaciones_en")), bool(d.get("ideologias_en")))
    return max(persona["partidos"], key=clave) if persona["partidos"] else None


def elegir_gobierno(forma, roles, partidos=None):
    """(persona, rol, partido_qid) de quien encabeza el gobierno según la forma."""
    orden = ["gobierno", "estado"] if forma in ("parlamentaria", "monarquia_constitucional") else ["estado", "gobierno"]
    candidatos = [(j, r) for r in orden for j in roles.get(r, [])]
    for j, r in candidatos:
        if j["partidos"]:
            return j, r, partido_vigente(j, partidos)
    return (candidatos[0][0], candidatos[0][1], None) if candidatos else (None, None, None)


# ---------------------------------------------------------------- features
def features_gobierno(paises_fc, formas, jefes, partidos, fecha, instituciones=None):
    """Dos juegos de polígonos (forma de gobierno y orientación) con la misma ficha."""
    forma_fc, orient_fc = [], []
    for f in paises_fc["features"]:
        iso = f["properties"].get("iso3")
        info = formas.get(iso)
        if not info:
            continue
        forma = forma_principal(info["formas_en"])
        roles = jefes.get(iso, {})
        persona, rol, pq = elegir_gobierno(forma, roles, partidos)
        partido = partidos.get(pq) if pq else None
        if pq in INDEPENDIENTE:
            pq, partido = None, None
        forma, inferida = inferir_forma(forma, info["formas_en"], roles, partido)
        esp, origen = espectro_y_origen(partido, forma) if persona else ("sin_dato", "")
        jefe_e = roles.get("estado", [{}])[0] if roles.get("estado") else {}
        jefe_g = roles.get("gobierno", [{}])[0] if roles.get("gobierno") else {}
        props = {
            "p": iso, "n": f["properties"].get("nombre") or info["nombre"], "wd": info["qid"],
            "forma": forma, "forma_txt": NOMBRE_FORMA[forma], "forma_inferida": inferida, "origen_espectro": origen, "formas_wd": json.dumps(info["formas_es"], ensure_ascii=False),
            "federal": es_federal(info["formas_en"]), "espectro": esp, "espectro_txt": NOMBRE_ESPECTRO[esp],
            "jefe_estado": jefe_e.get("nombre", ""), "jefe_estado_wd": jefe_e.get("qid", ""),
            "jefe_gobierno": jefe_g.get("nombre", ""), "jefe_gobierno_wd": jefe_g.get("qid", ""),
            "gobierna": rol or "", "partido": partido["nombre"] if partido else "", "partido_wd": pq or "",
            "alineacion": json.dumps(partido["alineaciones_en"] if partido else [], ensure_ascii=False),
            "ideologias": json.dumps((partido or {}).get("ideologias_es", [])[:8], ensure_ascii=False),
            "corrientes": json.dumps(corrientes((partido or {}).get("ideologias_en", [])), ensure_ascii=False),
            "fecha": fecha, "z": 0,
            "instituciones": json.dumps((instituciones or {}).get(iso, {}), ensure_ascii=False),
        }
        forma_fc.append({"type": "Feature", "geometry": f["geometry"], "properties": {**props, "id": f"gobf:{iso}", "st": f"gobforma_{forma}", "x": NOMBRE_FORMA[forma]}})
        orient_fc.append({"type": "Feature", "geometry": f["geometry"], "properties": {**props, "id": f"gobo:{iso}", "st": f"gobor_{esp}",
                                                                                      "x": NOMBRE_ESPECTRO[esp] + (f" · {partido['nombre']}" if partido else "")}})
    return forma_fc, orient_fc
