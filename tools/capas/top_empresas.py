"""Top 10 de empresas por país (Wikidata, CC0).

El orden es por notoriedad (número de Wikipedias con artículo de la empresa), no por tamaño: Wikidata no tiene las
cifras de todas y vienen en monedas y años distintos, así que no se pueden comparar con justicia. Para cada empresa
del top se piden aparte sus empleados (P1128), ingresos (P2139, con moneda y año), capitalización (P2226), bolsa donde
cotiza (P414) y sitio web (P856); se muestran tal como están en Wikidata, con su año.
"""
import re

Q_DETALLE = """
SELECT ?x ?emp ?ing ?ingMon ?ingAnio ?cap ?capMon ?bolsaEs ?bolsaEn ?web WHERE {
  VALUES ?x { %s }
  OPTIONAL { ?x wdt:P1128 ?emp }
  OPTIONAL { ?x p:P2139 ?s . ?s psv:P2139 [wikibase:quantityAmount ?ing; wikibase:quantityUnit ?u] .
             OPTIONAL { ?u wdt:P498 ?ingMon } OPTIONAL { ?s pq:P585 ?ingT } BIND(YEAR(?ingT) AS ?ingAnio) }
  OPTIONAL { ?x p:P2226/psv:P2226 [wikibase:quantityAmount ?cap; wikibase:quantityUnit ?cu] . OPTIONAL { ?cu wdt:P498 ?capMon } }
  OPTIONAL { ?x wdt:P414 ?b . OPTIONAL { ?b rdfs:label ?bolsaEs FILTER(lang(?bolsaEs) = "es") } OPTIONAL { ?b rdfs:label ?bolsaEn FILTER(lang(?bolsaEn) = "en") } }
  OPTIONAL { ?x wdt:P856 ?web }
}"""


def top_por_pais(registros, n=10):
    """registros {qid: {iso, n, ...}} → {iso: [registro ordenado por Wikipedias]} (solo con país conocido)."""
    por = {}
    for r in registros.values():
        if r.get("iso"):
            por.setdefault(r["iso"], []).append(r)
    return {iso: sorted(lista, key=lambda r: (-r["n"], r["nombre"]))[:n] for iso, lista in por.items()}


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def leer_detalle(res, detalle):
    """Filas SPARQL → detalle {qid: {...}}; de varias cifras se queda la más reciente (ingresos) o la mayor (empleados)."""
    for f in res["results"]["bindings"]:
        q = f["x"]["value"].rsplit("/", 1)[-1]
        d = detalle.setdefault(q, {"empleados": None, "ingresos": None, "ingresos_moneda": "", "ingresos_anio": 0, "capitalizacion": None,
                                   "cap_moneda": "", "bolsas": [], "web": ""})
        emp = _num(f.get("emp", {}).get("value"))
        if emp and (d["empleados"] is None or emp > d["empleados"]):
            d["empleados"] = emp
        ing = _num(f.get("ing", {}).get("value"))
        anio = int(_num(f.get("ingAnio", {}).get("value")) or 0)
        if ing and anio >= d["ingresos_anio"]:
            d.update(ingresos=ing, ingresos_moneda=f.get("ingMon", {}).get("value", ""), ingresos_anio=anio)
        cap = _num(f.get("cap", {}).get("value"))
        if cap and (d["capitalizacion"] is None or cap > d["capitalizacion"]):
            d.update(capitalizacion=cap, cap_moneda=f.get("capMon", {}).get("value", ""))
        bolsa = f.get("bolsaEs", {}).get("value") or f.get("bolsaEn", {}).get("value")
        if bolsa and bolsa not in d["bolsas"]:
            d["bolsas"].append(bolsa)
        if f.get("web") and not d["web"]:
            d["web"] = f["web"]["value"]
    return detalle


def cifra(v, moneda=""):
    """1234567890 → «1.2 mil millones USD» (texto corto en español)."""
    if v is None:
        return ""
    for div, txt in ((1e12, "billones"), (1e9, "mil millones"), (1e6, "millones")):
        if abs(v) >= div:
            return f"{v / div:.1f} {txt}{' ' + moneda if moneda else ''}"
    return f"{v:,.0f}{' ' + moneda if moneda else ''}"


def features(top, detalle, feat, punto):
    out = []
    for iso, lista in top.items():
        for i, r in enumerate(lista, 1):
            d = detalle.get(r["qid"], {})
            cotiza = bool(d.get("bolsas"))
            partes = [f"#{i} de {iso} por notoriedad ({r['n']} Wikipedias)", f"sede en {r['sede']}" if r.get("sede") else "",
                      ", ".join(r.get("industrias", [])[:2]),
                      f"{int(d['empleados']):,} empleados" if d.get("empleados") else "",
                      f"ingresos {cifra(d.get('ingresos'), d.get('ingresos_moneda'))}" + (f" ({d['ingresos_anio']})" if d.get("ingresos_anio") else "") if d.get("ingresos") else "",
                      f"capitalización {cifra(d.get('capitalizacion'), d.get('cap_moneda'))}" if d.get("capitalizacion") else "",
                      f"cotiza en {', '.join(d['bolsas'][:2])}" if cotiza else "no cotiza en bolsa (según Wikidata)"]
            out.append(feat(punto(r["lon"], r["lat"]), {"id": f"top:{r['qid']}", "n": f"{i}. {r['nombre']}", "st": "top_cotiza" if cotiza else "top_privada",
                                                        "p": iso, "rank": i, "web": d.get("web", ""),
                                                        "x": re.sub(r"\s+", " ", " · ".join(p for p in partes if p))}, 1 if i <= 3 else 3))
    return out
