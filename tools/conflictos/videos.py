#!/usr/bin/env python3
"""Videos recientes de cada conflicto de config/conflictos.json, con la API de datos de YouTube (v3).

Solo corre si existe el secreto YOUTUBE_API_KEY (llave gratuita de Google Cloud; cuota de 10,000 unidades al día,
cada búsqueda cuesta 100). YouTube prohíbe en su robots.txt leer sus feeds de forma automática, por eso se usa la API
oficial y no otra vía. Cada 2 h se leen los últimos 50 videos subidos por cada canal de medios de noticias de la lista
CANALES (playlistItems, 1 unidad por canal) y se asignan a cada conflicto por sus palabras clave en el título (7 días). Así solo aparecen medios conocidos: nada de propaganda, contenido gráfico sin contexto ni
cuentas anónimas. Se guarda el identificador del video, título, canal y fecha; el video se
reproduce insertado con el reproductor oficial de YouTube (youtube-nocookie.com) desde la ficha.
Además, «recientes» guarda todos los videos de esos canales de los últimos 7 días (sin gastar más cuota): las fichas de
seguridad, emergencias, salud, criminología y carreteras eligen ahí los que nombran su lugar y su tema.
Salida: vivos/conflictos_videos.json.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SALIDA = os.path.join(ROOT, "vivos", "conflictos_videos.json")
API = "https://www.googleapis.com/youtube/v3/playlistItems"
HORAS = 2
DIAS = 7
# Canales de medios de noticias (identificadores verificados el 2026-10-17).
CANALES = {
    "UCT4Jg8h03dD0iN3Pb5L0PMA": "DW Español", "UCVHNftB4Z2juvIY1R8dRg1Q": "BBC News Mundo", "UCyoGb3SMlTlB8CLGVH4c8Rw": "Euronews Español",
    "UC52X5wxOL_s5yw0dQk7NtgA": "Associated Press", "UChqUTb7kYRX8-EiaN3XFrSQ": "Reuters", "UCfiwzLy-8yKzIbsmZTzxDgw": "Al Jazeera English",
    "UCkFclpi8U9VJjfxLYoms7Aw": "Sky News", "UC_lEiu6917IJz03TnntWUaQ": "CNN en Español", "UCbbS1GE942k3UVqpLklyhIA": "DW News",
    "UCCCPCZNChQdGa9EkATeye4g": "France 24 English", "UCnsvJeZO4RigQ898WdDNoBw": "EL PAÍS", "UCEJs1fTF3KszRJGxJY14VrA": "NTN24",
    "UCUsm-fannqOY02PNN67C0KA": "N+",
}


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


import re
import unicodedata


def norm(t):
    return unicodedata.normalize("NFD", str(t or "")).encode("ascii", "ignore").decode().lower()


def subidos(llave, canal):
    """Últimos 50 videos subidos por un canal (lista «uploads» = UU + id del canal sin «UC»)."""
    params = {"part": "snippet", "playlistId": "UU" + canal[2:], "maxResults": 50, "key": llave}
    with urllib.request.urlopen(f"{API}?{urllib.parse.urlencode(params)}", timeout=30) as r:
        return json.loads(r.read()).get("items", [])


def asignar(videos, conflictos, desde, max_por_conflicto=6):
    """[(canal, item)] → {conflicto: [videos]} por palabras clave en el título."""
    reglas = [(c["id"], re.compile(r"\b(" + "|".join(re.escape(norm(p)) for p in c.get("palabras", []) if len(p) >= 3) + r")\b")) for c in conflictos if c.get("palabras")]
    out, vistos = {c["id"]: [] for c in conflictos}, set()
    for canal, it in videos:
        s = it.get("snippet") or {}
        vid = (s.get("resourceId") or {}).get("videoId")
        fecha = (s.get("publishedAt") or "")[:19] + "Z"
        if not vid or vid in vistos or fecha < desde or s.get("title") in ("Private video", "Deleted video"):
            continue
        texto = norm(s.get("title"))  # solo el título: las descripciones de noticieros mencionan muchos temas
        for cid, rx in reglas:
            if rx.search(texto):
                out[cid].append({"video": vid, "titulo": " ".join((s.get("title") or "").split())[:160], "canal": CANALES[canal], "fecha": fecha})
                vistos.add(vid)
                break
    return {k: sorted(v, key=lambda x: x["fecha"], reverse=True)[:max_por_conflicto] for k, v in out.items()}


def recientes(videos, desde, maximo=700):
    """[(canal, item)] → [{v, t, c, f}] de los últimos días, sin repetir, del más nuevo al más viejo."""
    out, vistos = [], set()
    for canal, it in videos:
        s = it.get("snippet") or {}
        vid = (s.get("resourceId") or {}).get("videoId")
        fecha = (s.get("publishedAt") or "")[:19] + "Z"
        if not vid or vid in vistos or fecha < desde or s.get("title") in ("Private video", "Deleted video"):
            continue
        vistos.add(vid)
        out.append({"v": vid, "t": " ".join((s.get("title") or "").split())[:160], "c": CANALES[canal], "f": fecha})
    return sorted(out, key=lambda x: x["f"], reverse=True)[:maximo]


def main():
    llave = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not llave:
        print("videos de conflictos: sin llave (secreto YOUTUBE_API_KEY); se omite")
        return 0
    ahora = datetime.now(timezone.utc)
    try:
        previo = json.load(open(SALIDA, encoding="utf-8"))
        if ahora - datetime.strptime(previo["generado_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=HORAS):
            print("videos de conflictos: datos recientes")
            return 0
    except (OSError, ValueError, KeyError):
        previo = {"videos": {}}
    cfg = json.load(open(os.path.join(ROOT, "config", "conflictos.json"), encoding="utf-8"))
    desde, todos, errores = iso(ahora - timedelta(days=DIAS)), [], []
    for canal in CANALES:
        try:
            todos += [(canal, it) for it in subidos(llave, canal)]
        except Exception as e:  # noqa: BLE001
            errores.append(f"{CANALES[canal]}: {e}"[:120])
        time.sleep(0.3)
    videos, ultimos = asignar(todos, cfg["conflictos"], desde), recientes(todos, desde)
    if not todos:  # la API no respondió: se conserva lo anterior
        videos, ultimos = previo.get("videos", {}), previo.get("recientes", [])
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    json.dump({"generado_utc": iso(ahora), "fuente": "YouTube Data API v3 (canales de noticias)", "errores": errores, "videos": videos, "recientes": ultimos},
              open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"videos de conflictos: {sum(len(v) for v in videos.values())} videos; errores: {len(errores)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
