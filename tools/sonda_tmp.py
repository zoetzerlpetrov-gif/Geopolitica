import sys, json
sys.path.insert(0, "tools/capas")
import gobiernos as G, construir as C
r = C._sparql(G.Q_INSTITUCIONES); d = G.leer_instituciones(r)
print("instituciones", len(d), {k: d.get(k) for k in ["MEX", "USA", "ESP", "BRA", "DEU", "JPN"]})
import json, sys, time
from collections import Counter
sys.path.insert(0, "tools/capas")
import construir as C
for fid in ["fiscal_ue", "recaudacion", "tasas_bc", "nodos_bitcoin"]:
    t = time.time()
    try:
        fs = C.FAMILIAS[fid]()
        print(fid, round(time.time() - t, 1), "s", len(fs), Counter(f["properties"]["st"] for f in fs))
        for f in fs[:3]: print("   ", f["properties"]["n"], "|", f["properties"]["x"])
        if fid == "tasas_bc":
            for iso in ["MEX", "USA", "BRA", "DEU", "TUR", "ARG", "JPN", "GBR"]:
                print("   ", iso, next((f["properties"]["x"] for f in fs if f["properties"]["p"] == iso), "—"))
        if fid == "nodos_bitcoin":
            for f in sorted(fs, key=lambda f: -int(f["properties"]["x"].split()[0].replace(",", "")))[:8]: print("   ", f["properties"]["n"], f["properties"]["x"])
    except Exception as e:
        import traceback; traceback.print_exc()
import urllib.request, re
UA = {"User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"}
for u in ["https://ll.thespacedevs.com/robots.txt", "https://thespacedevs.com/llapi", "https://thespacedevs.com/terms", "https://thespacedevs.com/tos"]:
    try:
        t = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40).read().decode("utf-8", "replace")
        t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S); t = re.sub(r"<[^>]+>", " ", t); t = re.sub(r"\s+", " ", t)
        i = max(0, t.lower().find("licen") - 600) if "licen" in t.lower() else 0
        print("-----", u, len(t)); print(t[-700:] if "robots" in u else t[i:i + 2500])
    except Exception as e:
        print("-----", u, e)
