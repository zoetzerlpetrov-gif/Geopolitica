"""Pruebas de nivel_alerta, delta, índice de inestabilidad y correlación."""
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
from dimensiones import correlacionar, delta, distancia_km, indice_inestabilidad, nivel_alerta  # noqa: E402

AHORA = datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc)


def ev(i="e1", sev=3, area="seguridad", fuentes=1, mx=None, lat=0.0, lon=0.0, fecha="2026-10-08T10:00:00Z", pais="MEX"):
    return {"id": i, "severidad": sev, "area_principal": area, "fuentes": [{}] * fuentes, "impacto_mexico": mx,
            "lat": lat, "lon": lon, "fecha_utc": fecha, "pais_iso3": pais}


# ---- nivel_alerta
def test_flash_por_severidad_5():
    assert nivel_alerta(ev(sev=5, area="clima")) == "FLASH"

def test_flash_sev4_area_critica_con_3_fuentes():
    assert nivel_alerta(ev(sev=4, area="salud_nrbq", fuentes=3)) == "FLASH"

def test_sev4_area_critica_con_2_fuentes_es_prioridad():
    assert nivel_alerta(ev(sev=4, area="seguridad", fuentes=2)) == "PRIORIDAD"

def test_sev4_area_no_critica_es_prioridad():
    assert nivel_alerta(ev(sev=4, area="geoeconomia", fuentes=5)) == "PRIORIDAD"

def test_prioridad_sev2_con_impacto_mexico():
    assert nivel_alerta(ev(sev=2, mx="Afecta exportaciones")) == "PRIORIDAD"

def test_prioridad_por_escalamiento():
    assert nivel_alerta(ev(sev=1), delta="escala") == "PRIORIDAD"

def test_rutina():
    assert nivel_alerta(ev(sev=2)) == "RUTINA"


# ---- delta
def test_delta_nuevo():
    assert delta(ev(), None) == "nuevo"

def test_delta_escala_por_severidad():
    assert delta(ev(sev=4), ev(sev=3)) == "escala"

def test_delta_escala_por_fuentes():
    assert delta(ev(fuentes=4), ev(fuentes=2)) == "escala"

def test_delta_desescala():
    assert delta(ev(sev=2), ev(sev=3)) == "desescala"

def test_delta_sin_cambio():
    assert delta(ev(fuentes=2), ev(fuentes=1)) == "sin_cambio"


# ---- índice
def test_indice_rango_y_monotonia():
    uno = indice_inestabilidad([ev(sev=3)], AHORA)["MEX"]["indice"]
    muchos = indice_inestabilidad([ev(f"e{i}", sev=5) for i in range(10)], AHORA)["MEX"]["indice"]
    assert 0 <= uno < muchos <= 100

def test_indice_formula_documentada():
    # 1 evento de seguridad, severidad 5, de hoy: A = 25 → 100 × (1 − e^−1) = 63
    r = indice_inestabilidad([ev(sev=5, fecha="2026-10-08T12:00:00Z")], AHORA)["MEX"]
    assert r["A"] == 25.0 and r["indice"] == 63

def test_indice_vida_media_7_dias():
    hoy = indice_inestabilidad([ev(sev=5, fecha="2026-10-08T12:00:00Z")], AHORA)["MEX"]["A"]
    hace7 = indice_inestabilidad([ev(sev=5, fecha="2026-10-01T12:00:00Z")], AHORA)["MEX"]["A"]
    assert abs(hace7 - hoy / 2) < 0.01

def test_indice_ignora_eventos_viejos_y_sin_pais():
    assert indice_inestabilidad([ev(fecha="2026-08-01T00:00:00Z"), ev("x", pais=None)], AHORA) == {}


# ---- correlación
def test_distancia_cdmx_monterrey():
    assert 700 < distancia_km(19.43, -99.13, 25.67, -100.31) < 720

def test_correlaciona_areas_distintas_cercanas():
    a = ev("a", area="seguridad", lat=12.6, lon=43.3)
    b = ev("b", area="geoeconomia", lat=13.0, lon=44.0, fecha="2026-10-07T10:00:00Z")
    assert correlacionar([a, b]) == {"a": ["b"], "b": ["a"]}

def test_no_correlaciona_misma_area_lejos_o_fuera_de_ventana():
    a = ev("a", area="seguridad", lat=12.6, lon=43.3)
    misma = ev("m", area="seguridad", lat=12.7, lon=43.3)
    lejos = ev("l", area="clima", lat=40.0, lon=-3.7)
    viejo = ev("v", area="clima", lat=12.7, lon=43.3, fecha="2026-10-01T00:00:00Z")
    assert correlacionar([a, misma, lejos, viejo]) == {}
