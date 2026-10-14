"""Sonda temporal: matrices de GIBS para SO2 y aerosoles (se borra antes del PR)."""
import re, sys, urllib.request
sys.path.insert(0, "ingest")
import fuentes as F
def get(url, t=120):
    r = urllib.request.Request(url, headers={"User-Agent": F.UA})
    with urllib.request.urlopen(r, timeout=t) as x:
        return x.status, x.headers.get("content-type"), x.read()
_, _, b = get("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml")
for capa in ["OMPS_NOAA20_SO2_Planetary_Boundary_Layer", "OMPS_NOAA20_SO2_Lower_Troposphere", "OMPS_SO2_Planetary_Boundary_Layer",
             "OMPS_NOAA20_NadirMapper_AerosolIndex_360", "OMPS_Aerosol_Index", "MERRA2_SO2_Column_Mass_Density_Monthly", "AIRS_Prata_SO2_Index_Day"]:
    i = b.find(f"<ows:Identifier>{capa}</ows:Identifier>".encode())
    bloque = b[i:b.find(b"</Layer>", i)].decode("utf-8", "replace")
    tms = re.findall(r"<TileMatrixSet>([^<]+)</TileMatrixSet>", bloque)
    fmt = re.findall(r"<Format>([^<]+)</Format>", bloque)
    vals = re.findall(r"<Value>([^<]+)</Value>", bloque)
    dflt = re.findall(r"<Default>([^<]+)</Default>", bloque)
    print(capa, tms, fmt, dflt, vals[-2:])
    if tms:
        ext = "png"
        for fecha in ["2026-10-12", "2026-10-13"]:
            url = f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{capa}/default/{fecha}/{tms[0]}/2/1/1.{ext}"
            try:
                st, ct, d = get(url, 30); print("   ", fecha, st, ct, len(d))
            except Exception as e:
                print("   ", fecha, "ERR", e)
