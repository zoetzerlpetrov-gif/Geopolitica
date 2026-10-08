"""Reglas de clasificación de aeronaves y buques y privacidad de las instantáneas en movimiento."""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "vivos"))
import actualizar as v  # noqa: E402


def test_avion_sancionado_tiene_prioridad():
    assert v._subtipo_avion("AAL100", False, False, "EP-ABC", {"EPABC"}) == "sancionada"

def test_avion_en_tierra():
    assert v._subtipo_avion("AMX123", False, True, None, set()) == "en_tierra"

def test_avion_de_estado_por_indicativo():
    assert v._subtipo_avion("SAM44", True, False, None, set()) == "estado"

def test_avion_militar():
    assert v._subtipo_avion("RCH123", True, False, None, set()) == "militar"

def test_avion_carga_y_comercial():
    assert v._subtipo_avion("FDX1234", False, False, None, set()) == "carga"
    assert v._subtipo_avion("AMX0410", False, False, None, set()) == "civil_comercial"

def test_aviacion_general():
    assert v._subtipo_avion("XBABC", False, False, None, set()) == "aviacion_general"

def test_buque_por_codigo_ais():
    assert v._subtipo_buque(84, None, set()) == "tanqueros"
    assert v._subtipo_buque(70, None, set()) == "carga"
    assert v._subtipo_buque(35, None, set()) == "militares"
    assert v._subtipo_buque(None, None, set()) == "otros"

def test_buque_sancionado_por_imo():
    assert v._subtipo_buque(80, 9187629, {"9187629"}) == "sancionados"

def test_campos_de_aeronaves_sin_propietario():
    src = open(os.path.join(ROOT, "tools", "vivos", "actualizar.py"), encoding="utf-8").read()
    assert '"campos": ["hex", "indicativo", "lon", "lat", "alt_m", "rumbo", "vel_kmh", "subtipo", "pais", "edad_s"]' in src
    assert "ownOp" not in src and "owner" not in src.lower().replace("dueño", "")
