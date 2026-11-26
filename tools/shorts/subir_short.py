"""Sube el short temático a YouTube como privado (el admin lo publica a mano). Reutiliza el permiso de Brújula Diaria.

Uso:  python3 tools/shorts/subir_short.py DIR   (DIR con short.mp4, guion.json y descripcion.txt)
Llaves solo en secretos de GitHub: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN. Sin llaves, no hace nada.
"""
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "noticiero_video"))
from subir import SUBIDA_URL, AVISO_CADUCO, PermisoCaducado, explicar_error, token_de_acceso  # noqa: E402


def metadatos(g, descripcion):
    """Siempre privado, voz sintética declarada, categoría Noticias y política (25), español de México."""
    tags = ["DOMINUS", "Shorts", "noticias", *g.get("hashtags", [])][:15]
    return {"snippet": {"title": g["titulo"][:100], "description": descripcion[:4900], "categoryId": "25", "tags": tags,
                        "defaultLanguage": "es-419", "defaultAudioLanguage": "es-419"},
            "status": {"privacyStatus": "private", "selfDeclaredMadeForKids": False, "containsSyntheticMedia": True}}


def subir(directorio):
    cid, secreto, refresco = (os.environ.get(k, "") for k in ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN"))
    if not (cid and secreto and refresco):
        print("Sin llaves de YouTube: no se sube; el short queda como artefacto de la corrida.")
        return None
    with open(os.path.join(directorio, "guion.json"), encoding="utf-8") as f:
        g = json.load(f)
    with open(os.path.join(directorio, "descripcion.txt"), encoding="utf-8") as f:
        descripcion = f.read()
    video = os.path.join(directorio, "short.mp4")
    try:
        acceso = token_de_acceso(cid, secreto, refresco)
    except PermisoCaducado:
        print(AVISO_CADUCO)
        sys.exit(1)
    ini = urllib.request.Request(SUBIDA_URL, data=json.dumps(metadatos(g, descripcion)).encode("utf-8"), method="POST", headers={
        "Authorization": f"Bearer {acceso}", "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(os.path.getsize(video))})
    try:
        with urllib.request.urlopen(ini, timeout=60) as r:
            destino = r.headers["Location"]
    except urllib.error.HTTPError as e:
        motivo, texto = explicar_error(e.read().decode("utf-8", "replace"))
        print(f"::error title=YouTube rechazó el short (HTTP {e.code} {motivo})::{texto}")
        sys.exit(1)
    with open(video, "rb") as f:
        put = urllib.request.Request(destino, data=f.read(), method="PUT", headers={"Authorization": f"Bearer {acceso}", "Content-Type": "video/mp4"})
    with urllib.request.urlopen(put, timeout=600) as r:
        res = json.load(r)
    print(f"Short subido como privado: https://youtu.be/{res.get('id')} — publícalo desde YouTube Studio cuando lo revises.")
    return res.get("id")


if __name__ == "__main__":
    subir(sys.argv[1] if len(sys.argv) > 1 else "salida")
