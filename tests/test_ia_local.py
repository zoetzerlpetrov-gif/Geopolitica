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
