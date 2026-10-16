import urllib.request, time
UA = {"User-Agent": "GeopoliticaMonitor/1.0 (github.com/zoetzerlpetrov-gif/Geopolitica)"}
URLS = [
 "https://www.wpc.ncep.noaa.gov/robots.txt",
 "https://www.wpc.ncep.noaa.gov/discussions/codsus",
 "https://www.wpc.ncep.noaa.gov/discussions/codsus_hr",
 "https://tgftp.nws.noaa.gov/data/raw/as/asus02.kwbc.cod.sus.txt",
 "https://www.cpc.ncep.noaa.gov/robots.txt",
 "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt",
 "https://www.cpc.ncep.noaa.gov/data/indices/wksst9120.for",
 "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml",
 "https://ssd-api.jpl.nasa.gov/cad.api?date-min=now&date-max=%2B60&dist-max=0.05&fullname=true&diameter=true",
 "https://ssd-api.jpl.nasa.gov/fireball.api?limit=5&req-loc=true",
 "https://ssd-api.jpl.nasa.gov/sbdb_query.api?fields=full_name,pdes,q,tp,M1,K1&sb-kind=c&sb-cdata=%7B%22AND%22%3A%5B%22q%7CLT%7C3%22%5D%7D&limit=5",
 "https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27433%27&OBJ_DATA=NO&MAKE_EPHEM=YES&EPHEM_TYPE=OBSERVER&CENTER=%27500@399%27&START_TIME=%272026-10-16%27&STOP_TIME=%272026-10-17%27&STEP_SIZE=%2712h%27&QUANTITIES=%271,9,20%27",
 "https://aa.usno.navy.mil/robots.txt",
 "https://aa.usno.navy.mil/api/moon/phases/date?date=2026-10-16&nump=8",
 "https://aa.usno.navy.mil/api/eclipses/solar/year?year=2027",
 "https://marine-api.open-meteo.com/v1/marine?latitude=16.85,21.1&longitude=-99.9,-86.7&hourly=swell_wave_height,swell_wave_period,swell_wave_direction&forecast_days=3",
 "https://smn.conagua.gob.mx/robots.txt",
 "https://smn.conagua.gob.mx/es/pronosticos/avisos/aviso-de-frente-frio",
 "https://cobs.si/api/comet_list.api",
 "https://www.imo.net/robots.txt",
]
for u in URLS:
    try:
        t = time.time()
        with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40) as r:
            b = r.read()
        print(f"=== {r.status} {len(b)}B {time.time()-t:.1f}s {u}")
        print(b[:1800].decode("utf-8", "replace"))
    except Exception as e:
        print(f"=== ERR {u}: {e}")
    time.sleep(1)
