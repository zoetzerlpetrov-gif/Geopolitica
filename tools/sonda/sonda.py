"""Sonda temporal: licitaciones, geocodificación y CORS (se borra antes del PR)."""
import json, time, urllib.parse, urllib.request
UA = "DOMINUS-OSINT/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
ORIGEN = "https://zoetzerlpetrov-gif.github.io"

def probar(nombre, url, datos=None, metodo=None, cab=None, mostrar=600):
    print("==", nombre, url)
    h = {"User-Agent": UA, "Origin": ORIGEN, "Accept": "application/json, text/html;q=0.8"}
    h.update(cab or {})
    cuerpo = None
    if datos is not None:
        cuerpo = json.dumps(datos).encode(); h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=cuerpo, headers=h, method=metodo)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            b = r.read()
            print("  ", r.status, f"{time.time()-t0:.1f}s", "ACAO=", r.headers.get("Access-Control-Allow-Origin"), "tipo=", r.headers.get("Content-Type"), "bytes=", len(b))
            print("  ", b[:mostrar].decode("utf-8", "replace").replace("\n", " "))
    except urllib.error.HTTPError as e:
        print("   HTTP", e.code, "ACAO=", e.headers.get("Access-Control-Allow-Origin"), e.read()[:400].decode("utf-8", "replace"))
    except Exception as e:
        print("   ERROR", e)
    time.sleep(1.5)

# Preflight CORS (OPTIONS) para POST JSON
def preflight(nombre, url):
    print("== preflight", nombre)
    req = urllib.request.Request(url, method="OPTIONS", headers={"User-Agent": UA, "Origin": ORIGEN,
        "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print("  ", r.status, {k: v for k, v in r.headers.items() if k.lower().startswith("access-control")})
    except urllib.error.HTTPError as e:
        print("   HTTP", e.code, {k: v for k, v in e.headers.items() if k.lower().startswith("access-control")})
    except Exception as e:
        print("   ERROR", e)

preflight("TED v3", "https://api.ted.europa.eu/v3/notices/search")
probar("TED v3 search", "https://api.ted.europa.eu/v3/notices/search",
       {"query": "FT~\"construction\" AND publication-date>=20261001", "fields": ["publication-number", "notice-title", "buyer-name", "buyer-country", "publication-date", "deadline-receipt-tender-date-lot", "links"], "limit": 3, "page": 1, "scope": "ACTIVE"}, mostrar=2500)
probar("TED v3 search 2", "https://api.ted.europa.eu/v3/notices/search",
       {"query": "notice-title~\"software\"", "fields": ["publication-number", "notice-title", "buyer-name", "buyer-country", "publication-date"], "limit": 2}, mostrar=1500)
preflight("USAspending", "https://api.usaspending.gov/api/v2/search/spending_by_award/")
probar("USAspending awards", "https://api.usaspending.gov/api/v2/search/spending_by_award/",
       {"filters": {"keywords": ["cybersecurity"], "award_type_codes": ["A", "B", "C", "D"], "time_period": [{"start_date": "2026-01-01", "end_date": "2026-10-21"}]},
        "fields": ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Start Date", "Description"], "limit": 3, "page": 1, "sort": "Award Amount", "order": "desc"}, mostrar=1500)
preflight("grants.gov", "https://api.grants.gov/v1/api/search2")
probar("grants.gov search2", "https://api.grants.gov/v1/api/search2", {"keyword": "water", "rows": 2, "oppStatuses": "forecasted|posted"}, mostrar=1500)
probar("SAM.gov sin llave", "https://api.sam.gov/opportunities/v2/search?limit=1&postedFrom=10/01/2026&postedTo=10/21/2026")
probar("SAM.gov búsqueda web", "https://sam.gov/search/?index=opp&keywords=cybersecurity", mostrar=300)
probar("ComprasMX", "https://comprasmx.buengobierno.gob.mx/", mostrar=800)
probar("ComprasMX sitemap/api", "https://comprasmx.buengobierno.gob.mx/sitiopublico/#/", mostrar=500)
probar("CompraNet datos abiertos", "https://www.datos.gob.mx/api/3/action/package_search?q=compranet&rows=3", mostrar=1500)
probar("datos.gob.mx", "https://datos.gob.mx/busca/api/3/action/package_search?q=compranet&rows=3", mostrar=800)
probar("upcp-compranet", "https://upcp-compranet.buengobierno.gob.mx/", mostrar=400)
probar("Nominatim colonia", "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=mx&q=" + urllib.parse.quote("Polanco, Ciudad de México"), mostrar=900)
probar("Nominatim colonia 2", "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=mx&q=" + urllib.parse.quote("Colonia Centro, Otzolotepec"), mostrar=900)
probar("Photon", "https://photon.komoot.io/api/?limit=3&lang=es&q=" + urllib.parse.quote("Polanco Ciudad de México"), mostrar=900)
probar("raw developments", "https://raw.githubusercontent.com/zoetzerlpetrov-gif/InmueblesAraSadasi/main/data/developments.json", mostrar=200)
for lib in ("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm", "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/+esm", "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm"):
    probar("lib", lib, mostrar=120)
# Overpass: una caja chica de acuicultura para ver si responde
q = '[out:json][timeout:60];(nwr["landuse"="aquaculture"]["name"](20,-110,30,-90););out center tags;'
probar("Overpass acuicultura MX", "https://overpass-api.de/api/interpreter?data=" + urllib.parse.quote(q), mostrar=300)
