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
import io
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
                    r"tornade|trombe|смерч|торнадо|hortum|tornádo|trąba powietrzna|windhose|wasserhose|tromba", re.I)
NO_ES = re.compile(r"panavia|eurofighter|fighter jet|caza tornado|jet tornado|tornado gr4|tornado ids|cash tornado|tornado cash|"
                   r"tornado de (goles|críticas)|minnesota|kenny|cyclone weather", re.I)
SEVERO = re.compile(r"muert|dead|died|killed|morti|vittim|heridos|injur|feriti|destro|devast|dañ|damage|danni|evacu|"
                    r"\b(ef|f)[2-5]\b", re.I)
MARINA = re.compile(r"waterspout|tromb[ae] marin|trompa marina|manga de agua|wasserhose", re.I)


def titulo_de(extras):
    m = re.search(r"<PAGE_TITLE>(.*?)</PAGE_TITLE>", extras or "", re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else ""


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


def elegir_lugar(locs, pos_tema):
    """El lugar más específico y más cercano en el texto a la mención del tornado (las notas citan muchos lugares)."""
    if not locs:
        return None
    prioridad = {"3": 0, "4": 0, "2": 1, "5": 1, "1": 2}
    return min(locs, key=lambda l: (prioridad.get(l[0], 3), abs(l[5] - (pos_tema or 0)) if pos_tema is not None else 0))


def fila_a_feature(f, flujo):
    """Fila del GKG → feature o None."""
    if len(f) < 27 or not TEMA.search(f[8] or f[7] or ""):
        return None
    titulo = titulo_de(f[26])
    if not titulo or not TITULO.search(titulo) or NO_ES.search(titulo):
        return None
    lugar = elegir_lugar(lugares(f[10]), offset_tema(f[8]))
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


def main(archivos=4):
    previos = []
    if os.path.exists(OUT):
        previos = json.load(open(OUT, encoding="utf-8")).get("features", [])
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
    feats = unir(previos, nuevos, datetime.now(timezone.utc))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "fuente": "GDELT GKG 2.1 (noticias de todo el mundo; señales por verificar)", "errores": errores[:10], "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"tornados: {len(nuevos)} notas nuevas, {len(feats)} en {DIAS} días; errores: {len(errores)}")
    for f in feats[:15]:
        p = f["properties"]
        print(f"   {p['date']} {p['kind']} {p['state']} · {p['title'][:90]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(int(sys.argv[1]) if len(sys.argv) > 1 else 4))
