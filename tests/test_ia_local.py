"""IA de resúmenes y panorama con un modelo abierto local (llama.cpp en GitHub Actions), sin llaves de terceros."""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import run  # noqa: E402


def cfg():
    return json.load(open(os.path.join(ROOT, "config", "fuentes.json"), encoding="utf-8"))["ia"]


def test_sin_servidor_local_queda_la_configuracion():
    assert run.config_ia(cfg(), {}) == cfg()


def test_con_servidor_local_no_usa_groq_ni_pide_llave():
    c = run.config_ia(cfg(), {"IA_LOCAL_URL": "http://127.0.0.1:8080/v1/chat/completions"})
    assert c["proveedor"] == "local" and c["url"].startswith("http://127.0.0.1")
    assert c["modelos"] == [cfg()["local"]["modelo"]] and "groq" not in c["url"]
    assert c["max_por_corrida"] <= 20 and c["timeout_s"] >= 120 and c["pausa_s"] == 0


def test_licencia_del_modelo_abierta_y_workflow_sin_groq():
    assert "Apache-2.0" in cfg()["local"]["licencia"]
    wf = open(os.path.join(ROOT, ".github", "workflows", "ingest.yml"), encoding="utf-8").read()
    assert "IA_LOCAL_URL" in wf and "GROQ_API_KEY" not in wf
    assert "sha256sum -c" in wf, "el modelo y el servidor se verifican por su huella antes de usarse"


def test_peticion_local_sin_parametros_de_groq(monkeypatch):
    import resumen_ia
    enviados = []

    class R:
        def __init__(self, b): self.b = b
        def read(self): return self.b
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def falso(req, timeout):
        enviados.append((json.loads(req.data), timeout))
        return R(json.dumps({"choices": [{"message": {"content": "Resumen."}}]}).encode())

    monkeypatch.setattr(resumen_ia.urllib.request, "urlopen", falso)
    c = run.config_ia(cfg(), {"IA_LOCAL_URL": "http://127.0.0.1:8080/v1/chat/completions"})
    resumen_ia.pedir("Título", "Texto", "Medio", c, "local", "qwen3-4b")
    cuerpo, timeout = enviados[0]
    assert "reasoning_effort" not in cuerpo and timeout == c["timeout_s"]


def test_tope_de_tiempo_deja_pendientes_para_la_siguiente_corrida():
    """En CPU cada resumen tarda; al agotar `presupuesto_s` se detiene para que la ingesta de cada hora no se caiga."""
    import resumen_ia
    eventos = [{"id": f"e{i}", "severidad": 3, "fecha_utc": "2026-11-11T00:00:00Z", "nivel_alerta": "RUTINA"} for i in range(6)]
    textos = {e["id"]: ("Título", "Texto del medio sobre el tema.", "Medio") for e in eventos}
    t = [0]

    def reloj():
        return t[0]

    def pedir(*a):
        t[0] += 100  # cada resumen «tarda» 100 s
        return "Resumen propio del tema."

    c = {**run.config_ia(cfg(), {"IA_LOCAL_URL": "http://x"}), "presupuesto_s": 250}
    est = resumen_ia.resumir(eventos, textos, c, "local", pedir_fn=pedir, dormir=lambda s: None, reloj=reloj)
    assert est["pendientes"] == 3 and any("tope" in e for e in est["errores"])


def test_panorama_local_mas_ligero():
    import panorama_ia
    c = run.config_ia(cfg(), {"IA_LOCAL_URL": "http://x"})
    assert c["eventos_panorama"] <= 20 and c["max_tokens_panorama"] <= 1000 and c["horas_panorama"] >= 12
    rep = {"destacados": [], "secciones": [{"eventos": [{"id": f"nt-{i}"} for i in range(40)]}]}
    assert len(panorama_ia.eventos_para_ia(rep, c["eventos_panorama"])) == c["eventos_panorama"]
    llamadas = []

    def pedir(*a):
        llamadas.append(a)
        raise TimeoutError

    rep = {**rep, "tipo": "global", "titulo": "x", "fecha": "2026-11-11", "panorama_reglas": ""}
    from datetime import datetime, timezone
    assert panorama_ia.panorama(rep, None, c, "local", datetime.now(timezone.utc), pedir_fn=pedir) is None
    assert len(llamadas) == 1, "en local se intenta una sola vez: cada intento en CPU tarda minutos"
