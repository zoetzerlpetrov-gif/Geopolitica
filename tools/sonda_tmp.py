import json, os, urllib.request, urllib.parse
T = os.environ["GFW_TOKEN"]; B = "https://gateway.api.globalfishingwatch.org/v3"
H = {"Authorization": f"Bearer {T}", "User-Agent": "Geopolitica-monitor/1.0"}
def req(url, body=None):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
              headers={**H, **({"Content-Type": "application/json"} if body is not None else {})}), timeout=90)
        return json.loads(r.read())
    except Exception as e:
        return {"ERR": str(e), "body": getattr(e, "read", lambda: b"")()[:500].decode("utf8", "replace")}
def show(t, d, n=1200): print("==", t, json.dumps(d)[:n])
# 1. eventos con región (POST)
for rid in (8383, "8383"):
    d = req(f"{B}/events?offset=0&limit=3", {"datasets": ["public-global-fishing-events:latest"], "startDate": "2026-10-01", "endDate": "2026-10-15", "region": {"dataset": "public-eez-areas", "id": rid}})
    show(f"fishing MEX eez {rid!r}", {"total": d.get("total"), "e": [(x["vessel"].get("flag"), x["regions"].get("eez"), x["regions"].get("mpaNoTake")) for x in d.get("entries", [])]} if "entries" in d else d)
d = req(f"{B}/events?offset=0&limit=3", {"datasets": ["public-global-port-visits-events:latest"], "startDate": "2026-10-01", "endDate": "2026-10-15", "region": {"dataset": "public-eez-areas", "id": 8383}, "confidences": ["3", "4"], "vesselTypes": ["FISHING", "CARRIER"]})
show("port visits MEX", d, 2500)
d = req(f"{B}/events?offset=0&limit=2", {"datasets": ["public-global-loitering-events:latest"], "startDate": "2026-10-01", "endDate": "2026-10-15", "vesselTypes": ["CARRIER"]})
show("loitering carriers", d, 2500)
# 2. identidad en lote
ev = req(f"{B}/events?" + urllib.parse.urlencode({"datasets[0]": "public-global-encounters-events:latest", "start-date": "2026-10-05", "end-date": "2026-10-15", "limit": 3, "offset": 0}))
ids = [e["vessel"]["id"] for e in ev.get("entries", [])]
d = req(f"{B}/vessels?" + urllib.parse.urlencode([("datasets[0]", "public-global-vessel-identity:latest")] + [(f"ids[{i}]", v) for i, v in enumerate(ids)] + [("includes[0]", "OWNERSHIP"), ("includes[1]", "AUTHORIZATIONS")]))
show("vessels batch", {"total": d.get("total"), "keys": list(d.keys()), "e0": d.get("entries", [{}])[0] if d.get("entries") else d}, 3000)
# insights con 2 barcos
d = req(f"{B}/insights/vessels", {"includes": ["FISHING", "GAP", "VESSEL-IDENTITY-IUU-VESSEL-LIST"], "startDate": "2025-10-15", "endDate": "2026-10-15",
        "vessels": [{"datasetId": "public-global-vessel-identity:latest", "vesselId": v} for v in ids[:2]]})
show("insights 2", d, 1500)
# 3. radar SAR en la ZEE de México
for q in ["spatial-resolution=LOW&temporal-resolution=ENTIRE&datasets[0]=public-global-sar-presence:latest&date-range=2026-09-15,2026-10-15&format=JSON&filters[0]=matched='false'",
          "spatial-resolution=LOW&temporal-resolution=ENTIRE&datasets[0]=public-global-sar-presence:latest&date-range=2026-09-15,2026-10-15&format=JSON"]:
    d = req(f"{B}/4wings/report?{q}", {"region": {"dataset": "public-eez-areas", "id": 8383}})
    show("sar " + q[-30:], d if "ERR" in d else {"keys": list(d.keys()), "n": len((d.get("entries") or [{}])[0].get(list((d.get("entries") or [{}])[0].keys() or ["x"])[0], []) if d.get("entries") else 0), "muestra": json.dumps(d)[:800]}, 1500)
