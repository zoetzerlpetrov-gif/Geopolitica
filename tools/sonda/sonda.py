"""Sonda temporal: estructura del archivo de acuicultura de FishStat (se borra antes del PR)."""
import csv, io, urllib.request, zipfile
UA = "DOMINUS-OSINT/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
b = urllib.request.urlopen(urllib.request.Request("https://www.fao.org/fishery/static/Data/Aquaculture_2025.1.0.zip", headers={"User-Agent": UA}), timeout=120).read()
z = zipfile.ZipFile(io.BytesIO(b)); print(z.namelist())
for n in z.namelist():
    if n.lower().endswith(".csv"):
        f = io.TextIOWrapper(z.open(n), encoding="utf-8-sig", errors="replace")
        r = csv.reader(f); filas = [next(r) for _ in range(4)]
        tot = sum(1 for _ in r)
        print("==", n, tot + 3, filas)
