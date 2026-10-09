#!/usr/bin/env python3
"""Ciclones de todo el mundo: tifones (Pacífico occidental), ciclones (Índico, Pacífico sur), huracanes y
tormentas tropicales. Complementa la capa de Clima Táctico, que solo trae los del NHC (Atlántico y
Pacífico oriental).

Fuentes (sin llave):
  1. GDACS (ONU y Comisión Europea): lista de eventos de ciclón tropical (TC) con nivel de alerta y, para
     cada uno, su geometría (trayectoria, puntos y zonas de viento) del servicio de polígonos.
  2. IBTrACS ACTIVE (NOAA NCEI): trayectorias de los ciclones activos de todas las cuencas; se usa para
     los ciclones que GDACS no trajo o si GDACS no responde.
Salida: vivos/ciclones_mundo.geojson (cada 3 h como máximo; lo llama «Datos en movimiento»).
"""
import csv
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "ciclones_mundo.geojson")
GDACS_LISTA = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC&fromdate={desde}&todate={hasta}&alertlevel={nivel}"
GDACS_GEOM = "https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid={e}&episodeid={ep}"
IBTRACS = "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.ACTIVE.list.v04r01.csv"
CADA_H = 3
VIGENTE_DIAS = 3
CUENCAS = {"NA": "Atlántico norte", "EP": "Pacífico oriental", "WP": "Pacífico occidental", "NI": "Índico norte", "SI": "Índico sur",
           "SP": "Pacífico sur", "SA": "Atlántico sur", "MM": "varias cuencas"}


def get_json(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": F.UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def categoria_kt(kt):
    """Escala Saffir-Simpson (vientos sostenidos en nudos)."""
    kt = kt or 0
    return ("Categoría 5" if kt >= 137 else "Categoría 4" if kt >= 113 else "Categoría 3" if kt >= 96 else "Categoría 2" if kt >= 83
            else "Categoría 1 (huracán / tifón)" if kt >= 64 else "Tormenta tropical" if kt >= 34 else "Depresión tropical")


# ---------------------------------------------------------------- GDACS
def eventos_gdacs(lista, ahora):
    """Eventos TC vigentes (terminan hace menos de 3 días) de la respuesta de geteventlist."""
    out = []
    for f in lista.get("features", []):
        p = f.get("properties", {})
        if str(p.get("eventtype", "")).upper() != "TC":
            continue
        fin = p.get("todate") or p.get("fromdate") or ""
        try:
            t = datetime.fromisoformat(fin.replace("Z", "+00:00"))
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if ahora - t > timedelta(days=VIGENTE_DIAS):
            continue
        sev = p.get("severitydata") or {}
        kmh = sev.get("severity") if str(sev.get("severityunit", "")).lower().startswith("km") else None
        out.append({"eventid": p.get("eventid"), "episodeid": p.get("episodeid"), "nombre": p.get("eventname") or p.get("name") or "Ciclón",
                    "alerta": p.get("alertlevel", "Green"), "kmh": kmh, "texto": sev.get("severitytext", ""), "paises": p.get("country", ""),
                    "url": (p.get("url") or {}).get("report", "") if isinstance(p.get("url"), dict) else "", "fin": fin,
                    "geom": f.get("geometry")})
    return out


def features_gdacs(ev, geom):
    """Geometría de GDACS → features compatibles con la capa de ciclones (posición, trayectoria, zonas de viento)."""
    base = {"storm_name": ev["nombre"], "fuente": "GDACS", "alertlevel": ev["alerta"], "url": ev["url"], "paises": ev["paises"]}
    kt = round(ev["kmh"] / 1.852) if ev.get("kmh") else None
    out = []
    for f in (geom or {}).get("features", []):
        g = f.get("geometry") or {}
        t = g.get("type")
        if t in ("Polygon", "MultiPolygon"):
            out.append({"type": "Feature", "geometry": g, "properties": {**base, "layer": "storm_track", "kind": "wind_radii_forecast", "wind_kt": 34}})
        elif t in ("LineString", "MultiLineString"):
            out.append({"type": "Feature", "geometry": g, "properties": {**base, "layer": "storm_track", "kind": "forecast"}})
        elif t == "Point":
            out.append({"type": "Feature", "geometry": g, "properties": {**base, "layer": "storm_track", "kind": "forecast_point"}})
    if ev.get("geom") and ev["geom"].get("type") == "Point":
        out.append({"type": "Feature", "geometry": ev["geom"], "properties": {**base, "layer": "storm", "name": ev["nombre"], "intensity_kt": kt,
                    "class_label": categoria_kt(kt) if kt else ev.get("texto", ""), "last_update": ev["fin"], "basin": ev["paises"]}})
    return out


# ---------------------------------------------------------------- IBTrACS
def tormentas_ibtracs(texto, ahora):
    """CSV ACTIVE de IBTrACS → {sid: {nombre, cuenca, puntos:[(lon, lat, kt, iso_time)]}} de tormentas vigentes."""
    filas = list(csv.DictReader(io.StringIO(texto)))
    tormentas = {}
    for f in filas[1:]:  # la segunda fila son unidades
        try:
            lat, lon = float(f["LAT"]), float(f["LON"])
            t = datetime.strptime(f["ISO_TIME"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except (KeyError, ValueError):
            continue
        kt = None
        for col in ("USA_WIND", "WMO_WIND", "TOKYO_WIND", "CMA_WIND", "HKO_WIND", "NEWDELHI_WIND", "REUNION_WIND", "BOM_WIND", "NADI_WIND", "WELLINGTON_WIND"):
            v = (f.get(col) or "").strip()
            if v:
                try:
                    kt = int(float(v))
                    break
                except ValueError:
                    pass
        s = tormentas.setdefault(f["SID"], {"nombre": (f.get("NAME") or "SIN NOMBRE").title(), "cuenca": f.get("BASIN", ""), "puntos": []})
        s["puntos"].append((round(lon if lon <= 180 else lon - 360, 2), round(lat, 2), kt, t))
    return {k: v for k, v in tormentas.items() if v["puntos"] and ahora - max(p[3] for p in v["puntos"]) <= timedelta(days=VIGENTE_DIAS)}


def features_ibtracs(sid, s):
    pts = sorted(s["puntos"], key=lambda p: p[3])
    lon, lat, kt, t = pts[-1]
    base = {"storm_name": s["nombre"], "fuente": "IBTrACS (NOAA)", "basin": CUENCAS.get(s["cuenca"], s["cuenca"]), "storm_id": sid}
    linea = [[p[0], p[1]] for p in pts]
    for i in range(1, len(linea)):  # longitudes continuas (sin saltos de 360°)
        while linea[i][0] - linea[i - 1][0] > 180:
            linea[i][0] -= 360
        while linea[i][0] - linea[i - 1][0] < -180:
            linea[i][0] += 360
    out = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {**base, "layer": "storm", "name": s["nombre"], "intensity_kt": kt, "class_label": categoria_kt(kt) if kt else "",
                           "last_update": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "url": "https://www.ncei.noaa.gov/products/international-best-track-archive"}}]
    if len(linea) > 1:
        out.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": linea}, "properties": {**base, "layer": "storm_track", "kind": "past"}})
    return out


# GDACS pide en su robots.txt «Request-rate: 1/60» y «Visit-time: 0400-0645» (UTC). Se respeta: solo se le
# consulta en esa ventana y una sola vez por corrida (las corridas van cada 20 min). Primero las listas por
# nivel de alerta y después la geometría de cada ciclón; lo obtenido se guarda en vivos/gdacs_cache.json
# y se usa el resto del día.
CACHE = os.path.join(ROOT, "vivos", "gdacs_cache.json")
NIVELES = ("red", "orange", "green")
MAX_GEOM = 6


def en_ventana_gdacs(t):
    return (4, 0) <= (t.hour, t.minute) < (6, 45)


def siguiente_peticion(cache, hoy):
    """Qué pedir a GDACS en esta corrida: ("lista", nivel), ("geom", evento) o None si ya está todo."""
    if cache.get("fecha") != hoy:
        return ("lista", NIVELES[0])
    for n in NIVELES:
        if n not in cache.get("niveles", []):
            return ("lista", n)
    for ev in cache.get("eventos", [])[:MAX_GEOM]:
        if str(ev["eventid"]) not in cache.get("geom", {}):
            return ("geom", ev)
    return None


def paso_gdacs(cache, ahora, pedir_json):
    """Hace a lo más UNA petición a GDACS (si está en su ventana) y devuelve (cache, estado)."""
    hoy = ahora.strftime("%Y-%m-%d")
    if not en_ventana_gdacs(ahora):
        return cache, f"fuera de la ventana de GDACS (04:00–06:45 UTC); se usan los datos del {cache.get('fecha') or '—'}"
    sig = siguiente_peticion(cache, hoy)
    if cache.get("fecha") != hoy:
        cache = {"fecha": hoy, "niveles": [], "eventos": [], "geom": {}}
    if not sig:
        return cache, f"ok ({len(cache['eventos'])} ciclones, completo)"
    try:
        if sig[0] == "lista":
            url = GDACS_LISTA.format(desde=(ahora - timedelta(days=10)).strftime("%Y-%m-%d"), hasta=hoy, nivel=sig[1])
            try:
                nuevos = eventos_gdacs(pedir_json(url), ahora)
            except urllib.error.HTTPError as e:
                if e.code != 404:  # un nivel sin eventos puede responder 404
                    raise
                nuevos = []
            ids = {str(e["eventid"]) for e in cache["eventos"]}
            cache["eventos"] += [{k: v for k, v in e.items()} for e in nuevos if str(e["eventid"]) not in ids]
            cache["niveles"].append(sig[1])
        else:
            ev = sig[1]
            cache["geom"][str(ev["eventid"])] = pedir_json(GDACS_GEOM.format(e=ev["eventid"], ep=ev["episodeid"]))
        return cache, f"ok ({len(cache['eventos'])} ciclones; petición: {sig[0]} {sig[1] if sig[0] == 'lista' else sig[1]['nombre']})"
    except Exception as e:  # noqa: BLE001
        return cache, f"error: {e}"[:160]


def main():
    ahora = datetime.now(timezone.utc)
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    estado = {}
    if F.permitido_por_robots(GDACS_LISTA.format(desde="2026-01-01", hasta="2026-01-02", nivel="red")):
        cache, estado["gdacs"] = paso_gdacs(cache, ahora, get_json)
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    else:
        estado["gdacs"] = "robots.txt no lo permite"
    previo = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    gen = previo.get("generado_utc", "")
    reciente = gen and ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=CADA_H)
    feats, nombres = [], set()
    for ev in cache.get("eventos", []):
        if ahora - datetime.fromisoformat(ev["fin"].replace("Z", "+00:00")).replace(tzinfo=timezone.utc) > timedelta(days=VIGENTE_DIAS):
            continue
        feats += features_gdacs(ev, cache.get("geom", {}).get(str(ev["eventid"])))
        nombres.add(ev["nombre"].lower())
    # IBTrACS (NOAA): cada 3 h como máximo; si los datos son recientes se reusan sus ciclones.
    if reciente:
        feats += [f for f in previo.get("features", []) if f["properties"].get("fuente", "").startswith("IBTrACS")]
        estado["ibtracs"] = previo.get("fuentes", {}).get("ibtracs", "datos recientes")
    else:
        try:
            if not F.permitido_por_robots(IBTRACS):
                raise PermissionError("robots.txt no lo permite")
            tormentas = tormentas_ibtracs(F.get(IBTRACS, timeout=120).decode("utf-8", "replace"), ahora)
            nuevos = 0
            for sid, s_ in tormentas.items():
                if s_["nombre"].lower() in nombres:
                    continue  # GDACS ya lo trae (con pronóstico y zonas de viento)
                feats += features_ibtracs(sid, s_)
                nuevos += 1
            estado["ibtracs"] = f"ok ({len(tormentas)} activos, {nuevos} agregados)"
        except Exception as e:  # noqa: BLE001
            estado["ibtracs"] = f"error: {e}"[:160]
            feats += [f for f in previo.get("features", []) if f["properties"].get("fuente", "").startswith("IBTrACS")]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": (ahora if not reciente else datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ")).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "fuentes": estado, "features": feats}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"ciclones: {sum(1 for f in feats if f['properties'].get('layer') == 'storm')} ciclones; {estado}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
