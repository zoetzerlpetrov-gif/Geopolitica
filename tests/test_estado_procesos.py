"""Revisión diaria de procesos (tools/estado_procesos/estado_procesos.py, config/procesos.json, estado.html)."""
import json
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "estado_procesos"))
import estado_procesos as E  # noqa: E402

AHORA = datetime(2026, 10, 29, 18, 0, tzinfo=timezone.utc)
P = {"id": "vivos", "nombre": "Datos en movimiento", "workflow": "vivos.yml", "max_horas": 1}


def corrida(id_, creada, fin, conclusion="success", status="completed"):
    return {"id": id_, "status": status, "conclusion": conclusion if status == "completed" else None, "created_at": creada,
            "run_started_at": creada, "updated_at": fin, "html_url": f"https://github.com/x/runs/{id_}"}


def test_config_apunta_a_workflows_que_existen():
    cfg = json.load(open(os.path.join(ROOT, "config", "procesos.json"), encoding="utf-8"))
    for p in cfg["workflows"]:
        assert os.path.exists(os.path.join(ROOT, ".github", "workflows", p["workflow"])), p["workflow"]
        assert p["max_horas"] > 0 and p["afecta"]
    assert {d["errores"] for d in cfg["datos"] if d.get("errores")} <= {"pasos", "fuentes", "errores"}


def test_al_dia():
    w = E.evaluar_workflow(P, [corrida(2, "2026-10-29T17:20:00Z", "2026-10-29T17:45:00Z")], AHORA)
    assert w["estado"] == "ok" and w["horas_sin_exito"] == 0.2 and w["duracion_media_min"] == 25.0


def test_canceladas_como_el_29_de_octubre_dan_atraso():
    """Todas las corridas canceladas: nunca publica. Antes de 2 h es atraso por cancelaciones; después, falla."""
    canceladas = [corrida(i, f"2026-10-29T{17 - i // 3:02d}:{(i % 3) * 20:02d}:00Z", "2026-10-29T17:50:00Z", "cancelled") for i in range(6)]
    ok_viejo = corrida(99, "2026-10-29T16:30:00Z", "2026-10-29T16:55:00Z")
    w = E.evaluar_workflow(P, canceladas + [ok_viejo], AHORA)
    assert w["estado"] == "atraso" and "canceladas" in w["detalle"]
    w = E.evaluar_workflow(P, canceladas, AHORA)
    assert w["estado"] == "falla" and "Ninguna" in w["detalle"]


def test_tres_fallas_seguidas_es_falla_aunque_haya_exito_reciente():
    c = [corrida(i, "2026-10-29T17:40:00Z", "2026-10-29T17:50:00Z", "failure") for i in range(3)] + [corrida(9, "2026-10-29T17:00:00Z", "2026-10-29T17:30:00Z")]
    w = E.evaluar_workflow(P, c, AHORA)
    assert w["fallas_seguidas"] == 3 and w["estado"] == "falla"


def test_pasos_fallidos_y_lentos():
    jobs = [{"name": "actualizar", "steps": [
        {"name": "Set up job", "conclusion": "success", "started_at": "2026-10-29T17:00:00Z", "completed_at": "2026-10-29T17:00:01Z"},
        {"name": "Meteosat", "conclusion": "success", "started_at": "2026-10-29T17:00:01Z", "completed_at": "2026-10-29T17:03:01Z"},
        {"name": "Noticiero", "conclusion": "failure", "started_at": "2026-10-29T17:03:01Z", "completed_at": "2026-10-29T17:04:01Z"}]}]
    fallidos, lentos = E.pasos_de(jobs)
    assert fallidos == ["actualizar → Noticiero"]
    assert lentos[0] == {"paso": "Meteosat", "min": 3.0} and all(x["paso"] != "Set up job" for x in lentos)


def test_errores_de_cada_formato():
    assert E.errores_de({"pasos": {"buques": {"estado": "error", "error": "timeout"}, "aeronaves": {"estado": "ok"}}}, "pasos") == ["buques: timeout"]
    assert E.errores_de({"fuentes": {"eua": "ok (200)", "mi5": "error: HTTPError"}}, "fuentes") == ["mi5: error: HTTPError"]
    assert E.errores_de({"fuentes": [{"nombre": "GDELT", "estado": "error", "error": "503"}, {"nombre": "x", "estado": "ok"}]}, "fuentes") == ["GDELT: 503"]
    assert E.errores_de({"errores": ["rss: caído"]}, "errores") == ["rss: caído"]


def test_dato_viejo_y_dato_ausente():
    regla = {"id": "d", "nombre": "N", "archivo": "data/x.json", "campo": "generado_utc", "max_horas": 1.5, "errores": "pasos"}
    assert E.evaluar_dato(regla, {"generado_utc": "2026-10-29T17:30:00Z", "pasos": {}}, AHORA)["estado"] == "ok"
    assert E.evaluar_dato(regla, {"generado_utc": "2026-10-29T16:00:00Z"}, AHORA)["estado"] == "atraso"
    assert E.evaluar_dato(regla, {"generado_utc": "2026-10-29T10:00:00Z"}, AHORA)["estado"] == "falla"
    assert E.evaluar_dato(regla, None, AHORA)["estado"] == "falla"


def test_revisar_y_bitacora_sin_duplicados():
    cfg = {"workflows": [P], "datos": [{"id": "d", "nombre": "Vivos", "archivo": "data/vivos/estado.json", "campo": "generado_utc", "max_horas": 1.5, "errores": "pasos"}]}

    def get(url, token=None):
        if "/workflows/" in url:
            return {"workflow_runs": [corrida(5, "2026-10-29T15:00:00Z", "2026-10-29T15:20:00Z", "failure")]}
        if "/jobs" in url:
            return {"jobs": [{"name": "actualizar", "steps": [{"name": "Actualizar", "conclusion": "failure", "started_at": "2026-10-29T15:00:00Z", "completed_at": "2026-10-29T15:20:00Z"}]}]}
        assert url.startswith("https://sitio/data/vivos/estado.json?")
        return {"generado_utc": "2026-10-29T17:40:00Z", "pasos": {"buques": {"estado": "error", "error": "sin llave"}}}

    res = E.revisar(cfg, "x/y", "https://sitio/", ahora=AHORA, get=get)
    assert res["estado_global"] == "falla" and res["workflows"][0]["pasos_fallidos"] == ["actualizar → Actualizar"]
    bit = E.actualizar_bitacora([], res, AHORA)
    assert {e["tipo"] for e in bit} == {"proceso", "fuente"}
    assert E.actualizar_bitacora(bit, res, AHORA) == bit, "la misma incidencia el mismo día no se repite"
    viejo = [{"fecha_utc": "2026-06-01T00:00:00Z", "id": "z", "detalle": "x"}]
    assert all(e["id"] != "z" for e in E.actualizar_bitacora(viejo, res, AHORA)), "se borra lo de más de 90 días"


def test_workflow_diario_publica_y_avisa():
    y = open(os.path.join(ROOT, ".github", "workflows", "estado-procesos.yml"), encoding="utf-8").read()
    assert "actions: read" in y and "datos-estado" in y and "exit 1" in y and "cron:" in y
    assert "estado-procesos.yml" in open(os.path.join(ROOT, ".github", "workflows", "reloj.yml"), encoding="utf-8").read()
    pages = open(os.path.join(ROOT, ".github", "workflows", "pages.yml"), encoding="utf-8").read()
    assert "datos-estado" in pages and "estado.html" in pages and "soporte.html" in pages


def test_centro_de_control_solo_admin_y_soporte_para_todos():
    planes = json.load(open(os.path.join(ROOT, "config", "planes.json"), encoding="utf-8"))
    assert any(x.get("href") == "estado.html" for x in planes["solo_admin"])
    assert planes["acceso_por_plan"]["paginas"]["soporte.html"] == "demo"
    html = open(os.path.join(ROOT, "estado.html"), encoding="utf-8").read()
    assert 'id="p-autoaud"' in html and "js/autoauditoria.js" in html and "js/vista_enlaces.js" in html


def test_autoauditoria_lee_la_revision_diaria(tmp_path, monkeypatch):
    sys.path.insert(0, os.path.join(ROOT, "tools", "autoauditoria"))
    import autoauditoria as A
    monkeypatch.setenv("ESTADO_PROCESOS", str(tmp_path / "no.json"))
    assert A.procesos_publican({})["estado"] == "sin_evaluar"
    f = tmp_path / "u.json"
    f.write_text(json.dumps({"fecha_utc": "2026-10-29T13:07:00Z", "estado_global": "atraso", "workflows": [{"nombre": "Datos en movimiento", "estado": "atraso"}], "datos": []}))
    monkeypatch.setenv("ESTADO_PROCESOS", str(f))
    r = A.procesos_publican({})
    assert r["estado"] == "parcial" and "Datos en movimiento" in r["detalle"]
