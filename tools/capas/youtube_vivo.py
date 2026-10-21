"""Cámaras en vivo de todo el mundo que se transmiten en YouTube (playas, ciudades, puertos, aeropuertos, volcanes…).

Se usa la API oficial de datos de YouTube (v3) con el secreto YOUTUBE_API_KEY: YouTube prohíbe en su robots.txt leer sus
páginas de forma automática. Cada búsqueda (search.list, eventType=live) cuesta 100 unidades de la cuota diaria de
10,000; aquí se hacen como máximo BUSQUEDAS_MAX por corrida. Luego videos.list (1 unidad por cada 50) da la ubicación
de grabación, si el canal la publicó, y si el video se puede insertar.

Ubicación: la de grabación del video (exacta, la que puso el canal). Si no tiene, se busca en el título el nombre de
una ciudad de config/ciudades.json (la más poblada si hay varias) y se marca como aproximada. Sin ninguna de las dos,
la cámara se descarta: no se inventan coordenadas.

Solo se guarda: identificador del video, título, enlace al canal y la ubicación. No se guardan datos de quien
transmite más allá de ese enlace público. Se ven con el reproductor oficial de YouTube desde la ficha.
"""
import json
import re
import unicodedata
import urllib.parse
import urllib.request

API = "https://www.googleapis.com/youtube/v3/"
# Búsquedas en varios idiomas; cada una trae hasta 50 transmisiones en vivo.
BUSQUEDAS = ["live cam", "webcam live", "live webcam beach", "live cam city", "harbor live cam", "airport live cam",
             "volcano live cam", "cámara en vivo", "webcam en vivo", "câmera ao vivo", "Live-Kamera", "webcam en direct",
             "ライブカメラ", "веб-камера онлайн", "canal live cam", "ski live cam"]
BUSQUEDAS_MAX = 16  # 1,600 unidades por corrida
# Debe parecer cámara; no noticieros, música, juegos ni radios.
ES_CAMARA = re.compile(r"(live ?cam|webcam|web cam|c[aá]mara en vivo|camara ao vivo|c[aâ]mera ao vivo|live-?kamera|en direct|"
                       r"ライブカメラ|веб-?камер|livestream cam|cam live|earthcam|skyline)", re.I)
NO_CAMARA = re.compile(r"(news|noticias|noticiero|music|música|musica|lofi|lo-fi|radio|gaming|gameplay|minecraft|fortnite|"
                       r"concierto|concert|sermon|misa|stream highlights|asmr)", re.I)
CATEGORIAS_FUERA = {"10", "20", "25"}  # música, videojuegos, noticias y política
# Palabras del título → subtipo del mapa.
TEMAS = [("yt_aeropuertos", r"airport|aeropuerto|aeroporto|flughafen|runway|planespotting"), ("yt_playas", r"beach|playa|praia|strand|plage|coast|costa|ビーチ|пляж"),
         ("yt_puertos", r"harbou?r|\bport\b|\bpuerto\b|\bporto\b|hafen|canal|marina|\bship"), ("yt_volcanes", r"volcan|volcán|vulkan|вулкан|火山"),
         ("yt_montana", r"ski|mountain|montaña|alp|berg|snow|nieve"), ("yt_trafico", r"traffic|tráfico|trafico|highway|autopista|street|calle|crossing")]


def norm(t):
    return unicodedata.normalize("NFD", str(t or "")).encode("ascii", "ignore").decode().lower()


def llamar(llave, metodo, **params):
    with urllib.request.urlopen(f"{API}{metodo}?{urllib.parse.urlencode({**params, 'key': llave})}", timeout=30) as r:
        return json.loads(r.read())


def es_camara(snippet, categoria=""):
    t = f"{snippet.get('title', '')} {snippet.get('description', '')[:200]}"
    return bool(ES_CAMARA.search(t)) and not NO_CAMARA.search(snippet.get("title", "")) and str(categoria) not in CATEGORIAS_FUERA


def tema(titulo):
    for st, rx in TEMAS:
        if re.search(rx, titulo, re.I):
            return st
    return "yt_ciudades"


class Ciudades:
    """Busca nombres de ciudades (≥ 5 letras, palabra completa) en un texto; devuelve la más poblada."""

    def __init__(self, filas):
        self.idx = {}
        for nom, nom_es, iso3, lat, lon, _tipo, pob in filas:
            for n in {norm(nom), norm(nom_es)}:
                if len(n) >= 5 and (n not in self.idx or (pob or 0) > self.idx[n][3]):
                    self.idx[n] = (lat, lon, iso3, pob or 0, nom_es or nom)

    def en(self, texto):
        t = f" {re.sub(r'[^a-z0-9 ]', ' ', norm(texto))} "
        hallados = [v for n, v in self.idx.items() if f" {n} " in t]
        return max(hallados, key=lambda v: v[3]) if hallados else None


def camaras(llave, ciudades, busquedas=BUSQUEDAS[:BUSQUEDAS_MAX]):
    """Devuelve [dict] con id, titulo, canal_url, lat, lon, aprox, pais, lugar, st."""
    ids = []
    for q in busquedas:
        try:
            r = llamar(llave, "search", part="id", type="video", eventType="live", maxResults=50, q=q)  # safeSearch=strict deja la búsqueda en vivo sin resultados
        except Exception as e:  # noqa: BLE001
            print(f"   YouTube «{q}»: {e}")
            continue
        ids += [it["id"]["videoId"] for it in r.get("items", []) if it.get("id", {}).get("videoId")]
    ids = list(dict.fromkeys(ids))
    out = []
    for i in range(0, len(ids), 50):
        r = llamar(llave, "videos", part="snippet,recordingDetails,status,liveStreamingDetails", id=",".join(ids[i:i + 50]))
        for v in r.get("items", []):
            s, st = v.get("snippet") or {}, v.get("status") or {}
            if s.get("liveBroadcastContent") != "live" or not st.get("embeddable", False) or not es_camara(s, s.get("categoryId", "")):
                continue
            loc = (v.get("recordingDetails") or {}).get("location") or {}
            if loc.get("latitude") is not None and loc.get("longitude") is not None and (loc["latitude"], loc["longitude"]) != (0, 0):
                lat, lon, aprox, pais, lugar = loc["latitude"], loc["longitude"], False, "", ""
            else:
                c = ciudades.en(s.get("title", ""))
                if not c:
                    continue
                lat, lon, pais, lugar, aprox = c[0], c[1], c[2], c[4], True
            out.append({"id": v["id"], "titulo": s.get("title", "")[:140], "canal_url": f"https://www.youtube.com/channel/{s.get('channelId', '')}",
                        "lat": round(float(lat), 5), "lon": round(float(lon), 5), "aprox": aprox, "pais": pais, "lugar": lugar,
                        "st": tema(s.get("title", ""))})
    return out
