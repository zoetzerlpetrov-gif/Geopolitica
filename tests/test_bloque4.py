"""Fenómenos anómalos (TrackAlien, NUFORC, catálogo) y bienes raíces (BIS, SHF, InmuebleWarRoom), sin red."""
import io
import json
import os
import sys
import zipfile
from datetime import datetime, timezone

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "anomalias"))
sys.path.insert(0, os.path.join(ROOT, "tools", "capas"))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import anomalias as A  # noqa: E402
import construir as C  # noqa: E402
import inmuebles as I  # noqa: E402

HOY = datetime(2026, 10, 14, tzinfo=timezone.utc)


def _ta(titulo, fuentes, fecha="2026-10-01", cred="BAJA (señal noticiosa)", tipo="ufo"):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [-99.1, 19.4]},
            "properties": {"id": titulo[:6], "type": tipo, "date": fecha, "title": titulo, "description": "texto de la nota que no se copia",
                           "credibility": cred, "country": "MX", "sources": fuentes}}


def test_trackalien_recientes_filtra_ruido_y_exige_enlace():
    fc = {"features": [
        _ta("Captan OVNI sobrevolando la Ciudad de México - Récord", "Récord|https://news.google.com/a"),
        _ta("Ситуация в аэропортах Москвы: введены ограничения", "ura.news|GDELT Global Knowledge Graph"),  # sin enlace ni tema
        _ta("Hallan cuerpo no identificado en un canal", "Diario|https://example.com/b"),                   # nota roja, no es el tema
        _ta("Ballenas: temporada de avistamiento en Baja California", "Diario|https://example.com/c"),
        _ta("Biden habla de illegal aliens en la frontera", "Diario|https://example.com/d"),
        _ta("The Vault Files: Tic-Tac", "The Black Vault|https://www.theblackvault.com/x"),                 # feed dedicado: pasa
        _ta("Captan OVNI en 2019", "Diario|https://example.com/e", fecha="2019-05-01"),                     # más de 12 meses: archivo
    ]}
    r = A.de_trackalien(fc, True, HOY)
    assert [f["properties"]["titulo"] for f in r] == ["Captan OVNI sobrevolando la Ciudad de México - Récord", "The Vault Files: Tic-Tac", "Captan OVNI en 2019"]
    assert r[2]["properties"]["capa"] == "anom_archivo"
    p = r[0]["properties"]
    assert p["capa"] == "anom_recientes" and p["url"] == "https://news.google.com/a" and p["fuente"] == "Récord"
    assert p["resumen"] == ""  # nunca se guarda el texto de la nota


def test_trackalien_historicos_sin_nuforc_y_con_nivel():
    fc = {"features": [_ta("Roswell", "Roswell Daily Record", "1947-07-08", "HISTÓRICO / VERIFICADO"),
                       _ta("Avistamiento NUFORC: Disk en x", "NUFORC — x|nuforc.org", "1966-10-10", "MEDIA (reporte civil NUFORC)"),
                       _ta("Campeche", "SEDENA", "2004-03-05", "OFICIAL CONFIRMADO — SEDENA")]}
    r = A.de_trackalien(fc, False, HOY)
    assert [(f["properties"]["titulo"], f["properties"]["nivel"]) for f in r] == [("Roswell", "oficial"), ("Campeche", "oficial")]


def test_tipo_de_fenomeno_como_trackalien():
    # El tipo de origen se respeta si es específico; «ufo» genérico se afina con el título.
    assert A.tipo_por_texto("Luces extrañas en el cielo de Monterrey", "ufo") == "lights_sky"
    assert A.tipo_por_texto("Captan cilindro volador cerca del volcán Popocatépetl") == "volcano"
    assert A.tipo_por_texto("Objeto sumergido frente a Veracruz", "ufo") == "uso"
    assert A.tipo_por_texto("Apagón tras avistamiento en Puebla", "ufo") == "em"
    assert A.tipo_por_texto("Crop circle appears in Wiltshire", "ufo") == "crop"
    assert A.tipo_por_texto("Captan OVNI sobrevolando la CDMX", "ufo") == "ufo"
    assert A.tipo_por_texto("Luces en el cielo", "contact") == "contact"
    # Las notas agrupadas por país conservan los tipos que contienen.
    fs = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [-102, 23]}, "properties": {
        "titulo": t, "tipo": tipo, "fecha": "2026-10-0" + str(i), "precision": "país", "lugar": "México", "url": "https://x/" + str(i), "fuente": "Medio"}}
        for i, (t, tipo) in enumerate((("Luces extrañas", "lights_sky"), ("OVNI visto", "ufo"), ("Otro OVNI", "ufo")), 1)]
    g = A.agrupar_por_pais(fs)
    assert len(g) == 1 and g[0]["properties"]["tipos"] == ["lights_sky", "ufo"]


def test_archivo_de_notas_no_pierde_lo_que_trackalien_deja_de_publicar():
    def nota(i, fecha):
        return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [0, 0]},
                "properties": {"id": f"ta:{i}", "titulo": f"n{i}", "fecha": fecha, "capa": "anom_recientes"}}
    previas = [nota(1, "2026-01-01"), nota(2, "2025-01-01")]
    unidas = A.unir_archivo(previas, [nota(3, "2026-10-01"), nota(1, "2026-01-01")], HOY)
    assert [f["properties"]["id"] for f in unidas] == ["ta:3", "ta:1", "ta:2"]  # nada se pierde, sin repetidos
    assert unidas[2]["properties"]["capa"] == "anom_archivo"  # más de un año
    assert len(A.unir_archivo(unidas, [], HOY, maximo=2)) == 2


def test_densidad_nuforc_solo_conteos_y_sin_celdas_pequenas():
    filas = ["10/10/1999 20:30,seattle,wa,us,light,60,1 min,\"texto del testigo\",1/1/2000,47.6,-122.3"] * 4
    filas += ["10/10/2001 20:30,seattle,wa,us,disk,60,1 min,\"otro texto\",1/1/2002,47.61,-122.33"]
    filas += ["10/10/2001 20:30,aislado,tx,us,disk,60,1 min,\"casa de alguien\",1/1/2002,30.1,-100.2"]  # 1 reporte: no se publica
    r = A.densidad_nuforc("\n".join(filas))
    assert len(r) == 1
    p = r[0]["properties"]
    assert p["n"] == 5 and p["desde"] == 1999 and p["hasta"] == 2001 and "luz (4)" in p["formas"]
    assert "texto" not in json.dumps(p) and "seattle" not in json.dumps(p).lower()


def test_catalogo_de_anomalias_completo():
    cat = json.load(open(os.path.join(ROOT, "config", "anomalias.json"), encoding="utf-8"))
    ids = [e["id"] for e in cat["entradas"]]
    assert len(ids) == len(set(ids))
    for e in cat["entradas"]:
        assert e["nivel"] in cat["niveles"], e["id"]
        assert e["tipo"] in {"orbe", "objeto", "cultivo", "lugar", "triangulo", "oficina"}, e["id"]
        assert e["url"].startswith("https://") and e["nota"] and e["fuente"], e["id"]
        assert -180 <= e["lon"] <= 180 and -90 <= e["lat"] <= 90
    assert {"esfera_buga", "milk_hill", "hessdalen", "zona_silencio", "skinwalker", "geipan"} <= set(ids)
    fs = A.de_catalogo(cat)
    assert {f["properties"]["capa"] for f in fs} == {"anom_orbe", "anom_objeto", "anom_cultivo", "anom_lugar", "anom_triangulo", "anom_oficina"}


# ---------- Bienes raíces ----------

BIS_SPP_CSV = """FREQ,REF_AREA,VALUE,UNIT_MEASURE,UNIT_MULT,TIME_PERIOD,OBS_VALUE
Q,MX,N,771,0,2026-Q1,7.5
Q,MX,N,771,0,2026-Q2,8.1
Q,MX,R,771,0,2026-Q2,3.9
Q,FR,N,771,0,2026-Q2,-2.8
Q,XM,N,771,0,2026-Q2,1.0
"""
BIS_CPP_CSV = """FREQ,REF_AREA,COVERED_AREA,RE_TYPE,RE_VINTAGE,COMPILING_ORG,PRICED_UNIT,ADJUST_CODED,TITLE_GRP,UNIT_MEASURE,TIME_PERIOD,OBS_VALUE
Q,ES,0,B,0,0,6,0,"Spain - Commercial property price index, offices, whole country",764,2025-Q2,100
Q,ES,0,B,0,0,6,0,"Spain - Commercial property price index, offices, whole country",764,2026-Q2,94
Q,ES,0,G,0,0,6,0,"Spain - Commercial property price index, industrial properties, whole country",764,2025-Q2,100
Q,ES,0,G,0,0,6,0,"Spain - Commercial property price index, industrial properties, whole country",764,2026-Q2,108
Q,ES,4,A,0,0,6,0,"Spain - Commercial property price index, all properties, major cities, prime market",764,2025-Q2,100
Q,ES,4,A,0,0,6,0,"Spain - Commercial property price index, all properties, major cities, prime market",764,2026-Q2,103
Q,CH,0,O,0,2,6,0,"Switzerland - Commercial property price index, residential investment properties",862,2026-Q2,200
"""
BIS_DPP_CSV = """FREQ,REF_AREA,COVERED_AREA,RE_TYPE,RE_VINTAGE,COMPILING_ORG,PRICED_UNIT,ADJUST_CODED,TITLE_GRP,UNIT_MEASURE,TIME_PERIOD,OBS_VALUE
Q,CL,0,2,0,0,6,0,"Chile - Real residential property price index, all houses, whole country",596,2025-Q1,100
Q,CL,0,2,0,0,6,0,"Chile - Real residential property price index, all houses, whole country",596,2026-Q1,102
Q,CL,0,8,0,0,6,0,"Chile - Real residential property price index, all flats, whole country",596,2025-Q1,100
Q,CL,0,8,0,0,6,0,"Chile - Real residential property price index, all flats, whole country",596,2026-Q1,99.5
M,JP,3,L,1,4,1,0,"Japan - Residential land price index, Tokyo metropolitan area, whole country",853,2025-06,100
M,JP,3,L,1,4,1,0,"Japan - Residential land price index, Tokyo metropolitan area, whole country",853,2026-06,110
"""
ISO = {"MX": "MEX", "FR": "FRA", "ES": "ESP", "CH": "CHE", "CL": "CHL", "JP": "JPN"}


def test_periodo_anterior_y_cambio_anual():
    assert I.periodo_anterior("2026-Q2") == "2025-Q2" and I.periodo_anterior("2026-05") == "2025-05" and I.periodo_anterior("2026") == "2025"
    assert I.cambio_anual([("2025-Q2", 100), ("2026-Q2", 110)]) == (10.0, "2026-Q2", "2025-Q2")
    assert I.cambio_anual([("2026-Q1", 100), ("2026-Q2", 110)]) is None  # sin el mismo trimestre del año anterior
    assert I.cambio_anual([("2026-Q2", 3.2)], es_porcentaje=True)[0] == 3.2


def test_tipo_de_serie():
    assert I.tipo_de_serie("Spain - Commercial property price index, offices, whole country", "CPP") == "oficinas"
    assert I.tipo_de_serie("Germany - Commercial property price index, office and retail buildings", "CPP") == "oficinas_locales"
    assert I.tipo_de_serie("Hong Kong - Industrial property price index, all industrial properties.", "CPP") == "bodegas"
    assert I.tipo_de_serie("Korea - Commercial land price index, whole country", "CPP") == "terrenos"
    assert I.tipo_de_serie("Switzerland - Commercial property price index, residential investment properties", "CPP") is None
    assert I.tipo_de_serie("Japan - Residential property price index, existing flats, whole country", "DPP") == "departamentos"
    assert I.tipo_de_serie("United States - Residential property price index, new single family houses", "DPP") == "casas"
    assert I.tipo_de_serie("Canada - Residential property price index, new houses, structures only", "DPP") is None


def test_por_pais_y_tipo_elige_la_mejor_serie():
    d = I.por_pais_y_tipo(I.leer_series_bis(BIS_SPP_CSV), I.leer_series_bis(BIS_DPP_CSV), I.leer_series_bis(BIS_CPP_CSV), ISO)
    assert d["MEX"]["vivienda"] == {"cambio": 8.1, "periodo": "2026-Q2", "titulo": d["MEX"]["vivienda"]["titulo"], "real": 3.9}
    assert d["FRA"]["vivienda"]["cambio"] == -2.8 and "real" not in d["FRA"]["vivienda"]
    assert d["ESP"]["oficinas"]["cambio"] == -6.0 and d["ESP"]["bodegas"]["cambio"] == 8.0 and d["ESP"]["comercial"]["cambio"] == 3.0
    assert "CHE" not in d  # inversión residencial: no comparable
    assert d["CHL"]["casas"]["cambio"] == 2.0 and d["CHL"]["departamentos"]["cambio"] == -0.5
    assert d["JPN"]["terrenos"]["cambio"] == 10.0


def test_features_paises_un_poligono_por_tipo_con_color():
    paises = {"features": [{"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]},
                            "properties": {"iso3": "ESP", "nombre": "España"}}]}
    d = I.por_pais_y_tipo({}, {}, I.leer_series_bis(BIS_CPP_CSV), ISO)
    fs = I.features_paises(paises, d)
    st = {f["properties"]["st"]: f["properties"] for f in fs}
    assert set(st) == {"inm_oficinas", "inm_bodegas", "inm_comercial"}
    assert st["inm_oficinas"]["color"] == "#2166AC" and st["inm_bodegas"]["color"] == "#B2182B" and st["inm_comercial"]["color"] == "#EF8A62"
    assert "-6.0 %" in st["inm_oficinas"]["x"]
    assert I.color_cambio(0.4)[1] == "estable (±1 %)"


def _xlsx(filas):
    """Arma un .xlsx mínimo (texto en línea y números) para probar el lector sin dependencias."""
    def celda(ref, v):
        if isinstance(v, (int, float)):
            return f'<c r="{ref}"><v>{v}</v></c>'
        return f'<c r="{ref}" t="inlineStr"><is><t>{v}</t></is></c>'
    letras = "ABCDEFGHI"
    rows = "".join(f'<row r="{i + 1}">' + "".join(celda(f"{letras[j]}{i + 1}", v) for j, v in enumerate(f) if v is not None) + "</row>"
                   for i, f in enumerate(filas))
    xml = f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{rows}</sheetData></worksheet>'
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("xl/worksheets/sheet1.xml", xml)
    return b.getvalue()


def test_shf_xlsx_y_estados():
    filas = [["Trimestre", "Entidad federativa", None, "Valor promedio ... por m2", None, None, "Valor mediano ... por m2"],
             ["2025.T2", "Ciudad de México", None, 40000.0, None, None, 36000.0],
             ["2026.T2 /p", "Ciudad de México", None, 42000.0, None, None, 39600.0],
             ["2025.T2", "Coahuila", None, 9000.0, None, None, 10000.0],
             ["2026.T2 /p", "Coahuila", None, 9100.0, None, None, 9700.0],
             ["Nota 1: 2018.T1 - 2025.T2 Cifras definitivas", None, None, None, None, None, None]]
    shf = I.leer_shf(I.leer_xlsx(_xlsx(filas)))
    assert shf["Ciudad de México"] == [("2025.T2", 36000.0, False), ("2026.T2", 39600.0, True)]
    estados = {"features": [
        {"type": "Feature", "geometry": None, "properties": {"name": "Distrito Federal"}},
        {"type": "Feature", "geometry": None, "properties": {"name": "Coahuila"}},
        {"type": "Feature", "geometry": None, "properties": {"name": "Yucatán"}}]}  # sin dato: no se dibuja
    fs = I.features_mx(estados, {"casa-habitaci": shf})
    p = {f["properties"]["n"]: f["properties"] for f in fs}
    assert set(p) == {"Distrito Federal", "Coahuila"}
    assert p["Distrito Federal"]["st"] == "mx_casa" and p["Distrito Federal"]["color"] == "#B2182B" and "+10.0 %" in p["Distrito Federal"]["x"] and "preliminar" in p["Distrito Federal"]["x"]
    assert p["Coahuila"]["color"] == "#67A9CF"


def test_enlaces_shf():
    html = ('<a href="/cms/uploads/attachment/file/1/Valor_de_inmuebles_valuados_para_tipo_de_vivienda_casa-habitaci_n.xlsx">'
            '<a href="/cms/uploads/attachment/file/2/Valor_de_inmuebles_valuados_de_la_vivienda_econ_mica-social.xlsx">'
            '<a href="/cms/uploads/attachment/file/3/Metodologia.pdf">')
    e = I.enlaces_shf(html)
    assert set(e) == {"casa-habitaci", "econ_mica-social"} and e["casa-habitaci"].startswith("https://www.gob.mx/cms/")


def test_inmuebles_en_seguimiento_y_revision_geologica():
    lista = json.load(open(os.path.join(ROOT, "config", "inmuebles_seguimiento.json"), encoding="utf-8"))["inmuebles"]
    assert len(lista) == 17
    volcanes = [(14.139, 40.827, "Campi Flegrei")]  # (lon, lat, nombre)
    fs = I.features_seguimiento(lista, volcanes, [])
    bacoli = next(f["properties"] for f in fs if "Bacoli" in f["properties"]["n"])
    assert bacoli["st"] == "inm_riesgo_alto" and bacoli["geo_alerta"] and "Campi Flegrei" in bacoli["geo"]
    assert all(f["properties"]["url"].startswith("https://") for f in fs)


def test_familias_de_bienes_raices_registradas():
    capas = json.load(open(os.path.join(ROOT, "config", "capas.json"), encoding="utf-8"))["familias"]
    cat = json.load(open(os.path.join(ROOT, "config", "entities.json"), encoding="utf-8"))
    subtipos = {s["id"]: s["familia"] for k in cat["categorias"] for s in k["subtipos"] if s.get("familia")}
    for fam in ("inmuebles_pais", "inmuebles_mx", "inmuebles_seguimiento"):
        assert fam in C.FAMILIAS and any(x["id"] == fam and x["habilitada"] for x in capas)
    assert {v[0] for v in I.TIPOS_PAIS.values()} <= {k for k, v in subtipos.items() if v == "inmuebles_pais"}
    assert {v[0] for v in I.TIPOS_MX.values()} <= {k for k, v in subtipos.items() if v == "inmuebles_mx"}
    assert set(I.RIESGO_ST.values()) <= {k for k, v in subtipos.items() if v == "inmuebles_seguimiento"}


def test_indice_de_busqueda_de_organizaciones():
    fs = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [-99.1712345, 19.42]},
           "properties": {"id": "osm:n1", "n": "Embajada de Japón", "st": "embajadas_consulados", "p": "MEX", "x": "embassy|JP"}},
          {"type": "Feature", "geometry": {"type": "Point", "coordinates": [0, 0]}, "properties": {"id": "osm:n2", "n": "", "st": "embajadas_consulados"}}]
    assert C.indice_busqueda(fs) == [["Embajada de Japón", "embajadas_consulados", "MEX", -99.17123, 19.42, "osm:n1", "embassy|JP"]]
    assert {"empresas", "embajadas"} <= C.BUSCABLES
