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
d = req(f"{B}/datasets/public-eez-areas/context-layers")
mex = [x for x in (d if isinstance(d, list) else d.get("entries", d.get("ERR") and [] or [])) if "MEX" in json.dumps(x) or "Mexic" in json.dumps(x)]
show("eez MEX", mex, 1500)
if not mex: show("eez raw", d, 600)
mid = [x for x in mex if "Mexican Exclusive" in json.dumps(x) or x.get("iso3") == "MEX"]
MID = (mid or mex or [{"id": 0}])[0].get("id")
d = req(f"{B}/datasets/public-mpa-no-take-areas/context-layers") if False else None
r = req(f"{B}/events?offset=0&limit=3", {"datasets": ["public-global-fishing-events:latest"], "startDate": "2026-10-01", "endDate": "2026-10-15", "region": {"dataset": "public-eez-areas", "id": MID}})
show(f"fishing MEX {MID}", {"total": r.get("total"), "e": [(x["vessel"].get("flag"), x["vessel"].get("name"), x["regions"].get("mpaNoTake"), x.get("fishing")) for x in r.get("entries", [])]} if "entries" in r else r, 2000)
r = req(f"{B}/events?offset=0&limit=2", {"datasets": ["public-global-port-visits-events:latest"], "startDate": "2026-10-01", "endDate": "2026-10-15", "region": {"dataset": "public-eez-areas", "id": MID}, "confidences": ["3", "4"]})
show("ports MEX", {"total": r.get("total"), "e": r.get("entries")} if "entries" in r else r, 2500)
ev = req(f"{B}/events?" + urllib.parse.urlencode({"datasets[0]": "public-global-encounters-events:latest", "start-date": "2026-10-05", "end-date": "2026-10-15", "limit": 3, "offset": 0}))
ids = [e["vessel"]["id"] for e in ev.get("entries", [])]
d = req(f"{B}/vessels?" + urllib.parse.urlencode([("datasets[0]", "public-global-vessel-identity:latest")] + [(f"ids[{i}]", v) for i, v in enumerate(ids)]))
show("vessels batch", {"total": d.get("total"), "n": len(d.get("entries") or []), "e0": (d.get("entries") or [d])[0]}, 3000)
for q in ["spatial-resolution=LOW&temporal-resolution=ENTIRE&datasets[0]=public-global-sar-presence:latest&date-range=2026-09-15,2026-10-15&format=JSON&filters[0]=matched='false'",
          "spatial-resolution=LOW&temporal-resolution=ENTIRE&datasets[0]=public-global-sar-presence:latest&date-range=2026-09-15,2026-10-15&format=JSON"]:
    d = req(f"{B}/4wings/report?{q}", {"region": {"dataset": "public-eez-areas", "id": MID}})
    show("sar", d, 1500)
