"""Lugares religiosos relevantes: catedrales, basílicas, mezquitas, templos, sinagogas, santuarios (Wikidata, CC0).

«Relevante» se mide con dos datos públicos de Wikidata:
  · número de Wikipedias que tienen artículo del lugar (sitelinks): es la medida de notoriedad que usa
    la propia Wikidata; una parroquia de barrio casi nunca pasa de 1 o 2.
  · declaratoria de Patrimonio Mundial de la UNESCO (P1435 = Q9259).
Niveles: muy alta (Patrimonio Mundial o ≥ 40 Wikipedias, visible desde el zoom 1), alta (≥ 15, zoom 3),
media (≥ 4, o ≥ 8 para iglesias, zoom 6). Las iglesias y templos de barrio (importancia baja) existen en
OpenStreetMap, pero son cientos de miles sin una medida de importancia; no se incluyen.

Se consulta una clase por vez (consultas cortas: el servicio corta a los 60 s).
"""
import re

# (QID de la clase, nombre en español, religión por omisión, mínimo de sitelinks)
CLASES = [
    ("Q2977", "Catedral", "cristianismo", 4),
    ("Q163687", "Basílica", "cristianismo", 4),
    ("Q120560", "Basílica menor", "cristianismo", 4),
    ("Q16970", "Iglesia", "cristianismo", 8),
    ("Q160742", "Abadía", "cristianismo", 4),
    ("Q44613", "Monasterio", None, 4),
    ("Q32815", "Mezquita", "islam", 4),
    ("Q34627", "Sinagoga", "judaismo", 4),
    ("Q842402", "Templo hindú", "hinduismo", 4),
    ("Q5393308", "Templo budista", "budismo", 4),
    ("Q199451", "Pagoda", "budismo", 4),
    ("Q845945", "Santuario sintoísta", "sintoismo", 4),
    ("Q1068842", "Gurdwara", "sij", 4),
    ("Q44539", "Templo", None, 4),
]

Q_CLASE = """
SELECT ?x ?xEs ?xEn ?coord ?n ?relEn ?relEs ?iso ?patr WHERE {
  ?x wdt:P31 wd:%s ; wikibase:sitelinks ?n ; wdt:P625 ?coord .
  FILTER(?n >= %d)
  OPTIONAL { ?x rdfs:label ?xEs FILTER(lang(?xEs) = "es") }
  OPTIONAL { ?x rdfs:label ?xEn FILTER(lang(?xEn) = "en") }
  OPTIONAL { ?x wdt:P140 ?rel . OPTIONAL { ?rel rdfs:label ?relEn FILTER(lang(?relEn) = "en") }
             OPTIONAL { ?rel rdfs:label ?relEs FILTER(lang(?relEs) = "es") } }
  OPTIONAL { ?x wdt:P17 ?pais . ?pais wdt:P298 ?iso }
  OPTIONAL { ?x wdt:P1435 wd:Q9259 . BIND(true AS ?patr) }
}"""

RELIGIONES = [  # (id, patrón sobre la etiqueta en inglés de P140)
    ("islam", r"islam|muslim|sunni|shia|sufi"),
    ("judaismo", r"juda|jewish"),
    ("hinduismo", r"hindu|vaishnav|shaiv|shakt"),
    ("budismo", r"buddh|zen|theravada|mahayana|vajrayana"),
    ("sintoismo", r"shinto"),
    ("sij", r"sikh"),
    ("cristianismo", r"christ|catholic|orthodox|protestant|anglican|lutheran|calvin|baptist|methodist|evangel|coptic|church of"),
]
NOMBRE_RELIGION = {"cristianismo": "Cristianismo", "islam": "Islam", "judaismo": "Judaísmo", "hinduismo": "Hinduismo", "budismo": "Budismo",
                   "sintoismo": "Sintoísmo", "sij": "Sijismo", "otras": "Otras religiones"}
NIVELES = [("muy_alta", "Importancia muy alta", 1), ("alta", "Importancia alta", 3), ("media", "Importancia media", 6)]


def religion_de(etiquetas_en, por_omision):
    t = " | ".join(e for e in etiquetas_en if e).lower()
    for rid, rx in RELIGIONES:
        if re.search(rx, t):
            return rid
    return por_omision or "otras"


def nivel_de(sitelinks, patrimonio):
    if patrimonio or sitelinks >= 40:
        return "muy_alta"
    if sitelinks >= 15:
        return "alta"
    return "media"


def _v(f, k):
    x = f.get(k)
    return x["value"] if x else None


def coord(wkt):
    m = re.match(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)", wkt or "")
    return (round(float(m.group(1)), 5), round(float(m.group(2)), 5)) if m else None


def leer_clase(res, clase):
    """Filas de una consulta → {qid: registro}; varias filas del mismo lugar se unen."""
    qid_clase, nombre_clase, rel_omision, _ = clase
    out = {}
    for f in res["results"]["bindings"]:
        q = (_v(f, "x") or "").rsplit("/", 1)[-1]
        c = coord(_v(f, "coord"))
        if not q or not c:
            continue
        r = out.setdefault(q, {"qid": q, "nombre": _v(f, "xEs") or _v(f, "xEn") or q, "lon": c[0], "lat": c[1], "n": int(_v(f, "n") or 0),
                               "clase": nombre_clase, "rel_en": [], "rel_es": [], "iso": _v(f, "iso") or "", "patrimonio": False, "rel_omision": rel_omision})
        for k, dest in (("relEn", "rel_en"), ("relEs", "rel_es")):
            x = _v(f, k)
            if x and x not in r[dest]:
                r[dest].append(x)
        if _v(f, "patr"):
            r["patrimonio"] = True
    return out


def features_lugares(registros, feat, punto):
    """Registros (de todas las clases, sin duplicar) → features con subtipo por religión y zoom por importancia."""
    out = []
    zoom = {n[0]: n[2] for n in NIVELES}
    nombre_nivel = {n[0]: n[1] for n in NIVELES}
    for r in sorted(registros.values(), key=lambda r: -r["n"]):
        rel = religion_de(r["rel_en"], r["rel_omision"])
        niv = nivel_de(r["n"], r["patrimonio"])
        detalle = " · ".join(x for x in [r["clase"], ", ".join(r["rel_es"][:2]), "Patrimonio Mundial" if r["patrimonio"] else "",
                                         f"{nombre_nivel[niv].lower()} ({r['n']} Wikipedias)"] if x)
        out.append(feat(punto(r["lon"], r["lat"]), {"id": f"wd:{r['qid']}", "n": r["nombre"], "st": f"culto_{rel}", "p": r["iso"], "x": detalle,
                                                    "nivel": niv}, zoom[niv]))
    return out
