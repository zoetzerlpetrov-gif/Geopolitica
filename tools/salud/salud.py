#!/usr/bin/env python3
"""Salud: brotes y enfermedades en el mundo, en dos niveles.

1. Oficial (vivos/salud_oficial.geojson), una vez al día:
   - OMS, Disease Outbreak News (API pública `who.int/api/news/diseaseoutbreaknews`): brotes notificados en 90 días.
   - CDC de EUA, avisos de salud para viajeros (RSS `wwwnc.cdc.gov/travel/rss/notices.xml`, nivel 1 a 4, con lista de
     países). Su robots.txt pide 20 s entre consultas; aquí se hace una sola al día.
   - ECDC, actualizaciones epidemiológicas (RSS de la Unión Europea), 60 días.
   Cada aviso se ubica en el país que nombra (centro del país; no es la zona exacta del brote).
2. Señales en noticias (vivos/salud_noticias.geojson), cada corrida: titulares de GDELT GKG 2.1 que hablan de un brote,
   aumento de casos o alerta (gripe, COVID, dengue, cólera, infecciones estomacales, sarampión, ébola, etc.) o de un
   incidente de bioseguridad en un laboratorio. Reusa los archivos GKG que ya bajaron los tornados. Son señales por
   verificar con la autoridad sanitaria. 14 días.
Se guarda título, enlace, fuente, fecha, enfermedad y lugar; nunca el texto de los artículos.
"""
import html
import json
import os
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "clima"))
import tornados as T  # noqa: E402

ROOT = T.ROOT
OUT_OFICIAL = os.path.join(ROOT, "vivos", "salud_oficial.geojson")
OUT_NOTICIAS = os.path.join(ROOT, "vivos", "salud_noticias.geojson")
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
URL_OMS = "https://www.who.int/api/news/diseaseoutbreaknews?sf_culture=en&$orderby=PublicationDateAndTime%20desc&$top=60&$select=Title,PublicationDateAndTime,UrlName"
URL_CDC = "https://wwwnc.cdc.gov/travel/rss/notices.xml"
URL_ECDC = "https://www.ecdc.europa.eu/en/taxonomy/term/1310/feed"
DIAS_OMS, DIAS_ECDC, DIAS_NOTICIAS = 90, 60, 14

# Enfermedad → (nombre, grupo, expresión). El orden importa: gana la primera que coincide.
ENFERMEDADES = [
    ("ebola", "Ébola", "grave", r"[eé]bola|bundibugyo"),
    ("marburgo", "Marburgo", "grave", r"marburg"),
    ("lassa", "Fiebre de Lassa", "grave", r"\blassa\b"),
    ("ccfh", "Fiebre hemorrágica de Crimea-Congo", "grave", r"crimea.congo|cchf"),
    ("nipah", "Nipah", "grave", r"\bnipah\b"),
    ("peste", "Peste", "grave", r"\bpeste (bub[oó]nica|neum[oó]nica)|\bplague\b|bubonic"),
    ("antrax", "Ántrax", "grave", r"[aá]ntrax|anthrax"),
    ("mpox", "Mpox", "grave", r"\bmpox|monkeypox|viruela (del mono|s[ií]mica)"),
    ("polio", "Poliomielitis", "grave", r"\bpolio"),
    ("mers", "MERS", "respiratoria", r"\bmers\b|middle east respiratory"),
    ("aviar", "Gripe aviar (H5N1 y otras)", "respiratoria", r"gripe aviar|influenza aviar|bird flu|avian (flu|influenza)|\bh5n1|\bh5n\d|\bh7n9|\bh9n2"),
    ("covid", "COVID-19", "respiratoria", r"covid|coronavirus|sars-cov"),
    ("gripe", "Gripe / influenza", "respiratoria", r"\bgripe\b|influenza|\bflu\b"),
    ("neumonia", "Neumonía", "respiratoria", r"neumon[ií]a|pneumonia"),
    ("vsr", "Virus sincitial respiratorio", "respiratoria", r"\brsv\b|sincitial|syncytial"),
    ("tosferina", "Tos ferina", "respiratoria", r"tos ferina|whooping cough|pertussis"),
    ("tuberculosis", "Tuberculosis", "respiratoria", r"tuberculos"),
    ("sarampion", "Sarampión", "prevenible", r"sarampi[oó]n|measles"),
    ("difteria", "Difteria", "prevenible", r"difteria|diphtheria"),
    ("meningitis", "Meningitis", "prevenible", r"meningit|meningococ"),
    ("colera", "Cólera", "gastro", r"c[oó]lera\b|cholera"),
    ("gastro", "Infección estomacal / intoxicación", "gastro", r"gastroenterit|diarrea|diarrh|norovirus|rotavirus|intoxicaci[oó]n alimentaria|food poisoning|"
     r"salmonel|e\. ?coli|shigel|listeri|botulism|hepatitis a\b|fiebre tifoidea|typhoid"),
    ("dengue", "Dengue", "vectores", r"dengue"),
    ("chikungunya", "Chikungunya", "vectores", r"chikungu"),
    ("zika", "Zika", "vectores", r"\bzika"),
    ("oropouche", "Oropouche", "vectores", r"oropouche"),
    ("malaria", "Malaria / paludismo", "vectores", r"malaria|paludismo"),
    ("fiebre_amarilla", "Fiebre amarilla", "vectores", r"fiebre amarilla|yellow fever"),
    ("nilo", "Virus del Nilo Occidental", "vectores", r"nilo occidental|west nile"),
    ("rabia", "Rabia", "otra", r"\brabia\b|\brabies\b"),
    ("legionella", "Legionela", "otra", r"legionel"),
    ("rickettsia", "Fiebre manchada (rickettsiosis)", "otra", r"fiebre manchada|spotted fever|rickettsi"),
    ("hepatitis", "Hepatitis", "otra", r"hepatitis"),
    ("indeterminada", "Enfermedad de causa no determinada", "grave", r"undetermined etiology|unknown (disease|illness)|enfermedad (desconocida|misteriosa)|mystery (illness|disease)"),
]
_ENF = [(i, n, g, re.compile(x, re.I)) for i, n, g, x in ENFERMEDADES]
LABORATORIO = re.compile(r"(fuga|filtraci[oó]n|escape|leak|accident|incident|accidente|incidente)\w* (de |en |at |in )?(un |a |the |el )?(laboratorio|lab\b|laboratory)|"
                         r"lab[- ]leak|laboratory[- ](leak|accident|incident|acquired)|bioseguridad|biosafety (breach|incident|lapse)|biosecurity breach", re.I)
CONTEXTO = re.compile(r"brote|outbreak|positiv|epidemi|pandemi|casos|cases|contagi|infect|muert|deaths?\b|died|dead\b|hospitaliz|alerta|alert|emergenc|"
                      r"aumento|surge|spike|rise in|rising|record|r[eé]cord|cluster|confirm|detect|spread|propaga|vigilancia|warning|aviso", re.I)
NO_ES = re.compile(r"vaccine (stock|maker|shares)|acciones de|stock price|\bnfl\b|\bnba\b|football|f[uú]tbol|pel[ií]cula|\bfilm\b|serie de tv|"
                   r"videojuego|video game|flu season tips|computer virus|virus inform[aá]tico|malware|ransomware", re.I)
GRAVE = re.compile(r"muert|deaths?\b|died|dead\b|fallec|emergenc|record|r[eé]cord|cientos|hundreds|miles|thousands|epidemia|epidemic|pandemi", re.I)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def get(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout) as r:
        return r.read()


def enfermedad_de(texto):
    for i, n, g, rx in _ENF:
        if rx.search(texto or ""):
            return i, n, g
    return None


# ---------------------------------------------------------------- nivel oficial

ALIAS_PAIS = {"russia": "RUS", "south korea": "KOR", "korea": "KOR", "north korea": "PRK", "laos": "LAO", "turkey": "TUR", "turkiye": "TUR",
              "iran": "IRN", "syria": "SYR", "ivory coast": "CIV", "cote divoire": "CIV", "usa": "USA", "united states": "USA",
              "tanzania": "TZA", "drc": "COD", "dr congo": "COD", "uk": "GBR", "great britain": "GBR", "czechia": "CZE", "viet nam": "VNM",
              "kingdom of saudi arabia": "SAU", "bolivia plurinational state of": "BOL", "venezuela bolivarian republic of": "VEN",
              "republic of korea": "KOR", "taiwan": "TWN", "palestine": "PSE", "occupied palestinian territory": "PSE", "cabo verde": "CPV",
              "eswatini": "SWZ", "burma": "MMR", "the gambia": "GMB", "east timor": "TLS", "macedonia": "MKD", "moldova": "MDA"}


def _n(t):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z ]", " ", T.norm(t))).strip()


class Paises:
    """Nombre de país (español, inglés o alias) → (nombre en español, lat, lon, "país", iso3), con los centros del gazetteer."""

    def __init__(self, gazetteer=None):
        g = gazetteer if gazetteer is not None else json.load(open(os.path.join(ROOT, "config", "gazetteer.json"), encoding="utf-8"))["paises"]
        self.datos = {k: v for k, v in g.items() if v.get("lat") is not None}
        self.nombres = {}
        for iso3, p in self.datos.items():
            for n in (p.get("es"), p.get("en")):
                if n:
                    self.nombres[_n(n)] = iso3
        for a, iso3 in ALIAS_PAIS.items():
            if iso3 in self.datos:
                self.nombres[_n(a)] = iso3
        self._largos = sorted(self.nombres, key=len, reverse=True)

    def de(self, iso3):
        p = self.datos[iso3]
        return p.get("es") or p.get("en"), p["lat"], p["lon"], "país", iso3

    def ubicar(self, texto):
        t = _n(re.sub(r"^\s*(the|la|el)\s+", "", texto or "", flags=re.I))
        if not t:
            return None
        if t in self.nombres:
            return self.de(self.nombres[t])
        for n in self._largos:  # el nombre más largo que aparezca como palabra completa
            if len(n) >= 4 and re.search(rf"\b{re.escape(n)}\b", t):
                return self.de(self.nombres[n])
        return None


_PAISES = None
PAISES_GRANDES = {"RUS", "USA", "CAN", "CHN", "BRA", "AUS", "IND", "ARG", "KAZ", "IDN", "DZA", "COD", "SAU", "MEX"}


def PAISES():  # noqa: N802  (una sola instancia por corrida)
    global _PAISES
    _PAISES = _PAISES or Paises()
    return _PAISES


def punto(lon, lat, props):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3)]}, "properties": props}


def oms(datos, nom, ahora):
    """Disease Outbreak News: «Enfermedad - País» → un punto por país."""
    feats, limite = [], iso(ahora - timedelta(days=DIAS_OMS))
    for d in datos.get("value", []):
        fecha = (d.get("PublicationDateAndTime") or "")[:19] + "Z"
        titulo = " ".join((d.get("Title") or "").split())
        if fecha < limite or " - " not in titulo:
            continue
        enf_txt, lugar = titulo.rsplit(" - ", 1)
        enf = enfermedad_de(enf_txt) or ("otra", enf_txt, "otra")
        u = nom.ubicar(lugar)
        if not u:
            continue
        nombre, lat, lon, _, iso3 = u
        feats.append(punto(lon, lat, {"kind": "oficial", "fuente": "OMS · Disease Outbreak News", "title": titulo, "enfermedad": enf[1], "enf_id": enf[0], "grupo": enf[2],
                                      "lugar": nombre, "pais_iso3": iso3, "date": fecha, "nivel": 3 if enf[2] == "grave" else 2,
                                      "url": f"https://www.who.int/emergencies/disease-outbreak-news/item/{d.get('UrlName')}"}))
    return feats


def items_rss(xml_bytes):
    raiz = ET.fromstring(xml_bytes)
    for it in raiz.iter("item"):
        yield {k: (it.findtext(k) or "").strip() for k in ("title", "link", "description", "pubDate")}


def fecha_rss(t):
    try:
        return iso(parsedate_to_datetime(t).astimezone(timezone.utc))
    except (TypeError, ValueError):
        return ""


def cdc(xml_bytes, nom, ahora, max_paises=40):
    """Avisos de viaje de los CDC: «Level N - Lugar Enfermedad» y, si es global, su «Country List»."""
    feats = []
    for it in items_rss(xml_bytes):
        m = re.match(r"Level (\d)\s*-\s*(.+)", it["title"])
        if not m:
            continue
        nivel, resto = int(m.group(1)), m.group(2)
        enf = enfermedad_de(resto) or ("otra", resto, "otra")
        texto = html.unescape(re.sub(r"<[^>]+>", " ", it["description"]))
        lista = re.search(r"Country List\s*:\s*(.+?)(?:Country List|$)", texto, re.S)
        paises = [p.strip() for p in lista.group(1).split(",")] if lista else []
        if not paises:
            paises = [resto]  # «Mexico Dengue»: el nomenclátor encuentra el país dentro del texto
        vistos = set()
        for p in paises[:max_paises]:
            u = nom.ubicar(p)
            if not u or u[4] in vistos:
                continue
            vistos.add(u[4])
            nombre, lat, lon, _, iso3 = u
            feats.append(punto(lon, lat, {"kind": "oficial", "fuente": "CDC · Avisos de salud para viajeros", "title": it["title"], "enfermedad": enf[1], "enf_id": enf[0],
                                          "grupo": enf[2], "lugar": nombre, "pais_iso3": iso3, "date": fecha_rss(it["pubDate"]) or iso(ahora), "nivel": min(4, nivel + 1),
                                          "nivel_cdc": nivel, "url": it["link"] or "https://wwwnc.cdc.gov/travel/notices"}))
    return feats


def ecdc(xml_bytes, nom, ahora):
    feats, limite = [], iso(ahora - timedelta(days=DIAS_ECDC))
    for it in items_rss(xml_bytes):
        fecha = fecha_rss(it["pubDate"])
        if not fecha or fecha < limite:
            continue
        enf = enfermedad_de(it["title"]) or ("otra", it["title"], "otra")
        u = nom.ubicar(it["title"])
        if not u:
            continue  # avisos europeos sin país en el título (p. ej. «Weekly threats report»)
        nombre, lat, lon, _, iso3 = u
        feats.append(punto(lon, lat, {"kind": "oficial", "fuente": "ECDC · Actualización epidemiológica", "title": it["title"], "enfermedad": enf[1], "enf_id": enf[0],
                                      "grupo": enf[2], "lugar": nombre, "pais_iso3": iso3, "date": fecha, "nivel": 3 if enf[2] == "grave" else 2, "url": it["link"]}))
    return feats


# ---------------------------------------------------------------- señales en noticias (GDELT)

def tipo_de_titulo(titulo):
    """(id, nombre, grupo) si el titular habla de un brote o incidente; si no, None."""
    if not titulo or NO_ES.search(titulo):
        return None
    if LABORATORIO.search(titulo):
        return "laboratorio", "Incidente de bioseguridad en laboratorio", "laboratorio"
    e = enfermedad_de(titulo)
    return e if e and CONTEXTO.search(titulo) else None


def fila_a_feature(f, flujo, nom=None):
    if len(f) < 27:
        return None
    titulo = T.titulo_de(f[26])
    e = tipo_de_titulo(titulo) if titulo else None
    if not e:
        return None
    # Lo que va después del primer « - » o « | » suele ser el nombre del medio («… - Grenada Chronicle»).
    partes = re.split(r"\s[|–—-]\s", titulo)
    cuerpo = partes[0] if len(partes) > 1 and len(partes[0]) >= 25 else titulo
    t = T.norm(cuerpo)
    locs = [l for l in T.lugares(f[10]) if l[0] != "1" and T.en_titulo(l[1].split(",")[0], t)]
    iso3 = ""
    if locs:
        tipo, nombre, _, lat, lon, _ = T.elegir_lugar(locs, None, cuerpo)
    else:
        u = (nom or T.nomenclator()).ubicar(cuerpo)
        if not u:
            return None
        nombre, lat, lon, prec, iso3 = u
        tipo = {"ciudad": "4", "estado": "2", "país": "1"}[prec]
    # Si el titular nombra un país y el lugar elegido queda lejos de él («Costa Rica» → «Coast»), gana el país.
    pais = PAISES().ubicar(cuerpo)
    if pais and T.km([lon, lat], [pais[2], pais[1]]) > (4000 if pais[4] in PAISES_GRANDES else 1800):
        nombre, lat, lon, _, iso3 = pais
        tipo = "1"
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    try:
        fecha = iso(datetime.strptime(f[1], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc))
    except ValueError:
        return None
    url = f[4] if f[4].startswith("http") else ""
    if not url:
        return None
    return punto(lon, lat, {"title": titulo[:220], "url": url, "source": f[3], "date": fecha, "kind": e[0], "enfermedad": e[1], "grupo": e[2],
                            "severe": bool(GRAVE.search(titulo)) or e[2] in ("grave", "laboratorio"), "state": nombre,
                            "precision": {"1": "país", "2": "estado", "5": "estado"}.get(tipo, "ciudad"), "pais_iso3": iso3,
                            "via": f"GDELT GKG ({'nota traducida al inglés por GDELT' if flujo == 'traducido' else 'nota en inglés'}); lugar nombrado en el titular"})


def tipo_grupo(ns):
    """Enfermedad del grupo: la más repetida entre sus notas."""
    conteo = {}
    for n in ns:
        conteo[n["properties"]["kind"]] = conteo.get(n["properties"]["kind"], 0) + 1
    return max(conteo, key=conteo.get)


def noticias(archivos):
    previos, relleno = [], False
    if os.path.exists(OUT_NOTICIAS):
        d = json.load(open(OUT_NOTICIAS, encoding="utf-8"))
        previos, relleno = d.get("notas", []), d.get("relleno_12h", False)
    if not relleno:
        archivos = max(archivos, 48)
    nuevos, errores, nom = [], [], T.nomenclator()
    for flujo, url in T.FLUJOS.items():
        try:
            for u in T.archivos_gkg(url, archivos):
                try:
                    nuevos += [ft for ft in (fila_a_feature(fila, flujo, nom) for fila in T.filas_gkg(u)) if ft]
                except Exception as e:  # noqa: BLE001
                    errores.append(f"{u.rsplit('/', 1)[-1]}: {e}"[:120])
        except Exception as e:  # noqa: BLE001
            errores.append(f"{flujo}: {e}"[:160])
    notas = T.unir(previos, nuevos, datetime.now(timezone.utc), DIAS_NOTICIAS)
    # Se agrupa por enfermedad: el dengue y la gripe de un mismo país son señales distintas.
    feats = []
    for k in sorted({n["properties"]["kind"] for n in notas}):
        grupo = T.agrupar([n for n in notas if n["properties"]["kind"] == k], radio_km=300, horas=96, tipo_de=tipo_grupo)
        for g in grupo:
            nota = next(n for n in notas if n["properties"]["url"] == g["properties"]["enlaces"][0]["url"])
            g["properties"].update({"enfermedad": nota["properties"]["enfermedad"], "grupo": nota["properties"]["grupo"]})
        feats += grupo
    feats.sort(key=lambda f: f["properties"]["date"], reverse=True)
    json.dump({"type": "FeatureCollection", "generado_utc": iso(datetime.now(timezone.utc)), "relleno_12h": True,
               "fuente": "GDELT GKG 2.1 (titulares de noticias; señales por verificar)", "errores": errores[:10], "features": feats, "notas": notas},
              open(OUT_NOTICIAS, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return f"salud noticias: {len(nuevos)} notas nuevas, {len(notas)} en {DIAS_NOTICIAS} días, {len(feats)} focos; errores: {len(errores)}"


def viejo(ruta, horas, ahora):
    try:
        gen = json.load(open(ruta, encoding="utf-8")).get("generado_utc", "")
        return ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) >= timedelta(hours=horas)
    except (OSError, ValueError):
        return True


def oficial(ahora):
    if not viejo(OUT_OFICIAL, 24, ahora):
        return "salud oficial: datos recientes"
    nom, feats, notas = Paises(), [], []
    for nombre, fn in (("OMS", lambda: oms(json.loads(get(URL_OMS)), nom, ahora)), ("CDC", lambda: cdc(get(URL_CDC), nom, ahora)),
                       ("ECDC", lambda: ecdc(get(URL_ECDC), nom, ahora))):
        try:
            f = fn()
            feats += f
            notas.append(f"{nombre}: {len(f)}")
        except Exception as e:  # noqa: BLE001
            notas.append(f"{nombre}: error {e}"[:120])
        time.sleep(2)
    if not feats:
        return f"salud oficial: sin datos ({'; '.join(notas)}); se conserva el anterior"
    json.dump({"type": "FeatureCollection", "generado_utc": iso(ahora), "fuente": "OMS, CDC y ECDC", "detalle": notas,
               "features": sorted(feats, key=lambda f: f["properties"]["date"], reverse=True)},
              open(OUT_OFICIAL, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return f"salud oficial: {'; '.join(notas)}"


def main(archivos=4):
    ahora = datetime.now(timezone.utc)
    os.makedirs(os.path.join(ROOT, "vivos"), exist_ok=True)
    for paso in (lambda: oficial(ahora), lambda: noticias(archivos)):
        try:
            print(paso())
        except Exception as e:  # noqa: BLE001
            print(f"salud: error {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main(int(sys.argv[1]) if len(sys.argv) > 1 else 4))
