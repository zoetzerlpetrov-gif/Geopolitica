#!/usr/bin/env python3
"""Tornados y trombas marinas en el mundo, a partir de noticias (GDELT GKG 2.1).

Por qué así: no hay una fuente oficial abierta y mundial de tornados. El SPC de EUA (reportes) prohíbe a
programas en su robots.txt, la base europea ESWD exige registro y GDACS no los cubre. GDELT lee medios de
todo el mundo cada 15 min y etiqueta cada nota con temas (p. ej. NATURAL_DISASTER_TORNADO) y con los
lugares que menciona, con coordenadas. Se usan dos flujos: notas en inglés y notas traducidas de 65 idiomas
(así entra «tromba d'aria» de un diario italiano).

Archivos: http://data.gdeltproject.org/gdeltv2/lastupdate.txt y lastupdate-translation.txt → *.gkg.csv.zip.
Sin llave ni límite de consultas (son archivos estáticos). En cada corrida se leen los últimos 4 de cada flujo
(1 h) y se acumulan 7 días en vivos/tornados.geojson.

Qué se guarda: título de la nota, enlace, medio, fecha, lugar y coordenadas del lugar mencionado más cerca de la
palabra «tornado» en el texto. Nunca el texto del artículo. Son SEÑALES de noticias por verificar: una nota
puede recordar un tornado viejo o hablar de un pronóstico; por eso se exige que el TÍTULO lo mencione.
Columnas del GKG 2.1 (tabuladas): 1 fecha, 3 medio, 4 URL, 8 V2Themes, 10 V2Locations, 26 Extras (PAGE_TITLE).
"""
import csv
import html
import io
import math
import unicodedata
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "tornados.geojson")
FLUJOS = {"ingles": "http://data.gdeltproject.org/gdeltv2/lastupdate.txt",
          "traducido": "http://data.gdeltproject.org/gdeltv2/lastupdate-translation.txt"}
DIAS = 7
csv.field_size_limit(10_000_000)

TEMA = re.compile(r"NATURAL_DISASTER_(TORNADO|WATERSPOUT)")
# El título debe nombrar el fenómeno (en el idioma original del medio). «Tornado» también es un avión de combate
# (Panavia Tornado) y un nombre comercial; esos casos se descartan.
TITULO = re.compile(r"tornad|twister|waterspout|landspout|tromb[ae] d.?aria|tromb[ae] marin|trompa marina|manga de agua|"
                    r"tornade|смерч|торнадо|hortum|tornádo|trąba powietrzna|windhose|wasserhose", re.I)
NO_ES = re.compile(r"panavia|eurofighter|fighter jet|caza tornado|jet tornado|tornado gr4|tornado ids|cash tornado|tornado cash|"
                   r"tornado de (goles|críticas)|minnesota|kenny|cyclone weather", re.I)
SEVERO = re.compile(r"muert|dead|died|killed|morti|vittim|heridos|injur|feriti|destro|devast|dañ|damage|danni|evacu|"
                    r"\b(ef|f)[2-5]\b", re.I)
# Notas que no informan de un tornado ocurrido: pronósticos, riesgo, ayudas o aniversarios.
NO_OCURRIDO = re.compile(r"\b(could|may|possible|possibili|posibles?|threat|risk|rischio|riesgo|forecast|pron[oó]stic|previsioni|watch|season|"
                         r"stagione|temporada|alley|relief|fema|aid|aiuti|ayudas?|how|why|perch[eé]|replant|anniversary|anniversario|aniversario|"
                         r"years? (ago|after)|anni fa|turbulence|activity is shifting|se blinda|ahead of|prepares?|se prepara)\b", re.I)
MARINA = re.compile(r"waterspout|tromb[ae] marin|trompa marina|manga de agua|wasserhose", re.I)


def titulo_de(extras):
    m = re.search(r"<PAGE_TITLE>(.*?)</PAGE_TITLE>", extras or "", re.S)
    return html.unescape(re.sub(r"\s+", " ", m.group(1))).strip() if m else ""


def norm(t):
    t = unicodedata.normalize("NFD", t or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t)


def en_titulo(nombre, titulo_n):
    """¿El lugar aparece en el título? Admite gentilicios por raíz («Trapanese» → Trapani, «Sicilian» → Sicily)."""
    n = norm(nombre).strip()
    if len(n) < 4:
        return False
    if re.search(rf"\b{re.escape(n)}\b", titulo_n):
        return True
    raiz = n[:max(5, len(n) - 2)]
    return len(n) >= 6 and re.search(rf"\b{re.escape(raiz)}", titulo_n) is not None


def offset_tema(v2themes):
    """Posición (caracteres) de la primera mención del tema tornado en el texto, o None."""
    for t in (v2themes or "").split(";"):
        nombre, _, pos = t.partition(",")
        if TEMA.search(nombre) and pos.isdigit():
            return int(pos)
    return None


def lugares(v2loc):
    """V2Locations → [(tipo, nombre, pais_fips, lat, lon, pos)]. Tipos: 1 país, 2/5 estado, 3/4 ciudad."""
    out = []
    for parte in (v2loc or "").split(";"):
        c = parte.split("#")
        if len(c) < 9:
            continue
        try:
            out.append((c[0], c[1], c[2], float(c[5]), float(c[6]), int(c[8] or 0)))
        except ValueError:
            continue
    return out


def elegir_lugar(locs, pos_tema, titulo=""):
    """Primero un lugar nombrado en el título (la ciudad antes que la región); si no hay, el más específico y más
    cercano en el texto a la mención del tornado. Las notas citan muchos lugares (la sede del medio, otras
    noticias), y GDELT lee adjetivos como «German» o «Italian» como países: esos quedan al final."""
    if not locs:
        return None
    t = norm(titulo)
    prioridad = {"3": 0, "4": 0, "2": 1, "5": 1, "1": 2}
    en_t = [l for l in locs if en_titulo(l[1].split(",")[0], t)]
    if en_t:
        return min(en_t, key=lambda l: prioridad.get(l[0], 3))
    en_t = [l for l in locs if any(en_titulo(x, t) for x in l[1].split(",")[1:2])]  # región o estado nombrado en el título
    if en_t:
        return min(en_t, key=lambda l: prioridad.get(l[0], 3))
    return min(locs, key=lambda l: (prioridad.get(l[0], 3), abs(l[5] - (pos_tema or 0)) if pos_tema is not None else 0))


def fila_a_feature(f, flujo, nom=None):
    """Fila del GKG → feature o None."""
    if len(f) < 27 or not TEMA.search(f[8] or f[7] or ""):
        return None
    titulo = titulo_de(f[26])
    if not titulo or not TITULO.search(titulo) or NO_ES.search(titulo) or NO_OCURRIDO.search(titulo):
        return None
    # Ubicación: 1) un lugar de GDELT que el título nombra (coordenada precisa); 2) el nomenclátor propio sobre el
    # título. Si el título no nombra ningún lugar, la nota se descarta: GDELT suele citar la sede del medio u otras
    # noticias, y un punto falso confunde más que una nota de menos.
    # El nombre del medio suele ir al final tras « | » o « - » («… | FOX 4 Dallas-Fort Worth»): no es el lugar.
    cuerpo = re.split(r"\s[|–—-]\s(?=[^|–—-]*$)", titulo)[0] if re.search(r"\s[|–—-]\s", titulo) else titulo
    t = norm(cuerpo)
    # Solo ciudades y estados de GDELT: sus «países» incluyen adjetivos («Italian», «America»).
    locs = [l for l in lugares(f[10]) if l[0] != "1" and en_titulo(l[1].split(",")[0], t)]
    if locs:
        tipo, nombre, _, lat, lon, _ = elegir_lugar(locs, offset_tema(f[8]), cuerpo)
    else:
        u = (nom or nomenclator()).ubicar(cuerpo)
        if not u:
            return None
        nombre, lat, lon, prec = u
        tipo = {"ciudad": "4", "estado": "2", "país": "1"}[prec]
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    try:
        fecha = datetime.strptime(f[1], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return None
    url = f[4] if f[4].startswith("http") else ""
    if not url:
        return None
    precision = {"1": "país", "2": "estado", "5": "estado"}.get(tipo, "ciudad")
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3)]},
            "properties": {"title": titulo[:220], "url": url, "source": f[3], "date": fecha,
                           "kind": "TROMBA MARINA" if MARINA.search(titulo) else "TORNADO", "severe": bool(SEVERO.search(titulo)),
                           "state": nombre, "precision": precision,
                           "via": f"GDELT GKG ({'nota traducida al inglés por GDELT' if flujo == 'traducido' else 'nota en inglés'}); lugar mencionado en el texto"}}


def archivos_gkg(url_ultima, n):
    """URLs de los últimos `n` archivos GKG de un flujo (cada 15 min)."""
    linea = next(l for l in F.get(url_ultima).decode().splitlines() if ".gkg.csv.zip" in l)
    ultima = linea.split()[2]
    marca = re.search(r"(\d{14})\.(translation\.)?gkg", ultima).group(1)
    t = datetime.strptime(marca, "%Y%m%d%H%M%S")
    return [ultima.replace(marca, (t - timedelta(minutes=15 * k)).strftime("%Y%m%d%H%M%S")) for k in range(n)]


def leer_gkg(url, flujo):
    z = zipfile.ZipFile(io.BytesIO(F.get(url, timeout=180)))
    out = []
    with z.open(z.namelist()[0]) as fh:
        for fila in csv.reader(io.TextIOWrapper(fh, encoding="utf-8", errors="replace"), delimiter="\t", quoting=csv.QUOTE_NONE):
            ft = fila_a_feature(fila, flujo)
            if ft:
                out.append(ft)
    return out


def unir(previos, nuevos, ahora, dias=DIAS):
    """Une sin repetir enlaces y conserva los últimos `dias`. Titulares casi iguales (mismo título) cuentan una vez."""
    vistos, titulos, out = set(), set(), []
    limite = (ahora - timedelta(days=dias)).strftime("%Y-%m-%dT%H:%M:%SZ")
    for f in sorted(nuevos + previos, key=lambda x: x["properties"].get("date") or "", reverse=True):
        p = f["properties"]
        clave_t = re.sub(r"\W+", " ", p["title"].lower()).strip()
        if p["url"] in vistos or clave_t in titulos or (p.get("date") or "") < limite:
            continue
        vistos.add(p["url"])
        titulos.add(clave_t)
        out.append(f)
    return out


class Nomenclator:
    """Lugares nombrados en un título: ciudades (config/ciudades.json, Natural Earth), provincias y regiones
    (config/admin1.json) y países (config/gazetteer.json). Admite gentilicios por raíz en provincias, regiones y
    países («Trapanese» → Trapani, «Sicilian» → Sicilia). Solo cuenta si la palabra va con mayúscula en el título."""
    COMUNES = {"nice", "split", "mobile", "reading", "bath", "hope", "union", "orange", "marina", "isla", "grande", "salt", "mar",
               "most", "ede", "como", "bra", "aura", "dover", "tornado", "trento"}

    def __init__(self, ciudades=None, admin1=None, paises=None):
        cfg = lambda n: json.load(open(os.path.join(ROOT, "config", n), encoding="utf-8"))  # noqa: E731
        ciudades = ciudades if ciudades is not None else cfg("ciudades.json")["ciudades"]
        admin1 = admin1 if admin1 is not None else cfg("admin1.json")["lugares"]
        paises = paises if paises is not None else cfg("gazetteer.json")["paises"]
        self._por_palabra, self._por_raiz = {}, {}
        self.lugares = []  # (nombre_normalizado, rango, iso3, lat, lon, nombre, población, admite_raíz)
        for nom, nom_es, iso, lat, lon, _, pob in ciudades:
            for n in {nom, nom_es}:
                self._agregar(n, 0, iso, lat, lon, nom_es or nom, pob or 0, False)
        for ns, iso, lat, lon, tipo in admin1:
            for n in ns:
                self._agregar(n, 1 if tipo == "provincia" else 2, iso, lat, lon, ns[0], 0, True)
        for iso, p in paises.items():
            for n in (p.get("es"), p.get("en")):
                if n and p.get("lat") is not None:
                    self._agregar(n, 3, iso, p["lat"], p["lon"], p.get("es") or n, 0, True)

    def _agregar(self, n, rango, iso, lat, lon, nombre, pob, raiz):
        k = norm(n).strip()
        if len(k) >= 4 and k not in self.COMUNES:
            self.lugares.append((k, rango, iso, lat, lon, nombre, pob, raiz))
            # Índices: por primera palabra (nombre completo) y por las 5 primeras letras (gentilicio por raíz).
            self._por_palabra.setdefault(k.split()[0], []).append(len(self.lugares) - 1)
            if raiz and len(k) >= 6:
                self._por_raiz.setdefault(k[:5], []).append(len(self.lugares) - 1)

    def buscar(self, titulo):
        """[(rango, posición, iso3, lat, lon, nombre, población)] de los lugares del título."""
        plano = unicodedata.normalize("NFD", titulo).encode("ascii", "ignore").decode()
        t = norm(titulo)
        palabras = t.split()
        candidatos = set()
        for w in palabras:
            candidatos.update(self._por_palabra.get(w, ()))
            candidatos.update(self._por_raiz.get(w[:5], ()))
        out = []
        for i in candidatos:
            k, rango, iso, lat, lon, nombre, pob, raiz = self.lugares[i]
            m = re.search(rf"\b{re.escape(k)}\b", t)
            if not m and raiz and len(k) >= 6:
                m = re.search(rf"\b{re.escape(k[:max(5, len(k) - 2)])}", t)
            if not m:
                continue
            # La misma palabra en el título original debe empezar con mayúscula (nombre propio).
            mo = re.search(rf"(?i)\b{re.escape(k[:4])}", plano)
            if mo and not plano[mo.start()].isupper():
                continue
            out.append((rango, m.start(), iso, lat, lon, nombre, pob))
        return out

    def ubicar(self, titulo):
        """(nombre, lat, lon, precisión) o None. Gana la ciudad; si hay país o región en el título, la ciudad debe
        ser de ese país (hay muchas «Victoria» o «Córdoba»). Entre homónimas, la más poblada."""
        hall = self.buscar(titulo)
        if not hall:
            return None
        paises = {h[2] for h in hall if h[0] >= 1}
        # Un nombre que es a la vez estado y ciudad de otro país («Florida», EUA y Uruguay) se toma como el estado.
        admin = {(h[5].lower(), h[1]) for h in hall if h[0] in (1, 2)}
        ciudades = [h for h in hall if h[0] == 0 and (not paises or h[2] in paises) and (h[5].lower(), h[1]) not in admin]
        if ciudades:
            h = min(ciudades, key=lambda x: (x[1], -x[6]))
            return h[5], h[3], h[4], "ciudad"
        resto = [h for h in hall if h[0] > 0]
        # Entre homónimos del mismo rango gana el país con más coincidencias (nombres en varios idiomas, país citado).
        votos = {}
        for h in hall:
            votos[h[2]] = votos.get(h[2], 0) + 1
        h = min(resto, key=lambda x: (x[0], x[1], -votos[x[2]]))
        return h[5], h[3], h[4], "estado" if h[0] in (1, 2) else "país"


_NOM = None


def nomenclator():
    global _NOM
    if _NOM is None:
        _NOM = Nomenclator()
    return _NOM


def km(a, b):
    (lo1, la1), (lo2, la2) = a, b
    p = math.pi / 180
    h = math.sin((la2 - la1) * p / 2) ** 2 + math.cos(la1 * p) * math.cos(la2 * p) * math.sin((lo2 - lo1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


PRECISION = {"ciudad": 0, "estado": 1, "país": 2}


def agrupar(notas, radio_km=200, horas=36):
    """Un mismo tornado sale en decenas de notas: se agrupan las que caen a menos de `radio_km` y `horas` entre sí (200 km: una nota ubica «Sicilia» al centro de la isla y otra en Marsala).
    El punto del grupo es el lugar más repetido entre sus notas de mayor precisión; se guardan hasta 8 enlaces."""
    grupos = []
    for f in sorted(notas, key=lambda x: x["properties"]["date"]):
        c = f["geometry"]["coordinates"]
        t = datetime.strptime(f["properties"]["date"], "%Y-%m-%dT%H:%M:%SZ")
        for g in grupos:
            if abs((t - g["t"]).total_seconds()) <= horas * 3600 and any(km(c, x["geometry"]["coordinates"]) <= radio_km for x in g["notas"]):
                g["notas"].append(f)
                g["t"] = max(g["t"], t)
                break
        else:
            grupos.append({"t": t, "notas": [f]})
    out = []
    for g in grupos:
        ns = g["notas"]
        mejor = min(PRECISION.get(n["properties"]["precision"], 3) for n in ns)
        candidatos = [n for n in ns if PRECISION.get(n["properties"]["precision"], 3) == mejor]
        conteo = {}
        for n in candidatos:
            k = (n["properties"]["state"], tuple(n["geometry"]["coordinates"]))
            conteo[k] = conteo.get(k, 0) + 1
        (lugar, coord), _ = max(conteo.items(), key=lambda kv: kv[1])
        recientes = sorted(ns, key=lambda n: n["properties"]["date"], reverse=True)
        principal = next((n for n in recientes if n["properties"]["severe"]), recientes[0])["properties"]
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": list(coord)},
                    "properties": {**principal, "state": lugar, "severe": any(n["properties"]["severe"] for n in ns),
                                   "kind": "TORNADO" if any(n["properties"]["kind"] == "TORNADO" for n in ns) else "TROMBA MARINA",
                                   "notas": len(ns), "desde": ns[0]["properties"]["date"], "date": recientes[0]["properties"]["date"],
                                   "enlaces": [{k: n["properties"][k] for k in ("title", "url", "source", "date")} for n in recientes[:8]]}})
    return sorted(out, key=lambda f: f["properties"]["date"], reverse=True)


def main(archivos=4):
    previos = []
    if os.path.exists(OUT):
        previos = json.load(open(OUT, encoding="utf-8")).get("notas", [])
        archivos = archivos if previos else max(archivos, 48)  # primera corrida: 12 h hacia atrás
    nuevos, errores = [], []
    for flujo, url in FLUJOS.items():
        try:
            for u in archivos_gkg(url, archivos):
                try:
                    nuevos += leer_gkg(u, flujo)
                except Exception as e:  # noqa: BLE001  un archivo faltante no detiene a los demás
                    errores.append(f"{u.rsplit('/', 1)[-1]}: {e}"[:120])
        except Exception as e:  # noqa: BLE001
            errores.append(f"{flujo}: {e}"[:160])
    notas = unir(previos, nuevos, datetime.now(timezone.utc))
    feats = agrupar(notas)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # «features» = un punto por fenómeno (lo que dibuja el mapa); «notas» = cada nota, para la próxima corrida.
    json.dump({"type": "FeatureCollection", "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "fuente": "GDELT GKG 2.1 (noticias de todo el mundo; señales por verificar)", "errores": errores[:10], "features": feats, "notas": notas},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"tornados: {len(nuevos)} notas nuevas, {len(notas)} en {DIAS} días, {len(feats)} fenómenos; errores: {len(errores)}")
    for f in feats[:20]:
        p = f["properties"]
        print(f"   {p['date']} {p['kind']} {p['severe']} {p['state']} {f['geometry']['coordinates']} · {p['notas']} notas · {p['title'][:80]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(int(sys.argv[1]) if len(sys.argv) > 1 else 4))
