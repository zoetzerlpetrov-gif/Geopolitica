"""Creadores de contenido: filas de Wikidata → top por plataforma y puntos por país (solo datos profesionales)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "creadores"))
import creadores as C  # noqa: E402


def fila(qid, nombre, seg, cuenta, fecha=""):
    f = {"p": {"value": f"http://www.wikidata.org/entity/{qid}"}, "pLabel": {"value": nombre}, "seg": {"value": str(seg)}, "u": {"value": cuenta}}
    if fecha:
        f["fecha"] = {"value": f"{fecha}T00:00:00Z"}
    return f


def test_mejores_toma_el_dato_mas_reciente_y_ordena():
    filas = [fila("Q1", "MrBeast", 421000000, "UCX6", "2025-01-01"), fila("Q1", "MrBeast", 393000000, "UCX6", "2024-06-01"),
             fila("Q2", "PewDiePie", 111000000, "UC-l", "2024-01-01"), fila("Q3", "Q3", 500000000, "UCzz"),  # sin etiqueta: se omite
             fila("Q4", "Like Nastya", "x", "UCJp"),  # número inválido
             fila("Q6", "Skrapz", 99999976554, "UCuZ", "2024-08-10")]  # error de captura: más de mil millones
    out = C.mejores(filas, "YouTube")
    assert [(r["nombre"], r["seguidores"], r["puesto"]) for r in out] == [("MrBeast", 421000000, 1), ("PewDiePie", 111000000, 2)]
    assert out[0]["url"] == "https://www.youtube.com/channel/UCX6" and out[0]["fecha"] == "2025-01-01"
    assert C.mejores(filas, "YouTube", top=1)[0]["qid"] == "Q1"


def test_dato_mas_reciente_gana_aunque_sea_menor():
    out = C.mejores([fila("Q1", "A", 90, "a", "2023-01-01"), fila("Q1", "A", 80, "a", "2025-01-01")], "TikTok")
    assert out[0]["seguidores"] == 80 and out[0]["url"] == "https://www.tiktok.com/@a"


def test_por_pais_agrupa_y_no_guarda_datos_personales():
    cuentas = C.mejores([fila("Q1", "MrBeast", 421000000, "UCX6", "2025-01-01")], "YouTube") + \
        C.mejores([fila("Q1", "MrBeast", 100000000, "mrbeast", "2025-01-01"), fila("Q5", "Kimberly Loaiza", 65000000, "kimberly.loaiza")], "TikTok")
    info = C.detalles([
        {"p": {"value": "http://www.wikidata.org/entity/Q1"}, "iso": {"value": "USA"}, "ocL": {"value": "youtuber"}},
        {"p": {"value": "http://www.wikidata.org/entity/Q5"}, "iso": {"value": "MEX"}, "ocL": {"value": "cantante"}},
        {"p": {"value": "http://www.wikidata.org/entity/Q5"}, "iso": {"value": "MEX"}, "ocL": {"value": "youtuber"}}])
    paises = {"USA": {"es": "Estados Unidos", "lat": 39.0, "lon": -98.0}, "MEX": {"es": "México", "lat": 23.0, "lon": -102.0}}
    feats, sin_pais = C.por_pais(cuentas, info, paises)
    assert sin_pais == 0 and {f["properties"]["iso3"] for f in feats} == {"USA", "MEX"}
    us = next(f for f in feats if f["properties"]["iso3"] == "USA")["properties"]
    mb = us["creadores"][0]
    assert [c["plataforma"] for c in mb["cuentas"]] == ["YouTube", "TikTok"]
    assert set(mb) == {"qid", "nombre", "cuentas", "ocupaciones", "otras_nacionalidades"}
    mx = next(f for f in feats if f["properties"]["iso3"] == "MEX")
    assert mx["geometry"]["coordinates"] == [-102.0, 23.0] and mx["properties"]["creadores"][0]["ocupaciones"] == ["cantante", "youtuber"]


def test_consultas_piden_solo_personas_y_campos_profesionales():
    q = C.consulta_cuentas("P2397", 1000)
    assert "wd:Q5" in q and "P569" not in q and "P551" not in q  # sin fecha de nacimiento ni residencia
    d = C.consulta_detalles(["Q1", "Q2"])
    assert "wd:Q1 wd:Q2" in d and "P27" in d and "P106" in d and "P569" not in d
