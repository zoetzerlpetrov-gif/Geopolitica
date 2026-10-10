"""Panorama con IA para los reportes diarios: escenarios a corto, mediano y largo plazo (opcional).

Corre solo si existe el secreto GROQ_API_KEY y a lo más cada `HORAS_ENTRE` horas por reporte; si no, se conserva
el panorama anterior del mismo día. Lo que se envía al modelo: título, fuente, fecha, severidad y el resumen PROPIO
de los eventos del reporte (nunca el texto de los medios). Lo que se pide: escenarios con probabilidad cualitativa,
señales observables a vigilar y los identificadores de los eventos en que se basa cada escenario.

Salvaguardas (si la respuesta no las cumple, se descarta y queda el panorama anterior o ninguno):
  - JSON con la forma pedida; 1 a 3 escenarios por horizonte; probabilidad «alta», «media» o «baja».
  - Cada escenario cita eventos que existen en el reporte (los inventados se quitan; sin ninguno, el escenario se quita).
  - Sin enlaces; títulos y textos con longitud acotada.
Se publica con un aviso: es una hipótesis generada por un modelo de lenguaje, no una predicción ni asesoría.
"""
import json
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
HORAS_ENTRE = 6
MAX_EVENTOS = 35
HORIZONTES = {
    "corto_plazo": "próximas 4 semanas",
    "mediano_plazo": "de 3 a 12 meses",
    "largo_plazo": "de 1 a 5 años",
}
AVISO = ("Escenarios generados por un modelo de lenguaje a partir de los eventos de este reporte. Son hipótesis para "
         "pensar, no predicciones ni asesoría: el modelo puede equivocarse u omitir factores. Verifica cada evento citado.")

INSTRUCCIONES = """Eres un analista de prospectiva geopolítica. Escribes en español claro para alguien que está aprendiendo.
Recibes una lista de eventos de las últimas 24 horas, cada uno con un identificador entre corchetes.
Tarea: proponer escenarios plausibles para tres horizontes: corto plazo (próximas 4 semanas), mediano plazo (3 a 12 meses)
y largo plazo (1 a 5 años, tendencias estructurales).

Reglas:
- Basa cada escenario en los eventos listados y cita sus identificadores exactos en "eventos". No cites identificadores que no estén en la lista.
- No inventes hechos, cifras, fechas ni declaraciones. Si usas contexto general conocido, que sea estable y no lo presentes como noticia.
- Cada escenario: "titulo" (máximo 12 palabras), "descripcion" (40 a 90 palabras: qué podría pasar y por qué, mencionando el mecanismo),
  "probabilidad" ("alta", "media" o "baja", relativa a los otros escenarios), "senales" (2 a 4 indicadores observables que confirmarían o
  descartarían el escenario).
- De 1 a 3 escenarios por horizonte. Tono neutral, sin adjetivos alarmistas, sin recomendaciones de inversión ni de seguridad personal.
- Sin enlaces.
Responde solo con JSON con esta forma:
{"corto_plazo":{"escenarios":[{"titulo":"","descripcion":"","probabilidad":"","senales":[""],"eventos":[""]}]},
 "mediano_plazo":{"escenarios":[...]}, "largo_plazo":{"escenarios":[...]}}"""


def eventos_para_ia(rep):
    """Destacados y los principales de cada sección (notas de medios primero), sin repetir; máximo MAX_EVENTOS."""
    vistos, out = set(), []
    grupos = [rep.get("destacados", [])] + [s["eventos"] for s in rep["secciones"]] + [(rep.get("entorno") or {}).get("eventos", [])]
    for grupo in grupos:
        for e in sorted(grupo, key=lambda e: e.get("automatico", False)):
            if e["id"] not in vistos and len(out) < MAX_EVENTOS:
                vistos.add(e["id"])
                out.append(e)
    return out


def mensaje_usuario(rep, eventos):
    lineas = [f"Reporte: {rep['titulo']} ({rep['fecha']}). Resumen por reglas: {rep['panorama_reglas']}", "", "Eventos:"]
    for e in eventos:
        tipo = "señal automática" if e.get("automatico") else e.get("fuente", "")
        lineas.append(f"[{e['id']}] ({e.get('fecha_utc', '')[:10]}, {tipo}, severidad {e.get('severidad')}) {e['titulo']} — {e.get('resumen', '')[:220]}")
    return "\n".join(lineas)


def _texto(x, maximo):
    x = re.sub(r"\s+", " ", str(x or "")).strip()
    return x if 0 < len(x) <= maximo and not re.search(r"https?://|www\.", x) else None


def validar(datos, ids_validos):
    """Respuesta del modelo → horizontes limpios, o None si no sirve."""
    if not isinstance(datos, dict):
        return None
    horizontes = {}
    for clave, texto_h in HORIZONTES.items():
        escenarios = []
        for esc in ((datos.get(clave) or {}).get("escenarios") or [])[:3]:
            if not isinstance(esc, dict):
                continue
            titulo, desc = _texto(esc.get("titulo"), 140), _texto(esc.get("descripcion"), 900)
            prob = str(esc.get("probabilidad", "")).strip().lower()
            ids = [i for i in esc.get("eventos") or [] if i in ids_validos]
            senales = [s for s in (_texto(s, 200) for s in (esc.get("senales") or [])[:4]) if s]
            if not titulo or not desc or len(desc.split()) < 15 or prob not in ("alta", "media", "baja") or not ids:
                continue
            escenarios.append({"titulo": titulo, "descripcion": desc, "probabilidad": prob, "senales": senales, "eventos": ids})
        if escenarios:
            horizontes[clave] = {"horizonte": texto_h, "escenarios": escenarios}
    return horizontes if len(horizontes) >= 2 else None


def _json_de(texto):
    try:
        return json.loads(texto)
    except (json.JSONDecodeError, TypeError):
        m = re.search(r"\{.*\}", texto or "", re.S)
        try:
            return json.loads(m.group(0)) if m else None
        except json.JSONDecodeError:
            return None


def pedir(rep, eventos, cfg, clave, modelo, json_mode=True):
    cuerpo = {"model": modelo, "temperature": 0.3, "max_tokens": 3500,
              "messages": [{"role": "system", "content": INSTRUCCIONES}, {"role": "user", "content": mensaje_usuario(rep, eventos)}]}
    if json_mode:
        cuerpo["response_format"] = {"type": "json_object"}
    if "gpt-oss" in modelo or "qwen" in modelo:
        cuerpo["reasoning_effort"] = "medium"
        cuerpo["reasoning_format"] = "hidden"
    req = urllib.request.Request(cfg["url"], data=json.dumps(cuerpo).encode(),
                                 headers={"Authorization": f"Bearer {clave}", "Content-Type": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())["choices"][0]["message"]["content"]


def reciente(previo, t):
    p = (previo or {}).get("panorama_ia")
    if not p:
        return None
    gen = datetime.strptime(p["generado_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return p if t - gen < timedelta(hours=HORAS_ENTRE) else None


def panorama(rep, previo, cfg, clave, t, pedir_fn=pedir, dormir=time.sleep):
    """Panorama nuevo, el previo si es reciente o si falla la IA, o None. Nunca lanza excepción."""
    guardado = (previo or {}).get("panorama_ia")
    if reciente(previo, t) or not clave:
        return guardado
    eventos = eventos_para_ia(rep)
    if len(eventos) < 3:
        return guardado
    ids = {e["id"] for e in eventos}
    errores = []
    for modelo in cfg.get("modelos", [])[:3]:
        for json_mode in (True, False):
            try:
                horizontes = validar(_json_de(pedir_fn(rep, eventos, cfg, clave, modelo, json_mode)), ids)
            except urllib.error.HTTPError as e:
                errores.append(f"{modelo}: HTTP {e.code}")
                if e.code == 429:
                    # Límite por minuto del plan gratuito: cada modelo tiene el suyo. Se espera y se prueba el siguiente.
                    dormir(20)
                    break
                continue
            except Exception as e:  # noqa: BLE001
                errores.append(f"{modelo}: {type(e).__name__}")
                continue
            if horizontes:
                return {"generado_utc": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "modelo": f"{cfg.get('proveedor', 'groq')}/{modelo}",
                        "aviso": AVISO, "horizontes": horizontes, "eventos_base": len(eventos)}
            errores.append(f"{modelo}: respuesta no válida")
    print(f"panorama IA ({rep['tipo']}): sin resultado · {errores}")
    return guardado
