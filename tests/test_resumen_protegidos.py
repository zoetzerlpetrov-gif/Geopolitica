"""Resumen sin contenido de los archivos protegidos por plan, y su uso en el Centro de control."""
import json
import os
import sys
from datetime import datetime, timezone

RAIZ = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(RAIZ, "tools", "pages"))
sys.path.insert(0, os.path.join(RAIZ, "tools", "estado_procesos"))
import resumen_protegidos as R  # noqa: E402
import estado_procesos as E  # noqa: E402


def test_solo_guarda_los_campos_que_revisa_el_centro_de_control(tmp_path):
    (tmp_path / "data" / "vivos").mkdir(parents=True)
    (tmp_path / "data" / "vivos" / "anomalias.geojson").write_text(json.dumps({
        "generado_utc": "2026-11-20T10:00:00Z", "fuentes": {"nuforc": {"estado": "error"}}, "resumen": {"n": 40},
        "features": [{"properties": {"titulo": "secreto"}}]}), encoding="utf-8")
    reglas = [{"archivo": "data/vivos/anomalias.geojson", "campo": "generado_utc", "errores": "fuentes", "minimo": {"campo": "resumen.n", "valor": 1}},
              {"archivo": "data/vivos/publico.json", "campo": "generado_utc"}]
    res = R.resumir(str(tmp_path), {"data/vivos/anomalias.geojson"}, reglas)
    assert res == {"data/vivos/anomalias.geojson": {"generado_utc": "2026-11-20T10:00:00Z", "fuentes": {"nuforc": {"estado": "error"}}, "resumen": {"n": 40}}}
    assert "secreto" not in json.dumps(res)


def test_el_centro_de_control_usa_el_resumen_si_el_archivo_ya_no_es_publico():
    ahora = datetime(2026, 11, 20, 12, tzinfo=timezone.utc)
    cfg = {"workflows": [], "datos": [{"id": "d_anom", "nombre": "Anómalos", "archivo": "data/vivos/anomalias.geojson", "campo": "generado_utc", "max_horas": 30}]}

    def get(url, token=None):
        if "estado_protegidos.json" in url:
            return {"data/vivos/anomalias.geojson": {"generado_utc": "2026-11-20T10:00:00Z"}}
        raise OSError("404")
    r = E.revisar(cfg, "x/y", "https://dominusosint.com/", get=get, ahora=ahora)
    assert r["datos"][0]["estado"] != "falla" and r["datos"][0]["horas"] == 2


def test_regla_con_url_completa_del_sitio_usa_el_resumen(tmp_path):
    (tmp_path / "data" / "portafolio").mkdir(parents=True)
    (tmp_path / "data" / "portafolio" / "daily_report.json").write_text(json.dumps({"generated_at": "2026-11-21T03:30:00-06:00", "noticias": {"instrumentos_con_noticias": 12}, "secreto": 1}), encoding="utf-8")
    reglas = [{"archivo": "https://dominusosint.com/data/portafolio/daily_report.json", "campo": "generated_at", "minimo": {"campo": "noticias.instrumentos_con_noticias", "valor": 1}}]
    res = R.resumir(str(tmp_path), {"data/portafolio/daily_report.json"}, reglas)
    assert res == {"data/portafolio/daily_report.json": {"generated_at": "2026-11-21T03:30:00-06:00", "noticias": {"instrumentos_con_noticias": 12}}}
    ahora = datetime(2026, 11, 21, 12, tzinfo=timezone.utc)
    cfg = {"workflows": [], "datos": [{"id": "d_portafolio", "nombre": "P", "archivo": "https://dominusosint.com/data/portafolio/daily_report.json", "campo": "generated_at", "max_horas": 30}]}

    def get(url, token=None):
        if "estado_protegidos.json" in url:
            return res
        raise OSError("404")
    r = E.revisar(cfg, "x/y", "https://dominusosint.com/", get=get, ahora=ahora)
    assert r["datos"][0]["estado"] == "ok"
