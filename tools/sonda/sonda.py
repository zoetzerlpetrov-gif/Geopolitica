"""Sonda temporal del Lote E (2): Congreso, gobernadores con partido, formato del DOF y del índice de leyes."""
import json, os, re, sys, urllib.parse, urllib.request
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F

def pedir(url, n=0):
    try:
        b = F.get(url, timeout=60)
        print(f"[OK] robots={F.permitido_por_robots(url)} {url[:140]} · {len(b)} B")
        if n: print("   ", b[:n])
        return b
    except Exception as e:
        print(f"[ERR] robots={F.permitido_por_robots(url)} {url[:140]} · {e}")

print("=== DOF sumario")
b = pedir("https://dof.gob.mx/sumario.xml")
if b:
    t = b.decode("latin-1")
    for it in re.findall(r"<item>(.*?)</item>", t, re.S)[:40]:
        print("   ", re.sub(r"\s+", " ", it)[:330])
print("=== LeyesBiblio")
b = pedir("https://www.diputados.gob.mx/LeyesBiblio/index.htm")
if b:
    t = b.decode("latin-1")
    i = t.find("Ley Aduanera")
    print(t[i-1500:i+2500])
    print("fechas:", len(re.findall(r"\d{2}-\d{2}-\d{4}", t)), "ultima ref:", len(re.findall(r"(?i)[uú]ltima reforma", t)))
print("=== Congreso")
for u in ["https://sitl.diputados.gob.mx/LXVI_leg/info_diputados.php", "http://sitl.diputados.gob.mx/LXVI_leg/info_diputados.php",
          "https://www.senado.gob.mx/66/senadores/por_grupo_parlamentario", "https://www.senado.gob.mx/66/"]:
    b = pedir(u)
    if b:
        t = re.sub(r"<[^>]+>", " ", b.decode("utf-8", "replace"))
        t = re.sub(r"\s+", " ", t)
        for pal in ["MORENA", "PAN", "PRI", "PVEM", "PT", "MC", "Total"]:
            i = t.find(pal)
            if i >= 0: print("   ", pal, "→", t[max(0, i-80):i+120])
print("=== Wikidata")
def sparql(q):
    req = urllib.request.Request("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"}), headers={"User-Agent": F.UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())["results"]["bindings"]
Q = {
 "gobernadores": """SELECT ?eLabel ?gLabel ?pLabel ?ini WHERE { ?e wdt:P31 wd:Q15149663 . ?e p:P6 ?s . ?s ps:P6 ?g . OPTIONAL { ?s pq:P580 ?ini } FILTER NOT EXISTS { ?s pq:P582 ?fin }
   OPTIONAL { ?g p:P102 ?ps . ?ps ps:P102 ?p . FILTER NOT EXISTS { ?ps pq:P582 ?f2 } } SERVICE wikibase:label { bd:serviceParam wikibase:language "es". } } ORDER BY ?eLabel""",
 "cargo_diputado": """SELECT ?c ?cLabel WHERE { ?c rdfs:label ?l . FILTER(?l IN ("diputado federal de México"@es, "miembro de la Cámara de Diputados de México"@es, "member of the Chamber of Deputies of Mexico"@en)) SERVICE wikibase:label { bd:serviceParam wikibase:language "es". } }""",
 "legislatura": """SELECT ?l ?lLabel WHERE { ?l rdfs:label ?x . FILTER(?x IN ("LXVI Legislatura del Congreso de la Unión de México"@es, "LXVI Legislature of the Mexican Congress"@en)) SERVICE wikibase:label { bd:serviceParam wikibase:language "es". } }""",
}
for k, q in Q.items():
    try:
        filas = sparql(q)
        print(k, len(filas))
        for f in filas[:45]:
            print("   ", {kk: v["value"][-70:] for kk, v in f.items()})
    except Exception as e:
        print(k, "ERR", e)
