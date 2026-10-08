"""Pruebas de la ingesta (Fase 2) sin red: filas de GDELT y feeds RSS/Atom sintéticos.

Ejecutar:  python3 -m pytest -q tests/test_ingesta.py
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402
import run as R  # noqa: E402
from classify import Clasificador  # noqa: E402
from geo import Gazetteer, Paises  # noqa: E402
from validate import validar  # noqa: E402

with open(os.path.join(ROOT, "config", "fuentes.json"), encoding="utf-8") as f:
    CFG = json.load(f)
with open(os.path.join(ROOT, "config", "taxonomy.json"), encoding="utf-8") as f:
    TAX = json.load(f)
GAZ, PAISES, CLS = Gazetteer(), Paises(), Clasificador(TAX)
T = datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc)


def fila(raiz="19", codigo="190", articulos="40", gold="-10", lat="50.45", lon="30.52",
         a1="RUSSIA", a2="UKRAINE", lugar="Kyiv, Kyyiv, Misto, Ukraine", fecha="20261008110000",
         url="https://example.com/2026/10/08/russian-missile-strike-kyiv-power-grid"):
    f = [""] * 61
    f[0], f[6], f[16], f[25], f[26], f[28] = "1234567", a1, a2, "1", codigo, raiz
    f[30], f[32], f[33], f[52], f[56], f[57], f[59], f[60] = gold, "12", articulos, lugar, lat, lon, fecha, url
    return f


RSS = b"""<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
<item><title>Ataques con drones dejan sin electricidad a Kiev</title><link>https://example.org/a1</link>
<pubDate>Thu, 08 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Texto del medio que NO se guarda</p>]]></description></item>
<item><title>Sin enlace</title><link></link></item>
</channel></rss>"""

ATOM = b"""<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>x</title>
<entry><title>Mexico and US agree new tariffs review under USMCA</title><link href="https://example.net/b1"/>
<updated>2026-10-08T09:30:00Z</updated><summary>Resumen del medio</summary></entry></feed>"""

RDF = b"""<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
 xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<item><title>Protestas masivas en Serbia contra el gobierno</title><link>https://example.de/c1</link>
<dc:date>2026-10-08T08:00:00Z</dc:date></item></rdf:RDF>"""

FEED = {"id": "x", "nombre": "Medio de prueba", "tipo": "noticia"}


# ---------------- GDELT ----------------
def test_fila_gdelt_valida():
    c = F.fila_gdelt(fila(), CFG["gdelt"])
    assert c["titulo"].startswith("Combate: Russia → Ukraine")
    assert c["severidad"] == 4  # Goldstein -10 (+2) y 40 artículos (+1)
    assert c["area_sugerida"] == "seguridad"
    assert c["fecha_utc"] == "2026-10-08T11:00:00Z"
    assert "missile" in c["texto_clasificar"]  # palabras del enlace, solo para clasificar


@pytest.mark.parametrize("cambio", [
    {"raiz": "04"},            # cooperación verbal: fuera de los códigos de conflicto
    {"articulos": "2"},        # menos del mínimo de artículos
    {"lat": ""},               # sin coordenada
])
def test_fila_gdelt_filtrada(cambio):
    assert F.fila_gdelt(fila(**cambio), CFG["gdelt"]) is None


def test_cameo_especial_sanciones_es_geoeconomia():
    c = F.fila_gdelt(fila(raiz="16", codigo="163"), CFG["gdelt"])
    assert c["area_sugerida"] == "geoeconomia"


@pytest.mark.parametrize("g,a,esperado", [(0, 5, 1), (-5, 5, 2), (-9, 5, 3), (-9, 60, 5), (3, 100, 3)])
def test_severidad_gdelt(g, a, esperado):
    assert F.severidad_gdelt(g, a) == esperado


# ---------------- RSS / Atom / RDF ----------------
def test_rss2_guarda_solo_titulo_fecha_enlace():
    out = F.parsear_rss(RSS, FEED)
    assert len(out) == 1  # el item sin enlace se descarta
    c = out[0]
    assert c["titulo"] == "Ataques con drones dejan sin electricidad a Kiev"
    assert c["fecha_utc"] == "2026-10-08T10:00:00Z"
    assert c["resumen"] is None  # el resumen lo redacta el sistema, no el medio


def test_atom_y_rdf():
    a = F.parsear_rss(ATOM, FEED)[0]
    assert a["url"] == "https://example.net/b1" and a["fecha_utc"] == "2026-10-08T09:30:00Z"
    r = F.parsear_rss(RDF, FEED)[0]
    assert r["url"] == "https://example.de/c1" and r["fecha_utc"] == "2026-10-08T08:00:00Z"


# ---------------- Geocodificación ----------------
@pytest.mark.parametrize("titulo,iso", [
    ("Ataques con drones dejan sin electricidad a Kiev", "UKR"),
    ("Protestas masivas en Serbia contra el gobierno", "SRB"),
    ("Mexico and US agree new tariffs review", "MEX"),
    ("Tensions rise in the South China Sea", "CHN"),
    ("Let us talk about the weather", None),  # "us" en minúsculas no es Estados Unidos
])
def test_pais_en_texto(titulo, iso):
    assert GAZ.pais_en_texto(titulo) == iso


def test_punto_en_poligono():
    assert PAISES.de(30.52, 50.45) == "UKR"
    assert PAISES.de(-99.13, 19.43) == "MEX"
    assert PAISES.de(-30.0, 0.0) is None  # océano


# ---------------- Corrida completa (sin red) ----------------
def _candidatos():
    return ([F.fila_gdelt(fila(), CFG["gdelt"])]
            + F.parsear_rss(RSS, FEED)
            + F.parsear_rss(RSS, {**FEED, "nombre": "Otro medio"})   # misma nota, otra fuente
            + F.parsear_rss(ATOM, FEED) + F.parsear_rss(RDF, FEED))


def _procesar(cands, anteriores=()):
    return R.procesar(cands, list(anteriores), CFG, T, GAZ, PAISES, CLS, TAX)


def _data(eventos):
    return {"version_esquema": "1.0", "generado_utc": R.iso(T), "modo": "produccion", "total": len(eventos), "eventos": eventos}


def test_corrida_cumple_esquema():
    eventos, desc = _procesar(_candidatos())
    assert validar(_data(eventos), TAX) == []
    assert desc["sin_clasificar"] == 0


def test_dedup_agrupa_fuentes_y_marca_verificado():
    eventos, _ = _procesar(_candidatos())
    kiev = [e for e in eventos if "Kiev" in e["titulo"]]
    assert len(kiev) == 1
    assert {f["fuente"] for f in kiev[0]["fuentes"]} == {"Medio de prueba", "Otro medio"}
    assert kiev[0]["verificado"] is True


def test_clasificacion_y_mexico():
    eventos, _ = _procesar(_candidatos())
    por = {e["url"]: e for e in eventos}
    assert por["https://example.org/a1"]["area_principal"] in {"infraestructura", "seguridad"}
    assert por["https://example.org/a1"]["pais_iso3"] == "UKR"
    mx = por["https://example.net/b1"]
    assert mx["pais_iso3"] == "MEX" and mx["impacto_mexico"] == "Ocurre en México."
    assert mx["area_principal"] == "geoeconomia"
    assert por["https://example.de/c1"]["region"] == "europa_este_rusia"


def test_no_se_guarda_texto_del_medio():
    eventos, _ = _procesar(_candidatos())
    txt = json.dumps(eventos, ensure_ascii=False)
    assert "NO se guarda" not in txt and "Resumen del medio" not in txt
    assert all("texto_clasificar" not in e for e in eventos)


def test_ventana_de_72_horas():
    viejo = F.parsear_rss(RSS.replace(b"08 Oct 2026", b"01 Oct 2026"), FEED)
    eventos, desc = _procesar(viejo)
    assert eventos == [] and desc["fuera_de_ventana"] == 1


def test_delta_entre_corridas():
    primera, _ = _procesar(_candidatos())
    assert {e["delta"] for e in primera} == {"nuevo"}
    gd = next(e for e in primera if e["id"].startswith("gd-"))
    # La misma fila con más artículos sube la severidad -> "escala".
    otra = F.fila_gdelt(fila(articulos="80"), CFG["gdelt"])
    segunda, _ = _procesar([otra], primera)
    e2 = next(e for e in segunda if e["id"] == gd["id"])
    assert e2["severidad"] > gd["severidad"] and e2["delta"] == "escala"
    # Los eventos anteriores dentro de la ventana se conservan.
    assert len(segunda) == len(primera)


def test_tope_de_eventos_publicados():
    cands = [F.fila_gdelt(fila(url=f"https://example.com/n{i}", lat=str(10 + i * 0.5), lon="20",
                               a1=f"ACTOR{i}", lugar=f"Lugar{i}", articulos=str(5 + i)), CFG["gdelt"]) for i in range(30)]
    eventos, _ = R.procesar(cands, [], {**CFG, "max_eventos_publicados": 10}, T, GAZ, PAISES, CLS, TAX)
    assert len(eventos) == 10
    # Con 20 artículos o más la severidad sube a 4 (i = 15..29): los 10 publicados salen de ese grupo.
    assert {e["severidad"] for e in eventos} == {4}


def test_historial_y_poda(tmp_path):
    eventos, _ = _procesar(_candidatos())
    for e in eventos:
        e.setdefault("nivel_alerta", "RUTINA")
    carpeta = tmp_path / "historial"
    carpeta.mkdir()
    (carpeta / "2026-06-01.json").write_text('{"dia":"2026-06-01","total":0,"eventos":[]}')
    borrados = R.actualizar_historial(str(carpeta), eventos, T, 90)
    assert borrados == 1 and not (carpeta / "2026-06-01.json").exists()
    dia = json.loads((carpeta / "2026-10-08.json").read_text())
    assert dia["total"] == len(eventos)
    assert set(dia["eventos"][0]) == {"id", "fecha_utc", "titulo", "url", "fuente", "pais_iso3", "lat", "lon",
                                      "area_principal", "severidad", "nivel_alerta"}
    assert len(R.leer_historial(str(carpeta), (T - timedelta(days=30)).strftime("%Y-%m-%d"))) == len(eventos)


def test_proxima_corrida_minuto_17():
    assert R.proxima_corrida(datetime(2026, 10, 8, 12, 5, tzinfo=timezone.utc)).strftime("%H:%M") == "12:17"
    assert R.proxima_corrida(datetime(2026, 10, 8, 12, 20, tzinfo=timezone.utc)).strftime("%H:%M") == "13:17"


def test_seguridad_en_eua_no_marca_impacto_mexico():
    assert R.impacto_mexico("USA", "seguridad", [], "Shooting in Chicago", GAZ) is None
    assert R.impacto_mexico("USA", "geoeconomia", [], "New tariffs on steel", GAZ).startswith("Estados Unidos")


def test_feeds_deshabilitados_no_se_piden(monkeypatch):
    pedidos = []
    monkeypatch.setattr(F, "rss", lambda feed: pedidos.append(feed["id"]) or [])
    cfg = {**CFG, "gdelt": {**CFG["gdelt"], "habilitada": False}, "reliefweb": {"habilitada": False},
           "rss": [{"id": "a", "nombre": "A"}, {"id": "b", "nombre": "B", "habilitada": False}]}
    _, salud = R.recolectar(cfg, "")
    assert pedidos == ["a"] and [s["id"] for s in salud] == ["a"]
