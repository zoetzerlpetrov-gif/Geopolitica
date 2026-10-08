"""Resumen redactado con IA (Groq, API compatible con OpenAI), opcional.

Solo corre si existe el secreto GROQ_API_KEY. Para cada nota de RSS o ReliefWeb elegida (máximo
`max_por_corrida`, primero FLASH y PRIORIDAD) pide un resumen propio en español de ~35 palabras a
partir del título y la descripción del feed. El texto del medio se envía a Groq solo para resumir;
no se guarda.

Salvaguardas:
  - Se rechaza el resumen si copia 6 o más palabras seguidas del título o la descripción, si es muy
    corto o muy largo, si incluye enlaces o si el modelo responde INSUFICIENTE. En ese caso queda
    el resumen por reglas (ingest/resumen.py).
  - Nunca se resume GDELT: no hay texto del artículo y el modelo podría inventar.
  - Un error 429 (límite gratuito) detiene la ronda; lo pendiente se intenta en la siguiente corrida.
  - La clave nunca se imprime.
"""
import json
import re
import time
import urllib.error
import urllib.request

from classify import normalizar

UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"

INSTRUCCIONES = (
    "Eres un analista de noticias internacionales. Resume la nota en español, con tus propias palabras, "
    "en una o dos frases y como máximo 35 palabras. Di qué pasó, dónde y quiénes participan. "
    "Usa solo la información del título y del texto; no inventes cifras, causas, fechas ni consecuencias. "
    "No copies frases del texto. Sin comillas, sin enlaces y sin introducciones como «La nota dice». "
    "Si la información no alcanza para un resumen fiel, responde exactamente: INSUFICIENTE"
)


def _ngramas(texto, n):
    p = normalizar(texto).split()
    return {" ".join(p[i:i + n]) for i in range(len(p) - n + 1)}


def motivo_rechazo(resumen, titulo, texto, n=6, min_palabras=8, max_palabras=50):
    """None si el resumen sirve; si no, el motivo: vacio, insuficiente, corto, largo, enlace, incompleto o copia."""
    if not resumen:
        return "vacio"
    if resumen.strip().upper().startswith("INSUFICIENTE"):
        return "insuficiente"
    palabras = resumen.split()
    if len(palabras) < min_palabras:
        return "corto"
    if len(palabras) > max_palabras or len(resumen) > 400:
        return "largo"
    if re.search(r"https?://|www\.", resumen):
        return "enlace"
    if not re.search(r"[.!?…)»”]$", resumen.strip()):
        return "incompleto"  # cortado a media frase (p. ej. se agotaron los tokens)
    if _ngramas(resumen, n) & _ngramas(f"{titulo} {texto}", n):
        return "copia"
    return None


def valida(resumen, titulo, texto, **kw):
    """True si el resumen es propio (sin 6 palabras seguidas del medio), completo, de largo razonable y sin enlaces."""
    return motivo_rechazo(resumen, titulo, texto, **kw) is None


def limpiar(texto):
    t = (texto or "").strip().strip('"«»“”').strip()
    return re.sub(r"\s+", " ", t)


class LimiteAlcanzado(Exception):
    pass


class ModeloNoDisponible(Exception):
    pass


def pedir(titulo, texto, fuente, cfg, clave, modelo):
    """Una llamada a /chat/completions. Devuelve el texto del modelo."""
    cuerpo = {
        "model": modelo, "temperature": 0.2, "max_tokens": cfg.get("max_tokens", 600),
        "messages": [
            {"role": "system", "content": INSTRUCCIONES},
            {"role": "user", "content": f"Fuente: {fuente}\nTítulo: {titulo}\nTexto del medio (solo para entender, no copiar): {texto[:1200]}"},
        ],
    }
    if "gpt-oss" in modelo or "qwen" in modelo:
        # Modelos que razonan antes de responder: poco razonamiento y oculto, para que no se coma la respuesta.
        cuerpo["reasoning_effort"] = "low"
        cuerpo["reasoning_format"] = "hidden"
    req = urllib.request.Request(cfg["url"], data=json.dumps(cuerpo).encode(),
                                 headers={"Authorization": f"Bearer {clave}", "Content-Type": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            d = json.loads(r.read())
    except urllib.error.HTTPError as e:
        detalle = e.read()[:300].decode("utf-8", "replace")
        if e.code == 429:
            raise LimiteAlcanzado(detalle) from None
        if e.code in (400, 404) and ("model" in detalle.lower() or "decommission" in detalle.lower()):
            raise ModeloNoDisponible(detalle) from None
        raise RuntimeError(f"HTTP {e.code}: {detalle}") from None
    return d["choices"][0]["message"]["content"]


def elegir(eventos, textos, maximo):
    """Eventos a resumir: con texto del medio en esta corrida, sin resumen de IA, FLASH y PRIORIDAD primero."""
    peso = {"FLASH": 0, "PRIORIDAD": 1, "RUTINA": 2}
    candidatos = [e for e in eventos if e["id"] in textos and e.get("resumen_origen") != "ia"]
    candidatos.sort(key=lambda e: (peso.get(e.get("nivel_alerta"), 3), -e["severidad"], e["fecha_utc"]), reverse=False)
    return candidatos[:maximo]


def resumir(eventos, textos, cfg, clave, pedir_fn=pedir, dormir=time.sleep):
    """Pone resumen de IA en los eventos elegidos (modifica en sitio). Devuelve estadísticas para el run-log."""
    est = {"proveedor": cfg.get("proveedor", "groq"), "modelo": None, "resumidos": 0, "rechazados": 0, "motivos": {}, "errores": [], "pendientes": 0}
    modelos = list(cfg["modelos"])
    elegidos = elegir(eventos, textos, cfg["max_por_corrida"])
    for i, ev in enumerate(elegidos):
        titulo, texto, fuente = textos[ev["id"]]
        while modelos:
            try:
                salida = limpiar(pedir_fn(titulo, texto, fuente, cfg, clave, modelos[0]))
                break
            except ModeloNoDisponible as e:
                est["errores"].append(f"modelo {modelos[0]} no disponible: {str(e)[:120]}")
                modelos.pop(0)
            except LimiteAlcanzado:
                est["errores"].append("límite gratuito alcanzado (429): el resto queda para la siguiente corrida")
                est["pendientes"] = len(elegidos) - i
                return est
            except Exception as e:  # noqa: BLE001
                est["errores"].append(str(e)[:160])
                salida = None
                break
        else:
            est["errores"].append("ningún modelo de la lista está disponible")
            est["pendientes"] = len(elegidos) - i
            return est
        est["modelo"] = modelos[0]
        motivo = motivo_rechazo(salida, titulo, texto) if salida is not None else None
        if salida is not None and motivo is None:
            ev["resumen"] = salida
            ev["resumen_origen"] = "ia"
            ev["resumen_modelo"] = f"{est['proveedor']}/{modelos[0]}"
            est["resumidos"] += 1
        elif salida is not None:
            est["rechazados"] += 1
            est["motivos"][motivo] = est["motivos"].get(motivo, 0) + 1
        dormir(cfg.get("pausa_s", 2.5))
    return est
