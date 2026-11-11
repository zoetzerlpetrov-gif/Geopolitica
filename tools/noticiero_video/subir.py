"""Sube el video del Noticiero DOMINUS a YouTube (API de datos v3, subida reanudable). Sin dependencias externas.

Uso:  python3 tools/noticiero_video/subir.py DIR   (DIR con noticiero.mp4, guion.json y descripcion.txt)
Variables de entorno (GitHub → Settings → Secrets; nunca en el código): YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN.
YT_PRIVACIDAD: private (por omisión), unlisted o public. Un proyecto de API sin auditar solo puede subir videos
privados; tras la auditoría de Google se cambia a public. Si faltan las llaves, no hace nada y termina sin error.
"""
import json
import os
import sys
import urllib.parse
import urllib.request

TOKEN_URL = "https://oauth2.googleapis.com/token"
SUBIDA_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status"


def metadatos(g, descripcion, privacidad="private"):
    """Cuerpo de la petición: título, descripción, categoría Noticias y política (25), español, voz sintética declarada."""
    if privacidad not in ("private", "unlisted", "public"):
        privacidad = "private"
    return {
        "snippet": {"title": g["titulo"][:100], "description": descripcion[:4900], "categoryId": "25", "defaultLanguage": "es-419",
                    "defaultAudioLanguage": "es-419", "tags": ["noticias", "México", "mundo", "economía", "DOMINUS"]},
        "status": {"privacyStatus": privacidad, "selfDeclaredMadeForKids": False, "containsSyntheticMedia": True},
    }


def token_de_acceso(cid, secreto, refresco):
    datos = urllib.parse.urlencode({"client_id": cid, "client_secret": secreto, "refresh_token": refresco, "grant_type": "refresh_token"}).encode()
    with urllib.request.urlopen(urllib.request.Request(TOKEN_URL, data=datos), timeout=60) as r:
        return json.load(r)["access_token"]


def subir(directorio):
    cid, secreto, refresco = (os.environ.get(k, "") for k in ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN"))
    if not (cid and secreto and refresco):
        print("Sin llaves de YouTube (YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN): no se sube; el video queda como artefacto de la corrida.")
        return None
    with open(os.path.join(directorio, "guion.json"), encoding="utf-8") as f:
        g = json.load(f)
    with open(os.path.join(directorio, "descripcion.txt"), encoding="utf-8") as f:
        descripcion = f.read()
    video = os.path.join(directorio, "noticiero.mp4")
    acceso = token_de_acceso(cid, secreto, refresco)
    cuerpo = json.dumps(metadatos(g, descripcion, os.environ.get("YT_PRIVACIDAD", "private"))).encode("utf-8")
    ini = urllib.request.Request(SUBIDA_URL, data=cuerpo, method="POST", headers={
        "Authorization": f"Bearer {acceso}", "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(os.path.getsize(video))})
    with urllib.request.urlopen(ini, timeout=60) as r:
        destino = r.headers["Location"]
    with open(video, "rb") as f:
        put = urllib.request.Request(destino, data=f.read(), method="PUT", headers={"Authorization": f"Bearer {acceso}", "Content-Type": "video/mp4"})
    with urllib.request.urlopen(put, timeout=600) as r:
        res = json.load(r)
    print(f"Subido: https://youtu.be/{res.get('id')} ({res.get('status', {}).get('privacyStatus')})")
    return res.get("id")


if __name__ == "__main__":
    subir(sys.argv[1] if len(sys.argv) > 1 else "salida")
