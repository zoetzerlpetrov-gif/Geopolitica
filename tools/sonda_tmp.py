import json, os, urllib.request, urllib.parse, subprocess
def curl(*a):
    print(subprocess.run(["curl", "-s", "-m", "30", *a], capture_output=True, text=True).stdout[:1500])
print("== CORS Groq (preflight)")
curl("-i", "-X", "OPTIONS", "https://api.groq.com/openai/v1/chat/completions", "-H", "Origin: https://zoetzerlpetrov-gif.github.io",
     "-H", "Access-Control-Request-Method: POST", "-H", "Access-Control-Request-Headers: authorization,content-type")
print("== Groq POST sin llave (cabeceras)")
curl("-i", "-X", "POST", "https://api.groq.com/openai/v1/chat/completions", "-H", "Origin: https://zoetzerlpetrov-gif.github.io", "-H", "Content-Type: application/json", "-d", "{}")
k = os.environ.get("GROQ_API_KEY", "")
if k:
    r = urllib.request.urlopen(urllib.request.Request("https://api.groq.com/openai/v1/models", headers={"Authorization": f"Bearer {k}", "User-Agent": "x"}), timeout=30)
    d = json.loads(r.read())
    print("== modelos:", sorted((m["id"], m.get("context_window")) for m in d["data"] if m.get("active", True)))
t = os.environ.get("GFW_TOKEN", "")
def gfw(ds, extra=""):
    q = urllib.parse.urlencode({"datasets[0]": ds, "start-date": "2026-10-01", "end-date": "2026-10-16", "limit": 2, "offset": 0})
    try:
        r = urllib.request.urlopen(urllib.request.Request(f"https://gateway.api.globalfishingwatch.org/v3/events?{q}", headers={"Authorization": f"Bearer {t}"}), timeout=60)
        d = json.loads(r.read()); print("==", ds, "total", d.get("total"), json.dumps(d.get("entries", [])[:1])[:900])
    except Exception as e: print("==", ds, "ERR", e, getattr(e, "read", lambda: b"")()[:300])
for ds in ["public-global-loitering-events:latest", "public-global-port-visits-events:latest", "public-global-fishing-events:latest"]:
    gfw(ds)
try:
    body = json.dumps({"includes": ["FISHING", "GAP", "COVERAGE", "VESSEL-IDENTITY-IUU-VESSEL-LIST"], "startDate": "2026-01-01", "endDate": "2026-10-15",
                       "vessels": [{"datasetId": "public-global-vessel-identity:latest", "vesselId": "8c7304226-6c71-edbe-0b63-c246734b3c01"}]}).encode()
    r = urllib.request.urlopen(urllib.request.Request("https://gateway.api.globalfishingwatch.org/v3/insights/vessels", data=body, headers={"Authorization": f"Bearer {t}", "Content-Type": "application/json"}), timeout=60)
    print("== insights", r.read()[:800])
except Exception as e: print("== insights ERR", e, getattr(e, "read", lambda: b"")()[:400])
