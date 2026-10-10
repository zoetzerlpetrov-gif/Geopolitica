"""Reportes diarios (ingest/reporte.py) y panorama con IA (ingest/panorama_ia.py), sin red."""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ingest"))
import panorama_ia as P  # noqa: E402
import reporte as R  # noqa: E402

T = datetime(2026, 10, 10, 18, 0, tzinfo=timezone.utc)


def ev(i, titulo, horas=2, fuente="La Jornada · Política", pais="MEX", sev=3, impacto="Ocurre en México.", tipo="noticia", resumen=""):
    return {"id": f"e{i}", "titulo": titulo, "resumen": resumen, "fuente": fuente, "url": f"https://example.mx/{i}",
            "fecha_utc": (T - timedelta(hours=horas)).strftime("%Y-%m-%dT%H:%M:%SZ"), "severidad": sev, "pais_iso3": pais,
            "impacto_mexico": impacto, "tipo_fuente": tipo, "area_principal": "seguridad", "fuentes": [{}], "region": "norteamerica"}


EVENTOS = [
    ev(1, "Detectan toma clandestina de huachicol en Hidalgo"),
    ev(2, "Enfrentamiento entre células del CJNG deja 12 muertos", sev=4),
    ev(3, "Banxico recorta la tasa de interés", fuente="El Economista"),
    ev(4, "Bloqueo de transportistas en la México-Querétaro"),
    ev(5, "Combate: México → Sinaloa", fuente="GDELT 2.0 (evento codificado)", tipo="base_datos"),
    ev(6, "Publicación pública en Mastodon con #geopolitics sobre México", tipo="red_social"),
    ev(7, "EUA anuncia aranceles al acero canadiense", pais="USA", impacto="Estados Unidos es socio o vecino directo: posible efecto"),
    ev(8, "Huracán en Filipinas deja damnificados", pais="PHL", impacto=None, fuente="DW Español"),
    ev(9, "Nota de hace dos días sobre huachicol", horas=50),
]


def test_coincide_palabras_completas_y_prefijos_largos():
    t = R.texto_de({"titulo": "Reportan personas desaparecidas en Jalisco", "resumen": ""})
    assert R.coincide(t, "desaparecid")
    assert not R.coincide(R.texto_de({"titulo": "Cinemex inaugura sala"}), "ine")
    assert R.coincide(R.texto_de({"titulo": "Bloqueos en la CDMX"}), "bloqueo")


def test_reporte_mexico_secciones_entorno_y_exclusiones():
    cfg = R.cargar_config()
    rep = R.construir("mexico", EVENTOS, [], 0, T, cfg)
    sec = {s["id"]: s for s in rep["secciones"]}
    assert [e["id"] for e in sec["combustibles"]["eventos"]] == ["e1"]
    assert "e2" in [e["id"] for e in sec["seguridad"]["eventos"]]
    assert "e3" in [e["id"] for e in sec["economia"]["eventos"]]
    assert "e4" in [e["id"] for e in sec["protestas"]["eventos"]]
    ids = {e["id"] for s in rep["secciones"] for e in s["eventos"]}
    assert "e6" not in ids and "e9" not in ids and "e8" not in ids       # red social, fuera de ventana, otro país
    assert [e["id"] for e in rep["entorno"]["eventos"]] == ["e7"]         # socio sin mención directa
    assert sec["seguridad"]["eventos"][0]["id"] == "e2"                   # nota grave antes que la señal GDELT
    assert rep["cifras"]["senales_automaticas"] == 1 and rep["fecha"] == "2026-10-10"
    assert "Aún no hay 3 días" in rep["panorama_reglas"]


def test_reporte_global_y_tendencia():
    cfg = R.cargar_config()
    rep = R.construir("global", EVENTOS, [], 0, T, cfg)
    assert rep["regiones"] and rep["cifras"]["total"] == 7
    assert R.tendencia(9, 3, 7) == "sube" and R.tendencia(1, 6, 7) == "baja" and R.tendencia(3, 3, 7) == "estable"
    assert R.tendencia(9, 3, 1) == "sin base"


def test_banxico_fix():
    f = R.banxico_fix("<title>MX: 18.4163 MXN = 1 USD 2026-10-09 BM FIX</title>")
    assert f["valor"] == 18.4163 and f["fecha"] == "2026-10-09"
    assert R.banxico_fix("sin datos") is None


def test_generar_escribe_indice_y_conserva_panorama(tmp_path):
    previo = {"panorama_ia": {"generado_utc": "2026-10-10T17:00:00Z", "horizontes": {}}}
    os.makedirs(tmp_path / "reportes" / "mexico")
    (tmp_path / "reportes" / "mexico" / "2026-10-10.json").write_text(json.dumps({**previo, "generado_utc": "x", "cifras": {"total": 1}}))
    hechos = R.generar(str(tmp_path), EVENTOS, T, fix_fn=None)
    assert hechos["mexico"]["ia"] is True and hechos["global"]["ia"] is False
    ix = json.loads((tmp_path / "reportes" / "indice.json").read_text())
    assert ix["mexico"][0]["fecha"] == "2026-10-10"


RESPUESTA = {
    "corto_plazo": {"escenarios": [
        {"titulo": "Más operativos contra el huachicol", "descripcion": " ".join(["palabra"] * 30), "probabilidad": "Alta",
         "senales": ["Decomisos en Hidalgo", "https://no.permitido"], "eventos": ["e1", "inventado"]},
        {"titulo": "Escenario sin eventos válidos", "descripcion": " ".join(["x"] * 30), "probabilidad": "media", "eventos": ["zz"]},
        {"titulo": "Probabilidad inválida", "descripcion": " ".join(["x"] * 30), "probabilidad": "segura", "eventos": ["e1"]}]},
    "mediano_plazo": {"escenarios": [{"titulo": "Ajuste de tasas", "descripcion": " ".join(["y"] * 20), "probabilidad": "media", "eventos": ["e3"]}]},
    "largo_plazo": {"escenarios": []},
}


def test_validar_quita_ids_inventados_enlaces_y_formas_invalidas():
    h = P.validar(RESPUESTA, {"e1", "e3"})
    assert list(h) == ["corto_plazo", "mediano_plazo"]
    esc = h["corto_plazo"]["escenarios"]
    assert len(esc) == 1 and esc[0]["eventos"] == ["e1"] and esc[0]["probabilidad"] == "alta"
    assert esc[0]["senales"] == ["Decomisos en Hidalgo"]
    assert P.validar({"corto_plazo": RESPUESTA["corto_plazo"]}, {"e1"}) is None   # un solo horizonte no basta


def test_panorama_usa_previo_reciente_y_tolera_fallos():
    rep = R.construir("mexico", EVENTOS, [], 0, T, R.cargar_config())
    cfg = {"modelos": ["m1"], "url": "http://x", "proveedor": "groq"}
    reciente = {"panorama_ia": {"generado_utc": (T - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"), "horizontes": {"a": 1}}}
    assert P.panorama(rep, reciente, cfg, "clave", T, pedir_fn=lambda *a: 1 / 0) == reciente["panorama_ia"]
    assert P.panorama(rep, None, cfg, "", T) is None                                   # sin clave
    assert P.panorama(rep, None, cfg, "clave", T, pedir_fn=lambda *a: "no es json") is None
    ok = P.panorama(rep, None, cfg, "clave", T, pedir_fn=lambda *a: json.dumps(RESPUESTA))
    assert ok["modelo"] == "groq/m1" and "corto_plazo" in ok["horizontes"] and "hipótesis" in ok["aviso"]


def test_mensaje_no_incluye_enlaces_de_medios():
    rep = R.construir("mexico", EVENTOS, [], 0, T, R.cargar_config())
    msg = P.mensaje_usuario(rep, P.eventos_para_ia(rep))
    assert "https://" not in msg and "[e1]" in msg


def test_pdf_se_genera_con_acentos(tmp_path):
    import pytest
    try:
        import reporte_pdf
    except ImportError:
        pytest.skip("sin fpdf2")
    if not all(os.path.exists(f) for f in reporte_pdf.FUENTES):
        pytest.skip("sin la fuente DejaVu")
    rep = R.construir("mexico", EVENTOS, [], 0, T, R.cargar_config())
    rep["panorama_ia"] = {"aviso": "Hipótesis", "horizontes": P.validar(RESPUESTA, {"e1", "e3"})}
    ruta = tmp_path / "r.pdf"
    reporte_pdf.escribir(rep, str(ruta))
    assert ruta.read_bytes()[:4] == b"%PDF" and ruta.stat().st_size > 5000
