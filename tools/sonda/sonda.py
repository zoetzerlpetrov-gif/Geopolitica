"""Sonda temporal: ¿permite FAOSTAT/FishStat la descarga masiva? robots.txt, condiciones y contenido (se borra antes del PR)."""
import csv, io, time, urllib.request, urllib.robotparser, zipfile
UA = "DOMINUS-OSINT/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def get(url, t=120):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=t) as r:
        return r.status, r.headers.get("Content-Type"), r.read()
for host in ("https://bulks-faostat.fao.org", "https://www.fao.org", "https://fenixservices.fao.org"):
    try:
        st, ct, b = get(host + "/robots.txt", 30); print("== robots", host, st, ct); print(b.decode("utf-8", "replace")[:1500])
    except Exception as e:
        print("== robots", host, "ERROR", e)
    rp = urllib.robotparser.RobotFileParser(host + "/robots.txt")
    try:
        rp.read(); print("   can_fetch bulks zip:", rp.can_fetch(UA, host + "/production/Production_Crops_Livestock_E_All_Data_(Normalized).zip"))
    except Exception as e:
        print("   rp", e)
for url in ("https://www.fao.org/contact-us/terms/db-terms-of-use/en/", "https://www.fao.org/faostat/en/#data/QCL"):
    try:
        st, ct, b = get(url, 60); t = b.decode("utf-8", "replace")
        i = t.find("CC BY"); print("==", url, st, len(b), "CC BY en:", i, t[max(0, i - 300):i + 300].replace("\n", " ") if i >= 0 else "")
    except Exception as e:
        print("==", url, "ERROR", e)
t0 = time.time()
st, ct, b = get("https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_All_Data_(Normalized).zip", 300)
print("== zip", st, len(b), f"{time.time()-t0:.0f}s")
z = zipfile.ZipFile(io.BytesIO(b)); print(z.namelist())
nombre = [n for n in z.namelist() if n.endswith(".csv") and "Normalized" in n][0]
f = io.TextIOWrapper(z.open(nombre), encoding="latin-1")
r = csv.DictReader(f); print(r.fieldnames)
anios, elementos, n = set(), {}, 0
for fila in r:
    n += 1; anios.add(fila.get("Year")); elementos[fila.get("Element")] = elementos.get(fila.get("Element"), 0) + 1
    if n < 4: print(fila)
print("filas", n, "años", sorted(anios)[-5:], "elementos", elementos)
for url in ("https://www.fao.org/fishery/static/Data/Aquaculture_2025.1.0.zip", "https://www.fao.org/fishery/en/collection/aquaculture"):
    try:
        st, ct, b = get(url, 120); print("== fish", url, st, ct, len(b))
    except Exception as e:
        print("== fish", url, "ERROR", e)
