"""DENUE: solo establecimientos grandes, sin teléfono ni correo, dentro de México."""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "capas"))
import denue as D  # noqa: E402


def test_establecimientos_sin_datos_de_contacto():
    filas = [{"Id": "1", "Nombre": "PLANTA EJEMPLO", "Razon_social": "EJEMPLO SA DE CV", "Clase_actividad": "Fabricación de autopartes",
              "Ubicacion": "SALTILLO, Saltillo, COAHUILA DE ZARAGOZA", "Telefono": "8440000000", "Correo_e": "x@y.mx", "Sitio_internet": "WWW.EJEMPLO.MX",
              "Latitud": "25.42", "Longitud": "-101.0"},
             {"Id": "2", "Nombre": "FUERA", "Latitud": "40.0", "Longitud": "-3.7"},
             {"Id": "3", "Nombre": "", "Razon_social": "", "Latitud": "19", "Longitud": "-99"}]
    out = D.establecimientos(filas, "7")
    assert len(out) == 1
    e = out[0]
    assert e["st"] == "denue_251" and e["n"] == "Planta Ejemplo" and e["web"] == "www.ejemplo.mx"
    assert "Telefono" not in str(e) and "8440000000" not in str(e) and "x@y.mx" not in str(e)


def test_url_y_lectura():
    assert D.url("09", "6", "K", 1, 10).endswith("/09/0/0/0/0/0/0/0/0/0/1/10/0/6/K")
    assert D.leer("No autorizado. Utilice una clave válida.") == []
    assert D.leer('[{"Id": "1"}]') == [{"Id": "1"}]
