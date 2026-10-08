#!/usr/bin/env python3
"""Capa «Terrorismo, narcotráfico y crimen organizado»: señales de noticias de las últimas 24 h.

Fuente principal: archivos de eventos de GDELT 2.0 (cada 15 min): eventos violentos con un actor criminal
(CRM), insurgente (INS), rebelde (REB), armado (UAF) o separatista (SEP), con coordenadas. Se acumulan 24 h.
Complemento: GDELT DOC 2.0 API (gratuita, sin llave; monitorea medios de 100+ idiomas cada 15 min).
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
ESPERA_429_S = 30    # ante «demasiadas solicitudes» se espera y se reintenta una vez
MIN_ENTRE_CORRIDAS = 55

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


# ---------------------------------------------------------------- archivos de eventos de GDELT 2.0
ULTIMA = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt"
TIPOS_ACTOR = {"CRM": "Crimen organizado", "INS": "Insurgencia", "REB": "Grupo rebelde", "UAF": "Grupo armado", "SEP": "Separatistas"}
RAICES_VIOLENTAS = {"13", "14", "15", "17", "18", "19", "20"}  # amenazas, protestas violentas, fuerza, coerción, asalto, combate, violencia masiva
# Índices de columnas del formato de eventos de GDELT 2.0 (61 columnas).
C = {"a1": 6, "a1t": (12, 13, 14), "a2": 16, "a2t": (22, 23, 24), "raiz": 28, "articulos": 33, "geo_tipo": 51, "lugar": 52,
     "lat": 56, "lon": 57, "fecha": 59, "url": 60}


def evento_gdelt(f, gaz, paises, min_articulos=2):
    """Fila de eventos de GDELT → feature si un actor es criminal, insurgente o armado y la acción es violenta."""
    if len(f) < 61 or f[C["raiz"]] not in RAICES_VIOLENTAS:
        return None
    tipos = {f[i] for i in (*C["a1t"], *C["a2t"]) if f[i]}
    actor_tipo = next((TIPOS_ACTOR[t] for t in ("CRM", "INS", "REB", "UAF", "SEP") if t in tipos), None)
    if not actor_tipo:
        return None
    try:
        lat, lon, articulos = float(f[C["lat"]]), float(f[C["lon"]]), int(f[C["articulos"]])
    except ValueError:
        return None
    if articulos < min_articulos or not f[C["url"]].startswith("http"):
        return None
    slug = F.palabras_de_url(f[C["url"]])
    texto = f"{slug} {f[C['a1']]} {f[C['a2']]}"
    tipo = tipo_de(texto)
    if tipo == "Crimen organizado" and actor_tipo != "Crimen organizado":
        tipo = "Terrorismo" if re.search(TIPOS[0][1], texto.lower()) else actor_tipo
    sev = max(severidad_de(slug), {"20": 5, "19": 4, "18": 4}.get(f[C["raiz"]], 3))
    actores = " → ".join(a.title() for a in (f[C["a1"]], f[C["a2"]]) if a)
    titulo = slug.capitalize() if len(slug.split()) >= 4 else f"{tipo}: {actores or 'actor no identificado'} ({f[C['lugar']]})"
    iso = paises.de(lon, lat)
    fecha = datetime.strptime(f[C["fecha"]], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    precision = {"1": "país", "2": "estado", "5": "estado", "3": "ciudad", "4": "ciudad"}.get(f[C["geo_tipo"]], "ciudad")
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3)]},
            "properties": {"title": titulo[:220], "url": f[C["url"]], "source": urllib.parse.urlparse(f[C["url"]]).netloc, "date": fecha,
                           "tipo": tipo, "severidad": sev, "lugar": f[C["lugar"]], "pais_iso3": iso or "", "precision": precision,
                           "origen": "mx" if iso == "MEX" else "mundo", "actores": actores, "articulos": articulos,
                           "via": "GDELT 2.0 (evento codificado; el título sale del enlace)"}}


def eventos_gdelt(gaz, archivos=4):
    import csv
    import io
    import zipfile
    from geo import Paises
    paises = Paises()
    ultima = F.get(ULTIMA).decode().split("\n")[0].split()[2]
    marca = re.search(r"(\d{14})\.export", ultima).group(1)
    t = datetime.strptime(marca, "%Y%m%d%H%M%S")
    out = []
    for k in range(archivos):
        url = ultima.replace(marca, (t - timedelta(minutes=15 * k)).strftime("%Y%m%d%H%M%S"))
        try:
            z = zipfile.ZipFile(io.BytesIO(F.get(url, timeout=120)))
        except Exception as e:  # noqa: BLE001
            print(f"  gdelt {url}: {e}")
            continue
        with z.open(z.namelist()[0]) as fh:
            for fila in csv.reader(io.TextIOWrapper(fh, encoding="utf-8", errors="replace"), delimiter="\t"):
                ft = evento_gdelt(fila, gaz, paises)
                if ft:
                    out.append(ft)
    return out


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
    previos = []
    if os.path.exists(OUT):
        previo = json.load(open(OUT, encoding="utf-8"))
        previos = previo.get("features", [])
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
            if "429" in str(e):
                errores.append("La API de búsqueda de GDELT limita las consultas desde este servidor; se usan sus archivos de eventos")
                break
        time.sleep(PAUSA_S)
    # Fuente principal: archivos de eventos de GDELT 2.0 (cada 15 min, sin límite de consultas).
    try:
        nuevos = eventos_gdelt(gaz)
        feats += nuevos
        print(f"crimen: {len(nuevos)} eventos codificados de GDELT en la última hora")
    except Exception as e:  # noqa: BLE001
        errores.append(f"eventos GDELT: {e}"[:160])
    # Se acumulan 24 h: lo de corridas anteriores que siga vigente y no esté repetido.
    feats += [f for f in previos if f["properties"]["url"] not in {g["properties"]["url"] for g in feats}]
    limite = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
    feats = [f for f in feats if (f["properties"]["date"] or "") >= limite]
    feats.sort(key=lambda f: f["properties"]["date"] or "", reverse=True)
    feats = deduplicar(feats)
    if not feats and errores:
        print(f"crimen: sin datos nuevos ({errores}); se conservan los anteriores")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "fuente": "GDELT DOC 2.0 (señales de noticias, verificar)", "errores": errores, "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"crimen: {len(feats)} señales ({sum(1 for f in feats if f['properties']['pais_iso3'] == 'MEX')} en México); errores: {errores}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
