"""Sonda temporal 4 (se borra antes del PR)."""
import json, re, subprocess, sys, urllib.request, collections
sys.path.insert(0, "ingest")
import fuentes as F
def get(url, h=None, t=60):
    r = urllib.request.Request(url, headers={"User-Agent": F.UA, **(h or {})})
    with urllib.request.urlopen(r, timeout=t) as x:
        return x.read()
d = json.loads(get("https://msi.nga.mil/api/publications/broadcast-warn?output=json&status=A"))
w = d["broadcast-warn"]; print("avisos", len(w), "claves", list(w[0].keys()))
print(collections.Counter(x.get("navArea") for x in w))
claves = ["PIRACY", "PIRATE", "ARMED ROBBERY", "HIJACK", "ATTACK", "MISSILE", "ROCKET", "GUNNERY", "LIVE FIRING", "MILITARY EXERCISE", "GPS", "GNSS", "JAMMING", "DERELICT", "ADRIFT", "SUSPICIOUS", "BOARDED", "MINE", "DRONE", "UAV", "SPACE DEBRIS", "ROCKET LAUNCHING"]
c = collections.Counter(k for x in w for k in claves if k in x.get("text", ""))
print(c)
for x in [x for x in w if any(k in x.get("text", "") for k in ("PIRACY", "ATTACK", "HIJACK", "GNSS", "BOARDED", "SUSPICIOUS"))][:6]:
    print("-----", {k: v for k, v in x.items() if k != "text"}); print(x["text"][:700])
b = get("https://www.ukmto.org/recent-incidents")
m = re.search(rb'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', b, re.S)
print("NEXT_DATA", bool(m))
if m:
    nd = json.loads(m.group(1)); s = json.dumps(nd)[:3000]; print(s)
print(set(re.findall(rb'https?://[A-Za-z0-9./_-]*(?:api|incident)[A-Za-z0-9./_?=&-]*', b))[:20] if False else set(re.findall(rb'https?://[A-Za-z0-9./_-]*(?:api|incident)[A-Za-z0-9./_?=&-]*', b)))
print(set(re.findall(rb'/_next/static/[A-Za-z0-9./_-]+\.js', b)))
import os; os.makedirs("vivos", exist_ok=True)
for s in ("tools/transporte/trenes.py", "tools/clima/perturbaciones.py", "tools/transporte/emergencias_aereas.py"):
    print("\n#####", s); print(subprocess.run([sys.executable, s], capture_output=True, text=True, timeout=200).stdout[-1500:])
t = json.load(open("vivos/trenes.geojson")); print(json.dumps(t["features"][:2], ensure_ascii=False)); print(collections.Counter(f["properties"]["categoria"] for f in t["features"]))
