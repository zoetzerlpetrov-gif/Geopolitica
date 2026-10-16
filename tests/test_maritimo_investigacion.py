"""Global Fishing Watch (filtros de apagados y encuentros), conteo de tráfico marítimo y listas oficiales (SAT 69-B, FBI)."""
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "maritimo"))
sys.path.insert(0, os.path.join(ROOT, "tools", "investigacion"))
import gfw as G  # noqa: E402
import listas as Li  # noqa: E402
import trafico as T  # noqa: E402

DESDE = datetime(2026, 10, 1, tzinfo=timezone.utc)


def hueco(horas, intencional=True, tipo="fishing", fin="2026-10-10T08:00:00.000Z"):
    return {"start": "2026-10-09T00:00:00.000Z", "end": fin, "vessel": {"name": " LUCKY 7 ", "ssvid": "412000001", "flag": "CHN", "type": tipo},
            "gap": {"intentionalDisabling": intencional, "durationHours": horas, "distanceKm": 120.4, "impliedSpeedKnots": 2.04,
                    "offPosition": {"lat": -20.5, "lon": -80.25}, "onPosition": {"lat": -21.0, "lon": -79.9}}}


def test_apagados_filtra_por_intencion_duracion_tipo_y_fecha():
    entradas = [hueco(30), hueco(30, intencional=False), hueco(5), hueco(24 * 40), hueco(30, tipo="gear"), hueco(30, fin="2026-09-20T00:00:00Z")]
    f = G.apagados(entradas, DESDE)
    assert len(f) == 1
    p = f[0]["properties"]
    assert f[0]["geometry"]["coordinates"] == [-80.25, -20.5]
    assert p["nombre"] == "LUCKY 7" and p["mmsi"] == "412000001" and p["tipo"] == "pesca" and p["horas"] == 30
    assert p["lat_encendido"] == -21.0 and "id" not in p


def test_apagados_ordena_y_limita(monkeypatch):
    monkeypatch.setattr(G, "MAX_GUARDADOS", 2)
    f = G.apagados([hueco(20, fin=f"2026-10-0{d}T00:00:00Z") for d in (3, 7, 5)], DESDE)
    assert [x["properties"]["encendido_utc"][:10] for x in f] == ["2026-10-07", "2026-10-05"]


def encuentro(id_, tipo, riesgo=False):
    return {"id": id_, "start": "2026-10-08T00:00:00Z", "end": "2026-10-08T06:30:00Z", "position": {"lat": 5.0, "lon": 150.0},
            "vessel": {"name": "A", "ssvid": "1", "flag": "TWN", "type": "fishing"},
            "encounter": {"type": tipo, "potentialRisk": riesgo, "vessel": {"name": "B", "ssvid": "2", "flag": "PAN", "type": "carrier"}}}


def test_encuentros_un_evento_por_par_y_transbordo():
    f = G.encuentros([encuentro("abc.1", "carrier-fishing"), encuentro("abc.2", "carrier-fishing"), encuentro("x.1", "fishing-fishing"),
                      encuentro("y.1", "fishing-fishing", riesgo=True)], DESDE)
    assert len(f) == 2
    a = f[0]["properties"] if f[0]["properties"]["transbordo"] else f[1]["properties"]
    assert a["horas"] == 6.5 and a["barco_b"]["tipo"].startswith("carga refrigerada") and a["barco_a"]["bandera"] == "TWN"
    assert any(x["properties"]["riesgo"] for x in f)


def test_paginas_de_eventos(monkeypatch):
    llamadas = []

    def pedir(token, ds, d, h, offset):
        llamadas.append(offset)
        return {"entries": [{"n": offset}], "nextOffset": offset + 1 if offset < 2 else None, "total": 3}
    monkeypatch.setattr(G.time, "sleep", lambda s: None)
    assert len(G.eventos("t", "ds", "a", "b", pedir=pedir)) == 3 and llamadas == [0, 1, 2]


def test_trafico_cuenta_dentro_del_radio_y_guarda_serie():
    campos = ["lat", "lon", "vel_nudos", "subtipo"]
    rotterdam = [51.95, 4.05]
    barcos = [[51.96, 4.06, 0.2, "carga"], [51.90, 4.10, 10, "tanqueros"], [51.95, 4.05, None, ""], [53.0, 4.0, 0, "carga"]]
    lg = {"lat": rotterdam[0], "lon": rotterdam[1], "radio_km": 25}
    assert T.contar(barcos, campos, lg) == {"total": 3, "detenidos": 2, "carga": 1, "tanquero": 1}
    ahora = datetime(2026, 10, 16, 12, tzinfo=timezone.utc)
    snap = {"campos": campos, "b": barcos, "generado_utc": "2026-10-16T12:00:00Z"}
    fc = T.actualizar(snap, None, ahora)
    r = next(f["properties"] for f in fc["features"] if f["properties"]["id"] == "rotterdam")
    assert r["total"] == 3 and len(r["serie"]) == 1 and r["vs_promedio"] == 1.0
    # Misma hora: no agrega punto; hora siguiente: sí.
    assert len(next(f for f in T.actualizar(snap, fc, ahora)["features"] if f["properties"]["id"] == "rotterdam")["properties"]["serie"]) == 1
    snap2 = {**snap, "generado_utc": "2026-10-16T13:05:00Z"}
    assert len(next(f for f in T.actualizar(snap2, fc, ahora)["features"] if f["properties"]["id"] == "rotterdam")["properties"]["serie"]) == 2


CSV_SAT = (
    "Información actualizada al 31 de diciembre de 2025,,,,\n"
    "No,RFC,Nombre del Contribuyente,Situación del contribuyente,a,b,c,Publicación DOF presuntos,d,e,f,Publicación DOF desvirtuados,g,h,i,Publicación DOF definitivos,j,k,l,Publicación DOF sentencia favorable\n"
    "1,AAA010101AAA,EMPRESA  FANTASMA SA DE CV,Definitivo,,,,01/02/2020,,,,,,,,01/08/2020,,,,\n"
    "2,BBB0202022B1,OTRA SC,Presunto,,,,03/03/2025,,,,,,,,,,,,\n"
    "3,NO-ES-RFC,XX,Presunto,,,,,,,,,,,,,,,,\n")


def test_efos_de_lee_encabezado_y_filas():
    corte, filas = Li.efos_de(CSV_SAT)
    assert corte == "31 de diciembre de 2025"
    assert filas[0] == ["AAA010101AAA", "EMPRESA FANTASMA SA DE CV", "Definitivo", "01/02/2020", "", "01/08/2020", ""]
    assert len(filas) == 2


def test_fbi_de_guarda_solo_lo_minimo():
    items = [{"title": "JOHN  DOE", "url": "https://www.fbi.gov/wanted/x", "subjects": ["Violent Crime"], "poster_classification": "ten",
              "field_offices": ["miami"], "reward_text": "<p>Hasta $1,000,000</p>", "publication": "2024-01-02T00:00:00", "images": [{"large": "x.jpg"}],
              "scars_and_marks": "tatuaje", "hair": "negro"},
             {"title": "Sin enlace oficial", "url": "https://otro.sitio/x"}]
    f = Li.fbi_de(items)
    assert f == [{"nombre": "JOHN DOE", "temas": ["Violent Crime"], "categoria": "Los diez más buscados", "oficinas": ["miami"],
                  "recompensa": "Hasta $1,000,000", "publicado": "2024-01-02", "url": "https://www.fbi.gov/wanted/x"}]
