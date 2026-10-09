import json, time, urllib.request, gzip, collections, re
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=300) as r:
        b = r.read()
        return gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b
t0 = time.time()
tle = json.loads(get("https://db.satnogs.org/api/tle/?format=json"))
print("SATNOGS TLE", len(tle), round(time.time() - t0), "s", collections.Counter(x.get("tle_source") for x in tle).most_common(5))
for pat in ["STARLINK", "ONEWEB", "NAVSTAR|GPS", "GALILEO|GSAT0", "BEIDOU", "COSMOS", "ISS|TIANHE|CSS", "IRIDIUM", "NOAA|GOES|METEOSAT", "USA ", "HST|HUBBLE", "FLOCK|DOVE", "DEB", "R/B"]:
    print("  ", pat, sum(1 for x in tle if re.search(pat, x["tle0"])))
time.sleep(3)
sats = json.loads(get("https://db.satnogs.org/api/satellites/?format=json"))
print("SATNOGS SATS", len(sats), collections.Counter(x.get("status") for x in sats).most_common(6))
print("  con países", sum(1 for x in sats if x.get("countries")), "con operador", sum(1 for x in sats if x.get("operator") not in (None, "None", "")))
time.sleep(3)
for u in ["https://db.satnogs.org/about/", "https://db.satnogs.org/api/", "https://planet4589.org/space/gcat/web/intro/license.html", "https://planet4589.org/space/gcat/index.html"]:
    try:
        b = get(u).decode("utf-8", "replace")
        for m in re.finditer(r"(?i)(licen[cs]e[^<]{0,200}|CC[- ]BY[^<]{0,120}|creative commons[^<]{0,150})", b):
            print("LIC", u, m.group(0)[:220].replace("\n", " "))
    except Exception as e: print("LIC", u, e)
    time.sleep(2)
g = get("https://planet4589.org/space/gcat/tsv/cat/satcat.tsv").decode("utf-8", "replace").splitlines()
cab = g[0].lstrip("#").split("\t"); filas = [dict(zip(cab, l.split("\t"))) for l in g if not l.startswith("#")]
print("GCAT", len(filas), cab)
vivos = [f for f in filas if f["Status"].strip() in ("O", "OX", "AO", "R?", "N", "E")]
print("  estado", collections.Counter(f["Status"].strip() for f in filas).most_common(15))
print("  tipo en órbita", collections.Counter(f["Type"].strip()[:1] for f in filas if f["DDate"].strip() in ("-", "")).most_common(8))
print("  dueños", collections.Counter(f["State"].strip() for f in filas if f["DDate"].strip() in ("-", "")).most_common(15))
print("  ejemplo", {k: filas[-5][k] for k in cab[:20]})
time.sleep(2)
for u in ["https://planet4589.org/space/gcat/tsv/tables/orgs.tsv", "https://planet4589.org/space/gcat/tsv/tables/sites.tsv"]:
    try: b = get(u).decode("utf-8", "replace").splitlines(); print("TAB", u, len(b), b[:3])
    except Exception as e: print("TAB", u, e)
    time.sleep(2)
