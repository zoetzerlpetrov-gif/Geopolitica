"""Pruebas de contrato de la Fase 1: taxonomía, capas fijas, datos de ejemplo y esquema.

Ejecutar:  python3 -m pytest -q
"""
import copy
import json
import os
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
from validate import validar  # noqa: E402


def load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return json.load(f)


TAX = load("config/taxonomy.json")
EVENTS = load("data/events.json")
AREAS = {a["id"]: a for a in TAX["areas"]}

# Requisito del usuario: exactamente estas 11 áreas, en este orden y con estos colores.
ESPERADO = [
    ("geografia", "Geografía y territorio", "#2E6F8E"),
    ("seguridad", "Seguridad y poder militar", "#A3392F"),
    ("geoeconomia", "Geoeconomía", "#7A6A2F"),
    ("energia", "Energía y recursos", "#C27C1E"),
    ("tecnologia", "Tecnología y ciberespacio", "#5B4A9E"),
    ("demografia", "Demografía y migración", "#2F7A4A"),
    ("clima", "Clima y medio ambiente", "#1F8A8A"),
    ("instituciones", "Instituciones y derecho internacional", "#4A6B8A"),
    ("identidad", "Identidad, ideología y narrativa", "#9E4A7A"),
    ("regional", "Geopolítica regional", "#556B2F"),
    ("riesgo", "Riesgo geopolítico aplicado", "#333F48"),
]


# ---------------- Taxonomía ----------------
def test_taxonomia_tiene_las_11_areas_exactas():
    obtenido = [(a["id"], a["nombre"], a["color"]) for a in TAX["areas"]]
    assert obtenido == ESPERADO
    assert [a["numero"] for a in TAX["areas"]] == list(range(1, 12))


@pytest.mark.parametrize("area", TAX["areas"], ids=lambda a: a["id"])
def test_area_completa(area):
    for campo in ("que_estudia", "pregunta_guia", "ejemplo", "ejemplo_mexico"):
        assert area[campo].strip(), f"{area['id']}: falta {campo}"
    assert len(area["palabras_clave"]["es"]) >= 8
    assert len(area["palabras_clave"]["en"]) >= 8
    assert area["subtemas"], "cada área necesita subtemas"
    for s in area["subtemas"]:
        assert s["palabras_clave"]["es"] and s["palabras_clave"]["en"], s["id"]


def test_ids_de_subtemas_unicos():
    ids = [s["id"] for a in TAX["areas"] for s in a["subtemas"]]
    assert len(ids) == len(set(ids))


def test_palabras_clave_sin_duplicados_ni_espacios():
    for a in TAX["areas"]:
        for lang in ("es", "en"):
            kws = a["palabras_clave"][lang]
            assert len(kws) == len(set(k.lower() for k in kws)), f"{a['id']}/{lang} duplicadas"
            assert all(k == k.strip() and k for k in kws)


def test_regiones_coinciden_con_subtemas_del_area_10_y_esquema():
    regiones = set(load("config/regions.json")["regiones"])
    assert regiones == {s["id"] for s in AREAS["regional"]["subtemas"]}
    enum = set(load("schema/event.schema.json")["$defs"]["region_id"]["enum"]) - {None}
    assert regiones == enum


def test_un_pais_en_una_sola_region():
    vistos = {}
    for rid, r in load("config/regions.json")["regiones"].items():
        for iso in r["paises"]:
            assert iso not in vistos, f"{iso} está en {vistos.get(iso)} y {rid}"
            vistos[iso] = rid


# ---------------- Capas fijas ----------------
def test_chokepoints_requeridos():
    ids = {c["id"] for c in load("config/chokepoints.json")["chokepoints"]}
    assert {"ormuz", "malaca", "suez", "panama", "bab_el_mandeb", "bosforo", "gibraltar", "taiwan"} <= ids


def test_paises_sin_lineas_que_crucen_el_mapa():
    fc = load("data/base/countries.geojson")
    for f in fc["features"]:
        g = f["geometry"]
        anillos = g["coordinates"] if g["type"] == "Polygon" else [r for p in g["coordinates"] for r in p]
        for r in anillos:
            assert all(abs(a[0] - b[0]) <= 180 for a, b in zip(r, r[1:])), f["properties"]["iso3"]


# ---------------- Eventos ----------------
def test_events_json_cumple_esquema_y_reglas():
    assert validar(EVENTS, TAX) == []


def test_cada_area_tiene_al_menos_un_evento_de_ejemplo():
    principales = {e["area_principal"] for e in EVENTS["eventos"]}
    assert principales == set(AREAS)


def test_paises_de_eventos_existen_en_gazetteer():
    gaz = load("config/gazetteer.json")["paises"]
    for e in EVENTS["eventos"]:
        if e["pais_iso3"]:
            assert e["pais_iso3"] in gaz, e["id"]


def test_caso_de_aceptacion_mar_rojo():
    """Caso de referencia del proyecto (prueba de aceptación)."""
    ev = next(e for e in EVENTS["eventos"] if e["id"] == "mar-rojo-huties-2023")
    assert ev["area_principal"] == "geografia"
    assert set(ev["areas_secundarias"]) == {"seguridad", "geoeconomia", "identidad"}
    assert "chokepoints" in ev["subtemas"]
    assert ev["impacto_mexico"] and "flete" in ev["impacto_mexico"].lower()
    assert len(ev["fuentes"]) >= 2, "debe demostrar la agrupación de varias fuentes"


# ---------------- El validador detecta errores (pruebas negativas) ----------------
def _con(mutar):
    d = copy.deepcopy(EVENTS)
    mutar(d["eventos"][0])
    return validar(d, TAX)


@pytest.mark.parametrize("nombre,mutar", [
    ("area inexistente", lambda e: e.update(area_principal="deportes")),
    ("mas de 3 secundarias", lambda e: e.update(areas_secundarias=["seguridad", "clima", "energia", "riesgo"])),
    ("principal repetida", lambda e: e.update(areas_secundarias=[e["area_principal"]])),
    ("severidad fuera de rango", lambda e: e.update(severidad=7)),
    ("confianza > 1", lambda e: e.update(confianza_clasificacion=1.5)),
    ("url no http", lambda e: e.update(url="javascript:alert(1)")),
    ("lat sin lon", lambda e: e.update(lon=None)),
    ("subtema ajeno", lambda e: e.update(subtemas=["remesas"]) if e["area_principal"] != "demografia" else e.update(subtemas=["chokepoints"])),
    ("campo extra", lambda e: e.update(texto_completo="...")),
    ("resumen demasiado largo", lambda e: e.update(resumen="x" * 401)),
    ("fecha sin Z", lambda e: e.update(fecha_utc="2024-01-01 10:00")),
])
def test_validador_rechaza(nombre, mutar):
    assert _con(mutar), f"el validador debió rechazar: {nombre}"
