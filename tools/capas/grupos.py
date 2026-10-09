"""Presencia documentada de grupos criminales y terroristas (Wikidata, CC0).

Complementa a la capa de UCDP (que solo ve violencia con muertos): mafias, cárteles, pandillas, clubes
de motociclistas fuera de la ley y organizaciones terroristas que Wikidata registra, con
  · sede (P159) o lugar de fundación (P740) con coordenadas → un punto «origen o sede»;
  · países donde opera (P2541, «área de operaciones») → un punto «presencia» en cada país.
Solo organizaciones vigentes (sin fecha de disolución, P576) y con artículo en 3 o más Wikipedias.
No se guardan personas (líderes, miembros): solo el nombre del grupo, su tipo y los países.
«Terrorista» es la clase que Wikidata asigna (normalmente por designación de algún gobierno o de la ONU);
las designaciones varían por país y la ficha lo dice.
"""
import json
import math
import re

CLASES = [  # (QID, subtipo)
    ("Q1260006", "cartel"),
    ("Q4335775", "mafia"),
    ("Q1788992", "mafia"),
    ("Q275186", "pandilla"),
    ("Q1849110", "pandilla"),
    ("Q17127659", "terrorismo"),
    ("Q17149090", "terrorismo"),
]
NOMBRE_TIPO = {"cartel": "Cártel de drogas", "mafia": "Mafia u organización criminal", "pandilla": "Pandilla o club de motociclistas fuera de la ley",
               "terrorismo": "Organización terrorista (según Wikidata)"}
PRIORIDAD = ["terrorismo", "cartel", "mafia", "pandilla"]

Q_GRUPOS = """
SELECT ?x ?xEs ?xEn ?n ?clase ?coord ?sedeIso ?areaIso WHERE {
  VALUES ?clase { %s }
  ?x wdt:P31/wdt:P279? ?clase ; wikibase:sitelinks ?n .
  FILTER(?n >= 3)
  FILTER NOT EXISTS { ?x wdt:P576 ?fin }
  FILTER NOT EXISTS { ?x wdt:P31 wd:Q6256 }
  OPTIONAL { ?x rdfs:label ?xEs FILTER(lang(?xEs) = "es") }
  OPTIONAL { ?x rdfs:label ?xEn FILTER(lang(?xEn) = "en") }
  OPTIONAL { ?x wdt:P159|wdt:P740 ?sede . ?sede wdt:P625 ?coord . OPTIONAL { ?sede wdt:P17/wdt:P298 ?sedeIso } }
  OPTIONAL { ?x wdt:P2541 ?area . ?area wdt:P298 ?areaIso }
}"""


def _v(f, k):
    x = f.get(k)
    return x["value"] if x else None


def coord(wkt):
    m = re.match(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)", wkt or "")
    return (round(float(m.group(1)), 4), round(float(m.group(2)), 4)) if m else None


def leer_grupos(res, tipo_de_clase):
    """Filas → {qid: {nombre, n, tipos, sede, sede_iso, paises}}."""
    out = {}
    for f in res["results"]["bindings"]:
        q = (_v(f, "x") or "").rsplit("/", 1)[-1]
        if not q:
            continue
        g = out.setdefault(q, {"qid": q, "nombre": _v(f, "xEs") or _v(f, "xEn") or q, "n": int(_v(f, "n") or 0), "tipos": set(),
                               "sede": None, "sede_iso": None, "paises": set()})
        g["tipos"].add(tipo_de_clase.get((_v(f, "clase") or "").rsplit("/", 1)[-1], "mafia"))
        c = coord(_v(f, "coord"))
        if c and not g["sede"]:
            g["sede"], g["sede_iso"] = c, _v(f, "sedeIso")
        if _v(f, "areaIso"):
            g["paises"].add(_v(f, "areaIso"))
    return out


def tipo_principal(tipos):
    return next((t for t in PRIORIDAD if t in tipos), "mafia")


def centroides(paises_fc):
    """ISO3 → punto representativo del país (centro de la caja del polígono más grande)."""
    out = {}
    for f in paises_fc["features"]:
        g = f["geometry"]
        polis = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        mayor = max(polis, key=lambda p: len(p[0]))
        xs, ys = [c[0] for c in mayor[0]], [c[1] for c in mayor[0]]
        out[f["properties"].get("iso3")] = (round((min(xs) + max(xs)) / 2, 3), round((min(ys) + max(ys)) / 2, 3))
    return out


def features_grupos(grupos, centro, nombre_pais, feat, punto):
    """Un punto por sede y uno por país de operación (desplazado un poco para que no se encimen en el centro)."""
    out = []
    por_pais = {}
    for g in sorted(grupos.values(), key=lambda g: -g["n"]):
        tipo = tipo_principal(g["tipos"])
        paises = sorted(g["paises"])
        resumen = f"{NOMBRE_TIPO[tipo]} · {g['n']} Wikipedias" + (f" · opera en: {', '.join(nombre_pais(p) for p in paises[:12])}" if paises else "")
        zoom = 2 if g["n"] >= 30 else 4 if g["n"] >= 10 else 6
        if g["sede"]:
            out.append(feat(punto(*g["sede"]), {"id": f"wd:{g['qid']}", "n": g["nombre"], "st": f"grupo_{tipo}", "p": g["sede_iso"] or "",
                                                 "x": "Origen o sede · " + resumen, "rol": "sede", "paises": json.dumps(paises)}, zoom))
        for iso in paises:
            if iso not in centro or iso == g["sede_iso"]:
                continue
            k = por_pais.get(iso, 0)
            por_pais[iso] = k + 1
            lon, lat = centro[iso]
            # Espiral pequeña alrededor del centro del país para que varios grupos no queden en el mismo punto.
            ang, r = k * 2.4, 0.35 * (k ** 0.5)
            p = (round(lon + r * math.cos(ang), 3), round(lat + r * math.sin(ang), 3))
            out.append(feat(punto(*p), {"id": f"wd:{g['qid']}:{iso}", "n": g["nombre"], "st": f"grupo_{tipo}", "p": iso,
                                        "x": f"Presencia en {nombre_pais(iso)} (ubicación aproximada: centro del país) · " + resumen,
                                        "rol": "presencia", "paises": json.dumps(paises)}, max(zoom, 3)))
    return out
