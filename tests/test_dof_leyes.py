"""DOF y leyes federales (tools/investigacion/dof.py y leyes.py), sin red; fragmentos copiados de las páginas oficiales."""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "investigacion"))
import dof as D  # noqa: E402
import leyes as L  # noqa: E402


def test_tipos():
    assert D.tipo_de("Decreto por el que se reforman y adicionan los artículos 82, 116 y 122 de la Constitución Política") == "Ley o reforma legal"
    assert D.tipo_de("DECRETO por el que se expide la Ley Federal de Cine y el Audiovisual.") == "Ley o reforma legal"
    assert D.tipo_de("Decreto por el que se expropia por causa de utilidad pública la superficie de 04-70-78 hectáreas") == "Decreto"
    assert D.tipo_de("Acuerdo por el que se expide el Código de Conducta de las personas servidoras públicas") == "Acuerdo"
    assert D.tipo_de("Aviso de consulta pública del proyecto de cancelación de la Norma Oficial Mexicana NOM-077-SSA1-1994") == "Norma Oficial Mexicana"
    assert D.tipo_de("Tipo de cambio para solventar obligaciones denominadas en moneda extranjera") == "Indicador financiero"
    assert D.tipo_de("Sentencia dictada por el Tribunal Pleno de la Suprema Corte en la Controversia Constitucional 137/2026.") == "Sentencia o resolución judicial"
    assert D.tipo_de("Información relativa a los saldos del Fondo para la administración de los recursos provenientes de sentencias") == "Otro"


def test_sumario_xml():
    xml = """<rss><channel><item> <title>PODER EJECUTIVO SECRETARIA DE SALUD</title> <link><![CDATA[https://dof.gob.mx/nota_detalle.php?codigo=5801697&fecha=21/10/2026]]></link>
      <description><![CDATA[Aviso de consulta p&uacute;blica del proyecto de cancelaci&oacute;n de la Norma Oficial Mexicana NOM-077-SSA1-1994]]></description></item></channel></rss>"""
    r = D.leer_sumario(xml)
    assert list(r) == ["2026-10-21"]
    cod, tipo, dep, texto = r["2026-10-21"][0]
    assert cod == "5801697" and tipo == "Norma Oficial Mexicana" and dep == "PODER EJECUTIVO SECRETARIA DE SALUD" and "cancelación" in texto


def test_pagina_de_un_dia_con_dependencia():
    html = """<td bgcolor="#B2B2B2" colspan="3" class="txt_blanco2">&nbsp;PODER EJECUTIVO</td></tr><tr>
      <td colspan="3" class="subtitle_azul"><!-- <img> -->&nbsp;SECRETARIA DE RELACIONES EXTERIORES<!-- </img> --> <a target="_blank" href="/nota_to_doc.php?codnota=1">x</a></td>
      <td><a href="/nota_detalle.php?codigo=5801537&amp;fecha=20/10/2026" class="enlaces">
        Acuerdo por el que se da a conocer la Convocatoria al Concurso P&uacute;blico General de Ingreso 2026.</a></td>
      <td colspan="3" class="subtitle_azul">&nbsp;SECRETARIA DE HACIENDA Y CREDITO PUBLICO</td>
      <td><a href="/nota_detalle.php?codigo=5801538&amp;fecha=20/10/2026" class="enlaces">Decreto por el que se modifica la Tarifa de la Ley de los Impuestos Generales</a></td>"""
    r = {c: (t, d) for c, t, d, _ in D.leer_dia(html)}
    assert r["5801537"] == ("Acuerdo", "PODER EJECUTIVO SECRETARIA DE RELACIONES EXTERIORES")
    assert r["5801538"][1] == "PODER EJECUTIVO SECRETARIA DE HACIENDA Y CREDITO PUBLICO"


def test_faltantes_y_resumen():
    dias = {"2026-10-20": [["1", "Decreto", "", "Decreto x"]], "2026-10-19": []}
    f = D.faltantes(dias, date(2026, 10, 21), desde=date(2026, 10, 13), n=10)
    assert f == [date(2026, 10, 16), date(2026, 10, 15), date(2026, 10, 14), date(2026, 10, 13)]  # sin fin de semana ni días ya leídos
    r = D.resumen({"2026-10-20": [["1", "Decreto", "SEGOB", "Decreto x"], ["2", "Acuerdo", "", "Acuerdo y"]]}, date(2026, 10, 21))
    assert r["por_mes"] == {"2026-10": {"Decreto": 1, "Acuerdo": 1}} and len(r["leyes"]) == 1 and len(r["recientes"]) == 2
    assert r["leyes"][0]["u"] == "https://dof.gob.mx/nota_detalle.php?codigo=1&fecha=20/10/2026"


def test_indice_de_leyes():
    html = """<tr><td>013</td><td><a href="ref/ladua.htm"><font>LEY Aduanera</font></a><p>DOF 15/12/1995</p></td><td>DOF 27/12/2025</td>
      <td><a target="_blank" href="pdf/LAdua.pdf">pdf</a></td></tr>
      <tr><td>014</td><td><a href="ref/lfca.htm">LEY Federal de Cine y el Audiovisual</a> DOF 22/05/2026</td><td>Sin reforma</td><td><a href="pdf/LFCA.pdf">pdf</a></td></tr>
      <tr><td>encabezado sin enlace</td></tr>"""
    leyes = L.leer(html)
    assert leyes[0] == {"n": "LEY Aduanera", "ref": L.BASE + "ref/ladua.htm", "pdf": L.BASE + "pdf/LAdua.pdf", "pub": "1995-12-15", "ult": "2025-12-27"}
    assert leyes[1]["ult"] is None and len(leyes) == 2
    assert L.por_anio(leyes) == {"2025": 1}
