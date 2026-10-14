import json, sys
sys.path.insert(0, "tools/capas")
import construir as C
import inmuebles as I
html = C.get(I.SHF_PAGINA, timeout=60).decode("utf-8", "replace")
enl = I.enlaces_shf(html); print("enlaces", enl)
for clave, url in list(enl.items())[:2]:
    filas = I.leer_xlsx(C.get(url, timeout=120))
    print(clave, "filas", len(filas)); print(filas[:3]); print(filas[-3:])
    shf = I.leer_shf(filas); print("entidades", len(shf), list(shf)[:5], (list(shf.values()) or [[]])[0][-3:])
est = json.loads(C.get(C.NE + "ne_10m_admin_1_states_provinces.geojson", timeout=300))
mx = [f for f in est["features"] if f["properties"].get("iso_a2") == "MX"]
print("estados MX", len(mx), [f["properties"].get("name") for f in mx][:5])
