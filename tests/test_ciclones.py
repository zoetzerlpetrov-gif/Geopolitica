"""Ciclones del mundo: GDACS (eventos y geometría) e IBTrACS ACTIVE."""
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "clima"))
import ciclones as K  # noqa: E402

AHORA = datetime(2026, 10, 8, 22, 0, tzinfo=timezone.utc)


def test_categoria():
    assert K.categoria_kt(140) == "Categoría 5"
    assert K.categoria_kt(70).startswith("Categoría 1")
    assert K.categoria_kt(40) == "Tormenta tropical"


def test_gdacs_vigentes_y_geometria():
    lista = {"features": [
        {"geometry": {"type": "Point", "coordinates": [130.5, 18.2]}, "properties": {"eventtype": "TC", "eventid": 1001, "episodeid": 7, "eventname": "HAIKUI",
         "alertlevel": "Orange", "todate": "2026-10-08T18:00:00", "severitydata": {"severity": 167, "severityunit": "km/h", "severitytext": "Typhoon"}, "country": "Philippines"}},
        {"geometry": {"type": "Point", "coordinates": [0, 0]}, "properties": {"eventtype": "TC", "eventid": 9, "todate": "2026-09-01T00:00:00"}},
        {"geometry": {"type": "Point", "coordinates": [0, 0]}, "properties": {"eventtype": "EQ", "todate": "2026-10-08T00:00:00"}},
    ]}
    evs = K.eventos_gdacs(lista, AHORA)
    assert [e["nombre"] for e in evs] == ["HAIKUI"]
    geom = {"features": [{"geometry": {"type": "LineString", "coordinates": [[130, 18], [125, 20]]}}, {"geometry": {"type": "Polygon", "coordinates": [[[1, 1], [2, 1], [2, 2], [1, 1]]]}}]}
    fs = K.features_gdacs(evs[0], geom)
    kinds = sorted(f["properties"].get("kind", f["properties"]["layer"]) for f in fs)
    assert kinds == ["forecast", "storm", "wind_radii_forecast"]
    storm = next(f for f in fs if f["properties"]["layer"] == "storm")["properties"]
    assert storm["intensity_kt"] == 90 and storm["class_label"] == "Categoría 2"


def test_ibtracs_activos():
    csv_ = ("SID,SEASON,BASIN,NAME,ISO_TIME,LAT,LON,WMO_WIND,USA_WIND\n ,Year, , , ,degrees_north,degrees_east,kts,kts\n"
            "2026280N15130,2026,WP,KOINU,2026-10-08 12:00:00,18.0,179.5,,85\n2026280N15130,2026,WP,KOINU,2026-10-08 18:00:00,18.5,181.0,,95\n"
            "2026200N10100,2026,NI,VIEJO,2026-07-20 00:00:00,10,90,40,\n")
    t = K.tormentas_ibtracs(csv_, AHORA)
    assert list(t) == ["2026280N15130"]
    fs = K.features_ibtracs("2026280N15130", t["2026280N15130"])
    assert fs[0]["properties"]["intensity_kt"] == 95 and fs[0]["geometry"]["coordinates"] == [-179.0, 18.5]
    linea = fs[1]["geometry"]["coordinates"]
    assert abs(linea[1][0] - linea[0][0]) < 5  # sin salto de 360°
    assert fs[0]["properties"]["basin"] == "Pacífico occidental"


def test_gdacs_respeta_ventana_y_una_peticion_por_corrida():
    from datetime import datetime, timezone
    import ciclones as K
    fuera = datetime(2026, 10, 9, 3, 59, tzinfo=timezone.utc)
    dentro = datetime(2026, 10, 9, 4, 20, tzinfo=timezone.utc)
    assert not K.en_ventana_gdacs(fuera) and K.en_ventana_gdacs(dentro) and not K.en_ventana_gdacs(datetime(2026, 10, 9, 6, 45, tzinfo=timezone.utc))
    pedidos = []

    def pedir(url):
        pedidos.append(url)
        if "geteventlist" in url and "alertlevel=orange" in url:
            return {"features": [{"properties": {"eventtype": "TC", "eventid": 1, "episodeid": 2, "eventname": "KOGUMA", "alertlevel": "Orange",
                                                 "todate": "2026-10-09T00:00:00"}, "geometry": {"type": "Point", "coordinates": [140, 20]}}]}
        if "geteventlist" in url:
            return {"features": []}
        return {"features": [{"geometry": {"type": "LineString", "coordinates": [[140, 20], [138, 24]]}}]}

    cache, est = K.paso_gdacs({}, fuera, pedir)
    assert pedidos == [] and "fuera de la ventana" in est
    cache = {}
    for _ in range(5):
        antes = len(pedidos)
        cache, est = K.paso_gdacs(cache, dentro, pedir)
        assert len(pedidos) - antes <= 1  # nunca más de una petición por corrida
    assert cache["niveles"] == ["red", "orange", "green"] and "1" in cache["geom"]
    assert K.siguiente_peticion(cache, "2026-10-09") is None
    assert K.siguiente_peticion(cache, "2026-10-10") == ("lista", "red")  # día nuevo: se empieza de cero
