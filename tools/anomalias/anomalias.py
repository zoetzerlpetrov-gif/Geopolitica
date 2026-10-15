#!/usr/bin/env python3
"""Fenómenos anómalos: avistamientos, objetos extraños, luces recurrentes y lugares con fama de «propensos».

Nada de esto afirma que un fenómeno sea real ni extraterrestre: son REPORTES, con su nivel de respaldo.

Fuentes:
- TrackAlien (repositorio público de la misma cuenta, github.com/zoetzerlpetrov-gif/trackalien), que se actualiza
  2 veces al día: noticias y blogs recientes (Google News, The Black Vault, Inexplicata…) y casos históricos.
  Aquí se filtra: de las notas generales solo pasan las que hablan del tema en el título; se guardan título, fuente,
  fecha y enlace, nunca el texto de la nota. TrackAlien desplaza al azar las coordenadas de las noticias (de 1° a 8°,
  y a veces las pone en cualquier punto del mundo), así que aquí se vuelven a ubicar con el lugar que nombra el título
  (ciudad o estado; si no, el centro del país, marcado como aproximado). Sin lugar reconocible, la nota no se dibuja.
- NUFORC (National UFO Reporting Center), versión geocodificada de github.com/planetsig/ufo-reports (≈ 80 mil
  reportes civiles, 1910–2014). Solo se publican CONTEOS por celda de 1°, sin el texto de los testigos.
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
# Archivo acumulado de notas (sin agrupar): TrackAlien solo publica las recientes; lo que deja de publicar se conserva aquí.
ARCHIVO = os.path.join(ROOT, "vivos", "anomalias_archivo.json")
MAX_ARCHIVO = 20000
CATALOGO = os.path.join(ROOT, "config", "anomalias.json")
TA = "https://raw.githubusercontent.com/zoetzerlpetrov-gif/trackalien/main/data/"
NUFORC = "https://raw.githubusercontent.com/planetsig/ufo-reports/master/csv-data/ufo-scrubbed-geocoded-time-standardized.csv"
CADA_H = 6
NUFORC_CADA_DIAS = 30  # el archivo no cambia desde 2014: basta con recalcular una vez al mes
DIAS_RECIENTES = 365

# Categorías de TrackAlien → nombre en español.
TIPOS_TA = {"ufo": "Objeto aéreo no identificado", "uso": "Objeto sumergido o marítimo", "contact": "Supuesto contacto o seres",
            "lights_sky": "Luces en el cielo", "lights_ground": "Luces a ras de suelo", "sound": "Sonidos inexplicados",
            "em": "Efectos electromagnéticos", "volcano": "Objetos sobre volcanes", "crop": "Figuras en cultivos"}
# Feeds dedicados al tema: sus entradas pasan sin filtro de palabras.
FEEDS_TEMA = {"The Black Vault", "Inexplicata (es)", "Latest UFO Sightings", "Open Minds UFO News", "UFO Evidence RSS",
              "Planeta UFO (es)", "Espacio Misterio (es)", "Mystery Wire", "UFO Chronicles"}
# Palabras del tema (sin acentos, minúsculas). Una nota general debe traer alguna en el título.
TEMA = re.compile(r"\b(ovnis?|ufos?|uaps?|alienigenas?|extraterrestres?|platillos? voladores?|flying saucers?|"
                  r"(?:objetos?|fenomenos?) (?:voladores? |aereos? |anomalos? )*no identificad[oa]s?|unidentified (?:flying|aerial|anomalous)|"
                  r"fenomenos? anomalos?|anomalous phenomen|orbes?|orbs?|esferas? (?:metalicas?|misteriosas?|de buga)|crop circles?|"
                  r"agroglifos?|abduccion(?:es)?|abducted|humanoides?|nave (?:extraterrestre|nodriza)|luz extrana|luces extranas|"
                  r"luces misteriosas|strange lights?|mysterious lights?|cilindro volador|objeto volador|alien (?:encounter|life|contact|"
                  r"spacecraft|craft|bodies|technology)|non-human|no humanos?|aaro)\b", re.I)
NIVEL_TA = (("OFICIAL", "oficial"), ("HISTÓRICO / VERIFICADO", "oficial"), ("MUY ALTA", "medios"), ("ALTA", "medios"),
            ("MEDIA-ALTA", "medios"), ("NUFORC", "civil"))


def sin_acentos(t):
    return "".join(c for c in unicodedata.normalize("NFD", str(t or "")) if unicodedata.category(c) != "Mn").lower()


# Tipo de TrackAlien deducido del título cuando la nota llega como «ufo» genérico (orden: lo más específico primero).
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
    """Tipo de TrackAlien de una nota: el de origen si es específico; si es «ufo» o falta, se deduce del título."""
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


def _fuentes_ta(props):
    partes = [x.strip() for x in str(props.get("sources") or "").split("|") if x.strip()]
    url = next((x for x in partes if re.match(r"^https?://", x)), "")
    nombres = [x for x in partes if not re.match(r"^https?://", x) and x != "GDELT Global Knowledge Graph"]
    return nombres, url


# Lugares que la prensa nombra y no están como ciudad en el catálogo: (texto sin acentos, lon, lat, nombre, ISO3).
LUGARES_EXTRA = [("popocatepetl", -98.622, 19.023, "Popocatépetl", "MEX"), ("popo", -98.622, 19.023, "Popocatépetl", "MEX"),
                 ("cerro de la silla", -100.23, 25.63, "Cerro de la Silla, Monterrey", "MEX"), ("cdmx", -99.13, 19.43, "Ciudad de México", "MEX"),
                 ("playa miramar", -97.85, 22.29, "Playa Miramar, Ciudad Madero", "MEX"), ("polanco", -99.19, 19.43, "Polanco, CDMX", "MEX"),
                 ("area 51", -115.81, 37.23, "Área 51", "USA"), ("roswell", -104.52, 33.39, "Roswell", "USA")]
ISO2_TA = {"US": "USA", "MX": "MEX", "BR": "BRA", "AR": "ARG", "CL": "CHL", "CO": "COL", "PE": "PER", "ES": "ESP", "GB": "GBR", "UK": "GBR",
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
        iso = self.gaz.pais_en_texto(titulo) or ISO2_TA.get(str(pais_ta).strip())
        if iso:
            lon, lat = self.gaz.centroide(iso)
            if lon is not None:
                return lon, lat, self.gaz.paises[iso]["es"], "país"
        return None


def nivel_ta(cred):
    c = str(cred or "").upper()
    for clave, nivel in NIVEL_TA:
        if clave in c:
            return nivel
    return "medios"


def de_trackalien(fc, recientes, hoy, ubicador=None):
    """Features de TrackAlien → nuestro formato. `recientes`: True para el archivo de eventos recientes (se re-ubican)."""
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
        nombres, url = _fuentes_ta(p)
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
            capa, nivel = "anom_historicos", nivel_ta(cred)
            lugar, precision = "", "sitio"
        tipo = tipo_por_texto(titulo, p.get("type")) if recientes else (p.get("type") or "ufo")
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]}, "properties": {
            "id": f"ta:{p.get('id')}", "capa": capa, "tipo": tipo, "tipo_nombre": TIPOS_TA.get(tipo, "Otro"),
            "titulo": titulo[:160], "fecha": p.get("date") or "", "nivel": nivel, "credibilidad": cred[:80],
            "pais": p.get("country") or "", "lugar": lugar, "precision": precision, "fuente": ", ".join(nombres[:3]) or "TrackAlien",
            # Casos históricos curados en TrackAlien: su resumen es propio del repositorio (no copia de una nota).
            "resumen": "" if recientes else str(p.get("description") or "")[:400],
            "url": url or "https://github.com/zoetzerlpetrov-gif/trackalien"}})
    return out


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
    """Archivo de notas; la primera vez se siembra con las notas individuales de la corrida anterior."""
    try:
        return json.load(open(ARCHIVO, encoding="utf-8"))["features"]
    except (OSError, ValueError, KeyError):
        return [f for f in (previo or {}).get("features", []) if str(f["properties"].get("id", "")).startswith("ta:")
                and f["properties"].get("capa") in ("anom_recientes", "anom_archivo")]


def guardar_archivo(feats, ahora):
    os.makedirs(os.path.dirname(ARCHIVO), exist_ok=True)
    json.dump({"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "nota": "Notas de TrackAlien acumuladas (título, medio, fecha y enlace; sin texto).",
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
    for nombre, recientes in (("events_recent.geojson", True), ("events_historical.geojson", False)):
        capa = "anom_recientes" if recientes else "anom_historicos"
        if recientes:
            # Notas: se suman al archivo acumulado (lo que TrackAlien deja de publicar no se pierde).
            archivo = leer_archivo(previo)
            try:
                nuevos = de_trackalien(json.loads(F.get(TA + nombre, timeout=60)), True, ahora)
                estado[capa] = f"ok ({len(nuevos)} notas en TrackAlien)"
            except Exception as e:  # noqa: BLE001  se sigue con el archivo
                nuevos = []
                estado[capa] = f"error: {e}"
            archivo = unir_archivo(archivo, nuevos, ahora)
            guardar_archivo(archivo, ahora)
            estado["anom_archivo"] = f"{len(archivo)} notas guardadas ({sum(1 for f in archivo if f['properties']['capa'] == 'anom_archivo')} de hace más de un año)"
            feats += agrupar_por_pais(archivo)
            continue
        try:
            nuevos = de_trackalien(json.loads(F.get(TA + nombre, timeout=60)), recientes, ahora)
            feats += nuevos
            estado[capa] = f"ok ({len(nuevos)})"
        except Exception as e:  # noqa: BLE001  se conserva lo anterior de esta fuente
            feats += _previas(previo, {capa})
            estado[capa] = f"error: {e}"
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
