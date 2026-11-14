#!/usr/bin/env python3
"""Fenómenos anómalos: avistamientos, objetos extraños, luces recurrentes y lugares con fama de «propensos».

Nada de esto afirma que un fenómeno sea real ni extraterrestre: son REPORTES, con su nivel de respaldo.

Fuentes:
- Casos históricos curados (config/anomalias_casos.json): Roswell, Campeche, Nimitz… con su nivel de credibilidad.
- Blogs dedicados al tema (Inexplicata, Latest UFO Sightings, Open Minds, Mystery Wire): sus entradas pasan sin filtro.
  Cada nota se ubica con el lugar que nombra el título (ciudad o estado; si no, el centro del país, marcado como
  aproximado). Sin lugar reconocible, la nota no se dibuja. Se guardan título, fuente, fecha y enlace, nunca el texto.
- NUFORC (National UFO Reporting Center), versión geocodificada de github.com/planetsig/ufo-reports (≈ 80 mil
  reportes civiles, 1910–2014). Solo se publican CONTEOS por celda de 1°, sin el texto de los testigos.
- Medios propios (FEEDS_PROPIOS): RSS de medios del tema (The Debrief, Liberation Times) y de un
  medio sobre Irán (IranWire), solo si su robots.txt lo permite. De los medios generales solo pasan
  las notas cuyo título habla del tema. Se guardan título, medio, fecha y enlace.
- GDELT DOC 2.0 (índice de noticias del mundo): una búsqueda por corrida con términos en inglés, español, persa, árabe,
  ruso y turco, para captar reportes de regiones que los medios en inglés no cubren (p. ej. Irán). Si el título no nombra
  un lugar conocido, se usa el país del medio (marcado como aproximado).
- config/anomalias.json: catálogo curado de luces recurrentes, objetos, figuras en cultivos, lugares y oficinas
  oficiales, con nivel de respaldo y enlace.

Salida: vivos/anomalias.geojson (cada 6 h; si una fuente falla se conserva lo anterior de esa fuente).
"""
import csv
import io
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402
from geo import Gazetteer  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "anomalias.geojson")
# Archivo acumulado de notas (sin agrupar): los RSS solo publican las recientes; lo que dejan de publicar se conserva aquí.
ARCHIVO = os.path.join(ROOT, "vivos", "anomalias_archivo.json")
MAX_ARCHIVO = 20000
CATALOGO = os.path.join(ROOT, "config", "anomalias.json")
CASOS = os.path.join(ROOT, "config", "anomalias_casos.json")
NUFORC = "https://raw.githubusercontent.com/planetsig/ufo-reports/master/csv-data/ufo-scrubbed-geocoded-time-standardized.csv"
CADA_H = 1  # cada hora (antes 6): los reportes de avistamientos se publican y se mueven rápido en blogs y redes
NUFORC_CADA_DIAS = 30  # el archivo no cambia desde 2014: basta con recalcular una vez al mes
DIAS_RECIENTES = 365

# Tipos de fenómeno → nombre en español.
TIPOS_ANOM = {"ufo": "Objeto aéreo no identificado", "uso": "Objeto sumergido o marítimo", "contact": "Supuesto contacto o seres",
            "lights_sky": "Luces en el cielo", "lights_ground": "Luces a ras de suelo", "sound": "Sonidos inexplicados",
            "em": "Efectos electromagnéticos", "volcano": "Objetos sobre volcanes", "crop": "Figuras en cultivos"}
# Feeds dedicados al tema: sus entradas pasan sin filtro de palabras.
FEEDS_TEMA = {"The Black Vault", "Inexplicata (es)", "Latest UFO Sightings", "Open Minds UFO News", "UFO Evidence RSS",
              "Planeta UFO (es)", "Espacio Misterio (es)", "Mystery Wire", "UFO Chronicles", "UFO Sightings Daily"}
# Palabras del tema (sin acentos, minúsculas). Una nota general debe traer alguna en el título.
TEMA = re.compile(r"\b(ovnis?|ufos?|uaps?|alienigenas?|extraterrestres?|platillos? voladores?|flying saucers?|"
                  r"(?:objetos?|fenomenos?) (?:voladores? |aereos? |anomalos? )*no identificad[oa]s?|unidentified (?:flying|aerial|anomalous)|"
                  r"fenomenos? anomalos?|anomalous phenomen|orbes?|orbs?|esferas? (?:metalicas?|misteriosas?|de buga)|crop circles?|"
                  r"agroglifos?|abduccion(?:es)?|abducted|humanoides?|nave (?:extraterrestre|nodriza)|luz extrana|luces extranas|"
                  r"luces misteriosas|strange lights?|mysterious lights?|cilindro volador|objeto volador|alien (?:encounter|life|contact|"
                  r"spacecraft|craft|bodies|technology)|non-human|no humanos?|aaro)\b", re.I)
NIVEL_CRED = (("OFICIAL", "oficial"), ("HISTÓRICO / VERIFICADO", "oficial"), ("MUY ALTA", "medios"), ("ALTA", "medios"),
            ("MEDIA-ALTA", "medios"), ("NUFORC", "civil"))


def sin_acentos(t):
    return "".join(c for c in unicodedata.normalize("NFD", str(t or "")) if unicodedata.category(c) != "Mn").lower()


# Tipo de fenómeno deducido del título cuando la nota llega como «ufo» genérico (orden: lo más específico primero).
TIPO_POR_TEXTO = (
    ("crop", re.compile(r"\b(crop circles?|agroglifos?|figuras? en (?:los )?cultivos?)\b")),
    ("volcano", re.compile(r"\b(volcan(?:es)?|volcano(?:es)?|popocatepetl|crater)\b")),
    ("uso", re.compile(r"\b(usos?|submarin[oa]s?|sumergid[oa]s?|bajo el agua|underwater|underwater object|en el mar|from the (?:sea|ocean))\b")),
    ("contact", re.compile(r"\b(abduccion(?:es)?|abduct(?:ed|ion)|humanoides?|seres|beings|encuentro cercano|close encounter|contact(?:o|ados?)|"
                           r"alien bodies|cuerpos? (?:no humanos?|extraterrestres?)|non-human biologics?|momias?)\b")),
    ("sound", re.compile(r"\b(sonidos?|ruidos?|estruendos?|zumbidos?|sounds?|hum|booms?|trompetas)\b")),
    ("em", re.compile(r"\b(apagon(?:es)?|electromagnetic[oa]s?|electromagnetic|interferencias?|blackouts?|fallas? electricas?)\b")),
    ("lights_ground", re.compile(r"\b(luces (?:en el|a ras del?) (?:suelo|campo|cerro)|ground lights?|orbes? (?:en el|sobre el) suelo)\b")),
    ("lights_sky", re.compile(r"\b(luz|luces|luminos[oa]s?|lights?|orbes?|orbs?|bola de (?:luz|fuego)|destellos?|resplandor)\b")),
)


def tipo_por_texto(titulo, tipo_ta=""):
    """Tipo de fenómeno de una nota: el de origen si es específico; si es «ufo» o falta, se deduce del título."""
    if tipo_ta and tipo_ta != "ufo":
        return tipo_ta
    t = sin_acentos(titulo)
    for tipo, rx in TIPO_POR_TEXTO:
        if rx.search(t):
            return tipo
    return "ufo"


def es_del_tema(titulo, fuentes):
    """True si la nota es del tema: viene de un feed dedicado o su título lo menciona."""
    if any(f in FEEDS_TEMA for f in fuentes):
        return True
    return bool(TEMA.search(sin_acentos(titulo)))


def _fuentes_de(props):
    partes = [x.strip() for x in str(props.get("sources") or "").split("|") if x.strip()]
    url = next((x for x in partes if re.match(r"^https?://", x)), "")
    nombres = [x for x in partes if not re.match(r"^https?://", x) and x != "GDELT Global Knowledge Graph"]
    return nombres, url


# Lugares que la prensa nombra y no están como ciudad en el catálogo: (texto sin acentos, lon, lat, nombre, ISO3).
LUGARES_EXTRA = [("popocatepetl", -98.622, 19.023, "Popocatépetl", "MEX"), ("popo", -98.622, 19.023, "Popocatépetl", "MEX"),
                 ("cerro de la silla", -100.23, 25.63, "Cerro de la Silla, Monterrey", "MEX"), ("cdmx", -99.13, 19.43, "Ciudad de México", "MEX"),
                 ("playa miramar", -97.85, 22.29, "Playa Miramar, Ciudad Madero", "MEX"), ("polanco", -99.19, 19.43, "Polanco, CDMX", "MEX"),
                 ("area 51", -115.81, 37.23, "Área 51", "USA"), ("roswell", -104.52, 33.39, "Roswell", "USA"),
                 # Irán y vecinos escritos en persa o árabe (títulos que llegan de GDELT sin traducir).
                 ("تهران", 51.389, 35.689, "Teherán", "IRN"), ("اصفهان", 51.668, 32.654, "Isfahán", "IRN"), ("شیراز", 52.531, 29.592, "Shiraz", "IRN"),
                 ("مشهد", 59.606, 36.297, "Mashhad", "IRN"), ("تبریز", 46.292, 38.080, "Tabriz", "IRN"), ("کرج", 50.997, 35.840, "Karaj", "IRN"),
                 ("قم", 50.876, 34.640, "Qom", "IRN"), ("اهواز", 48.669, 31.318, "Ahvaz", "IRN"), ("کرمانشاه", 47.065, 34.314, "Kermanshah", "IRN"),
                 ("بندرعباس", 56.266, 27.183, "Bandar Abbás", "IRN"), ("یزد", 54.367, 31.897, "Yazd", "IRN"), ("بوشهر", 50.838, 28.923, "Bushehr", "IRN"),
                 ("ایران", 53.69, 32.43, "Irán", "IRN"), ("إيران", 53.69, 32.43, "Irán", "IRN"), ("العراق", 43.68, 33.22, "Irak", "IRQ"),
                 ("بغداد", 44.366, 33.315, "Bagdad", "IRQ"), ("الكويت", 47.48, 29.31, "Kuwait", "KWT"), ("السعودية", 45.08, 23.89, "Arabia Saudita", "SAU"),
                 ("الإمارات", 54.0, 24.0, "Emiratos Árabes Unidos", "ARE"), ("قطر", 51.18, 25.35, "Catar", "QAT"), ("سوريا", 38.99, 34.80, "Siria", "SYR"),
                 ("لبنان", 35.86, 33.85, "Líbano", "LBN"), ("الأردن", 36.24, 30.59, "Jordania", "JOR"), ("مصر", 30.80, 26.82, "Egipto", "EGY"),
                 ("عمان", 55.92, 21.51, "Omán", "OMN"), ("البحرين", 50.56, 26.07, "Baréin", "BHR"), ("اليمن", 48.52, 15.55, "Yemen", "YEM")]
ISO2_PAIS = {"US": "USA", "MX": "MEX", "BR": "BRA", "AR": "ARG", "CL": "CHL", "CO": "COL", "PE": "PER", "ES": "ESP", "GB": "GBR", "UK": "GBR",
           "CA": "CAN", "AU": "AUS", "RU": "RUS", "Russia": "RUS", "EE.UU.": "USA", "México": "MEX", "Reino Unido": "GBR"}


class Ubicador:
    """Título → (lon, lat, lugar, precisión). Busca ciudades y estados (palabra completa, sin acentos), luego el país."""

    def __init__(self):
        self.gaz = Gazetteer()
        lugares = {}
        mx = json.load(open(os.path.join(ROOT, "config", "mx_estados.json"), encoding="utf-8"))
        for e in mx["estados"]:
            for n in [e["nombre"], *e.get("alias", [])]:
                lugares.setdefault(sin_acentos(n), (e["lon"], e["lat"], e["nombre"], "MEX", "estado", 0))
        for c in mx["ciudades"]:
            lugares[sin_acentos(c["nombre"])] = (c["lon"], c["lat"], f"{c['nombre']}, {c['estado']}", "MEX", "ciudad", 10 ** 7)
        for nombre, nombre_es, iso3, lat, lon, tipo, pob in json.load(open(os.path.join(ROOT, "config", "ciudades.json"), encoding="utf-8"))["ciudades"]:
            if (pob or 0) < 150000 and tipo not in ("capital", "capital_estatal"):
                continue
            for n in {nombre, nombre_es}:
                k = sin_acentos(n)
                if len(k) >= 5 and (k not in lugares or (pob or 0) > lugares[k][5]):
                    lugares[k] = (lon, lat, nombre_es or nombre, iso3, "ciudad", pob or 0)
        for k, lon, lat, n, iso in LUGARES_EXTRA:
            lugares[k] = (lon, lat, n, iso, "ciudad", 10 ** 8)
        # Nombres que también son palabras comunes o de países: se omiten como ciudad.
        # También nombres de pila o apellidos frecuentes («George Noory», «Austin Abrams», «Antonio Salinas»).
        for k in ("mexico", "nacional", "victoria", "concordia", "progreso", "union", "trinidad", "santiago", "valencia", "independencia",
                  "colon", "libertad", "esperanza", "guadalupe", "florida", "nevada", "georgia", "jordan", "chad", "parana",
                  "george", "austin", "salinas", "vladimir", "jackson", "charlotte", "florence", "lincoln", "madison", "eugene", "tyler", "hamilton",
                  "clinton", "marion", "aurora", "dallas", "houston", "orlando", "jesus maria", "santa fe", "mercedes", "lourdes", "carmen"):
            if lugares.get(k, (0, 0, "", "", "estado"))[4] == "ciudad":
                lugares.pop(k, None)
        self.lugares = lugares
        self.rx = re.compile(r"\b(" + "|".join(re.escape(k) for k in sorted(lugares, key=len, reverse=True)) + r")\b")

    def ubicar(self, titulo, pais_ta="", medios=()):
        # «… - The New York Times», «| Opinion - Portland Press Herald»: el nombre del medio no es el lugar del hecho.
        sep = r" [-–|] "
        piezas_medio = {sin_acentos(x).strip() for m in medios if m for x in re.split(sep, m)}
        partes = [x for x in re.split(sep, titulo) if sin_acentos(x).strip() not in piezas_medio]
        titulo = " - ".join(partes) or titulo
        t = sin_acentos(titulo)
        m = self.rx.search(t)
        if m:
            lon, lat, nombre, iso, prec, _ = self.lugares[m.group(1)]
            return lon, lat, nombre, prec
        iso = self.gaz.pais_en_texto(titulo) or ISO2_PAIS.get(str(pais_ta).strip())
        if iso:
            lon, lat = self.gaz.centroide(iso)
            if lon is not None:
                return lon, lat, self.gaz.paises[iso]["es"], "país"
        return None


# (medio, URL del RSS, dedicado al tema). Revisados el 04-nov-2026: su robots.txt permite leer el feed.
FEEDS_PROPIOS = [
    ("Inexplicata (es)", "https://inexplicata.blogspot.com/feeds/posts/default?alt=rss", True),
    ("Latest UFO Sightings", "https://www.latest-ufo-sightings.net/feed", True),
    ("Open Minds UFO News", "https://www.openminds.tv/feed", True),
    ("Mystery Wire", "https://www.mysterywire.com/feed/", True),
    ("The Debrief", "https://thedebrief.org/feed/", False),
    ("Liberation Times", "https://www.liberationtimes.com/home?format=rss", False),
    ("IranWire", "https://iranwire.com/en/feed/", False),
    # 14-nov-2026: fuentes dedicadas con reportes diarios de testigos (robots.txt permite el feed) y dos medios
    # generales en español que publican los videos virales (Alaska, Argentina y Uruguay, plataforma petrolera).
    # Reddit (r/UFOs) y The Black Vault bloquean lectores automáticos en su robots.txt: no se usan.
    ("UFO Sightings Daily", "https://www.ufosightingsdaily.com/feeds/posts/default?alt=rss", True),
    ("MUFON", "https://www.mufon.com/feed", False),  # también publica podcasts y congresos: solo notas con palabras del tema
    ("El Heraldo de México (tendencias)", "https://heraldodemexico.com.mx/rss/feed.html?r=8", False),
    ("El Heraldo de México (mundo)", "https://heraldodemexico.com.mx/rss/feed.html?r=5", False),
    ("Infobae Tendencias", "https://www.infobae.com/arc/outboundfeeds/rss/category/tendencias/", False),
]
# Lo que usa la palabra pero no es un reporte: la banda de rock UFO, el rapero Ufo361, el anime «Ufo Robot Goldrake»,
# agencias de fotos o tiendas con «UFO» en el nombre.
RUIDO = re.compile(r"goldrake|grendizer|ufo robot|ufo361|funky taurus|phil mogg|michael schenker|\bufo (band|tour|album|concert)|"
                   r"\bla banda ufo\b|ufo catcher|ufo tofu|dj ufo|ufo pizza|podcast|symposium|simposio|webinar|join us|tickets?\b|boletos", re.I)
DOMINIOS_RUIDO = {"funkytaurusmedia.com"}
GDELT_DOC = "https://api.gdeltproject.org/api/v2/doc/doc"
# Dos consultas por corrida (GDELT pide máximo una cada 5 s): alfabeto latino y otros alfabetos.
GDELT_CONSULTAS = [
    '(ufo OR uap OR ovni OR "unidentified flying" OR "unidentified aerial" OR "objeto no identificado" OR "objeto voador" '
    'OR "objet volant non identifié" OR "oggetto volante" OR "unbekanntes Flugobjekt" OR "tanımlanamayan uçan")',
    '("بشقاب پرنده" OR "شیء ناشناس" OR "جسم ناشناس" OR "جسم غريب" OR "طبق طائر" OR "أطباق طائرة" OR НЛО OR "不明飞行物" '
    'OR "未確認飛行物体" OR "미확인 비행" OR "यूएफओ" OR "עב״ם")',
]
PAUSA_GDELT_S = 8
# Términos del tema en persa, árabe, ruso y turco (para los títulos que llegan de GDELT sin traducir).
TEMA_OTROS = re.compile(r"(بشقاب پرنده|یوفو|شیء ناشناس|جسم ناشناس|اجسام ناشناس|اشیای ناشناس|پدیده ناشناخته|نور مرموز|"
                        r"جسم غريب|أجسام غريبة|اجسام غريبة|طبق طائر|أطباق طائرة|جسم طائر مجهول|ظاهرة غامضة|"
                        r"нло|неопознанн|tanımlanamayan|不明飞行物|未確認飛行物体|미확인 비행|यूएफओ|עב״ם|"
                        r"objet volant|oggetto volante|unbekanntes flugobjekt|objeto voador|\bovnis?\b|\bufos?\b|\buaps?\b)", re.I)
UA_PROPIO = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"


def _id_url(url):
    import hashlib
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:14]


def nota_propia(titulo, url, fecha, medio, ubicador, dedicado=False, pais_medio=None, origen="rss"):
    """Nota de un medio propio o de GDELT → feature de «anom_recientes», o None si no es del tema o no tiene lugar."""
    titulo = re.sub(r"\s+", " ", str(titulo or "")).strip()
    if not titulo or not str(url).startswith("http") or RUIDO.search(titulo) or any(d in str(url) for d in DOMINIOS_RUIDO):
        return None
    if not (dedicado or es_del_tema(titulo, [medio]) or TEMA_OTROS.search(sin_acentos(titulo))):
        return None
    u = ubicador.ubicar(titulo, "", [medio])
    precision = None
    if not u and pais_medio:
        lon, lat = ubicador.gaz.centroide(pais_medio)
        if lon is not None:
            u, precision = (lon, lat, ubicador.gaz.paises[pais_medio]["es"], "país"), "país del medio (aproximado)"
    if not u:
        return None
    lon, lat, lugar, prec = u
    tipo = tipo_por_texto(titulo)
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]}, "properties": {
        "id": f"{origen}:{_id_url(url)}", "capa": "anom_recientes", "tipo": tipo, "tipo_nombre": TIPOS_ANOM.get(tipo, "Otro"),
        "titulo": titulo[:160], "fecha": (fecha or "")[:10], "nivel": "medios", "credibilidad": "", "pais": "", "lugar": lugar,
        "precision": precision or prec, "fuente": medio, "resumen": "", "url": url}}


def xml_limpio(datos):
    """Algunos RSS (Squarespace) traen entidades de HTML como &nbsp; que el XML no admite: se pasan a su carácter."""
    import html.entities

    def rep(m):
        n = m.group(1).decode()
        if n in ("amp", "lt", "gt", "quot", "apos"):
            return m.group(0)
        return html.entities.html5.get(n + ";", "").encode("utf-8")
    return re.sub(rb"&([A-Za-z][A-Za-z0-9]*);", rep, datos)


def de_feeds_propios(ubicador, leer=None, permitido=None, feeds=None):
    permitido = permitido or F.permitido_por_robots
    out, estado = [], {}
    for medio, url, dedicado in feeds or FEEDS_PROPIOS:
        if not permitido(url):
            estado[medio] = "robots.txt no lo permite"
            continue
        try:
            items = F.parsear_rss(xml_limpio(leer(url) if leer else F.get(url, timeout=40)), {"nombre": medio, "tipo": "noticia"})
            nuevas = [n for n in (nota_propia(i["titulo"], i["url"], i["fecha_utc"], medio, ubicador, dedicado) for i in items) if n]
            out += nuevas
            estado[medio] = f"{len(items)} notas, {len(nuevas)} del tema"
        except Exception as e:  # noqa: BLE001  un medio caído no detiene a los demás
            estado[medio] = f"error: {type(e).__name__}"
    return out, estado


def de_gkg(ubicador, archivos=4, filas_de=None, lista_de=None):
    """GDELT GKG (los mismos archivos de 15 min que ya bajan tornados y el Noticiero, en caché): notas del tema en
    cualquier idioma (el flujo traducido trae el título original). La API DOC responde 429 a los servidores de GitHub
    desde el 10-nov-2026 (comparten dirección IP), por eso se dejó de usar. Devuelve (features, estado)."""
    sys.path.insert(0, os.path.join(ROOT, "tools", "clima"))
    import tornados as T  # noqa: E402
    filas_de = filas_de or T.filas_gkg
    lista_de = lista_de or T.archivos_gkg
    out, n_arch, errores = [], 0, 0
    for flujo, url in T.FLUJOS.items():
        try:
            urls = lista_de(url, archivos)
        except Exception:  # noqa: BLE001
            errores += 1
            continue
        for u in urls:
            try:
                for fila in filas_de(u):
                    if len(fila) < 27 or not fila[4].startswith("http"):
                        continue
                    titulo = T.titulo_de(fila[26])
                    if not titulo or not TEMA_OTROS.search(sin_acentos(titulo)) and not es_del_tema(titulo, []):
                        continue
                    fecha = f"{fila[1][:4]}-{fila[1][4:6]}-{fila[1][6:8]}" if len(fila[1]) >= 8 else ""
                    f = nota_propia(titulo, fila[4], fecha, f"{fila[3] or 'GDELT'} (vía GDELT)", ubicador, origen="gdelt")
                    if f:
                        out.append(f)
                n_arch += 1
            except Exception:  # noqa: BLE001  un archivo faltante no detiene a los demás
                errores += 1
    return out, f"GKG: {len(out)} notas en {n_arch} archivos" + (f"; {errores} sin respuesta" if errores else "")


def de_gdelt(ubicador, leer=None, pausa=PAUSA_GDELT_S):
    """Consultas a GDELT DOC (últimas 24 h, varios idiomas). Devuelve (features, estado)."""
    import time
    import urllib.parse
    por_nombre = {sin_acentos(p.get("en", "")): i for i, p in ubicador.gaz.paises.items()}
    out, notas = [], []
    for k, q in enumerate(GDELT_CONSULTAS):
        if k:
            time.sleep(pausa)
        url = GDELT_DOC + "?" + urllib.parse.urlencode({"query": q, "mode": "artlist", "format": "json", "maxrecords": 150, "timespan": "24h", "sort": "datedesc"})
        try:
            texto = (leer(url) if leer else F.get(url, timeout=60)).decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            notas.append(f"consulta {k + 1}: error {type(e).__name__}")
            continue
        if not texto.strip().startswith("{"):
            notas.append(f"consulta {k + 1}: sin JSON (límite de GDELT)")
            continue
        n0 = len(out)
        for a in json.loads(texto).get("articles", []):
            sd = str(a.get("seendate") or "")
            fecha = f"{sd[:4]}-{sd[4:6]}-{sd[6:8]}" if len(sd) >= 8 else ""
            pais = por_nombre.get(sin_acentos(a.get("sourcecountry") or ""))
            f = nota_propia(a.get("title"), a.get("url"), fecha, f"{a.get('domain') or 'GDELT'} (vía GDELT)", ubicador, pais_medio=pais, origen="gdelt")
            if f:
                out.append(f)
        notas.append(f"consulta {k + 1}: {len(out) - n0} notas")
    return out, "; ".join(notas)


def nivel_cred(cred):
    c = str(cred or "").upper()
    for clave, nivel in NIVEL_CRED:
        if clave in c:
            return nivel
    return "medios"


def de_coleccion(fc, recientes, hoy, ubicador=None):
    """FeatureCollection de notas o casos → nuestro formato. `recientes`: True para notas recientes (se re-ubican)."""
    out = []
    if recientes and ubicador is None:
        ubicador = Ubicador()
    limite = (hoy - timedelta(days=DIAS_RECIENTES)).strftime("%Y-%m-%d") if recientes else ""
    for f in (fc or {}).get("features", []):
        p = f.get("properties") or {}
        try:
            lon, lat = (float(x) for x in f["geometry"]["coordinates"][:2])
        except (KeyError, TypeError, ValueError):
            continue
        nombres, url = _fuentes_de(p)
        titulo = str(p.get("title") or "").strip()
        cred = str(p.get("credibility") or "")
        if recientes:
            if not url or not es_del_tema(titulo, nombres):
                continue
            # Las notas de más de un año van al archivo (siguen en el mapa, en su propia capa).
            capa, nivel = ("anom_recientes" if str(p.get("date") or "") >= limite else "anom_archivo"), "medios"
            u = ubicador.ubicar(titulo, p.get("country"), nombres)
            if not u:
                continue
            lon, lat, lugar, precision = u
        else:
            if "NUFORC" in cred:  # los reportes civiles van agregados por celda (densidad), no uno por uno
                continue
            capa, nivel = "anom_historicos", nivel_cred(cred)
            lugar, precision = "", "sitio"
        tipo = tipo_por_texto(titulo, p.get("type")) if recientes else (p.get("type") or "ufo")
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]}, "properties": {
            "id": f"ta:{p.get('id')}", "capa": capa, "tipo": tipo, "tipo_nombre": TIPOS_ANOM.get(tipo, "Otro"),
            "titulo": titulo[:160], "fecha": p.get("date") or "", "nivel": nivel, "credibilidad": cred[:80],
            "pais": p.get("country") or "", "lugar": lugar, "precision": precision, "fuente": ", ".join(nombres[:3]) or "Casos curados (DOMINUS)",
            # Casos históricos curados: su resumen es propio (no copia de una nota).
            "resumen": "" if recientes else str(p.get("description") or "")[:400],
            "url": url or _busqueda_wikipedia(titulo)}})
    return out


def _busqueda_wikipedia(titulo):
    """Referencia para un caso sin enlace propio: búsqueda en Wikipedia con el lugar o nombre del caso."""
    import urllib.parse
    clave = re.split(r" [—–-] ", titulo or "")[0].strip() or titulo
    return "https://es.wikipedia.org/w/index.php?search=" + urllib.parse.quote(clave)


def casos_historicos(cfg):
    """config/anomalias_casos.json → FeatureCollection con el mismo formato que leen las notas."""
    feats = []
    for c in (cfg or {}).get("casos", []):
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [c["lon"], c["lat"]]}, "properties": {
            "id": c["id"], "type": c.get("tipo"), "date": c.get("fecha"), "title": c.get("titulo"), "description": c.get("resumen"),
            "credibility": c.get("credibilidad"), "country": c.get("pais"),
            "sources": " | ".join([*c.get("fuentes", []), *([c["url"]] if c.get("url") else [])])}})
    return {"type": "FeatureCollection", "features": feats}


def unir_archivo(previas, nuevas, hoy, maximo=MAX_ARCHIVO):
    """Notas individuales del archivo anterior + las de esta corrida (gana la versión nueva del mismo id). Cada nota se
    reasigna a «recientes» (último año) o «archivo» según su fecha. Nunca se borran salvo al pasar de `maximo`."""
    limite = (hoy - timedelta(days=DIAS_RECIENTES)).strftime("%Y-%m-%d")
    por_id = {f["properties"]["id"]: f for f in previas if f.get("properties", {}).get("id")}
    for f in nuevas:
        por_id[f["properties"]["id"]] = f
    out = sorted(por_id.values(), key=lambda f: f["properties"].get("fecha") or "", reverse=True)[:maximo]
    for f in out:
        f["properties"]["capa"] = "anom_recientes" if (f["properties"].get("fecha") or "") >= limite else "anom_archivo"
    return out


def agrupar_por_pais(feats, maximo=15):
    """Notas ubicadas solo por país → un punto por país con la lista de las más recientes (si no, quedarían encimadas)."""
    otras, por_pais = [], defaultdict(list)
    for f in feats:
        p = f["properties"]
        (por_pais[(p.get("capa"), p["lugar"])] if p.get("precision") == "país" else otras).append(f)
    for (_, lugar), fs in por_pais.items():
        fs.sort(key=lambda f: f["properties"]["fecha"], reverse=True)
        p0 = fs[0]["properties"]
        otras.append({"type": "Feature", "geometry": fs[0]["geometry"], "properties": {
            "id": f"ta_pais:{p0.get('capa', 'anom_recientes')}:{lugar}", "capa": p0.get("capa", "anom_recientes"), "tipo": "ufo", "tipo_nombre": "Notas sin ciudad identificada",
            "titulo": f"{len(fs)} nota{'s' if len(fs) != 1 else ''} sobre {lugar} sin ciudad identificada", "fecha": p0["fecha"], "nivel": "medios",
            "tipos": sorted({f["properties"]["tipo"] for f in fs}),
            "lugar": lugar, "precision": "país", "n": len(fs), "fuente": "Varias (ver lista)", "url": p0["url"],
            "notas": [{k: f["properties"][k] for k in ("titulo", "url", "fecha", "fuente")} for f in fs[:maximo]]}})
    return otras


def densidad_nuforc(texto, celda=1.0):
    """CSV de NUFORC → celdas con conteo, formas más comunes y años. Sin texto de testigos ni lugares exactos."""
    celdas = defaultdict(lambda: {"n": 0, "formas": Counter(), "anios": []})
    for fila in csv.reader(io.StringIO(texto)):
        if len(fila) < 11:
            continue
        try:
            lat, lon = float(fila[9]), float(fila[10])
            anio = int(fila[0].split(" ")[0].split("/")[2])
        except (ValueError, IndexError):
            continue
        if abs(lat) < 0.01 and abs(lon) < 0.01:
            continue
        k = (int(lat // celda), int(lon // celda))
        c = celdas[k]
        c["n"] += 1
        c["formas"][(fila[4] or "unknown").strip().lower()] += 1
        c["anios"].append(anio)
    out = []
    for (fi, co), c in celdas.items():
        if c["n"] < 3:  # celdas con 1–2 reportes: ruido y riesgo de señalar un domicilio
            continue
        lat, lon = (fi + 0.5) * celda, (co + 0.5) * celda
        anios = sorted(c["anios"])
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 2), round(lat, 2)]}, "properties": {
            "id": f"nuforc:{fi}:{co}", "capa": "anom_nuforc", "tipo": "densidad", "tipo_nombre": "Reportes civiles (NUFORC)",
            "titulo": f"{c['n']:,} reportes civiles en esta celda de ~110 km".replace(",", " "), "n": c["n"],
            "formas": ", ".join(f"{FORMAS.get(f, f)} ({n})" for f, n in c["formas"].most_common(4)),
            "desde": anios[0], "hasta": anios[-1], "nivel": "civil", "fuente": "NUFORC (versión geocodificada de planetsig/ufo-reports)",
            "url": "https://github.com/planetsig/ufo-reports"}})
    return out


FORMAS = {"light": "luz", "triangle": "triángulo", "circle": "círculo", "disk": "disco", "unknown": "desconocida", "other": "otra",
          "sphere": "esfera", "fireball": "bola de fuego", "oval": "óvalo", "formation": "formación", "cigar": "puro", "changing": "cambiante",
          "cylinder": "cilindro", "chevron": "chevrón", "rectangle": "rectángulo", "diamond": "diamante", "flash": "destello", "egg": "huevo",
          "teardrop": "lágrima", "cross": "cruz", "cone": "cono", "delta": "delta", "fireballs": "bolas de fuego"}


def de_catalogo(cat):
    out = []
    for e in cat.get("entradas", []):
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [e["lon"], e["lat"]]}, "properties": {
            "id": f"anom:{e['id']}", "capa": f"anom_{e['tipo']}", "tipo": e["tipo"], "titulo": e["nombre"], "fecha": e.get("periodo", ""),
            "nivel": e["nivel"], "pais": e.get("pais", ""), "resumen": e["nota"], "fuente": e["fuente"], "url": e["url"],
            "aprox": bool(e.get("aprox"))}})
    return out


def leer_archivo(previo=None):
    """Archivo de notas; la primera vez se siembra con las notas individuales de la corrida anterior. Se descartan las
    notas sin enlace a su medio (las que solo apuntaban a un repositorio intermedio)."""
    try:
        feats = json.load(open(ARCHIVO, encoding="utf-8"))["features"]
    except (OSError, ValueError, KeyError):
        feats = [f for f in (previo or {}).get("features", []) if str(f["properties"].get("id", "")).startswith("ta:")
                 and f["properties"].get("capa") in ("anom_recientes", "anom_archivo")]
    def sirve(p):
        u = str(p.get("url", ""))
        # Sin repositorios intermedios ni ruido (banda UFO, Goldrake, agencias con «UFO» en el nombre) guardado antes del filtro.
        return "github.com/" not in u and "githubusercontent" not in u and not RUIDO.search(str(p.get("titulo", ""))) and not any(d in u for d in DOMINIOS_RUIDO)
    return [f for f in feats if sirve(f["properties"])]


def guardar_archivo(feats, ahora):
    os.makedirs(os.path.dirname(ARCHIVO), exist_ok=True)
    json.dump({"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "nota": "Notas acumuladas de blogs, medios y GDELT (título, medio, fecha y enlace; sin texto).",
               "features": feats}, open(ARCHIVO, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


def _previas(previo, capas):
    return [f for f in (previo or {}).get("features", []) if f["properties"].get("capa") in capas]


def main():
    ahora = datetime.now(timezone.utc)
    previo = {}
    try:
        previo = json.load(open(OUT, encoding="utf-8"))
        gen = datetime.strptime(previo.get("generado_utc", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        if ahora - gen < timedelta(hours=CADA_H) and "--forzar" not in sys.argv:
            print("anomalías: datos recientes")
            return 0
    except (OSError, ValueError):
        pass
    feats, estado = [], {}
    # Notas: se suman al archivo acumulado (lo que un medio deja de publicar no se pierde).
    archivo = leer_archivo(previo)
    ubicador = Ubicador()
    propios, est_feeds = de_feeds_propios(ubicador)
    gd, estado["anom_gdelt"] = de_gkg(ubicador)
    estado["anom_medios"] = est_feeds
    estado["anom_recientes"] = f"ok ({len(propios) + len(gd)} notas nuevas en esta corrida)"
    archivo = unir_archivo(archivo, propios + gd, ahora)
    guardar_archivo(archivo, ahora)
    estado["anom_archivo"] = f"{len(archivo)} notas guardadas ({sum(1 for f in archivo if f['properties']['capa'] == 'anom_archivo')} de hace más de un año)"
    feats += agrupar_por_pais(archivo)
    try:
        hist = de_coleccion(casos_historicos(json.load(open(CASOS, encoding="utf-8"))), False, ahora)
        feats += hist
        estado["anom_historicos"] = f"ok ({len(hist)})"
    except Exception as e:  # noqa: BLE001  se conserva lo anterior
        feats += _previas(previo, {"anom_historicos"})
        estado["anom_historicos"] = f"error: {e}"
    nuforc_gen = previo.get("nuforc_generado_utc", "")
    viejo = not nuforc_gen or ahora - datetime.strptime(nuforc_gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) > timedelta(days=NUFORC_CADA_DIAS)
    if viejo:
        try:
            dens = densidad_nuforc(F.get(NUFORC, timeout=120).decode("utf-8", "replace"))
            feats += dens
            nuforc_gen = ahora.strftime("%Y-%m-%dT%H:%M:%SZ")
            estado["anom_nuforc"] = f"ok ({len(dens)} celdas)"
        except Exception as e:  # noqa: BLE001
            feats += _previas(previo, {"anom_nuforc"})
            estado["anom_nuforc"] = f"error: {e}"
    else:
        feats += _previas(previo, {"anom_nuforc"})
        estado["anom_nuforc"] = "sin cambios"
    feats += de_catalogo(json.load(open(CATALOGO, encoding="utf-8")))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "nuforc_generado_utc": nuforc_gen,
               "estado": estado, "features": feats}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"anomalías: {len(feats)} objetos · {estado}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
