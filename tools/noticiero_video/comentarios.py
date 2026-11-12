"""Comentarios de Brújula Diaria en YouTube: propone respuestas para que la administración las apruebe.

Qué hace (workflow «Comentarios de YouTube», una vez al día):
  1. Lee los comentarios nuevos de los videos del canal (API de YouTube con el permiso youtube.force-ssl).
  2. Omite los que el canal ya respondió.
  3. Los ofensivos, de odio o spam los marca «retenido» y los pasa a «retenido para revisión» en YouTube (no se borran).
  4. Para el resto, la IA local (el mismo modelo abierto de la ingesta) redacta una respuesta corta usando solo lo que
     dijo el noticiero de ese video (guiones/<video>.json) o, sin guion, el título y la descripción.
  5. Escribe comentarios/borradores.json: SOLO identificadores, la categoría y el texto propuesto. No guarda el nombre
     ni el texto de quien comenta (datos personales); la página comentarios.html los pide a YouTube al abrirla.

Nada se publica desde aquí: la respuesta sale solo cuando la persona la aprueba en comentarios.html. Máximo
MAX_POR_VIDEO respuestas propuestas por video (las de más «me gusta» primero).
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
from subir import PermisoCaducado, token_de_acceso  # noqa: E402

API = "https://www.googleapis.com/youtube/v3/"
MAX_POR_VIDEO = 10
DIAS = 14

# Ofensivo u odio: insultos frecuentes en México y en inglés, y ataques a grupos. Lista corta a propósito: la IA también
# clasifica, y lo dudoso se retiene (se puede liberar desde la página).
OFENSIVO = re.compile(
    r"\b(pendej\w*|put[oa]s?|putit\w*|chinga\w*|verga\w*|culer\w*|cabr[oó]n\w*|mierd\w*|imb[eé]cil\w*|idiota\w*|est[uú]pid\w*|"
    r"maric[oó]n\w*|joto\w*|naco\w*|indio pata rajada|gat[oa] igualad\w*|zorr[ao]\w*|perr[ao] maldit\w*|"
    r"fuck\w*|shit\w*|bitch\w*|asshole\w*|retard\w*|nigg\w*|fag\w*|kys|m[aá]tate|te voy a matar|ojal[aá] (te|se) muera\w*)\b",
    re.I)
SPAM = re.compile(r"https?://|www\.|\bt\.me/|telegram|whats ?app|\+?\d[\d\s-]{9,}|suscr[ií]bete a mi|visita mi canal|"
                  r"gana dinero|inversi[oó]n segura|criptos? gratis|onlyfans|promo code", re.I)


def clasificar_local(texto):
    """«ofensivo», «spam» u «ok» por reglas (antes de gastar la IA)."""
    t = texto or ""
    if OFENSIVO.search(t):
        return "ofensivo"
    if SPAM.search(t):
        return "spam"
    return "ok"


def api(ruta, acceso, params=None, metodo="GET", cuerpo=None, abrir=urllib.request.urlopen):
    url = API + ruta + ("?" + urllib.parse.urlencode(params) if params else "")
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else (b"" if metodo == "POST" else None)
    req = urllib.request.Request(url, data=datos, method=metodo, headers={"Authorization": f"Bearer {acceso}", "Content-Type": "application/json"})
    with abrir(req, timeout=60) as r:
        txt = r.read()
    return json.loads(txt) if txt else {}


def respondido_por(hilo, canal):
    """True si el canal ya respondió en el hilo (o si el comentario es del propio canal)."""
    top = hilo.get("snippet", {}).get("topLevelComment", {}).get("snippet", {})
    if (top.get("authorChannelId") or {}).get("value") == canal:
        return True
    return any((c.get("snippet", {}).get("authorChannelId") or {}).get("value") == canal for c in (hilo.get("replies") or {}).get("comments", []))


def contexto_video(guion=None, video=None, max_car=3500):
    """Lo que dijo el noticiero: textos de las escenas del guion; sin guion, título y descripción del video."""
    if guion:
        partes = [guion.get("titulo", "")]
        for e in guion.get("escenas", []):
            t = (e.get("texto") or "").strip()
            if t:
                partes.append(f"{e.get('encabezado', '')}: {t}")
        texto = "\n".join(partes)
    else:
        sn = (video or {}).get("snippet", {})
        texto = f"{sn.get('title', '')}\n{sn.get('description', '')}"
    return texto[:max_car]


INSTRUCCIONES = """Eres la persona que administra el canal de YouTube «Brújula Diaria», un noticiero en español de México.
Recibes un comentario de un espectador y lo que dijo el noticiero de ese día. Tarea:
1. Clasifica el comentario: "ofensivo" (insultos, odio, acoso, amenazas o desprecio a un grupo), "spam" (publicidad,
   enlaces, estafas), "sin_respuesta" (solo emojis o algo que no requiere respuesta) u "ok".
2. Si es "ok", escribe una respuesta breve (10 a 60 palabras), amable y en español de México: agradece, responde solo
   con lo que dijo el noticiero y, si no tienes el dato, di que las fuentes están en la descripción. Si señala un error,
   reconócelo y agradece la corrección. No opines de política ni de partidos, no des consejos de inversión, de salud
   ni legales, no prometas nada, no incluyas enlaces ni hashtags y no inventes datos.
Responde solo JSON: {"categoria": "ok|ofensivo|spam|sin_respuesta", "respuesta": "<texto o vacío>"}"""


def pedir_ia(url, comentario, contexto, timeout=90):
    cuerpo = {"model": "local", "temperature": 0.3, "max_tokens": 200, "response_format": {"type": "json_object"},
              "messages": [{"role": "system", "content": INSTRUCCIONES},
                           {"role": "user", "content": f"Lo que dijo el noticiero:\n{contexto}\n\nComentario:\n{comentario[:1500]}"}]}
    req = urllib.request.Request(url, data=json.dumps(cuerpo).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())["choices"][0]["message"]["content"]


def valida_respuesta(texto):
    r = re.sub(r"\s+", " ", str(texto or "")).strip().strip('"«»“”')
    if not 5 <= len(r.split()) <= 70 or re.search(r"https?://|www\.|#\w", r):
        return None
    if re.search(r"\b(compra|vende|invierte en|te recomiendo invertir|vota por|no votes)\b", r, re.I):
        return None
    return r


def interpretar(texto):
    try:
        d = json.loads(texto)
    except (json.JSONDecodeError, TypeError):
        m = re.search(r"\{.*\}", texto or "", re.S)
        try:
            d = json.loads(m.group(0)) if m else {}
        except json.JSONDecodeError:
            d = {}
    cat = d.get("categoria") if d.get("categoria") in ("ok", "ofensivo", "spam", "sin_respuesta") else None
    return cat, (valida_respuesta(d.get("respuesta")) if cat == "ok" else None)


def proponer(hilos, canal, contextos, url_ia=None, pedir_fn=pedir_ia, previos=None, max_por_video=MAX_POR_VIDEO,
             presupuesto_s=900, reloj=time.monotonic):
    """hilos: commentThreads de YouTube → [borrador]. contextos: {video: texto}. previos: borradores de corridas
    anteriores (no se vuelven a redactar). Devuelve solo identificadores, categoría y texto propuesto."""
    previos = {b["comentario"]: b for b in (previos or [])}
    por_video, out, inicio = {}, [], reloj()
    ordenados = sorted(hilos, key=lambda h: h.get("snippet", {}).get("topLevelComment", {}).get("snippet", {}).get("likeCount", 0), reverse=True)
    for h in ordenados:
        sn = h.get("snippet", {})
        top = sn.get("topLevelComment", {})
        cid, vid = top.get("id"), sn.get("videoId")
        if not cid or not vid or respondido_por(h, canal):
            continue
        if cid in previos:
            out.append(previos[cid])
            continue
        tsn = top.get("snippet", {})
        texto = tsn.get("textOriginal") or tsn.get("textDisplay") or ""
        cat, resp = clasificar_local(texto), None
        if cat == "ok" and url_ia and reloj() - inicio < presupuesto_s:
            try:
                cat_ia, resp = interpretar(pedir_fn(url_ia, texto, contextos.get(vid, "")))
                cat = cat_ia or cat
            except Exception as e:  # noqa: BLE001
                print(f"  IA comentario: {type(e).__name__}")
        if cat == "sin_respuesta":
            continue
        if cat == "ok":
            if por_video.get(vid, 0) >= max_por_video:
                continue
            por_video[vid] = por_video.get(vid, 0) + 1
        out.append({"comentario": cid, "hilo": h.get("id"), "video": vid, "categoria": "retenido" if cat in ("ofensivo", "spam") else "ok",
                    "motivo": cat if cat in ("ofensivo", "spam") else "", "borrador": resp or "",
                    "me_gusta": tsn.get("likeCount", 0), "fecha": tsn.get("publishedAt", "")})
    return out


AVISO_PERMISO = ("Falta el permiso para leer y responder comentarios. En tu computadora vuelve a correr "
                 "«python3 tools/noticiero_video/autorizar.py» (ahora pide subir videos y administrar comentarios) y reemplaza "
                 "el secreto YT_REFRESH_TOKEN en GitHub con el valor nuevo.")


def main(salida="comentarios", guiones_dir="guiones"):
    os.makedirs(salida, exist_ok=True)
    destino = os.path.join(salida, "borradores.json")
    previos = []
    try:
        previos = json.load(open(destino, encoding="utf-8")).get("borradores", [])
    except (OSError, ValueError):
        pass
    res = {"generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "aviso": "", "videos": {}, "borradores": previos}
    cid, secreto, refresco = (os.environ.get(k, "") for k in ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN"))
    try:
        if not (cid and secreto and refresco):
            raise PermisoCaducado("sin secretos")
        acceso = token_de_acceso(cid, secreto, refresco)
        canal = api("channels", acceso, {"part": "id", "mine": "true"})["items"][0]["id"]
        hilos, token = [], None
        limite = (datetime.now(timezone.utc) - timedelta(days=DIAS)).strftime("%Y-%m-%dT%H:%M:%SZ")
        while True:
            p = {"part": "snippet,replies", "allThreadsRelatedToChannelId": canal, "maxResults": 100, "order": "time"}
            if token:
                p["pageToken"] = token
            r = api("commentThreads", acceso, p)
            nuevos = [h for h in r.get("items", []) if h.get("snippet", {}).get("topLevelComment", {}).get("snippet", {}).get("publishedAt", "") >= limite]
            hilos += nuevos
            token = r.get("nextPageToken")
            if not token or len(nuevos) < len(r.get("items", [])) or len(hilos) >= 500:
                break
        ids = sorted({h["snippet"]["videoId"] for h in hilos if h.get("snippet", {}).get("videoId")})
        contextos, titulos = {}, {}
        for i in range(0, len(ids), 50):
            for v in api("videos", acceso, {"part": "snippet", "id": ",".join(ids[i:i + 50])}).get("items", []):
                guion = None
                try:
                    guion = json.load(open(os.path.join(guiones_dir, f"{v['id']}.json"), encoding="utf-8"))
                except (OSError, ValueError):
                    pass
                contextos[v["id"]] = contexto_video(guion, v)
                titulos[v["id"]] = v.get("snippet", {}).get("title", "")
        borradores = proponer(hilos, canal, contextos, os.environ.get("IA_LOCAL_URL", "").strip() or None, previos=previos)
        for b in borradores:
            if b["categoria"] == "retenido" and not b.get("retenido_en_youtube"):
                try:
                    api("comments/setModerationStatus", acceso, {"id": b["comentario"], "moderationStatus": "heldForReview"}, metodo="POST")
                    b["retenido_en_youtube"] = True
                except urllib.error.HTTPError as e:
                    print(f"  No se pudo retener {b['comentario']}: HTTP {e.code}")
        res.update({"videos": titulos, "borradores": borradores})
        print(f"{len(hilos)} hilos · {sum(b['categoria'] == 'ok' for b in borradores)} respuestas propuestas · "
              f"{sum(b['categoria'] == 'retenido' for b in borradores)} retenidos")
    except PermisoCaducado:
        res["aviso"] = AVISO_PERMISO
        print(f"::warning title=Comentarios de YouTube::{AVISO_PERMISO}")
    except urllib.error.HTTPError as e:
        cuerpo = e.read().decode("utf-8", "replace")
        res["aviso"] = AVISO_PERMISO if e.code == 403 and ("insufficient" in cuerpo.lower() or "scope" in cuerpo.lower()) else f"YouTube respondió HTTP {e.code}."
        print(f"::warning title=Comentarios de YouTube::{res['aviso']}")
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(*(sys.argv[1:3]))
