"""Sonda temporal: APIs de squawk de emergencia (se borra antes del PR)."""
import json, sys, urllib.request
sys.path.insert(0, "ingest")
import fuentes as F
for red, base in (("adsb.lol", "https://api.adsb.lol/v2/sqk/"), ("airplanes.live", "https://api.airplanes.live/v2/sqk/"), ("adsb.fi", "https://opendata.adsb.fi/api/v2/sqk/")):
    print(red, "robots:", F.permitido_por_robots(base + "7700"))
    for c in ("7700", "7600", "7500"):
        try:
            r = urllib.request.urlopen(urllib.request.Request(base + c, headers={"User-Agent": F.UA}), timeout=40)
            d = json.loads(r.read())
            ac = d.get("ac") or d.get("aircraft") or []
            print("  ", c, r.status, len(ac), [(a.get("flight", "").strip(), round(a.get("lat") or 0), round(a.get("lon") or 0)) for a in ac][:6])
        except Exception as e:
            print("  ", c, "ERROR", e)
        import time; time.sleep(1.5)
