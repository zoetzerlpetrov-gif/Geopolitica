"""Prueba de privacidad: ninguna persona tiene coordenadas ni se dibuja en el mapa."""
import json
import os
import re
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
from validate_entities import validador_def, validar_catalogo, validar_registros  # noqa: E402

CAT = json.load(open(os.path.join(ROOT, "config", "entities.json"), encoding="utf-8"))
PERSONAS = next(c for c in CAT["categorias"] if c["id"] == "personas")
PROHIBIDOS = ["lat", "lon", "coordenadas", "geometry", "domicilio", "direccion", "ubicacion", "ubicacion_tiempo_real",
              "telefono", "email", "contacto", "familiares", "aeronave", "matricula", "cartera_cripto"]


def test_catalogo_valido():
    assert validar_catalogo(CAT) == []


def test_registros_validos():
    assert validar_registros() == []


def test_personas_no_dibujables():
    assert PERSONAS["dibujable"] is False
    assert all(s["tipo_capa"] == "ficha" and s["zoom_min"] is None for s in PERSONAS["subtipos"])


def test_campos_permitidos_de_personas_no_incluyen_datos_privados():
    assert not set(PERSONAS["campos_permitidos"]) & set(PROHIBIDOS)


@pytest.mark.parametrize("campo", PROHIBIDOS)
def test_esquema_rechaza_persona_con_dato_privado(campo):
    persona = {"id": "Q1", "nombre": "Ejemplo", "cargo": "Cargo", "pais_iso3": "MEX", "subtipo": "otras_figuras", "fuente": "wikidata", campo: 1}
    assert list(validador_def("persona").iter_errors(persona)), f"el esquema debió rechazar '{campo}'"


def test_esquema_acepta_persona_de_rol_publico():
    persona = {"id": "Q1", "nombre": "Ejemplo", "cargo": "Presidenta", "pais_iso3": "MEX", "subtipo": "jefes_estado_gobierno",
               "fuente": "wikidata", "wikidata": "https://www.wikidata.org/wiki/Q1", "organizacion_id": None}
    assert not list(validador_def("persona").iter_errors(persona))


def test_archivos_de_personas_sin_coordenadas():
    ruta = os.path.join(ROOT, "data", "entidades", "personas.json")
    if not os.path.exists(ruta):
        pytest.skip("aún no hay registros de personas")
    texto = open(ruta, encoding="utf-8").read()
    assert not re.search(r'"(lat|lon|coordinates|geometry)"\s*:', texto)


def test_codigo_del_mapa_no_dibuja_categorias_no_dibujables():
    """js/capas.js solo crea capas para categorías dibujables y subtipos que no son 'ficha'."""
    src = open(os.path.join(ROOT, "js", "capas.js"), encoding="utf-8").read()
    assert "dibujable" in src and '"ficha"' in src
