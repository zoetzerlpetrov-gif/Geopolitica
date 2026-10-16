import os, subprocess, urllib.request, json
for s in ["tools/maritimo/gfw.py", "tools/investigacion/listas.py"]:
    r = subprocess.run(["python3", s], capture_output=True, text=True, timeout=600, env={**os.environ})
    print("=====", s, r.stdout[-2500:], r.stderr[-1500:])
for f in ["vivos/gfw_apagados.geojson", "vivos/gfw_encuentros.geojson", "vivos/efos_69b.json", "vivos/buscados_fbi.json"]:
    try:
        t = open(f).read(); print("=====", f, len(t)); print(t[:1500])
    except Exception as e: print(f, e)
for u in ["https://www.interpol.int/How-we-work/Notices/Red-Notices/View-Red-Notices", "https://www.interpol.int/How-we-work/Notices/Yellow-Notices/View-Yellow-Notices",
          "https://www.gob.mx/fgr", "https://versionpublicarnpdno.segob.gob.mx/", "https://www.fbi.gov/wanted", "https://www.plataformadigitalnacional.org/",
          "https://www.gob.mx/sat", "https://www.gob.mx/uif", "https://www.opensanctions.org/", "https://offshoreleaks.icij.org/", "https://sanctionssearch.ofac.treas.gov/", "https://opencorporates.com/"]:
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=30); print(r.status, u)
    except Exception as e: print("ERR", e, u)
