import json, subprocess
r = subprocess.run(["python3", "tools/creadores/creadores.py"], capture_output=True, text=True, timeout=500)
print(r.stdout, r.stderr[-1500:])
d = json.load(open("vivos/creadores.geojson"))
print([(f["properties"]["pais"], f["properties"]["n"]) for f in d["features"][:15]])
x = [c for f in d["features"] for c in f["properties"]["creadores"] for k in c["cuentas"] if k["plataforma"] == "X"]
print("X", [(c["nombre"]) for c in x[:10]])
import os; print(os.path.getsize("vivos/creadores.geojson"))
