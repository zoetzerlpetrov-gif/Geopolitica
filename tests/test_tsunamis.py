"""Tsunamis: lectura de boletines de la NOAA (tsunami.gov) y objetos del mapa."""
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "clima"))
import tsunamis as T  # noqa: E402

ATOM = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#">
<title>Tsunami Information Statement Number 1</title>
<link rel="related" title="Travel Time Map" href="https://www.tsunami.gov/x/ttv.jpg" type="image/jpeg" />
<entry><title>in Panama</title><updated>2026-10-09T18:05:18Z</updated><geo:lat>7.549</geo:lat><geo:long>-80.773</geo:long>
<summary type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><strong>Category:</strong> Information<br/><strong>Preliminary Magnitude: </strong>8.0(Mwp)<br/>
<b>Note:</b>  * This earthquake has the potential to generate a destructive tsunami in the source region. <br/><strong>Definition: </strong>x</div></summary>
<link rel="alternate" title="Bulletin" href="https://www.tsunami.gov/x/WEAK53.txt" type="application/xml" /></entry></feed>"""


def leer(n):
    return open(os.path.join(ROOT, "tests", "datos", n), encoding="utf-8").read()


def test_feed_atom():
    b = T.leer_feed(ATOM, "NTWC")[0]
    assert (b["lat"], b["lon"], b["magnitud"], b["nivel"]) == (7.549, -80.773, 8.0, 1)
    assert b["boletin"].endswith("WEAK53.txt") and b["mapa_tiempos"].endswith("ttv.jpg") and "destructive" in b["nota"]


def test_boletin_informativo_real():
    d = T.leer_boletin(leer("tsunami_ntwc.txt"))
    assert d["origen_utc"] == "2026-10-09T17:56:00Z" and d["profundidad_km"] == 34


def test_boletin_de_amenaza():
    d = T.leer_boletin(leer("tsunami_amenaza.txt"))
    assert d["radio_km"] == 1000
    assert d["alturas"][0] == {"altura": "1 to 3 meters", "costas": "Panama, Costa Rica"} and len(d["alturas"]) == 2
    assert [l["lugar"] for l in d["llegadas"]] == ["Punta Mala", "Puntarenas"] and d["llegadas"][1]["lon"] == -84.8
    assert d["observaciones"][0]["amplitud_m"] == 0.45 and d["observaciones"][0]["lat"] == 8.9


def test_objetos_del_mapa():
    b = T.leer_feed(ATOM, "NTWC")[0]
    b["texto"] = {**T.leer_boletin(leer("tsunami_ntwc.txt")), **T.leer_boletin(leer("tsunami_amenaza.txt"))}
    b2 = {**b, "centro": "PTWC", "nivel": 4, "categoria": "Amenaza de tsunami", "actualizado": "2026-10-09T18:30:00Z", "texto": {}}
    ahora = datetime(2026, 10, 9, 20, 30, tzinfo=timezone.utc)
    estado = T.actualizar_estado({}, [b, b2], ahora)
    assert len(estado) == 1  # los dos centros, un solo evento
    fs = [f for k, ev in estado.items() for f in T.features_evento(k, ev, ahora)]
    tipos = [f["properties"]["k"] for f in fs]
    assert tipos.count("epicentro") == 1 and tipos.count("zona") == 1 and tipos.count("frente") == T.HORAS_FRENTE
    assert tipos.count("llegada") == 2 and tipos.count("observacion") == 1
    ep = fs[0]["properties"]
    assert ep["categoria"] == "Amenaza de tsunami" and ep["horas_desde"] == 2.6 and ep["profundidad_km"] == 34
    frentes = [f["properties"] for f in fs if f["properties"]["k"] == "frente"]
    assert frentes[1]["pasado"] is True and frentes[2]["pasado"] is False  # 2 h ya pasaron; 3 h todavía no
    viejo = T.actualizar_estado(estado, [], datetime(2026, 10, 12, tzinfo=timezone.utc))
    assert viejo == {}
