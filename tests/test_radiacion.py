"""Radiación: conversión de CPM a µSv/h, ventana de 48 h y privacidad de los sensores."""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tools", "radiacion")))
import radiacion as R  # noqa: E402

AHORA = datetime(2026, 11, 4, 12, tzinfo=timezone.utc)
DISP = [
    {"when_captured": "2026-11-04T10:00:00Z", "loc_lat": 51.3871, "loc_lon": 30.1234, "lnd_7318u": 1002, "loc_name": "Zona",
     "device_contact_name": "Persona", "device_contact_email": "x@y.z", "device_sn": "serie"},
    {"when_captured": "2026-11-04T10:00:00Z", "loc_lat": 19.43, "loc_lon": -99.13, "lnd_7128ec": 10.8},
    {"when_captured": "2026-10-01T10:00:00Z", "loc_lat": 35.0, "loc_lon": 139.0, "lnd_7318u": 30},   # vieja
    {"when_captured": "2026-11-04T10:00:00Z", "loc_lat": 0.0, "loc_lon": 0.0, "lnd_7318u": 30},      # sin GPS
    {"when_captured": "2026-11-04T10:00:00Z", "loc_lat": 40.0, "loc_lon": -3.0, "pms_pm02_5": 12},   # sin Geiger
]


def test_sensores_y_privacidad(tmp_path, monkeypatch):
    monkeypatch.setattr(R, "OUT", str(tmp_path / "r.geojson"))
    R.construir(AHORA, leer=lambda u: DISP)
    texto = open(R.OUT, encoding="utf-8").read()
    d = json.loads(texto)
    s = [f for f in d["features"] if f["properties"]["k"] == "sensor"]
    assert len(s) == 2
    assert s[0]["properties"]["usv_h"] == 3.0 and s[0]["properties"]["nivel"] == "alto"
    assert s[0]["geometry"]["coordinates"] == [30.12, 51.39]  # redondeado a ~1 km
    assert s[1]["properties"]["usv_h"] == 0.1 and s[1]["properties"]["nivel"] == "normal"
    assert "Persona" not in texto and "x@y.z" not in texto and "serie" not in texto
    sitios = [f["properties"] for f in d["features"] if f["properties"]["k"] == "sitio"]
    assert {"chernobil", "fukushima", "juarez", "semipalatinsk"} <= {x["id"] for x in sitios}


def test_sin_safecast_conserva_previos(tmp_path, monkeypatch):
    monkeypatch.setattr(R, "OUT", str(tmp_path / "r.geojson"))
    R.construir(AHORA, leer=lambda u: DISP)

    def falla(u):
        raise OSError("sin red")
    R.construir(AHORA, leer=falla)
    d = json.load(open(R.OUT, encoding="utf-8"))
    assert d["sensores"] == 2 and d["fuentes"]["safecast"].startswith("error")


def test_catalogo_valido():
    cfg = json.load(open(R.SITIOS, encoding="utf-8"))
    for s in cfg["sitios"]:
        assert -90 <= s["lat"] <= 90 and -180 <= s["lon"] <= 180 and s["url"].startswith("https://") and s["texto"]
