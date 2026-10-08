"""Conectores de fuentes de eventos. Cada uno devuelve "candidatos" con un formato común:

  {titulo, fuente, url, tipo_fuente, fecha_utc, pais_iso3, lat, lon, actores, texto_clasificar,
   resumen, area_sugerida, severidad, articulos}

`texto_clasificar` se usa SOLO para clasificar y nunca se guarda (puede contener la descripción del
feed). Del contenido de terceros se guarda título, fuente, fecha y enlace; el resumen lo redacta el sistema.
"""
import csv
import io
import json
import re
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"

# CAMEO: código raíz -> (descripción en español, área sugerida)
CAMEO = {
    "10": ("Exigencia", "instituciones"), "11": ("Desaprobación", "instituciones"), "12": ("Rechazo", "instituciones"),
    "13": ("Amenaza", "seguridad"), "14": ("Protesta", "identidad"), "15": ("Despliegue de fuerza", "seguridad"),
    "16": ("Reducción de relaciones", "instituciones"), "17": ("Coerción", "seguridad"), "18": ("Agresión", "seguridad"),
    "19": ("Combate", "seguridad"), "20": ("Violencia masiva", "seguridad"),
}
# Subcódigos con área distinta a la de su raíz.
CAMEO_ESPECIAL = {"163": "geoeconomia", "1631": "geoeconomia", "1632": "geoeconomia", "172": "geoeconomia"}

# Columnas de la tabla de eventos de GDELT 2.0 (61 columnas, sin encabezado).
G = {"id": 0, "actor1": 6, "actor2": 16, "raiz_evento": 25, "codigo": 26, "raiz": 28, "goldstein": 30,
     "fuentes": 32, "articulos": 33, "tono": 34, "lugar": 52, "lat": 56, "lon": 57, "fecha": 59, "url": 60}


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def palabras_de_url(url):
    """Las palabras del 'slug' de una URL de noticia suelen ser el titular: sirven para clasificar."""
    ruta = urllib.parse.urlparse(url).path
    partes = re.split(r"[/_\-.]+", ruta)
    return " ".join(p for p in partes if p.isalpha() and len(p) > 2)


def severidad_gdelt(goldstein, articulos):
    """1-5: parte de 1; +1 si Goldstein ≤ -5, +1 si ≤ -8 (más conflictivo); +1 con ≥ 20 artículos, +1 con ≥ 50."""
    s = 1 + (goldstein <= -5) + (goldstein <= -8) + (articulos >= 20) + (articulos >= 50)
    return int(min(5, s))


def fila_gdelt(f, cfg):
    """Convierte una fila de GDELT en candidato, o None si no pasa los filtros."""
    if len(f) < 61 or f[G["raiz_evento"]] != "1" or f[G["raiz"]] not in cfg["codigos_raiz"]:
        return None
    try:
        lat, lon = float(f[G["lat"]]), float(f[G["lon"]])
        articulos, gold = int(f[G["articulos"]]), float(f[G["goldstein"]])
    except ValueError:
        return None
    if articulos < cfg["min_articulos"]:
        return None
    desc, area = CAMEO[f[G["raiz"]]]
    area = CAMEO_ESPECIAL.get(f[G["codigo"]], area)
    a1 = f[G["actor1"]].title() or "Actor no identificado"
    a2 = f[G["actor2"]].title()
    lugar = f[G["lugar"]] or "lugar no identificado"
    titulo = f"{desc}: {a1}{' → ' + a2 if a2 else ''} ({lugar})"
    fecha = datetime.strptime(f[G["fecha"]], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
    return {
        "titulo": titulo[:300], "fuente": "GDELT 2.0 (evento codificado)", "url": f[G["url"]], "tipo_fuente": "base_datos",
        "fecha_utc": _iso(fecha), "pais_iso3": None, "lat": round(lat, 3), "lon": round(lon, 3),
        "actores": [a for a in (a1, a2) if a and a != "Actor no identificado"],
        "texto_clasificar": f"{titulo} {palabras_de_url(f[G['url']])}",
        "resumen": None,  # lo redacta ingest/resumen.py con los países ya traducidos
        "gdelt": {"desc": desc, "a1": f[G["actor1"]], "a2": f[G["actor2"]], "lugar": f[G["lugar"]], "articulos": articulos,
                  "fuentes": int(f[G["fuentes"]] or 0), "goldstein": gold, "slug": palabras_de_url(f[G["url"]])},
        "area_sugerida": area, "severidad": severidad_gdelt(gold, articulos), "articulos": articulos,
    }


def gdelt(cfg):
    """Últimos N archivos de 15 min (N = archivos_por_corrida; 4 = la última hora)."""
    ultima = get(cfg["url_ultima"]).decode().split("\n")[0].split()[2]  # .../20261008011500.export.CSV.zip
    marca = re.search(r"(\d{14})\.export", ultima).group(1)
    t = datetime.strptime(marca, "%Y%m%d%H%M%S")
    out = []
    for i in range(cfg["archivos_por_corrida"]):
        ts = (t - timedelta(minutes=15 * i)).strftime("%Y%m%d%H%M%S")
        url = ultima.replace(marca, ts)
        try:
            z = zipfile.ZipFile(io.BytesIO(get(url, timeout=120)))
        except Exception as e:  # noqa: BLE001  un archivo faltante no detiene la corrida
            print(f"  gdelt {ts}: {e}")
            continue
        with z.open(z.namelist()[0]) as fh:
            for f in csv.reader(io.TextIOWrapper(fh, encoding="utf-8", errors="replace"), delimiter="\t"):
                c = fila_gdelt(f, cfg)
                if c:
                    out.append(c)
    out.sort(key=lambda c: (-c["severidad"], -c["articulos"]))
    return out[: cfg["max_eventos"]]


def _texto(el, *nombres):
    for n in nombres:
        x = el.find(n)
        if x is not None and (x.text or "").strip():
            return x.text.strip()
    return ""


ATOM = "{http://www.w3.org/2005/Atom}"
MEDIA = "{http://search.yahoo.com/mrss/}"


def primera_frase(texto, maximo=140):
    """Primera oración de un texto (para publicaciones sin título), cortada en palabra completa."""
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", texto or "")).strip()
    m = re.match(r"(.+?[.!?])(\s|$)", t)
    frase = m.group(1) if m else t
    if len(frase) > maximo:
        frase = frase[:maximo].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return frase


def parsear_rss(xml_bytes, feed):
    """RSS 2.0, RDF/RSS 1.0 o Atom (incluye YouTube). Devuelve candidatos sin país (se geocodifican después).

    Modos opcionales del feed (config/fuentes.json):
      "modo": "titulo_desde_texto"  publicaciones sin título de una cuenta institucional (Bluesky): el
                                    título es la primera frase de la propia publicación.
      "modo": "solo_enlace"         publicaciones de personas usuarias (Mastodon): no se guarda texto
                                    ni autor; el texto se usa solo en memoria para ubicar y clasificar,
                                    y el título lo genera el sistema (ingest/run.py).
      "max_items": n                tope de publicaciones por corrida.
    """
    raiz = ET.fromstring(xml_bytes)
    items = (raiz.findall(".//item") or raiz.findall(".//{http://purl.org/rss/1.0/}item")
             or raiz.findall(f".//{ATOM}entry"))
    modo = feed.get("modo")
    out = []
    for it in items[: feed.get("max_items") or len(items)]:
        titulo = _texto(it, "title", "{http://purl.org/rss/1.0/}title", f"{ATOM}title")
        link = _texto(it, "link", "{http://purl.org/rss/1.0/}link")
        if not link:
            a = it.find(f"{ATOM}link[@rel='alternate']")
            a = a if a is not None else it.find(f"{ATOM}link")
            link = a.get("href") if a is not None else ""
        fecha_txt = _texto(it, "pubDate", "{http://purl.org/dc/elements/1.1/}date", f"{ATOM}published", f"{ATOM}updated")
        desc = _texto(it, "description", "{http://purl.org/rss/1.0/}description", f"{ATOM}summary", f"{MEDIA}group/{MEDIA}description")
        if modo == "titulo_desde_texto" and not titulo:
            titulo = primera_frase(desc)
        if modo == "solo_enlace":
            titulo = titulo or "publicación"  # provisional: ingest/run.py lo reemplaza; nunca se publica el texto
        if not titulo or not link.startswith("http"):
            continue
        try:
            # RFC 822 con o sin día de la semana («Thu, 08 Oct 2026 …», «08 Oct 2026 10:00 +0000» de Bluesky) o ISO 8601.
            fecha = datetime.fromisoformat(fecha_txt.replace("Z", "+00:00")) if re.match(r"\d{4}-", fecha_txt) else parsedate_to_datetime(fecha_txt)
            if fecha.tzinfo is None:
                fecha = fecha.replace(tzinfo=timezone.utc)
        except Exception:  # noqa: BLE001
            fecha = datetime.now(timezone.utc)
        out.append({
            "titulo": re.sub(r"\s+", " ", titulo)[:300], "fuente": feed["nombre"], "url": link, "tipo_fuente": feed["tipo"],
            "fecha_utc": _iso(fecha), "pais_iso3": None, "lat": None, "lon": None, "actores": [],
            "texto_clasificar": f"{titulo} {re.sub('<[^>]+>', ' ', desc)[:500]}", "idioma": feed.get("idioma"),
            "resumen": None, "area_sugerida": None, "severidad": None, "articulos": 1,
            **({"anonimo": True, "etiqueta": feed.get("etiqueta", "")} if modo == "solo_enlace" else {}),
        })
    return out


_ROBOTS = {}


def permitido_por_robots(url, leer=None):
    """True si el robots.txt del sitio permite a nuestro bot leer `url`. Sin robots.txt (404) = permitido.

    Se consulta una vez por sitio y corrida. `leer` permite probar sin red.
    """
    p = urllib.parse.urlparse(url)
    base = f"{p.scheme}://{p.netloc}"
    if base not in _ROBOTS:
        rp = urllib.robotparser.RobotFileParser()
        try:
            texto = leer(base + "/robots.txt") if leer else get(base + "/robots.txt", timeout=20).decode("utf-8", "replace")
            rp.parse(texto.splitlines())
        except urllib.error.HTTPError as e:
            rp.parse([] if e.code >= 400 and e.code not in (401, 403) else ["User-agent: *", "Disallow: /"])
        except Exception:  # noqa: BLE001  robots.txt inaccesible por red: se trata como sin reglas
            rp.parse([])
        _ROBOTS[base] = rp
    return _ROBOTS[base].can_fetch("Geopolitica-monitor", url)


def rss(feed):
    if not permitido_por_robots(feed["url"]):
        raise PermissionError("el robots.txt del sitio no permite leer este feed: se omite")
    return parsear_rss(get(feed["url"], timeout=40), feed)


def reliefweb(cfg, appname):
    q = {"appname": appname, "limit": cfg["limite"], "sort[]": "date:desc", "profile": "list",
         "fields[include][]": ["title", "url", "date.created", "primary_country.iso3", "source.shortname", "disaster_type.name"]}
    url = cfg["url"] + "?" + urllib.parse.urlencode(q, doseq=True)
    datos = json.loads(get(url))["data"]
    out = []
    for d in datos:
        f = d["fields"]
        iso = (f.get("primary_country") or {}).get("iso3", "").upper() or None
        tipos = ", ".join(t["name"] for t in f.get("disaster_type", []) or [])
        out.append({
            "titulo": f["title"][:300], "fuente": "ReliefWeb (OCHA)", "url": f.get("url") or f"https://reliefweb.int/node/{d['id']}",
            "tipo_fuente": "base_datos", "fecha_utc": f["date"]["created"][:19] + "Z", "pais_iso3": iso, "lat": None, "lon": None,
            "actores": [s["shortname"] for s in f.get("source", []) if s.get("shortname")][:3],
            "texto_clasificar": f"{f['title']} {tipos} humanitarian crisis", "resumen": None, "idioma": "en",
            "area_sugerida": "demografia", "severidad": None, "articulos": 1,
        })
    return out
