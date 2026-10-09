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
                         r"years? (ago|after)|anni fa|turbulence)\b", re.I)
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


def fila_a_feature(f, flujo):
    """Fila del GKG → feature o None."""
    if len(f) < 27 or not TEMA.search(f[8] or f[7] or ""):
        return None
    titulo = titulo_de(f[26])
    if not titulo or not TITULO.search(titulo) or NO_ES.search(titulo) or NO_OCURRIDO.search(titulo):
        return None
    lugar = elegir_lugar(lugares(f[10]), offset_tema(f[8]), titulo)
    if not lugar or not (-90 <= lugar[3] <= 90 and -180 <= lugar[4] <= 180):
        return None
    tipo, nombre, _, lat, lon, _ = lugar
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
