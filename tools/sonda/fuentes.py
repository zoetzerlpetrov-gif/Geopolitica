"""Sonda temporal (se borra antes del PR): fuentes de la Fase 2."""
import os
import re
import sys
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

UA = {"User-Agent": "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"}


def traer(url, n=400000, timeout=40):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.headers.get("Content-Type"), r.read(n)


def probar(nombre, url, patron=None, n=400000, mostrar=300):
    try:
        robots = F.permitido_por_robots(url)
        st, ct, b = traer(url, n)
        t = b.decode("utf-8", "replace")
        print(f"SONDA {nombre}: {st} {ct} robots={robots} bytes={len(b)}")
        if patron:
            for m in list(dict.fromkeys(re.findall(patron, t)))[:40]:
                print(f"SONDA   · {m[:200]}")
        else:
            print("SONDA   > " + re.sub(r"\s+", " ", t[:mostrar]))
    except Exception as e:  # noqa: BLE001
        print(f"SONDA {nombre}: error {str(e)[:150]}")


probar("sesnsp_pagina", "https://www.gob.mx/sesnsp/acciones-y-programas/datos-abiertos-de-incidencia-delictiva", r'href="([^"]+)"')
probar("sesnsp_drive", "https://www.gob.mx/sesnsp/acciones-y-programas/incidencia-delictiva-del-fuero-comun-nueva-metodologia", r'href="([^"]+(?:drive|csv|zip|xls)[^"]*)"')
probar("datosgob_desaparecidos", "https://www.datos.gob.mx/api/3/action/package_search?q=desaparecidas&rows=10", r'"(?:title|url)": ?"([^"]+)"')
probar("datosgob_incidencia", "https://www.datos.gob.mx/api/3/action/package_search?q=incidencia%20delictiva&rows=10", r'"(?:title|url)": ?"([^"]+)"')
probar("rnpdno", "https://versionpublicarnpdno.segob.gob.mx/Dashboard/Index")
probar("cnb", "https://www.gob.mx/cnb")
probar("gpsjam_manifest", "https://gpsjam.org/data/manifest.csv", n=3000, mostrar=600)
probar("gpsjam_dia", "https://gpsjam.org/data/2026-10-26-h3_4.csv", n=3000, mostrar=600)
probar("eclipses_nasa_sol", "https://eclipse.gsfc.nasa.gov/SEdecade/SEdecade2021.html", n=200000, patron=r"(20\d\d \w{3} \d\d)[^<]*</a>")
probar("eclipses_nasa_luna", "https://eclipse.gsfc.nasa.gov/LEdecade/LEdecade2021.html", n=200000, patron=r"(20\d\d \w{3} \d\d)[^<]*</a>")
probar("eclipse_path_2027", "https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2027Aug02Tpath.html", n=6000, mostrar=1500)
probar("gibs_caps", "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml", r"<ows:Identifier>([^<]*(?:Snow|NDSI|IMS)[^<]*)</ows:Identifier>", n=30000000)
probar("nomads_10mb", "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl", n=3000)
probar("icrc", "https://www.icrc.org/en/what-we-do/missing-persons", n=2000)
