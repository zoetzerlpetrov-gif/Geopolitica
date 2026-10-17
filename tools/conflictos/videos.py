#!/usr/bin/env python3
"""Videos recientes de cada conflicto de config/conflictos.json, con la API de datos de YouTube (v3).

Solo corre si existe el secreto YOUTUBE_API_KEY (llave gratuita de Google Cloud; cuota de 10,000 unidades al día,
cada búsqueda cuesta 100). YouTube prohíbe en su robots.txt leer sus feeds de forma automática, por eso se usa la API
oficial y no otra vía. Cada 6 h, una búsqueda por conflicto (videos de los últimos 7 días que se pueden insertar).
Se conservan solo los de canales de medios de noticias de la lista CANALES, para no mostrar propaganda, contenido
gráfico sin contexto ni cuentas anónimas. Se guarda el identificador del video, título, canal y fecha; el video se
reproduce insertado con el reproductor oficial de YouTube (youtube-nocookie.com) desde la ficha.
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
API = "https://www.googleapis.com/youtube/v3/search"
HORAS = 6
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


def filtrar(items, max_por_conflicto=6):
    out = []
    for it in items:
        s, vid = it.get("snippet") or {}, (it.get("id") or {}).get("videoId")
        if not vid or s.get("channelId") not in CANALES or s.get("liveBroadcastContent") == "upcoming":
            continue
        out.append({"video": vid, "titulo": " ".join((s.get("title") or "").split())[:160], "canal": CANALES[s["channelId"]], "fecha": (s.get("publishedAt") or "")[:19] + "Z"})
    return sorted(out, key=lambda x: x["fecha"], reverse=True)[:max_por_conflicto]


def buscar(llave, q, desde):
    params = {"part": "snippet", "q": q, "type": "video", "order": "date", "maxResults": 50, "publishedAfter": desde, "videoEmbeddable": "true",
              "safeSearch": "moderate", "key": llave}
    with urllib.request.urlopen(f"{API}?{urllib.parse.urlencode(params)}", timeout=30) as r:
        return json.loads(r.read()).get("items", [])


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
    desde, videos, errores = iso(ahora - timedelta(days=7)), {}, []
    for c in cfg["conflictos"]:
        try:
            videos[c["id"]] = filtrar(buscar(llave, c.get("videos", c["nombre"]), desde))
        except Exception as e:  # noqa: BLE001
            errores.append(f"{c['id']}: {e}"[:120])
            videos[c["id"]] = previo.get("videos", {}).get(c["id"], [])
        time.sleep(0.5)
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    json.dump({"generado_utc": iso(ahora), "fuente": "YouTube Data API v3 (canales de noticias)", "errores": errores, "videos": videos},
              open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"videos de conflictos: {sum(len(v) for v in videos.values())} videos; errores: {len(errores)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
