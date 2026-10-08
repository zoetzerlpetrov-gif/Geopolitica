#!/usr/bin/env python3
"""Capa «Terrorismo, narcotráfico y crimen organizado»: señales de noticias de las últimas 24 h.

Fuente: GDELT DOC 2.0 API (gratuita, sin llave; monitorea medios de 100+ idiomas cada 15 min).
Prioridad México: búsquedas en español con medios de México y nombres de grupos que operan en el país;
además, búsquedas mundiales de terrorismo, mafias y crimen organizado (inglés y español).

Qué se guarda de cada nota: título, enlace, medio, fecha, tipo, severidad estimada y lugar aproximado.
Nunca el texto del artículo. Ubicación: estado o ciudad de México mencionados en el título
(config/mx_estados.json) o, si no, el país mencionado (gazetteer); sin lugar reconocible, una nota de
medios de México se ubica en el centro del país y se marca «ubicación aproximada (país)».
Son SEÑALES por verificar, no incidentes confirmados.

Salida: vivos/crimen.geojson (el workflow «Datos en movimiento» lo publica cada hora como máximo).
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
from classify import normalizar  # noqa: E402
from geo import Gazetteer  # noqa: E402
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "crimen.geojson")
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
API = "https://api.gdeltproject.org/api/v2/doc/doc"
PAUSA_S = 12         # GDELT pide no más de 1 consulta cada 5 s; desde IPs compartidas de GitHub conviene más margen
ESPERA_429_S = 45    # ante «demasiadas solicitudes» se espera y se reintenta una vez
MIN_ENTRE_CORRIDAS = 55

# Respaldo si GDELT no responde: Google News RSS (búsquedas públicas por región), respetando su robots.txt.
GNEWS = "https://news.google.com/rss/search?{q}"
CONSULTAS_RSS = [
    ("mx", "cártel OR narco OR \"crimen organizado\" OR sicarios OR \"fosa clandestina\" when:1d", "es-419", "MX", "MX:es-419"),
    ("latam", "narcotráfico OR \"crimen organizado\" OR pandillas OR \"Tren de Aragua\" when:1d", "es-419", "CO", "CO:es-419"),
    ("mundo", "terrorist attack OR \"Islamic State\" OR jihadist OR \"car bomb\" when:1d", "en-US", "US", "US:en"),
    ("mundo", "mafia OR \"organized crime\" OR \"drug cartel\" when:1d", "en-US", "US", "US:en"),
]

CONSULTAS = [
    # México (prioridad)
    ("mx", '(cártel OR narco OR narcotráfico OR "crimen organizado" OR sicarios OR "fosa clandestina" OR huachicol OR "cobro de piso") sourcecountry:mexico sourcelang:spanish'),
    ("mx", '("Cártel de Sinaloa" OR CJNG OR "Jalisco Nueva Generación" OR "Cártel del Golfo" OR "Familia Michoacana" OR "Cárteles Unidos" OR "Chapitos" OR "Mayo Zambada" OR "Santa Rosa de Lima" OR "Cártel del Noreste")'),
    # América Latina en español
    ("latam", '(narcotráfico OR "crimen organizado" OR pandillas OR maras OR "Tren de Aragua" OR "Clan del Golfo" OR "Primeiro Comando") sourcelang:spanish -sourcecountry:mexico'),
    # Mundo: terrorismo y mafias
    ("mundo", '(terrorist OR terrorism OR jihadist OR "suicide bomber" OR "car bomb" OR "Islamic State" OR al-Shabaab OR "Boko Haram" OR JNIM) sourcelang:english'),
    ("mundo", '(mafia OR "organized crime" OR "drug cartel" OR "drug trafficking" OR Ndrangheta OR Camorra OR yakuza OR triad OR "gang violence") sourcelang:english'),
]

TIPOS = [
    ("Terrorismo", r"terroris|yihad|jihad|suicide bomb|car bomb|islamic state|estado isl[aá]mico|al.?shabaab|boko haram|jnim|atentado"),
    ("Mafia", r"mafia|ndrangheta|camorra|cosa nostra|yakuza|triad|tr[ií]ada"),
    ("Narcotráfico", r"narco|c[aá]rtel|cartel|cocaine|coca[ií]na|fentanyl|fentanilo|metanfetamina|drug traffick|chapitos|cjng|sinaloa"),
    ("Crimen organizado", r"crimen organizado|organized crime|pandilla|gang|maras?\b|extorsi|cobro de piso|huachicol|secuestr|sicari|tren de aragua"),
]
AMBIGUOS = {"Hidalgo", "Morelos", "Guerrero", "Colima", "Durango", "Campeche", "Tabasco", "Zacatecas"}
GRAVES = r"masacre|massacre|bomb|explosi|ataque armado|ataque con drones?|enfrentamiento|balacera|emboscada|killed|asesinad|ejecutad|decapitad|fosa|car bomb|suicide"
LEVES = r"detien|deten|arrest|captur|decomis|seized|asegur|extradit|sentenc|juicio|trial|vinculan a proceso"


def tipo_de(titulo):
    t = titulo.lower()
    for nombre, rx in TIPOS:
        if re.search(rx, t):
            return nombre
    return "Crimen organizado"


def severidad_de(titulo):
    """3 por defecto; 4–5 con violencia o muertos (≥10 → 5); 2 con detenciones o decomisos."""
    t = titulo.lower()
    m = re.search(r"(\d{1,4})\s+(muertos|asesinados|killed|dead|personas sin vida|cuerpos|bodies)", t)
    if m and int(m.group(1)) >= 10:
        return 5
    if re.search(GRAVES, t) or m:
        return 4
    if re.search(LEVES, t):
        return 2
    return 3


def ubicar(titulo, estados, gaz, origen):
    """(lon, lat, lugar, iso3, precision) o None. Busca primero ciudades y estados de México."""
    t = normalizar(titulo)
    for c in estados["ciudades"]:
        if normalizar(c["nombre"]) in t:
            return c["lon"], c["lat"], f'{c["nombre"]}, {c["estado"]}', "MEX", "ciudad"
    for e in estados["estados"]:
        nombres = [e["nombre"], *e.get("alias", [])]
        for n in nombres:
            nn = normalizar(n)
            # Nombres que también son apellidos o personajes (Hidalgo, Morelos, Guerrero) solo cuentan
            # precedidos de «en», «de» o «estado de».
            if n in AMBIGUOS:
                if re.search(rf" (en|de|del estado de|estado de){re.escape(nn.rstrip())}", t):
                    return e["lon"], e["lat"], e["nombre"], "MEX", "estado"
            elif nn in t:
                return e["lon"], e["lat"], e["nombre"], "MEX", "estado"
    iso = gaz.pais_en_texto(titulo)
    if iso:
        lon, lat = gaz.centroide(iso)
        return lon, lat, gaz.paises[iso]["es"], iso, "país"
    if origen == "mx":
        lon, lat = gaz.centroide("MEX")
        return lon, lat, "México (sin lugar en el título)", "MEX", "país"
    return None


def fecha_gdelt(s):
    try:
        return datetime.strptime(s, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError):
        return None


def tokens(titulo):
    return {w for w in normalizar(titulo).split() if len(w) > 3}


def deduplicar(feats, umbral=0.6):
    """Quita titulares casi iguales (Jaccard ≥ 0.6) entre medios; se queda con el primero (más reciente)."""
    out, vistos = [], []
    for f in feats:
        tk = tokens(f["properties"]["title"])
        if any(tk and len(tk & v) / len(tk | v) >= umbral for v in vistos):
            continue
        vistos.append(tk)
        out.append(f)
    return out


def a_feature(art, origen, estados, gaz):
    titulo = re.sub(r"\s+", " ", art.get("title") or "").strip()
    url = art.get("url") or ""
    if not titulo or not url.startswith("http"):
        return None
    lugar = ubicar(titulo, estados, gaz, origen)
    if not lugar:
        return None
    lon, lat, nombre, iso, precision = lugar
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3)]},
            "properties": {"title": titulo[:220], "url": url, "source": art.get("domain") or "", "date": fecha_gdelt(art.get("seendate")),
                           "tipo": tipo_de(titulo), "severidad": severidad_de(titulo), "lugar": nombre, "pais_iso3": iso,
                           "precision": precision, "origen": origen}}


def get_json(url, reintentos=1):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            texto = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 429 and reintentos > 0:
            time.sleep(ESPERA_429_S)
            return get_json(url, reintentos - 1)
        raise
    return json.loads(texto) if texto.strip().startswith("{") else {}


def main():
    if os.path.exists(OUT):
        previo = json.load(open(OUT, encoding="utf-8"))
        gen = previo.get("generado_utc")
        if gen and datetime.now(timezone.utc) - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(minutes=MIN_ENTRE_CORRIDAS):
            print("crimen: datos de hace menos de 1 h; se conservan")
            return 0
    rp = urllib.robotparser.RobotFileParser("https://api.gdeltproject.org/robots.txt")
    try:
        rp.read()
    except Exception:  # noqa: BLE001
        rp.parse([])
    if not rp.can_fetch("Geopolitica-monitor", API):
        print("crimen: robots.txt de GDELT no permite la consulta; se omite")
        return 0
    estados = json.load(open(os.path.join(ROOT, "config", "mx_estados.json"), encoding="utf-8"))
    gaz = Gazetteer()
    feats, errores = [], []
    for origen, q in CONSULTAS:
        url = API + "?" + urllib.parse.urlencode({"query": q, "mode": "artlist", "format": "json", "maxrecords": 150, "timespan": "24h", "sort": "datedesc"})
        try:
            for art in get_json(url).get("articles", []):
                f = a_feature(art, origen, estados, gaz)
                if f:
                    feats.append(f)
        except Exception as e:  # noqa: BLE001  una consulta caída no detiene las demás
            errores.append(f"{origen}: {e}"[:160])
            if sum("429" in x for x in errores) >= 2:
                errores.append("GDELT limita las consultas desde este servidor: se pasa al respaldo")
                break
        time.sleep(PAUSA_S)
    # Respaldo: si GDELT no dio nada para una región, Google News RSS (título, enlace, medio y fecha).
    con_datos = {f["properties"]["origen"] for f in feats}
    for origen, q, hl, gl, ceid in CONSULTAS_RSS:
        if origen in con_datos:
            continue
        url = GNEWS.format(q=urllib.parse.urlencode({"q": q, "hl": hl, "gl": gl, "ceid": ceid}))
        try:
            if not F.permitido_por_robots(url):
                errores.append(f"{origen} (Google News): robots.txt no lo permite")
                continue
            for c in F.parsear_rss(F.get(url, timeout=40), {"nombre": "Google News", "tipo": "noticia"}):
                titulo, medio = (c["titulo"].rsplit(" - ", 1) + [""])[:2]
                f = a_feature({"title": titulo, "url": c["url"], "domain": medio,
                               "seendate": c["fecha_utc"].replace("-", "").replace(":", "")}, origen, estados, gaz)
                if f:
                    f["properties"]["via"] = "Google News RSS"
                    feats.append(f)
        except Exception as e:  # noqa: BLE001
            errores.append(f"{origen} (Google News): {e}"[:160])
        time.sleep(2)
    feats.sort(key=lambda f: f["properties"]["date"] or "", reverse=True)
    feats = deduplicar(feats)
    if not feats and errores:
        print(f"crimen: ninguna consulta respondió ({errores}); se conservan los datos anteriores")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "fuente": "GDELT DOC 2.0 (señales de noticias, verificar)", "errores": errores, "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"crimen: {len(feats)} señales ({sum(1 for f in feats if f['properties']['pais_iso3'] == 'MEX')} en México); errores: {errores}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
