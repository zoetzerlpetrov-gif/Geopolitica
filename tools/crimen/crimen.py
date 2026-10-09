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
    ("Narcotráfico", r"narco|\bc[aá]rtel(es)?\b|\bcartels?\b|cocaine|coca[ií]na|fentanyl|fentanilo|metanfetamina|drug traffick|chapitos|cjng|sinaloa"),
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
                           "tipo": tipo_de(titulo), "severidad": severidad_de(titulo), "lugar": nombre, "pais_iso3": iso, "arma": arma_de(titulo),
                           "precision": precision, "origen": origen}}


# ---------------------------------------------------------------- archivos de eventos de GDELT 2.0
ULTIMA = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt"
TIPOS_ACTOR = {"CRM": "Crimen organizado", "INS": "Insurgencia", "REB": "Grupo rebelde", "UAF": "Grupo armado", "SEP": "Separatistas"}
RAICES_VIOLENTAS = {"13", "14", "15", "17", "18", "19", "20"}  # amenazas, protestas violentas, fuerza, coerción, asalto, combate, violencia masiva
# Índices de columnas del formato de eventos de GDELT 2.0 (61 columnas).
C = {"a1": 6, "a1t": (12, 13, 14), "a2": 16, "a2t": (22, 23, 24), "codigo": 26, "raiz": 28, "articulos": 33, "geo_tipo": 51, "lugar": 52,
     "lat": 56, "lon": 57, "fecha": 59, "url": 60}


# Ataques por código CAMEO exacto (columna EventCode) y por palabras del enlace o el título.
ARMAS_CAMEO = {"1831": "Atentado suicida", "1832": "Coche bomba", "1833": "Bomba en carretera (IED)", "1834": "Bomba", "183": "Bomba",
               "194": "Artillería y tanques", "195": "Ataque aéreo", "1951": "Misiles o munición guiada", "1952": "Drones",
               "204": "Armas de destrucción masiva", "2041": "Armas químicas, biológicas o radiológicas", "2042": "Arma nuclear"}
ARMAS_TEXTO = [("Misiles o cohetes", r"misil|missile|cohete|rocket|bal[ií]stic"), ("Drones", r"\bdron|drone|uav|kamikaze"),
               ("Coche bomba", r"coche bomba|car bomb|vehicle bomb"), ("Atentado suicida", r"suicid.{0,12}(bomb|atent)|suicide bomb"),
               ("Bomba o explosivo", r"bomba|bomb|explosiv|granada|grenade|ied\b|artefacto explosivo|mina terrestre|landmine"),
               ("Ataque aéreo", r"bombardeo|airstrike|air strike|ataque a[eé]reo"), ("Artillería", r"artiller|shelling|mortero|mortar|tanque|tank")]


def arma_de(texto, codigo=""):
    """Tipo de arma: primero por palabras (más específicas), luego por código CAMEO. None si no hay."""
    t = (texto or "").lower()
    for nombre, rx in ARMAS_TEXTO:
        if re.search(rx, t):
            return nombre
    return ARMAS_CAMEO.get(codigo) or ARMAS_CAMEO.get(codigo[:3]) if codigo[:3] in ("183", "194", "195", "204") else None


# Un evento dentro de México basta con 1 artículo (la cobertura local suele ser de un solo medio); fuera, se
# exigen 2 (crimen) o 3 (ataques) para filtrar ruido. Con 1 artículo la severidad no sube por cobertura.
MIN_ARTICULOS_MX = 1


def evento_ataque(f, paises, min_articulos=3):
    """Fila de eventos de GDELT → feature si el código CAMEO es un ataque con bombas, artillería, aéreo o con drones/misiles.
    No exige actor criminal: incluye ataques militares entre Estados."""
    if len(f) < 61 or f[C["codigo"]][:3] not in ("183", "194", "195", "204"):
        return None
    try:
        lat, lon, articulos = float(f[C["lat"]]), float(f[C["lon"]]), int(f[C["articulos"]])
    except ValueError:
        return None
    if not f[C["url"]].startswith("http"):
        return None
    iso = paises.de(lon, lat)
    if articulos < (MIN_ARTICULOS_MX if iso == "MEX" else min_articulos):
        return None
    slug = F.palabras_de_url(f[C["url"]])
    arma = arma_de(slug, f[C["codigo"]]) or "Ataque armado"
    actores = " → ".join(a.title() for a in (f[C["a1"]], f[C["a2"]]) if a)
    sev = 5 if f[C["codigo"]].startswith("204") or articulos >= 50 else 4 if articulos >= 10 or f[C["codigo"]] in ("1831", "1832") else 3
    titulo = slug.capitalize() if len(slug.split()) >= 4 else f"{arma}: {actores or 'actor no identificado'} ({f[C['lugar']]})"
    fecha = datetime.strptime(f[C["fecha"]], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3)]},
            "properties": {"title": titulo[:220], "url": f[C["url"]], "source": urllib.parse.urlparse(f[C["url"]]).netloc, "date": fecha,
                           "tipo": "Ataque", "arma": arma, "cameo": f[C["codigo"]], "severidad": sev, "lugar": f[C["lugar"]], "pais_iso3": iso or "",
                           "precision": {"1": "país", "2": "estado", "5": "estado"}.get(f[C["geo_tipo"]], "ciudad"), "actores": actores,
                           "articulos": articulos, "via": "GDELT 2.0 (evento codificado; el título sale del enlace)"}}


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
    if not f[C["url"]].startswith("http"):
        return None
    iso = paises.de(lon, lat)
    if articulos < (MIN_ARTICULOS_MX if iso == "MEX" else min_articulos):
        return None
    slug = F.palabras_de_url(f[C["url"]])
    texto = f"{slug} {f[C['a1']]} {f[C['a2']]}"
    tipo = tipo_de(texto)
    if tipo == "Crimen organizado" and actor_tipo != "Crimen organizado":
        tipo = "Terrorismo" if re.search(TIPOS[0][1], texto.lower()) else actor_tipo
    sev = max(severidad_de(slug), {"20": 5, "19": 4, "18": 4}.get(f[C["raiz"]], 3))
    arma = arma_de(slug, f[C["codigo"]])
    actores = " → ".join(a.title() for a in (f[C["a1"]], f[C["a2"]]) if a)
    titulo = slug.capitalize() if len(slug.split()) >= 4 else f"{tipo}: {actores or 'actor no identificado'} ({f[C['lugar']]})"
    fecha = datetime.strptime(f[C["fecha"]], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    precision = {"1": "país", "2": "estado", "5": "estado", "3": "ciudad", "4": "ciudad"}.get(f[C["geo_tipo"]], "ciudad")
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3)]},
            "properties": {"title": titulo[:220], "url": f[C["url"]], "source": urllib.parse.urlparse(f[C["url"]]).netloc, "date": fecha,
                           "tipo": tipo, "severidad": sev, "lugar": f[C["lugar"]], "pais_iso3": iso or "", "precision": precision,
                           "origen": "mx" if iso == "MEX" else "mundo", "actores": actores, "articulos": articulos, "arma": arma,
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
    out, ataques = [], []
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
                at = evento_ataque(fila, paises)
                if at:
                    ataques.append(at)
    return out, ataques


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


# ---------------------------------------------------------------- feeds RSS de medios mexicanos
DESLAVE = r"\b(deslaves?|derrumbes? de (tierra|cerro|roca)|deslizamientos? de (tierra|ladera)|desgajamientos?|socav[oó]n|alud(es)?|landslides?|mudslides?|corrimientos? de tierra)\b"
CRIMEN_TXT = r"\bc[aá]rtel(es)?\b|narco|crimen organizado|sicari|balacera|enfrentamiento|ejecutad|asesinad|homicid|secuestr|extorsi|cobro de piso|fosa|levant(ad|on)|desaparec|huachicol|halcones|emboscada"


def clasificar_titular(titulo):
    """('deslave'|'ataque'|'crimen'|None, arma) para un titular de un medio mexicano."""
    t = titulo.lower()
    if re.search(DESLAVE, t):
        return "deslave", None
    arma = arma_de(t)
    if arma and re.search(r"ataque|atentado|explot|lanz|deton|ataca|attack|strike", t):
        return "ataque", arma
    if re.search(CRIMEN_TXT, t):
        return "crimen", arma
    return None, None


def rss_mexico(estados, gaz):
    """Titulares de medios mexicanos (config/fuentes_mx.json) → features de crimen, ataques y deslaves."""
    cfg = json.load(open(os.path.join(ROOT, "config", "fuentes_mx.json"), encoding="utf-8"))
    salida = {"crimen": [], "ataque": [], "deslave": []}
    estado_fuentes = {}
    for fuente in cfg["feeds"]:
        try:
            if not F.permitido_por_robots(fuente["url"]):
                estado_fuentes[fuente["id"]] = "robots.txt no lo permite"
                continue
            datos = F.get(fuente["url"], timeout=40)
            try:
                cands = F.parsear_rss(datos, {"nombre": fuente["nombre"], "tipo": "noticia"})
            except Exception:  # noqa: BLE001  XML con prefijos sin declarar (p. ej. «media:»): se quitan y se reintenta
                limpio = re.sub(rb"<(/?)([A-Za-z0-9_]+):", rb"<\1\2_", datos)
                limpio = re.sub(rb'\s[A-Za-z0-9_]+:([A-Za-z0-9_]+)="', rb' \1="', limpio)
                cands = F.parsear_rss(limpio, {"nombre": fuente["nombre"], "tipo": "noticia"})
        except Exception as e:  # noqa: BLE001
            estado_fuentes[fuente["id"]] = f"error: {e}"[:120]
            continue
        n = 0
        for c in cands:
            clase, arma = clasificar_titular(c["titulo"])
            if not clase:
                continue
            lugar = ubicar(c["titulo"], estados, gaz, "mx")
            # En medios nacionales, una nota sin lugar en el título no se pinta en el centro del país.
            if not lugar or lugar[4] == "país":
                continue
            lon, lat, nombre, iso, precision = lugar
            props = {"title": c["titulo"][:220], "url": c["url"], "source": fuente["nombre"], "date": c["fecha_utc"], "lugar": nombre,
                     "pais_iso3": iso, "precision": precision, "origen": "mx", "via": f"RSS de {fuente['nombre']}"}
            if clase == "deslave":
                props.update({"name": c["titulo"][:220], "state": nombre, "kind": "DESLAVE"})
            else:
                props.update({"tipo": "Ataque" if clase == "ataque" else tipo_de(c["titulo"]), "severidad": severidad_de(c["titulo"]), "arma": arma})
            salida[clase].append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3)]}, "properties": props})
            n += 1
        estado_fuentes[fuente["id"]] = f"ok ({n} de {len(cands)})"
        time.sleep(1)
    return salida, estado_fuentes


def sigue_valido(f, clase):
    """Vuelve a pasar por las reglas actuales lo guardado en corridas anteriores, para que un falso positivo
    ya corregido (p. ej. «alud» dentro de «salud») no siga en el mapa hasta que caduque."""
    p = f["properties"]
    if p.get("origen") != "mx":
        return True
    if p.get("precision") == "país":
        return False
    return clasificar_titular(p.get("title") or "")[0] == clase


def guardar(ruta, nuevos, horas, fuente, extra=None, clase=None):
    """Une con lo anterior (sin repetir enlaces), conserva las últimas `horas` y escribe el GeoJSON."""
    previos = []
    if os.path.exists(ruta):
        previos = json.load(open(ruta, encoding="utf-8")).get("features", [])
    if clase:
        previos = [f for f in previos if sigue_valido(f, clase)]
    urls = {f["properties"]["url"] for f in nuevos}
    feats = nuevos + [f for f in previos if f["properties"]["url"] not in urls]
    limite = (datetime.now(timezone.utc) - timedelta(hours=horas)).strftime("%Y-%m-%dT%H:%M:%SZ")
    feats = [f for f in feats if (f["properties"].get("date") or "") >= limite]
    feats.sort(key=lambda f: f["properties"].get("date") or "", reverse=True)
    feats = deduplicar(feats)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": fuente,
               **(extra or {}), "features": feats}, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return feats


def main():
    if os.path.exists(OUT):
        gen = json.load(open(OUT, encoding="utf-8")).get("generado_utc")
        if gen and datetime.now(timezone.utc) - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(minutes=MIN_ENTRE_CORRIDAS):
            print("crimen: datos de hace menos de 1 h; se conservan")
            return 0
    estados = json.load(open(os.path.join(ROOT, "config", "mx_estados.json"), encoding="utf-8"))
    gaz = Gazetteer()
    crimen, ataques, deslaves, errores = [], [], [], []
    # 1) API de búsqueda de GDELT (suele limitar desde GitHub: una sola consulta de prueba).
    rp = urllib.robotparser.RobotFileParser("https://api.gdeltproject.org/robots.txt")
    try:
        rp.read()
    except Exception:  # noqa: BLE001
        rp.parse([])
    if rp.can_fetch("Geopolitica-monitor", API):
        for origen, q in CONSULTAS:
            url = API + "?" + urllib.parse.urlencode({"query": q, "mode": "artlist", "format": "json", "maxrecords": 150, "timespan": "24h", "sort": "datedesc"})
            try:
                for art in get_json(url).get("articles", []):
                    f = a_feature(art, origen, estados, gaz)
                    if f:
                        crimen.append(f)
            except Exception as e:  # noqa: BLE001
                errores.append(f"{origen}: {e}"[:160])
                if "429" in str(e):
                    errores.append("La API de búsqueda de GDELT limita las consultas desde este servidor; se usan sus archivos de eventos")
                    break
            time.sleep(PAUSA_S)
    # 2) Archivos de eventos de GDELT 2.0 (sin límite): crimen organizado y ataques con armas.
    try:
        c2, a2 = eventos_gdelt(gaz)
        crimen += c2
        ataques += a2
        print(f"crimen: {len(c2)} eventos criminales y {len(a2)} ataques en la última hora (GDELT)")
    except Exception as e:  # noqa: BLE001
        errores.append(f"eventos GDELT: {e}"[:160])
    # 3) Medios mexicanos por RSS (titulares): crimen, ataques y deslaves.
    fuentes_mx = {}
    try:
        rss, fuentes_mx = rss_mexico(estados, gaz)
        crimen += rss["crimen"]
        ataques += rss["ataque"]
        deslaves += rss["deslave"]
        print(f"crimen: RSS de México {fuentes_mx}")
    except Exception as e:  # noqa: BLE001
        errores.append(f"RSS México: {e}"[:160])
    fc = guardar(OUT, crimen, 24, "GDELT y medios mexicanos (señales de noticias, verificar)", {"errores": errores, "fuentes_mx": fuentes_mx}, clase="crimen")
    fa = guardar(os.path.join(os.path.dirname(OUT), "ataques.geojson"), ataques, 48, "GDELT 2.0 (códigos CAMEO de ataque) y medios mexicanos", clase="ataque")
    fd = guardar(os.path.join(os.path.dirname(OUT), "deslaves.geojson"), deslaves, 72, "Medios mexicanos (titulares, verificar)", clase="deslave")
    print(f"crimen: {len(fc)} señales ({sum(1 for f in fc if f['properties']['pais_iso3'] == 'MEX')} en México); ataques: {len(fa)}; deslaves: {len(fd)}; errores: {errores}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
