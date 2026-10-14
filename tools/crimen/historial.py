"""Historial de 90 días de las señales de crimen organizado, narcotráfico, mafias, terrorismo y grupos armados.

vivos/crimen.geojson solo guarda 72 h. Para ver 7, 15, 30, 60 o 90 días sin un archivo enorme, aquí se cuenta por
celda de 0.5° (~55 km) y por día cuántas notas hubo de cada tipo, y se guardan los últimos titulares de cada celda
(título, medio, fecha y enlace; nunca el texto). Un día se recalcula mientras está entero dentro de la ventana de
72 h (hasta 48 h después de terminar); después queda fijo. Así nada se cuenta dos veces.

Salida: vivos/crimen_90d.geojson = {"base": "AAAA-MM-DD", "tipos": [...], "features": [punto por celda con
"d": [[día desde base, índice de tipo, notas], …] y "notas": [[título, url, medio, fecha, tipo], …]]}.
"""
import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

DIAS = 90
CELDA = 0.5
NOTAS_POR_CELDA = 6
TIPOS = ["Narcotráfico", "Crimen organizado", "Mafia", "Terrorismo", "Grupo armado", "Grupo rebelde", "Insurgencia", "Separatistas"]


def celda(lon, lat):
    return f"{round(lat / CELDA) * CELDA:.1f},{round(lon / CELDA) * CELDA:.1f}"


def _dia(iso):
    return str(iso or "")[:10]


def leer(ruta):
    try:
        return json.load(open(ruta, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def actualizar(previo, feats, ahora=None):
    """previo: el historial anterior (o {}); feats: features de crimen.geojson (72 h). Devuelve el historial nuevo."""
    ahora = ahora or datetime.now(timezone.utc)
    hoy = ahora.date()
    base = hoy - timedelta(days=DIAS - 1)
    abiertos = {(ahora - timedelta(hours=48)).date() + timedelta(days=i) for i in range(4)}  # días que se recalculan
    # 1) Conteos anteriores ya cerrados: {(celda, día ISO, tipo): n}; metadatos por celda.
    conteos, meta, notas = Counter(), {}, defaultdict(list)
    base_prev = previo.get("base")
    tipos_prev = previo.get("tipos") or TIPOS
    for f in previo.get("features", []):
        p = f["properties"]
        c = p["c"]
        meta[c] = {"coords": f["geometry"]["coordinates"], "lugar": p.get("lugar", ""), "pais": p.get("pais", "")}
        notas[c] = [n for n in p.get("notas", []) if _dia(n[3]) >= base.isoformat()]
        if not base_prev:
            continue
        b0 = datetime.strptime(base_prev, "%Y-%m-%d").date()
        for i, t, n in p.get("d", []):
            dia = b0 + timedelta(days=i)
            if dia >= base and dia not in abiertos and t < len(tipos_prev):
                conteos[(c, dia.isoformat(), tipos_prev[t])] += n
    # 2) Días abiertos: se cuentan desde las 72 h actuales.
    for f in feats:
        p = f["properties"]
        dia = _dia(p.get("date"))
        if not dia or p.get("tipo") not in TIPOS:
            continue
        lon, lat = f["geometry"]["coordinates"][:2]
        c = celda(lon, lat)
        meta.setdefault(c, {"coords": [round(lon, 3), round(lat, 3)], "lugar": p.get("lugar", ""), "pais": p.get("pais_iso3", "")})
        if datetime.strptime(dia, "%Y-%m-%d").date() in abiertos or not base_prev:  # primera corrida: todo lo que haya
            conteos[(c, dia, p["tipo"])] += 1
        if p.get("url") and all(n[1] != p["url"] for n in notas[c]):
            notas[c].append([str(p.get("title") or "")[:160], p["url"], p.get("source") or "", p.get("date") or "", p["tipo"]])
    # 3) Salida por celda.
    por_celda = defaultdict(list)
    for (c, dia, tipo), n in conteos.items():
        i = (datetime.strptime(dia, "%Y-%m-%d").date() - base).days
        if 0 <= i < DIAS and n:
            por_celda[c].append([i, TIPOS.index(tipo), n])
    out = []
    for c, d in por_celda.items():
        m = meta[c]
        ns = sorted(notas[c], key=lambda n: n[3], reverse=True)[:NOTAS_POR_CELDA]
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": m["coords"]},
                    "properties": {"c": c, "lugar": m["lugar"], "pais": m["pais"], "d": sorted(d), "notas": ns}})
    out.sort(key=lambda f: f["properties"]["c"])
    return {"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "base": base.isoformat(), "dias": DIAS,
            "tipos": TIPOS, "celda_grados": CELDA,
            "nota": "Conteo diario de señales de noticias por celda de ~55 km (GDELT y medios mexicanos); no son incidentes confirmados.",
            "features": out}


def guardar(ruta, previo, feats, ahora=None):
    h = actualizar(previo, feats, ahora)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    json.dump(h, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return h
