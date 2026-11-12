"""Arma el video de Brújula Diaria: una pantalla por escena (Pillow), voz con Piper y unión con ffmpeg.

Uso:  python3 tools/noticiero_video/render.py SALIDA_DIR [--fecha AAAA-MM-DD] [--sitio URL] [--modelo voz.onnx]
Lee los reportes y los indicadores del sitio publicado (o de archivos locales con --datos DIR) y escribe en SALIDA_DIR:
  noticiero.mp4, guion.json, descripcion.txt y miniatura.png.
Sin Piper (o sin modelo de voz) cada escena dura según su texto y el video sale sin voz: sirve para revisar el diseño.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import textwrap
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
from guion import guion  # noqa: E402

from PIL import Image, ImageDraw, ImageFont  # noqa: E402

W, H = 1920, 1080
FONDO, TINTA, ORO, GRIS, ROJO = (16, 22, 30), (236, 238, 240), (201, 162, 39), (150, 160, 170), (200, 16, 46)
FUENTES = "/usr/share/fonts/truetype/dejavu/"
PORTAFOLIO = "https://zoetzerlpetrov-gif.github.io/portafolio/daily_report.json"


def fuente(tam, negrita=False):
    try:
        return ImageFont.truetype(FUENTES + ("DejaVuSans-Bold.ttf" if negrita else "DejaVuSans.ttf"), tam)
    except OSError:
        return ImageFont.load_default()


def leer(origen, ruta):
    if origen.startswith("http"):
        req = urllib.request.Request(f"{origen.rstrip('/')}/{ruta}", headers={"User-Agent": "brujula-diaria/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    with open(os.path.join(origen, ruta), encoding="utf-8") as f:
        return json.load(f)


def leer_seguro(origen, ruta):
    try:
        return leer(origen, ruta)
    except Exception as e:  # una fuente que falle no impide el video
        print(f"aviso: no se pudo leer {ruta}: {e}", file=sys.stderr)
        return None


def pantalla(e, n, total, fecha):
    im = Image.new("RGB", (W, H), FONDO)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 10], fill=ORO)
    d.text((96, 60), "BRÚJULA DIARIA", font=fuente(34, True), fill=ORO)
    d.text((W - 96, 60), fecha, font=fuente(30), fill=GRIS, anchor="ra")
    if e["tipo"] in ("portada", "seccion", "cierre"):
        d.text((W // 2, H // 2 - 70), e["encabezado"], font=fuente(118, True), fill=TINTA, anchor="mm")
        y = H // 2 + 40
        for linea in (e.get("texto") or "").split("\n"):
            for parte in textwrap.wrap(linea, 60) or [""]:
                d.text((W // 2, y), parte, font=fuente(40), fill=GRIS, anchor="mm")
                y += 56
    elif e["tipo"] == "economia":
        d.text((96, 170), e["encabezado"], font=fuente(72, True), fill=TINTA)
        y = 320
        for f in e["filas"]:
            d.text((96, y), f["etiqueta"], font=fuente(46), fill=GRIS)
            d.text((W - 96, y - 6), f["valor"], font=fuente(60, True), fill=TINTA, anchor="ra")
            d.text((W - 96, y + 62), f"dato del {f['fecha'][:10]}", font=fuente(26), fill=GRIS, anchor="ra")
            d.line([96, y + 108, W - 96, y + 108], fill=(50, 58, 68), width=2)
            y += 140
    else:
        d.rectangle([96, 160, 96 + 14, 240], fill=ROJO if e["encabezado"] == "México" else ORO)
        d.text((130, 166), e["encabezado"].upper(), font=fuente(56, True), fill=TINTA)
        y = 330
        for parte in textwrap.wrap(e.get("texto", ""), 46)[:9]:
            d.text((96, y), parte, font=fuente(60), fill=TINTA)
            y += 82
        if e.get("medio"):
            d.text((96, H - 150), f"Fuente: {e['medio']}", font=fuente(38, True), fill=ORO)
            d.text((96, H - 100), "Resumen propio · nota completa en el enlace de la descripción", font=fuente(28), fill=GRIS)
    d.text((W - 96, H - 60), f"{n}/{total}", font=fuente(26), fill=GRIS, anchor="ra")
    return im


def voz(texto, wav, modelo):
    """Piper → WAV. Devuelve True si se generó."""
    piper = shutil.which("piper")
    if not (piper and modelo and os.path.exists(modelo)):
        return False
    r = subprocess.run([piper, "-m", modelo, "-f", wav, "--sentence-silence", "0.35"], input=texto.encode("utf-8"), capture_output=True)
    return r.returncode == 0 and os.path.exists(wav)


def duracion(wav):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav], capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def armar(g, salida, modelo):
    os.makedirs(salida, exist_ok=True)
    tmp = os.path.join(salida, "escenas")
    os.makedirs(tmp, exist_ok=True)
    partes = []
    total = len(g["escenas"])
    fecha_txt = g["titulo"].split(" · ")[1] if " · " in g["titulo"] else g["fecha"]
    for i, e in enumerate(g["escenas"], 1):
        png, wav, mp4 = (os.path.join(tmp, f"{i:02d}.{x}") for x in ("png", "wav", "mp4"))
        pantalla(e, i, total, fecha_txt).save(png)
        if i == 1:
            shutil.copy(png, os.path.join(salida, "miniatura.png"))
        con_voz = voz(e["voz"], wav, modelo)
        seg = (duracion(wav) + 0.8) if con_voz else max(4.0, len(e["voz"]) / 15)
        cmd = ["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", png]
        cmd += ["-i", wav] if con_voz else ["-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono"]
        cmd += ["-t", f"{seg:.2f}", "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p", "-r", "25",
                "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "1", "-af", "apad", mp4]
        subprocess.run(cmd, check=True)
        partes.append(mp4)
    lista = os.path.join(tmp, "lista.txt")
    with open(lista, "w") as f:
        f.writelines(f"file '{os.path.abspath(p)}'\n" for p in partes)
    final = os.path.join(salida, "noticiero.mp4")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", "-movflags", "+faststart", final], check=True)
    return final


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("salida")
    ap.add_argument("--fecha", help="Día del noticiero (por omisión, hoy en Ciudad de México)")
    ap.add_argument("--sitio", default="https://zoetzerlpetrov-gif.github.io/Geopolitica")
    ap.add_argument("--modelo", default=os.environ.get("PIPER_MODELO", ""))
    a = ap.parse_args()
    hoy = (datetime.now(timezone.utc) - timedelta(hours=6)).strftime("%Y-%m-%d")
    fecha = a.fecha or hoy
    rep_mx = leer_seguro(a.sitio, f"data/reportes/mexico/{fecha}.json")
    rep_gl = leer_seguro(a.sitio, f"data/reportes/global/{fecha}.json")
    if not rep_mx and not rep_gl:  # temprano en la mañana el reporte del día puede no existir aún: se usa el de ayer
        ayer = (datetime.fromisoformat(fecha) - timedelta(days=1)).strftime("%Y-%m-%d")
        rep_mx, rep_gl = leer_seguro(a.sitio, f"data/reportes/mexico/{ayer}.json"), leer_seguro(a.sitio, f"data/reportes/global/{ayer}.json")
    g = guion(fecha, rep_mx, rep_gl, leer_seguro(a.sitio, "data/economia/indicadores.json"), leer_seguro(PORTAFOLIO.rsplit("/", 1)[0], "daily_report.json") if a.sitio.startswith("http") else None)
    if g["notas"] < 3:
        print(f"Solo {g['notas']} nota(s): no se arma el video de hoy.", file=sys.stderr)
        sys.exit(2)
    os.makedirs(a.salida, exist_ok=True)
    with open(os.path.join(a.salida, "guion.json"), "w", encoding="utf-8") as f:
        json.dump(g, f, ensure_ascii=False, indent=1)
    with open(os.path.join(a.salida, "descripcion.txt"), "w", encoding="utf-8") as f:
        f.write(g["descripcion"])
    final = armar(g, a.salida, a.modelo)
    print(f"{final} · {duracion(final):.0f} s · {g['notas']} notas")


if __name__ == "__main__":
    main()
