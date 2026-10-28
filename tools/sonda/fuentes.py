"""Sonda temporal (se borra antes del PR): formatos de fuentes de la Fase 2."""
import io
import os
import re
import sys
import urllib.request
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

UA = {"User-Agent": "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"}


def traer(url, n=None, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, dict(r.headers), r.read(n) if n else r.read(), r.geturl()


# 1) SESNSP: enlaces de SharePoint de la página de datos abiertos, con descarga directa.
_, _, html, _ = traer("https://www.gob.mx/sesnsp/acciones-y-programas/datos-abiertos-de-incidencia-delictiva")
html = html.decode("utf-8", "replace")
for m in re.finditer(r'<a[^>]+href="(https://sspcgob-my\.sharepoint\.com/[^"]+)"[^>]*>(.*?)</a>', html, re.S):
    url, texto = m.group(1), re.sub(r"<[^>]+>|\s+", " ", m.group(2)).strip()
    ctx = re.sub(r"<[^>]+>|\s+", " ", html[max(0, m.start() - 300):m.start()])[-160:]
    try:
        st, h, b, final = traer(url + ("&" if "?" in url else "?") + "download=1", n=600000)
        cd = h.get("Content-Disposition", "")
        cab = b[:160]
        if b[:2] == b"PK":
            try:
                z = zipfile.ZipFile(io.BytesIO(traer(url + "&download=1")[2]))
                cab = f"ZIP {[ (i.filename, i.file_size) for i in z.infolist()][:5]}"
            except Exception as e:  # noqa: BLE001
                cab = f"ZIP (no leído: {e})"
        print(f"SONDA SP «{texto}» ctx «{ctx}» → {st} {h.get('Content-Type')} {cd[:120]} | {cab!r:.300}")
    except Exception as e:  # noqa: BLE001
        print(f"SONDA SP «{texto}» error {str(e)[:120]}")

# 2) RNPDNO versión estadística: scripts y rutas que usa la página.
_, _, b, _ = traer("https://versionpublicarnpdno.segob.gob.mx/Dashboard/Index")
t = b.decode("utf-8", "replace")
for m in sorted(set(re.findall(r'(?:src|href|url|action)\s*[:=]\s*["\']([^"\']+)["\']', t)))[:60]:
    print(f"SONDA RNPDNO · {m}")
print("SONDA RNPDNO robots: " + traer("https://versionpublicarnpdno.segob.gob.mx/robots.txt")[2][:300].decode("utf-8", "replace").replace("\n", " | ") if True else "")

# 3) GPSJam: últimas fechas del índice y un archivo del día.
_, _, b, _ = traer("https://gpsjam.org/data/manifest.csv")
filas = b.decode().strip().splitlines()
print("SONDA gpsjam últimas: " + " | ".join(filas[-4:]))
fecha = filas[-1].split(",")[0]
for nombre in (f"{fecha}-h3_4.csv", f"{fecha}-h3_3.csv", f"{fecha}.csv"):
    try:
        st, h, b, _ = traer(f"https://gpsjam.org/data/{nombre}", n=800)
        print(f"SONDA gpsjam {nombre}: {st} {b[:600]!r}")
    except Exception as e:  # noqa: BLE001
        print(f"SONDA gpsjam {nombre}: {e}")
try:
    print("SONDA gpsjam robots: " + traer("https://gpsjam.org/robots.txt")[2][:300].decode().replace("\n", " | "))
except Exception as e:  # noqa: BLE001
    print(f"SONDA gpsjam robots: {e}")
try:
    _, _, b, _ = traer("https://gpsjam.org/faq")
    tx = re.sub(r"<[^>]+>|\s+", " ", b.decode("utf-8", "replace"))
    for k in ("licen", "use the data", "download", "CC", "attribution", "commercial"):
        i = tx.lower().find(k.lower())
        if i >= 0:
            print(f"SONDA gpsjam faq «{k}»: {tx[max(0, i - 150):i + 250]}")
except Exception as e:  # noqa: BLE001
    print(f"SONDA gpsjam faq: {e}")

# 4) Eclipses: tabla de la trayectoria (formato de las filas).
_, _, b, _ = traer("https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2027Aug02Tpath.html")
t = b.decode("utf-8", "replace")
i = t.find("Limits")
print("SONDA eclipse tabla: " + t[i:i + 2500].replace("\n", " ⏎ "))
_, _, b, _ = traer("https://eclipse.gsfc.nasa.gov/SEdecade/SEdecade2021.html")
t = re.sub(r"\s+", " ", b.decode("utf-8", "replace"))
i = t.find("2026 Aug 12")
print("SONDA eclipse decada: " + t[i - 300:i + 1200])
_, _, b, _ = traer("https://eclipse.gsfc.nasa.gov/LEdecade/LEdecade2021.html")
t = re.sub(r"\s+", " ", b.decode("utf-8", "replace"))
i = t.find("2027 Feb 20")
print("SONDA eclipse luna: " + t[i - 300:i + 900])

# 5) GIBS: matriz y formato de la nieve diaria.
_, _, b, _ = traer("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml")
t = b.decode("utf-8", "replace")
for capa in ("VIIRS_NOAA20_NDSI_Snow_Cover", "MODIS_Terra_NDSI_Snow_Cover"):
    i = t.find(f"<ows:Identifier>{capa}</ows:Identifier>")
    bloque = t[i:i + 3000]
    print(f"SONDA gibs {capa}: " + " ".join(re.findall(r"<(?:Format|TileMatrixSet|ows:Identifier)>([^<]+)<", bloque)[:6]) + " " + " ".join(re.findall(r'<Value>([^<]+)</Value>', bloque)[:3]))
