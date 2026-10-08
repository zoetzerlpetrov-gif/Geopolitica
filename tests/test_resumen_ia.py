"""Resumen con IA (Groq) simulado: validación anti-copia, prioridades, respaldo de modelos y límite 429.

Ejecutar:  python3 -m pytest -q tests/test_resumen_ia.py   (no hace llamadas reales ni necesita clave)
"""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
sys.path.insert(0, os.path.dirname(__file__))
import resumen_ia as IA  # noqa: E402
import test_ingesta as T  # noqa: E402
import fuentes as F  # noqa: E402

CFG = {"proveedor": "groq", "url": "https://example.invalid", "modelos": ["m1", "m2"], "max_por_corrida": 2, "pausa_s": 0}
TITULO = "Saudi Arabia confirms three dead in Houthi strikes on its airports"
TEXTO = "Yemen's Houthi rebels launched drones at two airports in southern Saudi Arabia, killing three people and injuring 12, officials said."
BUENO = "Ataques con drones de los hutíes de Yemen contra dos aeropuertos del sur de Arabia Saudita dejaron tres muertos y doce heridos, según autoridades saudíes."


def test_valida_rechaza_copias_enlaces_y_largos():
    assert IA.valida(BUENO, TITULO, TEXTO)
    copia = "Houthi rebels launched drones at two airports in southern Saudi Arabia, with victims."
    assert not IA.valida(copia, TITULO, TEXTO)                  # 6+ palabras seguidas del medio
    assert not IA.valida("INSUFICIENTE", TITULO, TEXTO)
    assert not IA.valida("Muy corto.", TITULO, TEXTO)
    assert not IA.valida(BUENO + " Más en https://x.org", TITULO, TEXTO)
    assert not IA.valida(" ".join(["palabra"] * 60), TITULO, TEXTO)


def _ev(id_, nivel, sev, origen=None):
    e = {"id": id_, "nivel_alerta": nivel, "severidad": sev, "fecha_utc": "2026-10-08T10:00:00Z", "resumen": "por reglas"}
    if origen:
        e["resumen_origen"] = origen
    return e


def test_elige_flash_y_prioridad_primero_y_omite_los_ya_resumidos():
    evs = [_ev("a", "RUTINA", 2), _ev("b", "FLASH", 5), _ev("c", "PRIORIDAD", 3), _ev("d", "FLASH", 5, "ia"), _ev("e", "PRIORIDAD", 4)]
    textos = {k: (TITULO, TEXTO, "BBC") for k in "abcde"}
    assert [e["id"] for e in IA.elegir(evs, textos, 3)] == ["b", "e", "c"]
    assert IA.elegir(evs, {"a": textos["a"]}, 5)[0]["id"] == "a"   # solo con texto de esta corrida


def test_resumir_respaldo_de_modelo_y_rechazo():
    llamadas = []

    def falso(titulo, texto, fuente, cfg, clave, modelo):
        llamadas.append(modelo)
        if modelo == "m1":
            raise IA.ModeloNoDisponible("model decommissioned")
        return BUENO if len(llamadas) == 2 else "Houthi rebels launched drones at two airports in southern Saudi Arabia today."

    evs = [_ev("b", "FLASH", 5), _ev("c", "PRIORIDAD", 3)]
    est = IA.resumir(evs, {k: (TITULO, TEXTO, "BBC") for k in "bc"}, CFG, "clave-secreta", pedir_fn=falso, dormir=lambda s: None)
    assert llamadas == ["m1", "m2", "m2"]
    assert evs[0]["resumen"] == BUENO and evs[0]["resumen_origen"] == "ia" and evs[0]["resumen_modelo"] == "groq/m2"
    assert evs[1]["resumen"] == "por reglas" and "resumen_origen" not in evs[1]   # copia rechazada
    assert est["resumidos"] == 1 and est["rechazados"] == 1 and est["modelo"] == "m2"
    assert "clave-secreta" not in repr(est)


def test_limite_429_detiene_la_ronda():
    def falso(*a):
        raise IA.LimiteAlcanzado("rate limit")
    evs = [_ev("b", "FLASH", 5), _ev("c", "PRIORIDAD", 3)]
    est = IA.resumir(evs, {k: (TITULO, TEXTO, "BBC") for k in "bc"}, CFG, "k", pedir_fn=falso, dormir=lambda s: None)
    assert est["resumidos"] == 0 and est["pendientes"] == 2 and "429" in est["errores"][0]


def test_en_la_ingesta_nunca_se_resume_gdelt_y_se_conserva_entre_corridas():
    recibidos = {}

    def resumidor(evs, textos):
        recibidos.update(textos)
        for e in evs:
            if e["id"] in textos:
                e.update(resumen=BUENO, resumen_origen="ia", resumen_modelo="groq/m")
        return {"resumidos": len(textos)}

    cands = T._candidatos()
    eventos, desc = T.R.procesar(cands, [], T.CFG, T.T, T.GAZ, T.PAISES, T.CLS, T.TAX, resumidor)
    assert recibidos and all(not k.startswith("gd-") for k in recibidos)
    assert desc["ia"]["resumidos"] == len(recibidos)
    assert T.validar(T._data(eventos), T.TAX) == []                    # el esquema acepta los campos nuevos
    # Siguiente corrida sin IA: el resumen de IA anterior se conserva para la misma nota.
    otra, _ = T.R.procesar(T._candidatos(), eventos, T.CFG, T.T, T.GAZ, T.PAISES, T.CLS, T.TAX)
    con_ia = [e for e in otra if e.get("resumen_origen") == "ia"]
    assert con_ia and all(e["resumen"] == BUENO for e in con_ia)


def test_motivos_de_rechazo():
    assert IA.motivo_rechazo(BUENO, TITULO, TEXTO) is None
    assert IA.motivo_rechazo("Tres personas murieron tras ataques de los hutíes contra aeropuertos de Arabia Saudita,", TITULO, TEXTO) == "incompleto"
    assert IA.motivo_rechazo("INSUFICIENTE", TITULO, TEXTO) == "insuficiente"
    assert IA.motivo_rechazo("Houthi rebels launched drones at two airports in southern Saudi Arabia, with victims.", TITULO, TEXTO) == "copia"


def test_modelos_que_razonan_piden_razonamiento_bajo_y_oculto(monkeypatch):
    enviado = {}

    class R:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self): return b'{"choices":[{"message":{"content":"ok"}}]}'

    def falso_urlopen(req, timeout):
        import json as _j
        enviado.clear()
        enviado.update(_j.loads(req.data))
        return R()

    monkeypatch.setattr(IA.urllib.request, "urlopen", falso_urlopen)
    IA.pedir(TITULO, TEXTO, "BBC", {"url": "https://x.invalid"}, "k", "openai/gpt-oss-120b")
    assert enviado["reasoning_effort"] == "low" and enviado["reasoning_format"] == "hidden" and enviado["max_tokens"] == 600
    IA.pedir(TITULO, TEXTO, "BBC", {"url": "https://x.invalid"}, "k", "llama-3.1-8b-instant")
    assert "reasoning_effort" not in enviado and "reasoning_format" not in enviado
