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


# 1) SESNSP: SharePoint con galletas (como un navegador): primero el enlace, luego la descarga.
import http.cookiejar  # noqa: E402
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
op.addheaders = [("User-Agent", "Mozilla/5.0 (compatible; Geopolitica-monitor/1.0)")]
_, _, html, _ = traer("https://www.gob.mx/sesnsp/acciones-y-programas/datos-abiertos-de-incidencia-delictiva")
html = html.decode("utf-8", "replace")
m = re.search(r'<a[^>]+href="(https://sspcgob-my\.sharepoint\.com/[^"]+)"[^>]*>[^<]*Delitos\)\.\s*Incidencia delictiva estatal', html.replace("&nbsp;", " ").replace("&uacute;", "u"))
url = m.group(1) if m else None
print(f"SONDA SP enlace estatal 2026: {url}")
if url:
    try:
        r = op.open(url, timeout=60)
        print(f"SONDA SP paso1 {r.status} {r.geturl()[:160]} galletas={[c.name for c in cj]}")
        cuerpo = r.read(3000)
        print(f"SONDA SP paso1 cuerpo {cuerpo[:300]!r}")
        final = r.geturl()
        for cand in (url + "&download=1", final + ("&" if "?" in final else "?") + "download=1"):
            try:
                r2 = op.open(cand, timeout=90)
                b = r2.read(2000000)
                print(f"SONDA SP descarga {r2.status} {r2.headers.get('Content-Type')} {r2.headers.get('Content-Disposition','')[:120]} bytes={len(b)} inicio={b[:120]!r}")
                if b[:2] == b"PK":
                    z = zipfile.ZipFile(io.BytesIO(b + r2.read()))
                    for info in z.infolist()[:5]:
                        print(f"SONDA SP zip {info.filename} {info.file_size}")
                        with z.open(info) as f:
                            print("SONDA SP cab " + f.read(700).decode("latin-1", "replace").replace("\n", " ⏎ "))
                break
            except Exception as e:  # noqa: BLE001
                print(f"SONDA SP descarga error {cand[:100]} {str(e)[:120]}")
    except Exception as e:  # noqa: BLE001
        print(f"SONDA SP paso1 error {str(e)[:150]}")

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
