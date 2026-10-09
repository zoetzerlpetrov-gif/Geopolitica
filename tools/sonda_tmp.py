import json, os, subprocess, sys, urllib.request, re
r = subprocess.run([sys.executable, "tools/red/red.py"], capture_output=True, text=True, timeout=900)
print(r.stdout[-3000:], r.stderr[-3000:])
for n in ["red_cortes", "red_c2", "red_ics"]:
    try:
        d = json.load(open(f"vivos/{n}.geojson"))
    except Exception as e:
        print(n, e); continue
    print("=====", n, {k: v for k, v in d.items() if k != "features"})
    for f in d["features"][:6]:
        print(json.dumps(f["properties"], ensure_ascii=False)[:700])
UA = {"User-Agent": "geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
d = json.loads(get("https://bitnodes.io/api/v1/snapshots/latest/?field=coordinates"))
print({k: v for k, v in d.items() if k not in ("coordinates", "metadata")}); c = d.get("coordinates"); print(type(c), str(c)[:400], len(c or []))
for u in ["https://meteoalarm.org/en/live/page/terms-and-conditions", "https://www.meteoalarm.org/en/live/page/redistribution-hub", "https://meteoalarm.org/en/live/page/legal-notice"]:
    try:
        t = get(u).decode("utf-8", "replace"); t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S); t = re.sub(r"<[^>]+>", " ", t); t = re.sub(r"\s+", " ", t)
        print("-----", u, len(t)); i = max(0, t.lower().find("redistribut") - 500); print(t[i:i + 4000])
    except Exception as e:
        print(u, e)
