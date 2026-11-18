#!/usr/bin/env python3
"""Métricas del canal de YouTube para el tablero de marketing (marketing.html, solo admin).

Usa el mismo permiso OAuth que sube los videos (YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN; solo lectura:
channels y videos). Guarda totales del canal (suscriptores, vistas, videos) y los últimos 25 videos con vistas, me gusta,
comentarios y si son públicos o privados, más un historial diario (400 días) para ver la tendencia.
No guarda datos de quienes ven o comentan.
Uso: python3 metricas_youtube.py <carpeta>  → <carpeta>/metricas.json (lo publica el flujo «Comentarios de YouTube»).
"""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "noticiero_video"))
from comentarios import api  # noqa: E402
from subir import PermisoCaducado, token_de_acceso  # noqa: E402

DIAS_HISTORIAL = 400


def resumen_canal(c):
    s = c.get("statistics", {})
    return {"suscriptores": None if s.get("hiddenSubscriberCount") else int(s.get("subscriberCount", 0)),
            "vistas": int(s.get("viewCount", 0)), "videos": int(s.get("videoCount", 0)),
            "titulo": c.get("snippet", {}).get("title", "")}


def videos_de(items):
    out = []
    for v in items:
        s, st = v.get("statistics", {}), v.get("status", {})
        out.append({"id": v["id"], "titulo": v.get("snippet", {}).get("title", ""), "fecha": v.get("snippet", {}).get("publishedAt", "")[:10],
                    "privacidad": st.get("privacyStatus", ""), "vistas": int(s.get("viewCount", 0)), "me_gusta": int(s.get("likeCount", 0)),
                    "comentarios": int(s.get("commentCount", 0))})
    return sorted(out, key=lambda x: x["fecha"], reverse=True)


def agregar_historial(historial, hoy, canal, videos):
    """Un punto por día (el último del día manda); recorta a DIAS_HISTORIAL."""
    punto = {"fecha": hoy, "suscriptores": canal["suscriptores"], "vistas": canal["vistas"], "videos": canal["videos"],
             "publicos": sum(1 for v in videos if v["privacidad"] == "public")}
    h = [x for x in historial if x.get("fecha") != hoy] + [punto]
    return sorted(h, key=lambda x: x["fecha"])[-DIAS_HISTORIAL:]


def main(carpeta="marketing"):
    os.makedirs(carpeta, exist_ok=True)
    destino = os.path.join(carpeta, "metricas.json")
    try:
        previo = json.load(open(destino, encoding="utf-8"))
    except (OSError, ValueError):
        previo = {}
    cid, secreto, refresco = (os.environ.get(k, "") for k in ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN"))
    if not (cid and secreto and refresco):
        print("Métricas de YouTube: sin secretos; se omite")
        return 0
    try:
        acceso = token_de_acceso(cid, secreto, refresco)
        c = api("channels", acceso, {"part": "snippet,statistics,contentDetails", "mine": "true"})["items"][0]
        subidas = c["contentDetails"]["relatedPlaylists"]["uploads"]
        ids = [x["contentDetails"]["videoId"] for x in api("playlistItems", acceso, {"part": "contentDetails", "playlistId": subidas, "maxResults": 25}).get("items", [])]
        vids = videos_de(api("videos", acceso, {"part": "snippet,statistics,status", "id": ",".join(ids)}).get("items", [])) if ids else []
    except PermisoCaducado:
        previo["aviso"] = "El permiso de YouTube caducó: hay que volver a autorizar (tools/noticiero_video/autorizar.py)."
        json.dump(previo, open(destino, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("Métricas de YouTube: permiso caducado")
        return 0
    except Exception as e:  # noqa: BLE001  las métricas nunca deben romper el flujo de comentarios
        print(f"Métricas de YouTube: error {e}; se conserva lo anterior")
        return 0
    canal = resumen_canal(c)
    hoy = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    json.dump({"generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "aviso": "", "canal": canal, "videos": vids,
               "historial": agregar_historial(previo.get("historial", []), hoy, canal, vids)},
              open(destino, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"Métricas de YouTube: {canal['suscriptores']} suscriptores, {canal['vistas']} vistas, {len(vids)} videos recientes")
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
