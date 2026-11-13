"""Arma el video de Brújula Diaria: escenas animadas (o pantallas fijas), voz Kokoro ef_dora (o Piper) y unión con ffmpeg.

Uso:  python3 tools/noticiero_video/render.py SALIDA_DIR [--fecha AAAA-MM-DD] [--sitio URL] [--modelo voz.onnx]
Lee el Noticiero (las 30 secciones), el clima y los indicadores del sitio publicado (o de archivos locales con --datos DIR) y escribe en SALIDA_DIR:
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
from guion import candidatos_seccion, con_dof, guion, mercados, notas_dof  # noqa: E402
from redactar import elegir_y_redactar, frases_titulares, redactar_dof  # noqa: E402
import patrocinio  # noqa: E402

from PIL import Image, ImageDraw, ImageFont  # noqa: E402

W, H = 1920, 1080
FONDO, TINTA, ORO, GRIS, ROJO = (16, 22, 30), (236, 238, 240), (201, 162, 39), (150, 160, 170), (200, 16, 46)
FUENTES = "/usr/share/fonts/truetype/dejavu/"
PORTAFOLIO = "https://zoetzerlpetrov-gif.github.io/portafolio/portfolio_data.json"


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
    elif e["tipo"] == "clima":
        d.text((96, 150), e["encabezado"], font=fuente(64, True), fill=TINTA)
        for x0, titulo, filas in ((96, "México", e.get("mx") or []), (W // 2 + 40, "El mundo", (e.get("mundo") or [])[:8])):
            d.text((x0, 250), titulo, font=fuente(40, True), fill=ORO)
            y = 310
            for c, mx, mn in filas[:8]:
                d.text((x0, y), c, font=fuente(36), fill=TINTA)
                d.text((x0 + 760, y), f"{mx}° / {mn}°", font=fuente(36, True), fill=TINTA, anchor="ra")
                y += 54
        y = 760
        for linea in (e.get("alertas") or []) + ([f"Ciclones activos: {', '.join(e['ciclones'])}"] if e.get("ciclones") else []):
            for parte in textwrap.wrap(linea, 80)[:2]:
                d.text((96, y), parte, font=fuente(32), fill=GRIS)
                y += 44
        d.text((96, H - 100), "Máxima / mínima de hoy · pronóstico de MET Norway (CC BY 4.0), no es aviso oficial", font=fuente(26), fill=GRIS)
    elif e["tipo"] == "mercados":
        d.text((96, 150), e["encabezado"], font=fuente(64, True), fill=TINTA)
        y = 260
        for f in e.get("filas", [])[:8]:
            color = (46, 196, 120) if f["pct"] > 0 else (230, 80, 80) if f["pct"] < 0 else GRIS
            d.text((96, y), f"{f['nombre']} ({f['ticker']})", font=fuente(36, True), fill=TINTA)
            d.text((W - 96, y), f"{f['precio']:,.2f} {f['moneda']}   {f['pct']:+.2f} %", font=fuente(36, True), fill=color, anchor="ra")
            if f.get("frase"):
                d.text((96, y + 44), textwrap.shorten(f["frase"], 110), font=fuente(26), fill=GRIS)
            y += 90
        d.text((96, H - 100), e.get("texto", ""), font=fuente(26), fill=GRIS)
    elif e["tipo"] == "patrocinio":
        d.rectangle([W // 2 - 150, 200, W // 2 + 150, 252], outline=ORO, width=3)
        d.text((W // 2, 226), "PUBLICIDAD", font=fuente(32, True), fill=ORO, anchor="mm")
        d.text((W // 2, H // 2 - 40), e.get("marca", ""), font=fuente(96, True), fill=TINTA, anchor="mm")
        y = H // 2 + 60
        for parte in textwrap.wrap(e.get("texto", ""), 50)[:3]:
            d.text((W // 2, y), parte, font=fuente(44), fill=GRIS, anchor="mm")
            y += 60
        d.text((W // 2, H - 110), "Mensaje patrocinado · enlace en la descripción", font=fuente(28), fill=GRIS, anchor="mm")
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
        d.rectangle([96, 160, 96 + 14, 240], fill=ROJO if e.get("seccion") == "politica_mx" else ORO)
        d.text((130, 166), e["encabezado"].upper(), font=fuente(56, True), fill=TINTA)
        y = 330
        for parte in textwrap.wrap(e.get("texto", ""), 46)[:9]:
            d.text((96, y), parte, font=fuente(60), fill=TINTA)
            y += 82
        if e.get("medio"):
            d.text((96, H - 150), f"Fuente: {e['medio']}", font=fuente(38, True), fill=ORO)
        if e.get("aviso_patrocinador"):
            d.text((W - 96, H - 150), e["aviso_patrocinador"], font=fuente(30), fill=GRIS, anchor="ra")
            d.text((96, H - 100), ("Titular del medio" if e.get("titular") else "Resumen propio") + " · nota completa en el enlace de la descripción", font=fuente(28), fill=GRIS)
    d.text((W - 96, H - 60), f"{n}/{total}", font=fuente(26), fill=GRIS, anchor="ra")
    return im


_KOKORO = {}


def voz_kokoro(texto, wav, voz_id):
    """Kokoro-82M (Apache-2.0), voz en español (p. ej. ef_dora). El modelo se carga una sola vez por corrida."""
    try:
        import numpy as np
        import soundfile as sf
        from kokoro import KPipeline
    except ImportError:
        return False
    if "pipe" not in _KOKORO:
        _KOKORO["pipe"] = KPipeline(lang_code="e")
    medio_s = np.zeros(int(24000 * 0.5), dtype="float32")  # «‖»: media pausa (antes de «Fuente», entre instrumentos…)
    trozos = []
    for i, parte in enumerate(p for p in texto.split("‖") if p.strip()):
        if i:
            trozos.append(medio_s)
        trozos += [a for _, _, a in _KOKORO["pipe"](parte.strip(), voice=voz_id, speed=1.0)]
    if not trozos:
        return False
    trozos.append(np.zeros(int(24000 * 0.25), dtype="float32"))  # respiro corto al final de la escena
    sf.write(wav, np.concatenate(trozos), 24000)
    return os.path.exists(wav)


def voz(texto, wav, modelo):
    """VOZ_MOTOR=kokoro:<voz> (la de Brújula Diaria: kokoro:ef_dora) o Piper con el modelo .onnx. Si Kokoro falla, Piper."""
    motor = os.environ.get("VOZ_MOTOR", "")
    if motor.startswith("kokoro:"):
        try:
            if voz_kokoro(texto, wav, motor.split(":", 1)[1]):
                return True
        except Exception as e:  # noqa: BLE001
            print(f"aviso: Kokoro falló ({type(e).__name__}); se usa Piper", file=sys.stderr)
    piper = shutil.which("piper")
    if not (piper and modelo and os.path.exists(modelo)):
        return False
    texto = texto.replace("‖", ". ")  # Piper: la pausa se vuelve fin de oración (silencio de 0.5 s)
    r = subprocess.run([piper, "-m", modelo, "-f", wav, "--sentence-silence", "0.5"], input=texto.encode("utf-8"), capture_output=True)
    return r.returncode == 0 and os.path.exists(wav)


def duracion(wav):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav], capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def titulares(g):
    """Cintillo inferior: sección y el inicio del resumen de cada nota."""
    out = []
    for e in g["escenas"]:
        if e["tipo"] == "nota":
            t = e.get("texto", "")
            out.append({"s": e["encabezado"].upper(), "t": (t[:90].rsplit(" ", 1)[0] + "…") if len(t) > 90 else t})
    return out


def grabar_animado(g, escenas, tmp):
    """Escenas animadas (plantilla.html + grabar.mjs con Playwright). Devuelve True si se grabaron todas."""
    node = shutil.which("node")
    script = os.path.join(os.path.dirname(__file__), "grabar.mjs")
    if not node or os.environ.get("ESTILO") == "fijo":
        return False
    datos = os.path.join(tmp, "escenas.json")
    with open(datos, "w", encoding="utf-8") as f:
        json.dump({"meta": {"fecha": g["titulo"].split(" · ")[1] if " · " in g["titulo"] else g["fecha"], "titulares": titulares(g)},
                   "escenas": escenas}, f, ensure_ascii=False)
    r = subprocess.run([node, script, datos, tmp])
    return r.returncode == 0 and all(os.path.exists(os.path.join(tmp, f"{i:02d}.video.mp4")) for i in range(1, len(escenas) + 1))


# Efectos de sonido propios (sintetizados con ffmpeg, sin licencias de terceros), sutiles y bajos.
EFECTOS = {
    # Entrada: acorde que crece y una campana suave (re–la–re).
    "intro": "aevalsrc='0.25*(sin(2*PI*293.66*t)+sin(2*PI*440*t)+0.6*sin(2*PI*587.33*t))*min(t/0.8,1)*exp(-max(t-1.4,0)*2)"
             "+0.35*sin(2*PI*1174.7*t)*exp(-3*max(t-1.0,0))*gte(t,1.0)':s=44100:d=2.6",
    # Cambio de sección: dos notas de campana (mi–la), cortas.
    "seccion": "aevalsrc='0.3*sin(2*PI*659.25*t)*exp(-6*t)+0.3*sin(2*PI*880*t)*exp(-6*max(t-0.12,0))*gte(t,0.12)':s=44100:d=0.9",
    # Cambio de nota en la misma sección: barrido de aire muy breve.
    "nota": "anoisesrc=color=pink:amplitude=0.25:d=0.45:r=44100",
    # Cierre: campana descendente (la–re).
    "cierre": "aevalsrc='0.3*sin(2*PI*880*t)*exp(-4*t)+0.3*sin(2*PI*587.33*t)*exp(-4*max(t-0.2,0))*gte(t,0.2)':s=44100:d=1.6",
}
FILTRO_EFECTO = {"nota": "highpass=f=600,lowpass=f=5000,afade=t=in:d=0.18,afade=t=out:st=0.2:d=0.25,volume=0.5"}
ADELANTO_VOZ = 0.35  # s: la voz entra justo después del efecto


def efectos(tmp):
    """Genera los WAV de efectos una vez por corrida. Devuelve {nombre: ruta} (vacío si ffmpeg falla)."""
    out = {}
    for nombre, fuente in EFECTOS.items():
        ruta = os.path.join(tmp, f"efecto_{nombre}.wav")
        filtro = FILTRO_EFECTO.get(nombre, "afade=t=out:st=0:d=0.01,volume=1")
        r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", fuente, "-af", filtro, "-ac", "1", ruta])
        if r.returncode == 0:
            out[nombre] = ruta
    return out


def efecto_de(escenas, i):
    """Qué efecto suena al entrar a la escena i: entrada, cambio de sección, cambio de nota o cierre."""
    e = escenas[i]
    if e["tipo"] == "portada":
        return "intro"
    if e["tipo"] == "cierre":
        return "cierre"
    previa = escenas[i - 1] if i else {}
    if e["tipo"] == "nota" and previa.get("tipo") == "nota" and previa.get("seccion") == e.get("seccion"):
        return "nota"
    return "seccion"


def musica(segundos, destino):
    """Fondo musical propio (sin licencias de terceros): acorde suave de senoidales con trémolo lento, muy bajo."""
    notas = "+".join(f"0.18*sin(2*PI*{f}*t)" for f in (110, 164.81, 220, 277.18))
    expr = f"({notas})*(0.6+0.4*sin(2*PI*0.08*t))"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"aevalsrc={expr}:s=44100:d={segundos:.1f}",
                    "-af", "lowpass=f=900,afade=t=in:d=3,volume=0.12", "-ac", "1", destino], check=True)


def armar(g, salida, modelo):
    os.makedirs(salida, exist_ok=True)
    tmp = os.path.join(salida, "escenas")
    os.makedirs(tmp, exist_ok=True)
    total = len(g["escenas"])
    fecha_txt = g["titulo"].split(" · ")[1] if " · " in g["titulo"] else g["fecha"]
    # 1) Voz de cada escena y su duración.
    escenas, t0 = [], 0.0
    for i, e in enumerate(g["escenas"], 1):
        wav = os.path.join(tmp, f"{i:02d}.wav")
        con_voz = voz(e["voz"], wav, modelo)
        dur = round((duracion(wav) + 0.9 + ADELANTO_VOZ) if con_voz else max(4.0, len(e["voz"]) / 15), 2)
        escenas.append({**e, "dur": dur, "t0": round(t0, 2), "_wav": wav if con_voz else None})
        t0 += dur
    sfx = efectos(tmp)
    # 2) Imagen: escenas animadas o, si no se puede, pantallas fijas (Pillow).
    animado = grabar_animado(g, [{k: v for k, v in e.items() if k != "_wav"} for e in escenas], tmp)
    print("estilo:", "animado" if animado else "pantallas fijas")
    partes = []
    for i, e in enumerate(escenas, 1):
        mp4 = os.path.join(tmp, f"{i:02d}.mp4")
        if animado:
            cmd = ["ffmpeg", "-y", "-v", "error", "-i", os.path.join(tmp, f"{i:02d}.video.mp4")]
        else:
            png = os.path.join(tmp, f"{i:02d}.png")
            pantalla(e, i, total, fecha_txt).save(png)
            if i == 1:
                shutil.copy(png, os.path.join(salida, "miniatura.png"))
            cmd = ["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", png]
        cmd += ["-i", e["_wav"]] if e["_wav"] else ["-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono"]
        ef = sfx.get(efecto_de(escenas, i - 1))
        if ef:  # efecto al inicio y la voz un instante después
            cmd += ["-i", ef, "-filter_complex",
                    f"[1:a]aresample=44100,adelay={int(ADELANTO_VOZ * 1000)}:all=1[v];[2:a]aresample=44100,volume=0.55[f];"
                    "[v][f]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,apad[a]", "-map", "0:v", "-map", "[a]"]
        else:
            cmd += ["-af", "apad"]
        cmd += ["-t", f"{e['dur']:.2f}", "-c:v", "copy" if animado else "libx264", *([] if animado else ["-tune", "stillimage", "-pix_fmt", "yuv420p", "-r", "25"]),
                "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "1", mp4]
        subprocess.run(cmd, check=True)
        partes.append(mp4)
    lista = os.path.join(tmp, "lista.txt")
    with open(lista, "w") as f:
        f.writelines(f"file '{os.path.abspath(p)}'\n" for p in partes)
    sin_musica = os.path.join(tmp, "sin_musica.mp4")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", sin_musica], check=True)
    # 3) Música de fondo por debajo de la voz.
    final = os.path.join(salida, "noticiero.mp4")
    fondo = os.path.join(tmp, "fondo.wav")
    try:
        musica(duracion(sin_musica) + 1, fondo)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", sin_musica, "-i", fondo, "-filter_complex",
                        "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]", "-map", "0:v", "-map", "[a]",
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", final], check=True)
    except subprocess.CalledProcessError:
        shutil.copy(sin_musica, final)
    return final


def enlaces_usados(carpeta, fecha, dias=3):
    """Enlaces (notas y Mercados) de los videos de los `dias` anteriores a `fecha`, para no repetir noticias."""
    from datetime import date
    out = set()
    if not carpeta or not os.path.isdir(carpeta):
        return frozenset()
    for nombre in os.listdir(carpeta):
        try:
            g = json.load(open(os.path.join(carpeta, nombre), encoding="utf-8"))
            dif = (date.fromisoformat(fecha) - date.fromisoformat(g.get("fecha", ""))).days
        except (OSError, ValueError, TypeError):
            continue
        if 0 < dif <= dias:
            out.update(u for u in g.get("usadas") or [] if isinstance(u, str))
    return frozenset(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("salida")
    ap.add_argument("--fecha", help="Día del noticiero (por omisión, hoy en Ciudad de México)")
    ap.add_argument("--sitio", default="https://zoetzerlpetrov-gif.github.io/Geopolitica")
    ap.add_argument("--modelo", default=os.environ.get("PIPER_MODELO", ""))
    ap.add_argument("--previos", help="Carpeta con los guiones de los videos anteriores (rama datos-comentarios/guiones)")
    a = ap.parse_args()
    hoy = (datetime.now(timezone.utc) - timedelta(hours=6)).strftime("%Y-%m-%d")
    fecha = a.fecha or hoy
    usadas = enlaces_usados(a.previos, fecha)
    cands = candidatos_seccion(leer_seguro(a.sitio, "data/vivos/noticiero.json"), usadas=usadas)
    ia = os.environ.get("IA_LOCAL_URL", "").strip() or None
    elegidas = elegir_y_redactar(cands, ia)
    # Cambios recientes en el Diario Oficial de la Federación (bitácora normativa del sitio): qué se publicó y qué implica.
    elegidas = con_dof(elegidas, redactar_dof(notas_dof(leer_seguro(a.sitio, "data/normativa/bitacora.json"), fecha), ia))
    clima = {"calor": leer_seguro(a.sitio, "data/vivos/calor_frio.geojson"), "ciclones": leer_seguro(a.sitio, "data/vivos/ciclones_mundo.geojson")}
    portafolio = leer_seguro(PORTAFOLIO.rsplit("/", 1)[0], "portfolio_data.json") if a.sitio.startswith("http") else None
    frases = frases_titulares(mercados(portafolio, usadas=usadas) if isinstance(portafolio, list) else [], os.environ.get("IA_LOCAL_URL", "").strip() or None)
    g = guion(fecha, elegidas, leer_seguro(a.sitio, "data/economia/indicadores.json"), portafolio, clima,
              cifras=leer_seguro(a.sitio, "data/vivos/indicadores.json"), frases_mercado=frases, usadas=usadas)
    g = patrocinio.aplicar(g)  # patrocinios vigentes de config/patrocinios.json (si no hay, el video queda igual)
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
