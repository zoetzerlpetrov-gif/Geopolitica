"""Capa «Protocolos, alertas y niveles oficiales» (tools/protocolos/protocolos.py)."""
import json
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "protocolos"))
import protocolos as P  # noqa: E402

EUA = b"""<rss><channel>
<item><title>Iran - Level 4: Do Not Travel</title><link>https://travel.state.gov/x/destination.irn.html</link><pubDate>Thu, 29 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title>Mexico - Level 2: Exercise Increased Caution</title><link>https://travel.state.gov/x/destination.mex.html</link></item>
<item><title>Haiti - Level 3: Reconsider Travel</title><link>https://travel.state.gov/x/destination.hti.html</link></item>
</channel></rss>"""
CANADA = {"data": {"AF": {"advisory-state": 3, "eng": {"advisory-text": "Avoid all travel", "url-slug": "afghanistan"}, "date-published": {"date": "2026-10-14 07:01:50"}},
                   "IR": {"advisory-state": 3, "eng": {"advisory-text": "Avoid all travel", "url-slug": "iran"}},
                   "FR": {"advisory-state": 1, "eng": {"url-slug": "france"}}}}
MI5 = b"""<rss><channel><item><title>Current Threat Level: SEVERE</title><pubDate>Thu, 30 Apr 2026 06:09:17 +0100</pubDate></item></channel></rss>"""
NTAS_VACIO = b'<?xml version="1.0" encoding="UTF-8"?> <alerts> </alerts>'


def leer(url):
    return {P.EUA_RSS: EUA, P.CANADA: json.dumps(CANADA).encode(), P.MI5: MI5, P.NTAS: NTAS_VACIO}[url]


def test_construye_registro_viajes_y_niveles():
    fc = P.construir(datetime(2026, 10, 29, tzinfo=timezone.utc), leer)
    por = {f["properties"]["id"]: f["properties"] for f in fc["features"]}
    assert "reg:fortress_america" in por and por["reg:fortress_america"]["iso3"] == "USA"
    assert por["reg:ue_preparacion"]["paises"] == "27 países"
    # Irán: EUA nivel 4 y Canadá «evitar todo viaje» en un solo punto.
    ir = por["viaje:IRN"]
    assert ir["nivel"] == 4 and "EUA" in ir["resumen"] and "Canadá" in ir["resumen"] and ir["url2"]
    assert por["viaje:HTI"]["nivel"] == 3 and por["viaje:AFG"]["nivel"] == 4
    assert "viaje:MEX" not in por and "viaje:FRA" not in por, "solo niveles altos"
    assert por["nivel:GBR"]["nivel"] == 3 and "severo" in por["nivel:GBR"]["titulo"]
    assert not any(k.startswith("ntas:") for k in por), "sin boletín activo"
    assert fc["fuentes"]["eua"] == "ok (2)" and fc["fuentes"]["ntas"] == "ok (0)"


def test_una_fuente_caida_no_tumba_la_capa():
    def falla(url):
        if url == P.CANADA:
            raise OSError("caída")
        return leer(url)
    fc = P.construir(datetime(2026, 10, 29, tzinfo=timezone.utc), falla)
    assert fc["fuentes"]["canada"].startswith("error") and any(f["properties"]["id"] == "viaje:IRN" for f in fc["features"])


def test_registro_tiene_fuente_y_resumen():
    cfg = json.load(open(os.path.join(ROOT, "config", "protocolos.json"), encoding="utf-8"))
    for r in cfg["registro"]:
        assert r["url"].startswith("https://") and r["resumen"] and r["verificado"] and set(r["ambitos"]) <= set(cfg["ambitos"]), r["id"]


def test_cisne_negro_en_registro_y_niveles():
    fc = P.construir(datetime(2026, 10, 29, tzinfo=timezone.utc), leer)
    por = {f["properties"]["id"]: f["properties"] for f in fc["features"]}
    assert por["reg:fortress_america"]["cisne_negro"] and por["reg:fortress_america"]["emisor"] == "Estados Unidos"
    assert por["reg:uk_be_ready"]["cisne_negro"] and not por["reg:ue_preparacion"]["cisne_negro"]
    assert not por["nivel:GBR"]["cisne_negro"], "severo no es cisne negro; solo crítico"
    critico = P.nivel_reino_unido(b"<rss><channel><item><title>Current Threat Level: CRITICAL</title></item></channel></rss>", P.S.Paises(json.load(open(os.path.join(ROOT, "config", "gazetteer.json")))["paises"]))
    assert critico[0]["properties"]["cisne_negro"] and critico[0]["properties"]["nivel"] == 4


def test_datos_vivos_no_cancela_la_corrida_en_curso():
    """La corrida dura más que el intervalo del reloj: si se cancelara, ninguna publicaría."""
    wf = open(os.path.join(ROOT, ".github", "workflows", "vivos.yml"), encoding="utf-8").read()
    assert "cancel-in-progress: false" in wf


def test_reino_unido_y_gdacs_rojo_son_cisne_negro():
    nom = P.S.Paises(json.load(open(os.path.join(ROOT, "config", "gazetteer.json")))["paises"])
    indice = {"links": {"children": [
        {"api_url": "u/sudan", "web_url": "https://www.gov.uk/foreign-travel-advice/sudan", "public_updated_at": "2026-10-20T10:00:00+01:00", "details": {"country": {"name": "Sudan", "slug": "sudan"}}},
        {"api_url": "u/spain", "web_url": "w", "public_updated_at": "2026-10-20T10:00:00+01:00", "details": {"country": {"name": "Spain", "slug": "spain"}}},
        {"api_url": "u/mali", "web_url": "w", "public_updated_at": "X", "details": {"country": {"name": "Mali", "slug": "mali"}}}]}}
    fichas = {"u/sudan": {"details": {"alert_status": ["avoid_all_travel_to_whole_country"]}}, "u/spain": {"details": {"alert_status": []}}}
    cache = {"mali": {"actualizado": "X", "alertas": ["avoid_all_travel_to_parts"], "iso3": "MLI"}}   # sin cambio: no se vuelve a pedir
    pedidas = []
    def leer_uk(url):
        pedidas.append(url)
        return json.dumps(fichas[url]).encode()
    uk = P.avisos_reino_unido(indice, cache, leer_uk, nom, pausa=0)
    assert pedidas == ["u/sudan", "u/spain"] and set(uk) == {"SDN"} and uk["SDN"][0] == 4
    v = {f["properties"]["iso3"]: f["properties"] for f in P.viajes({}, {}, nom, uk)}
    assert v["SDN"]["cisne_negro"] and "Reino Unido" in v["SDN"]["afectacion"]
    gd = {"features": [{"geometry": {"type": "Point", "coordinates": [80.0, 13.0]}, "properties": {"alertlevel": "Red", "eventtype": "TC", "eventid": 1,
          "type_label": "Ciclón tropical", "name": "MURASU-26", "country": "India", "fromdate": "2026-11-01T00:00:00", "todate": "2026-11-03T06:00:00", "url": "https://gdacs"}},
                       {"geometry": {"type": "Point", "coordinates": [0, 0]}, "properties": {"alertlevel": "Orange", "eventtype": "DR"}}]}
    r = P.gdacs_rojos(gd, nom, datetime(2026, 11, 4, tzinfo=timezone.utc))
    assert len(r) == 1 and r[0]["properties"]["cisne_negro"] and r[0]["properties"]["desactivado"] == "2026-11-06" and r[0]["properties"]["iso3"] == "IND"
