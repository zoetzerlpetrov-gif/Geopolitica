"""Sonda temporal: volcanes y zonas geográficas (se borra antes del PR)."""
import collections, json, sys, time
sys.path.insert(0, "tools/capas"); sys.path.insert(0, "ingest")
import construir as C
import fuentes as F
for u in ["https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=application%2Fjson",
          "https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1/volcanolocs?itemsPerPage=5000", "https://volcano.si.edu/robots.txt", "https://webservices.volcano.si.edu/robots.txt"]:
    print("robots", F.permitido_por_robots(u), u[:90])
t = time.time()
origen, fs = C.volcanes_fuente()
print(origen, len(fs), json.dumps(fs[0]["properties"], ensure_ascii=False)[:800])
z = C.zonas()
print("zonas", len(z), round(time.time() - t), "s", collections.Counter(f["properties"]["st"] for f in z))
for st in ("volcanes_cinturon", "volcanes", "montes_picos"):
    print([f["properties"] for f in z if f["properties"]["st"] == st][:3])
mx = [f["properties"]["n"] for f in z if f["properties"]["st"].startswith("volcanes") and "Mexico" in str(f["properties"].get("x"))]
print("México:", len(mx), mx[:40])
