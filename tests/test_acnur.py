"""Desplazamiento forzado (ACNUR): registros de la API → puntos por país de origen y de acogida."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "humanitario"))
import acnur as A  # noqa: E402

PAISES = {"AFG": {"es": "Afganistán", "lat": 33.9, "lon": 67.7}, "MEX": {"es": "México", "lat": 23.0, "lon": -102.0},
          "TUR": {"es": "Turquía", "lat": 39.0, "lon": 35.0}}


def test_numeros_de_texto():
    assert A.num("-") == 0 and A.num("0") == 0 and A.num(5766586) == 5766586 and A.num("12.0") == 12 and A.num(None) == 0


def test_origen_suma_y_omite_pequenos_o_desconocidos():
    filas = [{"coo_iso": "AFG", "refugees": 5766586, "asylum_seekers": 384732, "idps": 3199710, "oip": "-", "returned_refugees": 364443, "returned_idps": 22687},
             {"coo_iso": "MEX", "refugees": 300, "asylum_seekers": 200, "idps": "0", "oip": "-"},  # menos de 1000
             {"coo_iso": "XXX", "refugees": 99999}]
    out = A.por_origen(filas, PAISES, 2025)
    assert len(out) == 1
    p = out[0]["properties"]
    assert p["total"] == 5766586 + 384732 + 3199710 and p["retornados"] == 364443 + 22687 and p["anio"] == 2025
    assert out[0]["geometry"]["coordinates"] == [67.7, 33.9]


def test_acogida_ordena_de_mayor_a_menor():
    filas = [{"coa_iso": "MEX", "refugees": 120000, "asylum_seekers": 250000, "oip": "0", "stateless": "13"},
             {"coa_iso": "TUR", "refugees": 2900000, "asylum_seekers": 200000, "oip": "-", "stateless": "0"}]
    out = A.por_acogida(filas, PAISES, 2025)
    assert [f["properties"]["iso3"] for f in out] == ["TUR", "MEX"] and out[1]["properties"]["apatridas"] == 13


def test_leer_recorre_todas_las_paginas(monkeypatch):
    monkeypatch.setattr(A.time, "sleep", lambda s: None)
    vistas = []

    def pedir(u):
        vistas.append(u)
        pagina = int(u.split("page=")[1].split("&")[0])
        return {"maxPages": 3, "items": [{"n": pagina}]}
    assert [x["n"] for x in A.leer(2025, "coo", pedir)] == [1, 2, 3] and "coo_all=true" in vistas[0]
