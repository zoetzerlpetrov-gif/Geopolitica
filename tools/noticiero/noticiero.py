#!/usr/bin/env python3
"""Noticiero DOMINUS: titulares de las últimas 72 h en 30 secciones (config/noticiero.json).

Dos vías por sección:
  1. GDELT GKG 2.1 (medios de todo el mundo cada 15 min; flujo en inglés y flujo traducido de 65 idiomas). Se reusan
     los archivos que tools/clima/tornados.py ya bajó en la misma corrida (caché CACHE_GKG). Una nota entra a una
     sección si su TÍTULO coincide con las palabras clave de la sección («palabras»); si la sección define
     «gkg_dominio», además el dominio del medio debe coincidir (p. ej. solo medios .mx para política de México).
  2. Feeds RSS elegidos para la sección, leídos solo si su robots.txt lo permite (ingest/fuentes.py). Un feed que
     aparece en una sola sección aporta todas sus notas; uno compartido por varias secciones reparte cada nota
     según las palabras clave.

Qué se guarda de cada nota: título, enlace, medio, tipo de medio, fecha y, si el medio la declara, su imagen para
compartir (enlazada desde su servidor). Nunca el texto del artículo.

Salida: vivos/noticiero.json  {generado_utc, secciones: [{id, titulo, nota, fuentes}], notas: [{t, u, m, tipo, f, img, s, via}], errores}
"""
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
sys.path.insert(0, os.path.join(ROOT, "tools", "clima"))
import fuentes as F  # noqa: E402
import tornados as T  # noqa: E402

CONF = os.path.join(ROOT, "config", "noticiero.json")
OUT = os.path.join(ROOT, "vivos", "noticiero.json")
HORAS = 72
MAX_SECCION = 40
MIN_TITULO = 25  # titulares más cortos suelen ser portadas o secciones, no notas


def reglas_de(cfg):
    """[(id, regex del título, regex del dominio o None)] en el orden de config/noticiero.json."""
    return [(s["id"], re.compile(s["palabras"], re.I), re.compile(s["gkg_dominio"], re.I) if s.get("gkg_dominio") else None)
            for s in cfg["secciones"]]


def secciones_de(titulo, dominio, reglas):
    return [sid for sid, rx, dom in reglas if rx.search(titulo) and (dom is None or dom.search(dominio or ""))]


def fecha_gkg(v):
    try:
        return datetime.strptime(v, "%Y%m%d%H%M%S").strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError):
        return ""


def nota_gkg(fila, reglas):
    """Una fila del GKG → nota con sus secciones, o None si no es de ninguna."""
    if len(fila) < 27:
        return None
    titulo = T.titulo_de(fila[26])
    if len(titulo) < MIN_TITULO or not fila[4].startswith("http"):
        return None
    secs = secciones_de(titulo, fila[3], reglas)
    if not secs:
        return None
    return {"t": titulo[:220], "u": fila[4], "m": fila[3], "tipo": "", "f": fecha_gkg(fila[1]), "img": T.imagen_de(fila), "s": secs, "via": "gdelt"}


def de_gkg(reglas, archivos=4):
    notas, errores = [], []
    for flujo, url in T.FLUJOS.items():
        try:
            for u in T.archivos_gkg(url, archivos):
                try:
                    notas += [n for n in (nota_gkg(f, reglas) for f in T.filas_gkg(u)) if n]
                except Exception as e:  # noqa: BLE001  un archivo faltante no detiene a los demás
                    errores.append(f"{u.rsplit('/', 1)[-1]}: {e}"[:120])
        except Exception as e:  # noqa: BLE001
            errores.append(f"GKG {flujo}: {e}"[:160])
    return notas, errores


def feeds_por_url(cfg):
    """{url: (feed, [ids de sección])}: un feed repetido en varias secciones se lee una sola vez."""
    por = {}
    for s in cfg["secciones"]:
        for fd in s.get("feeds", []):
            por.setdefault(fd["url"], (fd, []))[1].append(s["id"])
    return por


def notas_de_feed(items, secs, reglas):
    """Items de F.parsear_rss → notas. Con una sola sección entran todas; con varias, según las palabras clave."""
    rx = {sid: r for sid, r, _ in reglas}
    out = []
    for it in items:
        s = secs if len(secs) == 1 else [sid for sid in secs if rx[sid].search(it["titulo"])]
        if s:
            out.append({"t": it["titulo"][:220], "u": it["url"], "m": it["fuente"], "tipo": it["tipo_fuente"], "f": it["fecha_utc"],
                        "img": it.get("imagen", ""), "s": s, "via": "rss"})
    return out


def de_rss(cfg, reglas, leer=F.rss):
    notas, errores, ok = [], [], 0
    for url, (fd, secs) in feeds_por_url(cfg).items():
        try:
            notas += notas_de_feed(leer({**fd, "max_items": 40}), secs, reglas)
            ok += 1
        except Exception as e:  # noqa: BLE001  un medio caído no detiene a los demás
            errores.append(f"{fd['nombre']}: {e}"[:160])
    return notas, errores, ok


def clave_titulo(t):
    return T.norm(t).strip()[:90]


def unir(previos, nuevos, ahora, horas=HORAS, maximo=MAX_SECCION):
    """Une sin repetir enlaces ni titulares, conserva `horas` y deja como máximo `maximo` notas por sección (las más
    recientes). Una nota repetida suma las secciones de sus copias; la versión RSS gana a la de GDELT (trae el tipo de medio)."""
    limite = (ahora - timedelta(hours=horas)).strftime("%Y-%m-%dT%H:%M:%SZ")
    futuro = (ahora + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    por_url, por_titulo = {}, {}
    for n in sorted(nuevos + previos, key=lambda x: x["via"] != "rss"):
        if not n.get("f") or n["f"] < limite:
            continue
        n = {**n, "f": min(n["f"], futuro)}
        previa = por_url.get(n["u"]) or por_titulo.get(clave_titulo(n["t"]))
        if previa:
            previa["s"] = list(dict.fromkeys(previa["s"] + n["s"]))
            continue
        por_url[n["u"]] = por_titulo[clave_titulo(n["t"])] = n
    cuenta, out = {}, []
    for n in sorted(por_url.values(), key=lambda x: x["f"], reverse=True):
        n["s"] = [s for s in n["s"] if cuenta.get(s, 0) < maximo]
        if n["s"]:
            for s in n["s"]:
                cuenta[s] = cuenta.get(s, 0) + 1
            out.append(n)
    return out


def main(archivos=4):
    cfg = json.load(open(CONF, encoding="utf-8"))
    reglas = reglas_de(cfg)
    previos = []
    if os.path.exists(OUT):
        try:
            previos = json.load(open(OUT, encoding="utf-8")).get("notas", [])
        except ValueError:
            pass
    n_gkg, e_gkg = de_gkg(reglas, archivos)
    n_rss, e_rss, ok = de_rss(cfg, reglas)
    ahora = datetime.now(timezone.utc)
    notas = unir(previos, n_gkg + n_rss, ahora)
    secciones = [{"id": s["id"], "titulo": s["titulo"], "nota": s.get("nota", ""),
                  "fuentes": [{"nombre": f["nombre"], "tipo": f["tipo"]} for f in s.get("feeds", [])]} for s in cfg["secciones"]]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "horas": HORAS, "feeds_ok": ok, "errores": (e_gkg + e_rss)[:40],
               "secciones": secciones, "notas": notas}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    por = {}
    for n in notas:
        for s in n["s"]:
            por[s] = por.get(s, 0) + 1
    print(f"noticiero: {len(n_gkg)} notas de GDELT, {len(n_rss)} de {ok} feeds RSS; {len(notas)} en {HORAS} h; errores: {len(e_gkg) + len(e_rss)}")
    print("   " + " · ".join(f"{s['id']} {por.get(s['id'], 0)}" for s in cfg["secciones"]))
    for e in (e_gkg + e_rss)[:40]:
        print(f"   ✗ {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main(int(sys.argv[1]) if len(sys.argv) > 1 else 4))
