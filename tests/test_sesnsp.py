"""Cifras oficiales de robos (tools/crimen/sesnsp.py), sin red."""
import csv
import io
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "crimen"))
import sesnsp as S  # noqa: E402

CSV = """Año,Clave_Ent,Entidad,Bien jurídico afectado,Tipo de delito,Subtipo de delito,Modalidad,Enero,Febrero,Marzo,Abril,Mayo,Junio,Julio,Agosto,Septiembre,Octubre,Noviembre,Diciembre
2026,11,Guanajuato,El patrimonio,Robo,Robo a transportista,Con violencia,10,12,9,8,7,6,5,4,3,0,0,0
2026,11,Guanajuato,El patrimonio,Robo,Robo a transportista,Sin violencia,1,1,1,1,1,1,1,1,1,0,0,0
2026,15,México,El patrimonio,Robo,Robo en transporte público colectivo,Con violencia,50,40,30,20,10,5,5,5,5,0,0,0
2026,15,México,La vida y la Integridad corporal,Homicidio,Homicidio doloso,Con arma de fuego,9,9,9,9,9,9,9,9,9,0,0,0
"""


def test_resumen_por_estado_y_nacional():
    r = S.resumir(csv.DictReader(io.StringIO(CSV)), S.meses_publicados("Enero - septiembre 2026 (Fuero común - Delitos). Incidencia delictiva estatal"))
    assert r["meses"][-1] == "Septiembre" and len(r["meses"]) == 9
    assert r["por_estado"]["Guanajuato"]["transportista"][0] == 11
    assert sum(r["nacional"]["transporte_publico"]) == 170
    assert "homicidio" not in str(r).lower()


def test_enlace_estatal():
    html = ('<a href="https://x.sharepoint.com/:u:/g/a?e=1">Enero - septiembre&nbsp;2026 (Fuero com&uacute;n - Delitos). Incidencia delictiva estatal</a>'
            '<a href="https://x.sharepoint.com/:u:/g/b?e=2">Enero - septiembre 2026 (Fuero común - Delitos). Incidencia delictiva municipal</a>')
    url, nombre = S.enlace_estatal(html)
    assert url.endswith("a?e=1") and "septiembre" in nombre.lower()
    assert S.meses_publicados(nombre) == 9
