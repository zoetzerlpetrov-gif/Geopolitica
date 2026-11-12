"""Elige lo relevante de cada sección del Noticiero y lo redacta con palabras propias, con la IA local del workflow.

Por sección recibe hasta 6 candidatas (las que más medios repiten) y pide al modelo abierto (llama.cpp en GitHub
Actions, el mismo de la ingesta) que elija la que de verdad corresponde a la sección y sea más importante, y que la
cuente en UNA frase propia en español (traduce si el título está en otro idioma). Salvaguardas:
  - Solo se acepta un número de candidata que exista; null = ninguna corresponde (la sección se omite).
  - La frase: 10 a 45 palabras, sin enlaces, y no una copia del título (parecido < 0.85).
  - Un tema que ya salió en otra sección no se repite.
  - Tope de tiempo: al agotarlo, las secciones que faltan usan la elección sin IA (solo títulos en español).
Sin IA_LOCAL_URL todo usa la elección sin IA.
"""
import difflib
import json
import re
import time
import urllib.request

from guion import POR_SECCION, elegir_sin_ia, en_espanol, ya_contada

INSTRUCCIONES = """Eres redactor de un noticiero en español de México. Recibes el nombre de una sección y una lista numerada
de titulares (algunos en otro idioma), cada uno con su medio. Tarea:
1. Elige el titular que de verdad trata el tema de la sección y que sea la noticia más importante para el público
   de México. Si ninguno trata el tema de la sección, responde null.
2. Cuenta esa noticia en UNA frase de 15 a 35 palabras, en español neutral, con tus propias palabras (no copies el
   titular), sin opiniones, sin inventar datos que no estén en el titular, sin comillas ni enlaces.
Responde solo JSON: {"elegida": <número o null>, "resumen": "<frase>"}"""


def pedir(url, seccion, lista, timeout=120):
    usuario = f"Sección: {seccion}\nTitulares:\n" + "\n".join(f"{i}. {n['titulo']} ({n['medio']})" for i, n in enumerate(lista, 1))
    cuerpo = {"model": "local", "temperature": 0.2, "max_tokens": 160, "response_format": {"type": "json_object"},
              "messages": [{"role": "system", "content": INSTRUCCIONES}, {"role": "user", "content": usuario}]}
    req = urllib.request.Request(url, data=json.dumps(cuerpo).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())["choices"][0]["message"]["content"]


def valida(resumen, titulo):
    r = re.sub(r"\s+", " ", str(resumen or "")).strip().strip('"«»“”')
    if not 10 <= len(r.split()) <= 45 or re.search(r"https?://|www\.", r):
        return None
    if difflib.SequenceMatcher(None, r.lower(), titulo.lower()).ratio() >= 0.85:
        return None
    return r


def interpretar(texto, lista, titulo_de=lambda n: n["titulo"]):
    try:
        d = json.loads(texto)
    except (json.JSONDecodeError, TypeError):
        m = re.search(r"\{.*\}", texto or "", re.S)
        try:
            d = json.loads(m.group(0)) if m else {}
        except json.JSONDecodeError:
            d = {}
    k = d.get("elegida")
    if not isinstance(k, int) or not 1 <= k <= len(lista):
        return None, None
    return lista[k - 1], valida(d.get("resumen"), titulo_de(lista[k - 1]))


def elegir_y_redactar(cands, url=None, pedir_fn=pedir, presupuesto_s=900, reloj=time.monotonic):
    """cands: {sección: [notas]} (guion.candidatos_seccion) → notas elegidas, con «resumen» propio cuando la IA lo dio."""
    if not url:
        return elegir_sin_ia(cands)
    inicio, elegidas, stats = reloj(), [], {"ia": 0, "sin_ia": 0, "omitidas": 0, "errores": 0}
    for sec, lista in cands.items():
        for _ in range(POR_SECCION.get(sec, 1)):
            libres = [n for n in lista if n not in elegidas and not ya_contada(n, elegidas)]
            if not libres:
                break
            nota, resumen, respondio = None, None, False
            if reloj() - inicio < presupuesto_s:
                try:
                    nota, resumen = interpretar(pedir_fn(url, libres[0]["seccion_nombre"], libres), libres)
                    respondio = True
                except Exception as e:  # noqa: BLE001
                    stats["errores"] += 1
                    print(f"  IA {sec}: {type(e).__name__}")
            if respondio and nota is None:
                stats["omitidas"] += 1  # la IA dijo que ninguna corresponde a la sección
                break
            if nota is not None and resumen:
                elegidas.append({**nota, "resumen": resumen})
                stats["ia"] += 1
                continue
            # Sin resumen válido: la elegida (o la primera) solo si su título está en español; se cita como titular.
            alterna = next((n for n in ([nota] if nota else []) + libres if en_espanol(n["titulo"])), None)
            if alterna is None:
                break
            elegidas.append(alterna)
            stats["sin_ia"] += 1
    print(f"redacción: {stats}")
    return elegidas
