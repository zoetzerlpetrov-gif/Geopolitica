"""Sonda temporal del Lote E (se borra antes del PR): contratos, DOF, Congreso, gobernadores y municipios."""
import json, os, sys, urllib.parse, urllib.request, urllib.error
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F

def pedir(url, data=None, headers=None, n=500):
    rob = F.permitido_por_robots(url)
    req = urllib.request.Request(url, data=data, headers={"User-Agent": F.UA, "Accept": "application/json, text/html, */*", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            b = r.read()
            print(f"[{r.status}] robots={rob} {url[:150]} · {r.headers.get('Content-Type')} · {len(b)} B\n    {b[:n]!r}")
            return b
    except urllib.error.HTTPError as e:
        print(f"[{e.code}] robots={rob} {url[:150]} · {e.read()[:200]!r}")
    except Exception as e:
        print(f"[ERR] robots={rob} {url[:150]} · {e}")

print("=== Contratos")
for u in ["https://www.datos.gob.mx/api/3/action/package_search?q=compranet&rows=5",
          "https://www.datos.gob.mx/api/3/action/package_search?q=contrataciones%20abiertas&rows=5",
          "https://api.datos.gob.mx/v2/contratacionesabiertas?pageSize=1",
          "https://upcp-compranet.buengobierno.gob.mx/",
          "https://comprasmx.buengobierno.gob.mx/",
          "https://compranet.hacienda.gob.mx/esop/guest/go/public/opportunity/current"]:
    pedir(u)
print("=== DOF")
for u in ["https://www.dof.gob.mx/sumario.xml", "https://dof.gob.mx/sumario.xml",
          "https://sidof.segob.gob.mx/dof/sidof/notas/obtenerNotasPorFecha/20-10-2026",
          "https://sidof.segob.gob.mx/dof/sidof/diarioOficial/porFecha/20-10-2026",
          "https://www.dof.gob.mx/index.php?year=2026&month=10&day=20",
          "https://www.diputados.gob.mx/LeyesBiblio/ref/cpeum.htm",
          "https://www.diputados.gob.mx/LeyesBiblio/index.htm"]:
    pedir(u, n=700)
print("=== Wikipedia (legislatura)")
for t in ["LXVI_Legislatura_del_Congreso_de_la_Unión_de_México"]:
    b = pedir("https://es.wikipedia.org/w/api.php?" + urllib.parse.urlencode({"action": "parse", "page": t, "prop": "wikitext", "format": "json", "section": 0}), n=200)
    if b:
        wt = json.loads(b).get("parse", {}).get("wikitext", {}).get("*", "")
        print(wt[:3000])
print("=== Wikidata")
Q = {"gobernadores": """SELECT ?e ?eL ?g ?gL ?pL WHERE { ?e wdt:P31 wd:Q15149663 . ?e p:P6 ?s . ?s ps:P6 ?g . FILTER NOT EXISTS { ?s pq:P582 ?fin }
  OPTIONAL { ?g wdt:P102 ?p } SERVICE wikibase:label { bd:serviceParam wikibase:language "es". } }""",
     "tipo_municipio": """SELECT ?t ?tL (COUNT(?m) AS ?n) WHERE { ?m wdt:P17 wd:Q96 ; wdt:P31 ?t . ?t rdfs:label ?tL FILTER(lang(?tL)="es" && CONTAINS(LCASE(?tL), "municipio")) } GROUP BY ?t ?tL ORDER BY DESC(?n) LIMIT 5""",
}
for k, q in Q.items():
    b = pedir("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"}), n=100)
    if b:
        filas = json.loads(b)["results"]["bindings"]
        print(k, len(filas))
        for f in filas[:40]:
            print("   ", {kk: v["value"][-60:] for kk, v in f.items()})
