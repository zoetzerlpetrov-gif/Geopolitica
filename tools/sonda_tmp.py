import json, urllib.request, urllib.error
def get(u, ua=True):
    h = {"Accept": "application/geo+json", "Origin": "https://zoetzerlpetrov-gif.github.io"}
    if ua: h["User-Agent"] = "Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36"
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=h), timeout=60) as r:
            b = r.read(); print("OK", r.status, len(b), "CORS", r.headers.get("Access-Control-Allow-Origin"), u[:110]); return json.loads(b)
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, u[:110], e.read()[:300])
    except Exception as e:
        print("ERR", e, u[:110])
base = "https://api.weather.gov/alerts/active?status=actual&message_type=alert"
d = get(base)
get(base + "&t=1792000000000")
if d:
    fs = d["features"]; print("alertas", len(fs), "con geometría", sum(1 for f in fs if f.get("geometry")))
    print("ejemplo zonas", fs[0]["properties"].get("affectedZones", [])[:3], fs[0]["properties"].get("geocode"))
z = get("https://api.weather.gov/zones?type=forecast&include_geometry=false&limit=5")
