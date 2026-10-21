"""Sonda temporal (se borra antes del PR): feeds del noticiero, series de indicadores y tiempos de GIBS GeoColor."""
import json, os, sys, time, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F

def pedir(url, headers=None, data=None, t=30):
    req = urllib.request.Request(url, headers={"User-Agent": F.UA, **(headers or {})}, data=data)
    try:
        with urllib.request.urlopen(req, timeout=t) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read()[:300]
    except Exception as e:
        return 0, {}, str(e).encode()[:200]

print("=== GIBS GeoColor")
ahora = datetime.now(timezone.utc)
for capa in ["GOES-East_ABI_GeoColor", "GOES-West_ABI_GeoColor"]:
    for m in range(10, 200, 10):
        x = ahora - timedelta(minutes=m); x = x.replace(minute=x.minute // 10 * 10, second=0, microsecond=0)
        ts = x.strftime("%Y-%m-%dT%H:%M:%SZ")
        st, h, b = pedir(f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{capa}/default/{ts}/GoogleMapsCompatible_Level7/4/6/4.png", {"Origin": "https://example.org"})
        print(capa, m, ts, st, len(b), h.get("Content-Type"), h.get("Access-Control-Allow-Origin"))
    for base in ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0", "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0"]:
        ini = (ahora - timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:%SZ"); fin = ahora.strftime("%Y-%m-%dT%H:%M:%SZ")
        for tms in ["GoogleMapsCompatible_Level7", "2km"]:
            u = f"{base}/{capa}/default/{tms}/all/{ini}--{fin}.xml"
            st, h, b = pedir(u, {"Origin": "https://example.org"})
            print("  dominios", u, st, h.get("Access-Control-Allow-Origin"), b[:600])

print("=== Banxico")
tok = os.environ.get("BANXICO_API_KEY", "")
for s in ["SF43718","SF60653","SF46410","SF46406","SF46407","SF60632","SF290383","SF43936","SF43939","SF43942","SF43945","SF44071","SF43883","SF43886","SF45383","SF45384","SF61592","SF61593","SF61594","SF60696","SF61745","SF60648","SF331451","SP1","SP30578","SP30577","SP74665","SP74625","SF43707","SF43783","SL1","SF17908","SF60634","SF60694","SF60695","SF60697","SF43944"]:
    st, h, b = pedir(f"https://www.banxico.org.mx/SieAPIRest/service/v1/series/{s}/datos/oportuno", {"Bmx-Token": tok})
    try:
        se = json.loads(b)["bmx"]["series"][0]; print(s, st, se.get("titulo"), se.get("datos"))
    except Exception:
        print(s, st, b[:150])
    time.sleep(0.3)

print("=== ECB / CBR / Treasury / BLS / CoinGecko")
for u in ["https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", "https://www.cbr.ru/scripts/XML_daily.asp",
          f"https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/all/{ahora:%Y%m}?type=daily_treasury_yield_curve&field_tdr_date_value_month={ahora:%Y%m}&page&_format=csv",
          "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,ripple,stellar&vs_currencies=usd,mxn&include_24hr_change=true"]:
    print(u[:90], F.permitido_por_robots(u))
    st, h, b = pedir(u); print("  ", st, b[:400])
st, h, b = pedir("https://api.bls.gov/publicAPI/v1/timeseries/data/", {"Content-Type": "application/json"}, json.dumps({"seriesid": ["CUUR0000SA0", "LNS14000000"]}).encode())
print("BLS", st, b[:500])

print("=== Feeds")
cfg = json.load(open(os.path.join(ROOT, "config", "noticiero.json")))
vistos = set()
for s in cfg["secciones"]:
    for fd in s["feeds"]:
        if fd["url"] in vistos: continue
        vistos.add(fd["url"])
        try:
            if not F.permitido_por_robots(fd["url"]):
                print(f"ROBOTS {s['id']} {fd['nombre']}"); continue
            its = F.parsear_rss(F.get(fd["url"], timeout=30), fd)
            print(f"OK {len(its)} {s['id']} {fd['nombre']} | {its[0]['fecha_utc'] if its else ''} {its[0]['titulo'][:70] if its else ''}")
        except Exception as e:
            print(f"FALLA {s['id']} {fd['nombre']} {str(e)[:100]}")

print("=== Noticiero completo")
sys.path.insert(0, os.path.dirname(__file__))
import noticiero
noticiero.main(2)
d = json.load(open(noticiero.OUT))
for sec in d["secciones"]:
    ns = [n for n in d["notas"] if sec["id"] in n["s"]][:4]
    print("##", sec["id"])
    for n in ns: print("   ", n["via"], n["m"], "|", n["t"][:100])
