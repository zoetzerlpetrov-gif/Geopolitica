import re, urllib.request, io, csv
UA = {"User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"}
t = urllib.request.urlopen(urllib.request.Request("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml", headers=UA), timeout=90).read().decode("utf-8", "replace")
for capa in ["TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column", "TEMPO_L3_NO2_Vertical_Column_Troposphere", "OMI_Nitrogen_Dioxide_Tropo_Column", "Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual"]:
    i = t.find(f"<ows:Identifier>{capa}</ows:Identifier>")
    bloque = t[t.rfind("<Layer>", 0, i):t.find("</Layer>", i)]
    print("=====", capa)
    print(re.findall(r"<TileMatrixSet>([^<]+)</TileMatrixSet>", bloque), re.findall(r'format="([^"]+)"|<Format>([^<]+)</Format>', bloque)[:3])
    print(re.findall(r"<Default>([^<]+)</Default>", bloque), re.findall(r"<Value>([^<]+)</Value>", bloque)[:3], re.findall(r"<Value>([^<]+)</Value>", bloque)[-2:])
    print(re.findall(r'template="([^"]+)"', bloque)[:1], re.findall(r'xlink:href="([^"]+legend[^"]*)"', bloque)[:2])
b = urllib.request.urlopen(urllib.request.Request("http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv", headers=UA), timeout=120).read().decode("latin-1")
filas = list(csv.reader(io.StringIO(b)))
for f in filas[:6]: print(f[:20])
print(len(filas), filas[-1][:12])
from collections import Counter
print(Counter(f[3] for f in filas[3:] if len(f) > 3).most_common(8))
