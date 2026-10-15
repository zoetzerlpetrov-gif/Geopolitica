"""Apagones y cortes de agua desde GDELT GKG: filtro por titular, lugar del titular y agrupación."""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "clima"))
import cortes as C  # noqa: E402


def fila(titulo, locs="1#Mexico#MX#MX##23#-102#MX#30;4#Monterrey, Nuevo Leon, Mexico#MX#MX19##25.67#-100.31#-1#60"):
    f = [""] * 27
    f[1], f[3], f[4], f[10] = "20261014180000", "milenio.com", "https://www.milenio.com/apagon", locs
    f[26] = f"<PAGE_TITLE>{titulo}</PAGE_TITLE>"
    return f


def test_tipo_por_titular_y_falsos_positivos():
    assert C.tipo_de_titulo("Apagón deja sin luz a 200 mil usuarios en Monterrey") == "LUZ"
    assert C.tipo_de_titulo("Massive power outage leaves millions without electricity in Chile") == "LUZ"
    assert C.tipo_de_titulo("Corte de agua en 12 alcaldías de la CDMX por mantenimiento del Cutzamala") == "AGUA"
    assert C.tipo_de_titulo("Sin luz y sin agua: colonias de Acapulco tras el huracán") == "LUZ Y AGUA"
    assert C.tipo_de_titulo("Eskom announces stage 4 load shedding") == "LUZ"
    for no in ("Denuncian apagón informativo en medios estatales", "Call of Duty Black Ops 7 blackout mode returns", "Media blackout on the talks",
               "La economía crece 2 %", "Blackout curtains: the best of 2026"):
        assert C.tipo_de_titulo(no) is None, no


def test_ubica_por_el_lugar_del_titular_y_marca_tamano_y_programado():
    ft = C.fila_a_feature(fila("Apagón deja sin luz a 200 mil usuarios en Monterrey"), "ingles")
    p = ft["properties"]
    assert ft["geometry"]["coordinates"] == [-100.31, 25.67]
    assert (p["kind"], p["state"], p["severe"], p["programado"]) == ("LUZ", "Monterrey, Nuevo Leon, Mexico", True, False)
    p2 = C.fila_a_feature(fila("Habrá corte de agua programado en Monterrey el jueves"), "ingles")["properties"]
    assert (p2["kind"], p2["programado"], p2["severe"]) == ("AGUA", True, False)
    assert C.fila_a_feature(fila("Apagón en una ciudad sin nombre", locs=""), "ingles") is None


def test_agrupa_notas_del_mismo_corte():
    a = C.fila_a_feature(fila("Apagón deja sin luz a 200 mil usuarios en Monterrey"), "ingles")
    b = C.fila_a_feature(fila("Monterrey: CFE restablece la luz tras apagón"), "ingles")
    b["properties"]["url"] = "https://otro.mx/nota"
    g = C.T.agrupar([a, b], radio_km=150, horas=48, tipo_de=C.tipo_grupo)
    assert len(g) == 1 and g[0]["properties"]["notas"] == 2 and g[0]["properties"]["kind"] == "LUZ"
    assert C.tipo_grupo([{"properties": {"kind": "LUZ"}}, {"properties": {"kind": "AGUA"}}]) == "LUZ Y AGUA"
