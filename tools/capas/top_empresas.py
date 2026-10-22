"""Top 10 de empresas por país (Wikidata, CC0).

Se toman 30 candidatas por país (las de más Wikipedias), se quitan bancos centrales, bolsas de valores y dependencias
de gobierno, y se ordenan por empleados (P1128), la cifra de tamaño que se puede comparar entre países; las que no la
tienen quedan después, por notoriedad. Ingresos y capitalización vienen en monedas y años distintos: se muestran tal
como están en Wikidata, con su año, pero no se usan para ordenar. El país es el de la sede (coordenada), no la etiqueta.
Las empresas de una misma ciudad comparten coordenada: se separan en un círculo pequeño y la ficha nombra a las demás.
"""
import math
import re

# No son empresas comerciales aunque Wikidata las registre como organización o empresa.
NO_EMPRESA = re.compile(r"\bbanco central\b|central bank|banco de méxico|banque de france|bundesbank|federal reserve|reserve bank|"
                        r"\bbolsa\b|stock exchange|börse|\bbourse\b|ministerio|ministry|secretar[ií]a|government|gobierno", re.I)

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


def es_empresa(r):
    return not NO_EMPRESA.search(r.get("nombre", "")) and not any(NO_EMPRESA.search(i) for i in r.get("industrias", []))


def top_por_pais(registros, n=10, pais_de=None):
    """registros {qid: {iso, n, ...}} → {iso: [n candidatas por Wikipedias]}. «pais_de(lon, lat)» corrige el país con la
    ubicación de la sede (p. ej. una filial registrada con el país de la matriz)."""
    por = {}
    for r in registros.values():
        iso = (pais_de(r["lon"], r["lat"]) if pais_de else "") or r.get("iso")
        if iso and es_empresa(r):
            por.setdefault(iso, []).append({**r, "iso": iso})
    return {iso: sorted(lista, key=lambda r: (-r["n"], r["nombre"]))[:n] for iso, lista in por.items()}


def ordenar(candidatas, detalle, n=10):
    """Por empleados (mayor primero); las que no tienen el dato, después y por notoriedad."""
    def clave(r):
        e = detalle.get(r["qid"], {}).get("empleados")
        return (e is None, -(e or 0), -r["n"])
    return {iso: sorted(lista, key=clave)[:n] for iso, lista in candidatas.items()}


def separar(puntos, radio=0.02):
    """[(lon, lat)] con repetidos → mismas posiciones, pero las repetidas repartidas en un círculo (~2 km por anillo)."""
    grupos = {}
    for i, c in enumerate(puntos):
        grupos.setdefault((round(c[0], 3), round(c[1], 3)), []).append(i)
    out = list(puntos)
    for idx in grupos.values():
        if len(idx) < 2:
            continue
        for k, i in enumerate(idx):
            anillo, pos = 1 + k // 8, k % 8
            ang = 2 * math.pi * pos / min(8, len(idx) - (anillo - 1) * 8)
            lon, lat = puntos[i]
            out[i] = (round(lon + radio * anillo * math.cos(ang) / max(0.2, math.cos(math.radians(lat))), 5), round(lat + radio * anillo * math.sin(ang), 5))
    return out


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
    filas = [(iso, i, r) for iso, lista in top.items() for i, r in enumerate(lista, 1)]
    pos = separar([(r["lon"], r["lat"]) for _, _, r in filas])
    misma = {}
    for (iso, i, r) in filas:
        misma.setdefault((iso, round(r["lon"], 3), round(r["lat"], 3)), []).append(f"{i}. {r['nombre']}")
    for (iso, i, r), (lon, lat) in zip(filas, pos):
        d = detalle.get(r["qid"], {})
        cotiza = bool(d.get("bolsas"))
        vecinas = [x for x in misma[(iso, round(r["lon"], 3), round(r["lat"], 3))] if not x.startswith(f"{i}. ")]
        partes = [f"#{i} de {iso}" + (" por empleados" if d.get("empleados") else " por notoriedad") + f" ({r['n']} Wikipedias)", f"sede en {r['sede']}" if r.get("sede") else "",
                  ", ".join(r.get("industrias", [])[:2]),
                  f"{int(d['empleados']):,} empleados" if d.get("empleados") else "",
                  f"ingresos {cifra(d.get('ingresos'), d.get('ingresos_moneda'))}" + (f" ({d['ingresos_anio']})" if d.get("ingresos_anio") else "") if d.get("ingresos") else "",
                  f"capitalización {cifra(d.get('capitalizacion'), d.get('cap_moneda'))}" if d.get("capitalizacion") else "",
                  f"cotiza en {', '.join(d['bolsas'][:2])}" if cotiza else "no cotiza en bolsa (según Wikidata)",
                  f"en la misma ciudad sede: {', '.join(vecinas)}" if vecinas else ""]
        out.append(feat(punto(lon, lat), {"id": f"top:{r['qid']}", "n": f"{i}. {r['nombre']}", "st": "top_cotiza" if cotiza else "top_privada",
                                                    "p": iso, "rank": i, "web": d.get("web", ""),
                                                    "x": re.sub(r"\s+", " ", " · ".join(p for p in partes if p))}, 1 if i <= 3 else 3))
    return out
