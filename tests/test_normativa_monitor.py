"""Monitor diario de cambios normativos (tools/normativa/monitor.py), sin red: fuentes simuladas con fragmentos reales."""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tools", "normativa")))
import monitor as M  # noqa: E402

AHORA = datetime(2026, 11, 7, 13, tzinfo=timezone.utc)
DOF = {"dias": {
    "2026-11-05": [
        ["5803022", "Acuerdo", "PODER EJECUTIVO SECRETARIA DE ENERGIA", "Acuerdo de la Comisión Nacional de Energía por el que se expiden las Disposiciones Administrativas de "
         "Carácter General que regulan la actividad de comercialización de gas natural, petrolíferos, gas licuado de petróleo y petroquímicos."],
        ["5803030", "Indicador financiero", "BANCO DE MEXICO", "Tipo de cambio para solventar obligaciones denominadas en moneda extranjera."],
    ],
    "2026-10-23": [["5802000", "Ley o reforma legal", "PODER EJECUTIVO SECRETARIA DE HACIENDA", "Decreto por el que se reforman y adicionan diversas disposiciones de la Ley Aduanera."]],
    "2026-10-20": [["5801000", "Decreto", "PODER EJECUTIVO", "Decreto por el que se expropia por causa de utilidad pública la superficie del ejido La Lic. Esperanza."]],
}}
FR = {"results": [
    {"title": "Airworthiness Directives; The Boeing Company Airplanes", "document_number": "2026-1", "html_url": "https://fr/1", "publication_date": "2026-11-05", "type": "Rule", "agencies": [{"name": "Federal Aviation Administration"}]},
    {"title": "Heightened Requirements for Foreign Importers of Record", "document_number": "2026-2", "html_url": "https://fr/2", "publication_date": "2026-11-05", "type": "Rule",
     "agencies": [{"name": "U.S. Customs and Border Protection"}], "cfr_references": [{"title": 19, "part": 141}]},
], "next_page_url": None}
EUR = {"results": {"bindings": [
    {"celex": {"value": "32026R2382"}, "fecha": {"value": "2026-10-21"}, "tipo": {"value": "http://publications.europa.eu/resource/authority/resource-type/REG"},
     "titulo": {"value": "Reglamento (UE) 2026/2382 del Parlamento Europeo y del Consejo por el que se modifica el Reglamento (CE) n.º 1907/2006 (REACH)"}},
    {"celex": {"value": "M.12345"}, "fecha": {"value": "2026-10-21"}, "tipo": {"value": "http://publications.europa.eu/resource/authority/resource-type/DEC"},
     "titulo": {"value": "Decisión de la Comisión por la que se declara la compatibilidad de una operación de concentración con el mercado interior (Reglamento (CE) n.º 139/2004)"}},
]}}


def leer_falso(url, timeout=60):
    if "federalregister" in url:
        return json.dumps(FR).encode()
    if "sparql" in url:
        return json.dumps(EUR).encode()
    raise OSError("sin red en la prueba")


def fuentes_prueba():
    return [f for f in M.FUENTES if f[0] in ("USA", "EUR", "ARG")]


def test_claves_y_cruce():
    cats, claves = M.cargar_catalogo()
    idx = M.indice(cats, claves)
    leyes, sectores = M.cruzar("MEX", "Decreto por el que se reforman diversas disposiciones de la Ley Aduanera.", idx, cats)
    assert [l["id"] for l in leyes] == ["ley_aduanera"] and "logistica" in sectores
    # «Lic.» no es la Ley de Instituciones de Crédito: las siglas solo cuentan en mayúsculas.
    assert M.cruzar("MEX", "Decreto de expropiación del ejido La Lic. Esperanza", idx, cats)[0] == []
    # Una frase genérica («Ley de Protección…») no basta para atribuir una ley concreta.
    assert not M.cruzar("MEX", "Reglamento de la Ley de Protección del Espacio Aéreo Mexicano", idx, cats)[0]
    # Japonés y ruso, con los nombres oficiales de config/normativa/claves.json.
    assert [l["id"] for l in M.cruzar("JPN", "会社法の一部を改正する法律", idx, cats)[0]] == ["jp_sociedades"]
    assert "ru_datos_personales" in [l["id"] for l in M.cruzar("RUS", 'Федеральный закон "О внесении изменений в Федеральный закон "О персональных данных""', idx, cats)[0]]


def test_construir_bitacora(tmp_path):
    r = M.construir(str(tmp_path), ahora=AHORA, leer=leer_falso, permitido=lambda u: True, dof=DOF, leyes_fed=None, fuentes=fuentes_prueba(), pausa=0)
    b = json.load(open(tmp_path / "bitacora.json", encoding="utf-8"))["entradas"]
    ids = [e["id"] for e in b]
    assert "MEX:dof:5803030" not in ids and "MEX:dof:5801000" not in ids  # indicador financiero y expropiación sin relación
    cne = next(e for e in b if e["id"] == "MEX:dof:5803022")
    assert cne["nivel"] == "reglamento" and cne["impacto"] == "medio" and "hidrocarburos" in cne["sectores"]
    assert {"lsh", "dacg_comercializacion_cne"} <= {l["id"] for l in cne["leyes"]}
    assert any("trámite" in a for a in cne["afectaciones"])
    aduana = next(e for e in b if e["id"] == "MEX:dof:5802000")
    assert aduana["impacto"] == "alto" and any("entrada en vigor" in a for a in aduana["afectaciones"])
    assert "USA:fr:2026-1" not in ids and "USA:fr:2026-2" in ids  # directivas de aeronavegabilidad: rutina
    assert "EUR:32026R2382" in ids and "EUR:M.12345" not in ids  # decisiones de concentración: no cambian reglas
    reach = next(e for e in b if e["id"] == "EUR:32026R2382")
    assert reach["leyes"][0]["id"] == "eu_reach_clp" and reach["impacto"] == "alto"
    est = json.load(open(tmp_path / "estado.json", encoding="utf-8"))
    assert est["fuentes"]["ARG"]["ok"] is False and "CHN" in est["sin_fuente"]
    assert r["agregadas"] == len(b)


def test_bitacora_nunca_borra(tmp_path):
    M.construir(str(tmp_path), ahora=AHORA, leer=leer_falso, permitido=lambda u: True, dof=DOF, fuentes=fuentes_prueba(), pausa=0)
    primera = json.load(open(tmp_path / "bitacora.json", encoding="utf-8"))["entradas"]
    marcada = primera[0]["id"]
    # La siguiente corrida ya no ve esas publicaciones (DOF vacío, EUA sin resultados): la bitácora conserva todo.
    vacio = lambda url, timeout=60: json.dumps({"results": [], "next_page_url": None} if "federal" in url else {"results": {"bindings": []}}).encode()  # noqa: E731
    r = M.construir(str(tmp_path), ahora=AHORA, leer=vacio, permitido=lambda u: True, dof={"dias": {}}, fuentes=fuentes_prueba(), pausa=0)
    segunda = json.load(open(tmp_path / "bitacora.json", encoding="utf-8"))["entradas"]
    assert r["agregadas"] == 0 and {e["id"] for e in primera} <= {e["id"] for e in segunda}
    assert next(e for e in segunda if e["id"] == marcada) == primera[0]


def test_robots_y_reformas():
    est = M.construir.__defaults__  # firma estable: salida, ahora, leer, permitido, dof, leyes_fed, fuentes, pausa
    assert est is not None
    cats, _ = M.cargar_catalogo()
    lf = {"leyes": [{"n": "LEY Aduanera", "ref": "https://www.diputados.gob.mx/LeyesBiblio/ref/la.htm", "ult": "2099-01-01"}]}
    d = M.mex_reformas(cats, lf)
    assert d and d[0]["ley_id"] == "ley_aduanera" and d[0]["oficial"] == "2099-01-01"


def test_fuente_bloqueada_por_robots(tmp_path):
    M.construir(str(tmp_path), ahora=AHORA, leer=leer_falso, permitido=lambda u: "federalregister" not in u, dof={"dias": {}}, fuentes=fuentes_prueba(), pausa=0)
    est = json.load(open(tmp_path / "estado.json", encoding="utf-8"))
    assert est["fuentes"]["USA"]["ok"] is False and "robots" in est["fuentes"]["USA"]["error"]
