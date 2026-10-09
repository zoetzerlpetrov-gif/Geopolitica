"""Lista de lugares para «Reconocer el lugar»: filtros y ciudad más cercana."""
import importlib.util
import os

# Se carga con otro nombre: tools/capas/construir.py ya ocupa «construir» en otras pruebas.
_spec = importlib.util.spec_from_file_location("monumentos_construir", os.path.join(os.path.dirname(__file__), "..", "tools", "monumentos", "construir.py"))
C = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(C)

CIUDADES = [["New York", "Nueva York", "USA", 40.752, -73.982, "principal", 19040000],
            ["Jersey City", "", "USA", 40.72, -74.06, "ciudad", 260000],
            ["Paris", "París", "FRA", 48.869, 2.331, "capital", 9904000]]


def test_ciudad_cercana_prefiere_la_grande_si_estan_juntas():
    assert C.ciudad_cercana(40.6892, -74.0444, CIUDADES) == ("Nueva York", "New York")
    assert C.ciudad_cercana(0, 0, CIUDADES) == ("", "")


def test_construir_quita_no_visuales_vacios_y_agrega_curados_sin_repetir():
    wd = [["Statue of Liberty", "Estatua de la Libertad", "USA", 40.6892, -74.0444, 158, "Q9202"],
          ["Way of Saint James", "Camino de Santiago", "ESP", 42.88, -8.54, 120, "Q41150"],
          ["", "", "SAU", 21.4, 39.8, 90, "Q1"],
          ["Taj Mahal", "Taj Mahal", "IND", 27.1751, 78.0421, 150, "Q9141"]]
    out = C.construir(wd, CIUDADES)
    nombres = [m[0] for m in out]
    assert "Way of Saint James" not in nombres and "" not in nombres
    assert nombres.count("Taj Mahal") == 1
    assert "Big Ben" in nombres
    assert out[0][7:] == ["Nueva York", "New York"]
    assert all(len(m) == 9 for m in out)
