#!/usr/bin/env python3
"""Shorts temáticos de DOMINUS para YouTube (vertical 1080×1920, menos de 60 s).

Cada día un tema distinto (config/shorts.json) que no repite Brújula Diaria: 3 titulares recientes en español de esa
sección del Noticiero, con su medio. Paleta distinta en cada short (tools/shorts/paletas.py), voz sintética (Kokoro,
como Brújula Diaria), música y efectos propios sintetizados con ffmpeg (sin licencias de terceros).

Uso:  python3 tools/shorts/shorts.py SALIDA [--noticiero ARCHIVO_O_URL] [--tema SECCION] [--fecha AAAA-MM-DD]
Salida: SALIDA/short.mp4, guion.json, descripcion.txt, miniatura.png. Con --sin-video solo escribe el guion.
Solo título, enlace, medio y fecha de cada nota: nunca el texto del artículo.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, "..", ".."))
sys.path.insert(0, AQUI)
from paletas import paleta_del_dia  # noqa: E402

NOTICIERO = "https://dominusosint.com/data/vivos/noticiero.json"
PALABRAS_ES = {"el", "la", "de", "que", "en", "los", "las", "y", "del", "un", "una", "por", "con", "para", "se", "su", "al", "es", "más"}
ORDINALES = ["Uno", "Dos", "Tres", "Cuatro", "Cinco"]
# Temas ligeros (viajes, espectáculos, moda…): se saltan titulares de muertes, violencia o accidentes.
# Todos los temas: se descarta la violencia (el canal es para público general).
VIOLENTO = re.compile(r"\b(asesin|homicid|balacera|balea|disparo|ejecutad|secuestr|narco|cartel|c[áa]rtel|violaci|feminicid|masacre|fosa|cad[áa]ver|desmembr|tortur|ataque armado|sicari)", re.I)
TRAGICO = re.compile(r"\b(muer[et]|muri[óo]|fallec|asesin|homicid|matan|cad[áa]ver|accidente|choque|balacera|disparo|ataque|violaci|secuestr|desaparec|tragedia|herid[oa]s?|v[íi]ctima|incendio|explosi[óo]n|narco|extorsi|abuso|robo|asalt|fraude|denuncia|critican|polémica)", re.I)


def config():
    with open(os.path.join(RAIZ, "config", "shorts.json"), encoding="utf-8") as f:
        return json.load(f)


def es_espanol(texto):
    """Heurística simple: acentos o signos del español, o al menos 2 palabras funcionales en español."""
    t = str(texto or "").lower()
    if re.search(r"[áéíóúñ¿¡]", t):
        return True
    return len(PALABRAS_ES & set(re.findall(r"[a-záéíóúñ]+", t))) >= 2


def tema_del_dia(temas, dia, forzado=None):
    """Tema por día del año (rota todos antes de repetir) o el que se pida con --tema."""
    if forzado:
        for t in temas:
            if t["seccion"] == forzado:
                return t
        raise SystemExit(f"Tema desconocido: {forzado}")
    return temas[date.fromisoformat(str(dia)[:10]).toordinal() % len(temas)]


def elegir_titulares(noticiero, seccion, n=3, horas=72, ahora=None, ligero=False):
    """Titulares en español más recientes de la sección, de medios distintos y sin repetir título (y sin notas trágicas
    si el tema es ligero)."""
    ahora = ahora or datetime.now(timezone.utc)
    limite = (ahora - timedelta(hours=horas)).isoformat()
    notas = [x for x in (noticiero or {}).get("notas", []) if seccion in (x.get("s") or []) and es_espanol(x.get("t")) and x.get("u", "").startswith("https://")]
    notas.sort(key=lambda x: str(x.get("f", "")), reverse=True)
    out, medios, titulos = [], set(), set()
    for x in notas:
        if str(x.get("f", "")) < limite and len(out) >= 1:
            break
        tit = re.sub(r"\s+", " ", str(x["t"])).strip()
        clave = tit.lower()[:60]
        if not tit or clave in titulos or (x.get("m") in medios and len(notas) > n * 2) or VIOLENTO.search(tit) or (ligero and TRAGICO.search(tit)):
            continue
        titulos.add(clave); medios.add(x.get("m"))
        out.append({"titulo": tit[:180], "medio": str(x.get("m", "")).strip()[:60], "url": x["u"], "fecha": str(x.get("f", ""))[:10]})
        if len(out) == n:
            break
    return out


# Emoji alusivo a cada titular (el primero que coincida); si ninguno, el del tema.
EMOJIS = [
    (r"playa|mar\b|caribe|costa|isla", "🏖️"), (r"vuelo|aerol|aeropuerto|avi[óo]n", "✈️"), (r"hotel|hosped", "🏨"),
    (r"taco|comida|restaur|chef|gastron|platillo|cocina|receta", "🌮"), (r"caf[ée]\b", "☕"), (r"vino|cerveza|mezcal|tequila", "🍷"),
    (r"pel[íi]cula|cine|estreno|netflix|serie", "🎬"), (r"concierto|m[úu]sica|canci[óo]n|[áa]lbum|gira", "🎤"), (r"teatro|obra", "🎭"),
    (r"museo|arte|exposici", "🖼️"), (r"libro|feria del libro|novela", "📚"), (r"lluvia|tormenta|hurac[áa]n|cicl[óo]n", "🌧️"),
    (r"calor|temperatura|ola de calor", "🌡️"), (r"fr[íi]o|helada|nieve", "❄️"), (r"sismo|temblor|volc[áa]n", "🌋"),
    (r"inteligencia artificial|\bia\b|chatgpt|robot", "🤖"), (r"celular|iphone|android|app\b", "📱"), (r"videojuego|consola|gamer", "🎮"),
    (r"bitcoin|cripto|ethereum", "🪙"), (r"d[óo]lar|peso|bolsa|inflaci", "💵"), (r"casa|vivienda|renta|departamento", "🏠"),
    (r"moda|vestido|pasarela|outfit", "👗"), (r"maquillaje|belleza|piel|cabello", "💄"), (r"salud|vacuna|m[ée]dic|hospital", "🩺"),
    (r"ejercicio|deporte|f[úu]tbol|olimp", "⚽"), (r"ni[ñn]os|familia|escuela", "🎈"), (r"ovni|extraterrestre|alien", "🛸"),
    (r"espacio|nasa|luna|marte|cohete", "🚀"), (r"estafa|fraude|phishing|hacker", "🛡️"), (r"planeta|clima|ambiente|bosque|oc[ée]ano", "🌎"),
]
CIERRES = [
    "¿Cuál te sorprendió más? Cuéntanos en los comentarios y síguenos para más.",
    "Dale like si te sirvió y síguenos: cada día un tema nuevo.",
    "Comparte este video con quien le encante el tema. ¡Nos vemos mañana!",
]


def emoji_de(titulo, defecto=""):
    for patron, emo in EMOJIS:
        if re.search(patron, titulo, re.I):
            return emo
    return defecto


def guion(tema, items, dia):
    """Escenas del short, en tono cercano para público general: portada con gancho, una por titular y cierre con llamada a la acción."""
    ic, n = tema.get("icono", ""), len(items)
    d = date.fromisoformat(str(dia)[:10])
    escenas = [{"tipo": "portada", "titulo": tema["gancho"], "tema": tema["nombre"], "icono": ic, "total": n,
                "sub": f"{n} cosas que pasaron hoy 👇", "voz": f"{tema['gancho']}. Aquí van {n} cosas que pasaron hoy. ¡Quédate hasta el final!"}]
    for i, it in enumerate(items):
        ultima = i == n - 1
        entrada = "Y para cerrar" if ultima and n > 1 else f"Número {ORDINALES[i].lower()}"
        escenas.append({"tipo": "nota", "numero": i + 1, "total": n, "titulo": it["titulo"], "medio": it["medio"], "tema": tema["nombre"],
                        "icono": ic, "emoji": emoji_de(it["titulo"], ic), "voz": f"{entrada}: {it['titulo'].rstrip('.')}. Lo cuenta {it['medio']}."})
    cierre = CIERRES[d.toordinal() % len(CIERRES)]
    escenas.append({"tipo": "cierre", "titulo": "¿Cuál te gustó más?", "tema": tema["nombre"], "icono": ic, "total": n, "voz": cierre})
    titulo = f"{ic} {tema['gancho']} | {tema['nombre']} hoy #Shorts".strip()
    fuentes = "\n".join(f"• {it['titulo']} — {it['medio']} ({it['url']})" for it in items)
    tags = " ".join(f"#{h}" for h in tema.get("hashtags", []))
    descripcion = (f"{ic} {tema['gancho']}: {n} titulares del {dia} con su fuente. Abre cada enlace para leer la nota completa en el medio.\n\n"
                   f"Fuentes:\n{fuentes}\n\n👉 Cada día un tema nuevo. Más en https://dominusosint.com\n"
                   "Voz sintética. Resumen informativo de titulares públicos; cada nota pertenece a su medio.\n\n"
                   f"{tags} #Shorts #DOMINUS")
    return {"fecha": str(dia)[:10], "tema": tema["seccion"], "titulo": titulo[:100], "escenas": escenas, "items": items,
            "descripcion": descripcion[:4900], "hashtags": tema.get("hashtags", [])}


def duracion_estimada(texto):
    return max(2.5, len(texto.split()) / 2.6 + 0.8)


def leer_noticiero(origen):
    if origen.startswith("https://"):
        with urllib.request.urlopen(urllib.request.Request(origen, headers={"User-Agent": "DOMINUS-OSINT/1.0"}), timeout=60) as r:
            return json.load(r)
    with open(origen, encoding="utf-8") as f:
        return json.load(f)


def armar_video(g, salida, paleta):
    """Voz por escena (Kokoro; si no hay, silencio), video por escena (plantilla.html + grabar.mjs), efectos y música."""
    sys.path.insert(0, os.path.join(RAIZ, "tools", "noticiero_video"))
    from render import voz, duracion, efectos, musica, ADELANTO_VOZ  # noqa: E402  (solo al generar el video)
    tmp = os.path.join(salida, "tmp"); os.makedirs(tmp, exist_ok=True)
    for i, e in enumerate(g["escenas"]):
        wav = os.path.join(tmp, f"{i:02d}.voz.wav")
        e["dur"] = round((duracion(wav) + ADELANTO_VOZ + 0.6) if voz(e["voz"], wav, os.environ.get("VOZ_MODELO", "")) else duracion_estimada(e["voz"]), 2)
    total = sum(e["dur"] for e in g["escenas"])
    tope = config().get("duracion_max_s", 58)
    if total > tope:  # YouTube Shorts: menos de 60 s
        k = tope / total
        for e in g["escenas"]:
            e["dur"] = round(e["dur"] * k, 2)
    datos = os.path.join(tmp, "escenas.json")
    with open(datos, "w", encoding="utf-8") as f:
        json.dump({"meta": {"paleta": paleta, "fecha": g["fecha"]}, "escenas": g["escenas"]}, f, ensure_ascii=False)
    subprocess.run(["node", os.path.join(AQUI, "grabar.mjs"), datos, tmp], check=True)
    fx = efectos(tmp)
    # Audio por escena: efecto al entrar + voz con un breve adelanto, recortado a la duración de la escena.
    pistas = []
    for i, e in enumerate(g["escenas"]):
        wav, out = os.path.join(tmp, f"{i:02d}.voz.wav"), os.path.join(tmp, f"{i:02d}.audio.wav")
        efecto = fx.get("intro" if e["tipo"] == "portada" else "cierre" if e["tipo"] == "cierre" else "seccion")
        entradas, filtro = [], []
        if efecto:
            entradas += ["-i", efecto]; filtro.append(f"[{len(entradas) // 2 - 1}:a]volume=0.6[e]")
        if os.path.exists(wav):
            entradas += ["-i", wav]; filtro.append(f"[{len(entradas) // 2 - 1}:a]adelay={int(ADELANTO_VOZ * 1000)}|{int(ADELANTO_VOZ * 1000)}[v]")
        etiquetas = "".join(x for x in ("[e]" if efecto else "", "[v]" if os.path.exists(wav) else "") if x)
        n = etiquetas.count("[")
        if n:
            mezcla = ";".join(filtro) + f";{etiquetas}amix=inputs={n}:normalize=0,apad,atrim=0:{e['dur']},aresample=44100,aformat=channel_layouts=mono[a]"
            subprocess.run(["ffmpeg", "-y", "-v", "error", *entradas, "-filter_complex", mezcla, "-map", "[a]", out], check=True)
        else:
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(e["dur"]), out], check=True)
        pistas.append(out)
    lista_a, lista_v = os.path.join(tmp, "audio.txt"), os.path.join(tmp, "video.txt")
    with open(lista_a, "w") as f:
        f.writelines(f"file '{os.path.abspath(p)}'\n" for p in pistas)
    with open(lista_v, "w") as f:
        f.writelines(f"file '{os.path.abspath(os.path.join(tmp, f'{i + 1:02d}.video.mp4'))}'\n" for i in range(len(g["escenas"])))
    voz_total, video_total, fondo = os.path.join(tmp, "voz.wav"), os.path.join(tmp, "video.mp4"), os.path.join(tmp, "musica.wav")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lista_a, "-c", "copy", voz_total], check=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lista_v, "-c", "copy", video_total], check=True)
    total = sum(e["dur"] for e in g["escenas"])
    musica(total, fondo)
    destino = os.path.join(salida, "short.mp4")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", video_total, "-i", voz_total, "-i", fondo, "-filter_complex",
                    f"[2:a]volume=1.6,afade=t=out:st={max(total - 2, 0):.1f}:d=2[m];[1:a][m]amix=inputs=2:normalize=0[a]",
                    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", destino], check=True)
    shutil.copy(os.path.join(tmp, "miniatura.png"), os.path.join(salida, "miniatura.png")) if os.path.exists(os.path.join(tmp, "miniatura.png")) else None
    return destino


def main():
    a = argparse.ArgumentParser()
    a.add_argument("salida")
    a.add_argument("--noticiero", default=NOTICIERO)
    a.add_argument("--tema")
    a.add_argument("--fecha", default=datetime.now(timezone.utc).date().isoformat())
    a.add_argument("--sin-video", action="store_true")
    args = a.parse_args()
    os.makedirs(args.salida, exist_ok=True)
    cfg = config()
    tema = tema_del_dia(cfg["temas"], args.fecha, args.tema)
    noticiero = leer_noticiero(args.noticiero)
    items = elegir_titulares(noticiero, tema["seccion"], cfg.get("titulares", 3), ligero=tema.get("ligero", False))
    if len(items) < 2:  # tema sin notas en español: el siguiente de la lista
        for t in cfg["temas"]:
            items = elegir_titulares(noticiero, t["seccion"], cfg.get("titulares", 3), ligero=t.get("ligero", False))
            if len(items) >= 2:
                tema = t
                break
    if len(items) < 2:
        raise SystemExit("No hay titulares suficientes para un short hoy.")
    g = guion(tema, items, args.fecha)
    paleta = paleta_del_dia(args.fecha, desfase=3)  # distinta de la de Brújula Diaria del mismo día
    g["paleta"] = paleta["nombre"]
    if not args.sin_video:
        armar_video(g, args.salida, paleta)
    with open(os.path.join(args.salida, "guion.json"), "w", encoding="utf-8") as f:
        json.dump(g, f, ensure_ascii=False, indent=1)
    with open(os.path.join(args.salida, "descripcion.txt"), "w", encoding="utf-8") as f:
        f.write(g["descripcion"])
    print(f"Short «{g['titulo']}» · paleta {paleta['nombre']} · {len(items)} titulares")


if __name__ == "__main__":
    main()
