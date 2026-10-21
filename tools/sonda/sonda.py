"""Sonda temporal del Lote F (3): consultas reales de minas y campos con operador (se borra antes del PR)."""
import collections, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "capas"))
import construir as C
import sitios as S
for fid in ("recursos_minas", "petroleo_gas"):
    t0 = time.time()
    fs = C._sitios_wikidata(fid, con_operador=True)
    p = [f["properties"] for f in fs]
    print(f"== {fid}: {len(p)} objetos en {time.time()-t0:.0f} s; con op {sum('op' in x for x in p)}; con país {sum('o' in x for x in p)}")
    print("   nac:", collections.Counter(x.get("nac", "") for x in p))
    print("   países de operadores:", collections.Counter(x.get("o") for x in p if x.get("o")).most_common(15))
    print("   por zoom:", collections.Counter(f["properties"]["z"] for f in fs)); import json; print("   MB:", round(len(json.dumps(fs))/1e6, 1))
    for x in [x for x in p if x.get("p") == "MEX"][:5]:
        print("   MX", x["n"], "|", x.get("x", "")[:80], "|", x.get("op"), x.get("o"), x.get("nac"))
    sin = collections.Counter(x["op"] for x in p if "op" in x and "o" not in x).most_common(25)
    print("   operadores sin país:", sin)
