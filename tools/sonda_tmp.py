"""Sonda temporal: ingesta completa con los medios mexicanos, en una carpeta temporal (no publica nada)."""
import collections, json, os, subprocess, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ingest"))
os.makedirs("/tmp/x", exist_ok=True)
subprocess.run("git fetch -q --depth 1 origin datos-eventos && git archive FETCH_HEAD eventos | tar -x -C /tmp/x", shell=True)
import run as R
R.main(["--salida", "/tmp/x/eventos"])
d = json.load(open("/tmp/x/eventos/events.json")); ev = d["eventos"]
log = json.load(open("/tmp/x/eventos/run-log.json"))
print("TAMAÑO events.json:", os.path.getsize("/tmp/x/eventos/events.json"), "eventos", len(ev))
print("GDELT:", sum(e["fuente"].startswith("GDELT") for e in ev), "· MEX:", sum(e["pais_iso3"] == "MEX" for e in ev))
print("descartados:", log["descartados"])
mx = {f["nombre"] for f in json.load(open("config/fuentes.json"))["rss"] if f.get("pais_defecto") == "MEX"}
de_mx = [e for e in ev if e["fuente"] in mx]
print("de medios mexicanos:", len(de_mx), collections.Counter(e["fuente"] for e in de_mx).most_common())
print("áreas:", collections.Counter(e["area_principal"] for e in de_mx).most_common())
for e in de_mx[:40]:
    print(f"  {e['severidad']} {e['area_principal'][:10]:10} {e['pais_iso3']} | {e['titulo'][:95]} | {','.join(e['subtemas'][:3])}")
print("SIN CLASIFICAR (ejemplos):")
for x in log["ejemplos_sin_clasificar"]: print("  ", x["fuente"], "|", x["titulo"][:100])
for f in log["fuentes"]:
    if f["nombre"] in mx: print("FUENTE", f["nombre"], f["estado"], f["eventos"], f["error"] or "")
