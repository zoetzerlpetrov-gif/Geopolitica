import json, os, urllib.request, urllib.parse, subprocess
def curl(*a):
    print(subprocess.run(["curl", "-s", "-m", "30", *a], capture_output=True, text=True).stdout[:1500])
t = os.environ.get("GFW_TOKEN", "")
def gfw(ds, extra=""):
    q = urllib.parse.urlencode({"datasets[0]": ds, "start-date": "2026-10-01", "end-date": "2026-10-16", "limit": 2, "offset": 0})
    try:
        r = urllib.request.urlopen(urllib.request.Request(f"https://gateway.api.globalfishingwatch.org/v3/events?{q}", headers={"Authorization": f"Bearer {t}", "User-Agent": "Geopolitica-monitor/1.0"}), timeout=60)
        d = json.loads(r.read()); print("==", ds, "total", d.get("total"), json.dumps(d.get("entries", [])[:1])[:900])
    except Exception as e: print("==", ds, "ERR", e, getattr(e, "read", lambda: b"")()[:300])
for ds in ["public-global-loitering-events:latest", "public-global-port-visits-events:latest", "public-global-fishing-events:latest"]:
    gfw(ds)
import json as J
q = urllib.parse.urlencode({"datasets[0]": "public-global-encounters-events:latest", "start-date": "2026-10-01", "end-date": "2026-10-16", "limit": 1, "offset": 0})
ev = J.loads(urllib.request.urlopen(urllib.request.Request(f"https://gateway.api.globalfishingwatch.org/v3/events?{q}", headers={"Authorization": f"Bearer {t}", "User-Agent": "Geopolitica-monitor/1.0"}), timeout=60).read())["entries"][0]
VID = ev["vessel"]["id"]; print("== vessel", ev["vessel"])
try:
    r = urllib.request.urlopen(urllib.request.Request(f"https://gateway.api.globalfishingwatch.org/v3/vessels/{VID}?dataset=public-global-vessel-identity:latest", headers={"Authorization": f"Bearer {t}", "User-Agent": "Geopolitica-monitor/1.0"}), timeout=60)
    print("== vessel info", r.read()[:1500])
except Exception as e: print("== vessel ERR", e, getattr(e, "read", lambda: b"")()[:400])
try:
    body = json.dumps({"includes": ["FISHING", "GAP", "COVERAGE", "VESSEL-IDENTITY-IUU-VESSEL-LIST"], "startDate": "2026-01-01", "endDate": "2026-10-15",
                       "vessels": [{"datasetId": "public-global-vessel-identity:latest", "vesselId": VID}]}).encode()
    r = urllib.request.urlopen(urllib.request.Request("https://gateway.api.globalfishingwatch.org/v3/insights/vessels", data=body, headers={"Authorization": f"Bearer {t}", "Content-Type": "application/json", "User-Agent": "Geopolitica-monitor/1.0"}), timeout=60)
    print("== insights", r.read()[:800])
except Exception as e: print("== insights ERR", e, getattr(e, "read", lambda: b"")()[:400])
