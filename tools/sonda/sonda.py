"""Sonda temporal: prueba el recolector de vulnerabilidades (se borra antes del PR)."""
import json, subprocess, sys
subprocess.run([sys.executable, "-u", "tools/vulnerabilidades.py", "--salida", "/tmp/v.json", "--forzar"], check=False)
try:
    d = json.load(open("/tmp/v.json"))
    print(d["fuentes"], "kev_total", d["kev_total"], "n", len(d["vulnerabilidades"]))
    for v in d["vulnerabilidades"][:8]:
        print(" ", json.dumps({k: v[k] for k in ("id", "producto", "cvss", "version", "epss", "publicado")}, ensure_ascii=False), "KEV" if v.get("kev") else "")
    for q in ("php", "gitlab", "litellm"):
        hits = [v for v in d["vulnerabilidades"] if q in (v["producto"] + " " + v["descripcion"]).lower()]
        print(q, len(hits), [(v["id"], v["cvss"]) for v in hits[:6]])
except Exception as e:
    print("ERROR", e)
