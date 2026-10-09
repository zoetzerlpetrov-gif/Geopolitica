import sys, json
sys.path.insert(0, "tools/clima"); sys.path.insert(0, "ingest")
import meteoalarm as M, fuentes as F
from collections import Counter
reg = json.load(open("config/meteoalarm_regiones.json"))["regiones"]
for pais in ["czechia", "poland", "austria", "israel", "ukraine", "slovenia", "estonia", "sweden", "norway", "ireland", "latvia", "germany", "croatia"]:
    av = M.leer_feed(F.get(M.FEED.format(pais=pais), timeout=40), pais)
    sin = [a for a in av if not any(c in reg for c in a["codigos"])]
    print(pais, len(av), "sin:", len(sin), Counter(a["esquema"] for a in sin), [(a["codigos"][:3], a["region"]) for a in sin[:4]])
    print("   ejemplos en config:", [(k, v["n"]) for k, v in reg.items() if k.startswith(sin[0]["codigos"][0][:2])][:4] if sin and sin[0]["codigos"] else "")
d = json.loads(F.get("https://feeds.meteoalarm.org/api/v1/warnings/feeds-norway", timeout=60))
a = d["warnings"][0]["alert"]["info"][0]["area"][0]; print({k: (str(v)[:200]) for k, v in a.items()})
