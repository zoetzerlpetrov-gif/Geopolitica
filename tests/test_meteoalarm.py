"""MeteoAlarm: lectura del canal Atom, vigencia y unión con las regiones EMMA_ID."""
import json
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "clima"))
import meteoalarm as M  # noqa: E402

REG = json.load(open(os.path.join(ROOT, "config", "meteoalarm_regiones.json"), encoding="utf-8"))["regiones"]


def test_leer_vigentes_y_unir():
    avisos = M.leer_feed(open(os.path.join(ROOT, "tests", "datos", "meteoalarm_es.xml"), "rb").read(), "spain")
    assert len(avisos) == 4  # el verde se descarta
    a = avisos[0]
    assert a["codigos"] == ["ES890"] and a["nivel"] == 2 and a["tipo"] == "Fenómenos costeros" and a["url"].endswith("ES890")
    assert avisos[3]["tipo"] == "Lluvia e inundación" and avisos[3]["esquema"] == "NUTS3"
    ahora = datetime(2026, 10, 9, 13, tzinfo=timezone.utc)
    v = M.vigentes(avisos, ahora)
    assert len(v) == 3  # el de Sierra y Pedroches ya venció
    feats, sin = M.features(v, REG, ahora)
    assert sin == 0
    zonas = {f["properties"]["codigo"]: f["properties"] for f in feats if f["properties"]["k"] == "zona"}
    assert set(zonas) == {"ES890", "FR022"}  # Gard llega como NUTS3 y se une por nombre
    es = zonas["ES890"]
    assert es["nivel"] == 3 and es["tipos"] == ["Tormentas"] and len(es["avisos"]) == 2 and es["en_curso"]
    assert zonas["FR022"]["nivel"] == 4
    assert sum(1 for f in feats if f["geometry"]["type"] == "Point") == 2


def test_canal_json_con_poligono_y_respaldo_por_pais():
    d = {"warnings": [{"alert": {"status": "Actual", "msgType": "Alert", "sent": "2026-10-09T10:00:00Z", "info": [
        {"language": "no", "parameter": [{"valueName": "awareness_level", "value": "3; orange; Severe"}]},
        {"language": "en-GB", "severity": "Severe", "onset": "2026-10-09T09:00:00+00:00", "expires": "2026-10-10T09:00:00+00:00",
         "parameter": [{"valueName": "awareness_level", "value": "3; orange; Severe"}, {"valueName": "awareness_type", "value": "1; Wind"}],
         "area": [{"areaDesc": "Støtt - Melbu", "polygon": ["66.9133,13.7607 67.2505,14.6128 67.3015,13.9162 66.9133,13.7607"]},
                  {"areaDesc": "Sin forma", "geocode": []}]}]}}]}
    av = M.leer_json(d, "norway")
    assert len(av) == 2 and av[0]["nivel"] == 3 and av[0]["tipo"] == "Viento" and av[0]["poligonos"][0][0] == [13.761, 66.913]
    ahora = datetime(2026, 10, 9, 13, tzinfo=timezone.utc)
    feats, sin = M.features(av, REG, ahora, {"NO": [10.0, 62.0]})
    assert sin == 0
    zonas = [f for f in feats if f["properties"]["k"] == "zona"]
    puntos = [f["properties"] for f in feats if f["properties"]["k"] == "region"]
    assert len(zonas) == 1 and zonas[0]["geometry"]["type"] == "Polygon"
    assert any("aproximada: país" in p["region"] for p in puntos) and all(p["pais_iso2"] == "NO" for p in puntos)
