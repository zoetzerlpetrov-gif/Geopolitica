"""Fase 7: catálogo de planes y lista de fuentes no comerciales."""
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def cargar(p):
    return json.load(open(os.path.join(ROOT, p), encoding="utf-8"))


def test_planes_y_secciones_solo_admin_existen():
    cat = cargar("config/planes.json")
    assert [(p["id"], p["usd"]) for p in cat["planes"]] == [("demo", 0), ("recon", 4.99), ("analyst", 8.99), ("command", 12.99)]
    assert cat["cobro"]["tipo_cambio"]["serie"] == "SF43718"
    index = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    capas = {c["id"] for c in cargar("config/capas.json")["familias"]}
    for s in cat["solo_admin"]:
        if s["tipo"] == "pagina":
            assert os.path.exists(os.path.join(ROOT, s["href"])), s
        elif s["tipo"] == "bloque":
            assert f'id="{s["id"]}"' in index, s
        else:
            assert s["id"] in capas, s


def test_cada_fuente_no_comercial_de_sources_esta_en_la_lista():
    lic = cargar("config/comercial_licencias.json")
    patrones = [f["patron"] for f in lic["fuentes"]]
    assert all(f["accion"] in lic["acciones"] and f["estado"] in lic["estados"] and f["prueba"] for f in lic["fuentes"])
    nc = re.compile(r"BY-NC|no comercial|non-commercial|\| \*\*No\*\*", re.I)
    faltan = []
    for linea in open(os.path.join(ROOT, "SOURCES.md"), encoding="utf-8"):
        if linea.startswith("|") and nc.search(linea) and not any(p in linea for p in patrones):
            faltan.append(linea[:100])
    assert not faltan, faltan


def test_version_pago_apunta_a_elementos_que_existen():
    v = cargar("config/comercial_licencias.json")["version_pago"]
    index = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    app = open(os.path.join(ROOT, "js", "app.js"), encoding="utf-8").read()
    for b in v["bloques_solo_admin"]:
        assert f'id="{b}"' in index, b
    for f in v["funciones_solo_admin"]:
        assert f'"{f}"' in app, f"js/app.js no revisa la función {f}"
    assert set(v["movimiento_solo_admin"]) <= {"aeronaves", "buques", "satelites"}
    red = open(os.path.join(ROOT, "tools", "red", "red.py"), encoding="utf-8").read()
    assert "red_c2_comercial.geojson" in red and v["riesgos_sustituidos"]["c2_botnets"]["url"].endswith("red_c2_comercial.geojson")


def test_cables_osm_sustituye_a_telegeography():
    import sys
    sys.path.insert(0, os.path.join(ROOT, "tools", "capas"))
    import construir as C
    els = [{"type": "way", "id": 7, "tags": {"name": "Cable X", "operator": "Op"}, "geometry": [{"lon": -90, "lat": 20}, {"lon": -89, "lat": 21}]},
           {"type": "way", "id": 8, "tags": {}, "geometry": [{"lon": 0, "lat": 0}]}]
    fs = C.cables_osm_de(els)
    assert len(fs) == 1 and fs[0]["properties"]["st"] == "cables_submarinos_osm" and fs[0]["properties"]["x"] == "Op"
    capas = {f["id"]: f for f in cargar("config/capas.json")["familias"]}
    assert capas["cables_osm"]["sustituye"] == "cables" and capas["cables_osm"]["fuente"] == "osm"
    assert cargar("config/comercial_licencias.json")["version_pago"]["capas_sustituidas"] == {"cables": "cables_osm"}
    sub = [s for c in cargar("config/entities.json")["categorias"] for s in c["subtipos"] if s.get("familia") == "cables_osm"]
    assert [s["id"] for s in sub] == ["cables_submarinos_osm"]
    assert "cables_osm" in C.FAMILIAS and "cables_osm" in C.FAMILIAS_OSM


def test_bloque_infraestructura_por_plan_y_bitcoin_solo_admin():
    planes = cargar("config/planes.json")
    assert not any(s.get("id") == "b-capas-ent" for s in planes["solo_admin"])
    assert planes["acceso_por_plan"]["bloques"]["b-capas-ent"] == "recon"
    capas_admin = {s["id"] for s in planes["solo_admin"] if s["tipo"] == "capa"}
    assert {"inmuebles_seguimiento", "nodos_bitcoin"} <= capas_admin
