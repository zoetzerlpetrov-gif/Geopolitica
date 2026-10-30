"""Precios en México (tools/economia/precios_mx.py): lectores sin red."""
import os
import sys
from datetime import date

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "economia"))
import precios_mx as M  # noqa: E402

SELECT = '''<select name="ddlProducto" id="ddlProducto"><option value="-1">Todos</option><option value="183">Cebolla Bola - Primera</option>
<option value="301">Lim&#243;n con semilla # 4 - Primera</option><option value="520">Jitomate Saladette - Primera</option></select>'''
RES = '''<table><tr><td>Fecha</td><td>Presentación</td></tr>
<tr><td>01/10/2026</td><td>Kilogramo</td><td>Puebla</td><td>18.00</td><td>22.00</td><td>20.00</td><td></td></tr>
<tr><td>01/10/2026</td><td>Kilogramo</td><td>Guanajuato</td><td>16.00</td><td>20.00</td><td>18.00</td><td></td></tr>
<tr><td>15/10/2026</td><td>Kilogramo</td><td>Puebla</td><td>20.00</td><td>26.00</td><td>24.00</td><td>&nbsp;</td></tr>
<tr><td>02/11/2026</td><td>Kilogramo</td><td>Puebla</td><td>25.00</td><td>30.00</td><td>0</td><td></td></tr></table>'''


def test_lista_y_eleccion_de_productos():
    op = M.opciones_producto(SELECT)
    assert ("301", "Limón con semilla # 4 - Primera") in op
    assert M.elegir(op, r"^Lim(?:ó|&#243;|o)n con semilla")[0] == "301"
    assert M.elegir(op, r"^Papa Alpha")[0] is None


def test_filas_y_promedio_mensual():
    filas = M.filas_sniim(RES)
    assert filas == [("2026-10-01", 20.0), ("2026-10-01", 18.0), ("2026-10-15", 24.0), ("2026-11-02", 30.0)], "si el frecuente es 0 usa el máximo"
    assert M.mensual_promedio(filas) == [("2026-10-01", 21.5), ("2026-11-01", 30.0)], "promedio por día y luego por mes"


def test_historia_completa_solo_la_primera_vez():
    pedidas = []
    def bajar(url, **k):
        pedidas.append(url)
        return RES.encode()
    M.PAUSA = 0
    M.ESPERAS = (0, 0)
    M.serie_sniim("C.aspx", "R.aspx", "183", [], date(2026, 10, 30), bajar)
    assert len(pedidas) == 2026 - M.DESDE + 1
    pedidas.clear()
    out = M.serie_sniim("C.aspx", "R.aspx", "183", [("2015-01-01", 9.0)], date(2026, 10, 30), bajar)
    assert len(pedidas) == 1 and "fechaInicio=15%2F09%2F2026" in pedidas[0] and out[0] == ("2015-01-01", 9.0)


def test_promedio_de_gasolina():
    xml = b'<places><place place_id="1"><gas_price type="regular">22.95</gas_price><gas_price type="premium">27.9</gas_price></place>' \
          b'<place place_id="2"><gas_price type="regular">24.55</gas_price><gas_price type="diesel">0</gas_price></place></places>'
    assert M.promedios_cre(xml) == {"regular": (23.75, 2), "premium": (27.9, 1)}


def test_genericos_en_los_dos_formatos():
    a = "Periodo,Tortilla de maíz,Cerveza\n2026/07,150.1,140.2\n2026/08,151.0,141.0\n2026/09,152.3,141.5\n"
    assert M.leer_genericos(a)["Tortilla de maíz"] == [("2026-07-01", 150.1), ("2026-08-01", 151.0), ("2026-09-01", 152.3)]
    b = "Genérico,Jul 2026,Ago 2026,Sep 2026\nLeche pasteurizada,120,121,122.5\n"
    assert M.leer_genericos(b)["Leche pasteurizada"][-1] == ("2026-09-01", 122.5)


def test_si_una_fuente_falla_se_conserva_lo_anterior():
    def bajar(url, **k):
        raise TimeoutError("sin respuesta")
    previo = {"series": [{"id": "cebolla_bola", "puntos": [["2026-09-01", 20.0]]}, {"id": "gasolina_regular", "puntos": [["2026-10-29", 23.5]]}]}
    res = M.construir(previo, bajar=bajar, hoy=date(2026, 10, 30), carpeta_genericos="/nonexistent")
    por = {s["id"]: s for s in res["series"]}
    assert por["cebolla_bola"]["puntos"] == [["2026-09-01", 20.0]] and por["cebolla_bola"]["error"]
    assert por["gasolina_regular"]["puntos"] == [["2026-10-29", 23.5]]
    assert any("CRE" in e for e in res["errores"])


def test_reintenta_5xx_y_no_4xx():
    import urllib.error
    llamadas = []

    def falla(code):
        def b(url):
            llamadas.append(url)
            if len(llamadas) < 3:
                raise urllib.error.HTTPError(url, code, "x", {}, None)
            return b"ok"
        return b
    assert M.con_reintentos(falla(503), esperas=(0, 0, 0))("u") == b"ok" and len(llamadas) == 3
    llamadas.clear()
    try:
        M.con_reintentos(falla(404), esperas=(0, 0, 0))("u")
        assert False
    except urllib.error.HTTPError:
        assert len(llamadas) == 1
