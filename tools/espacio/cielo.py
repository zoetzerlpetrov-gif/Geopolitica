#!/usr/bin/env python3
"""Cielo: asteroides que pasan cerca de la Tierra, bólidos, cometas visibles, lluvias de estrellas, fases de la Luna y eclipses.

Fuentes (todas públicas; se guarda solo lo necesario para el mapa y la ficha, con enlace a la fuente):
- NASA/JPL SBDB Close-Approach Data API (`ssd-api.jpl.nasa.gov/cad.api`): acercamientos de asteroides y cometas a
  menos de 0.05 UA (≈ 19.5 distancias lunares) en los próximos 30 días.
- NASA/JPL Horizons API (`ssd.jpl.nasa.gov/api/horizons.api`): posición del objeto respecto a la Tierra hora por
  hora (vectores en el marco ecuatorial ICRF) para dibujar su trayectoria y el punto de la Tierra que lo tiene en
  el cenit en el momento de máximo acercamiento. Una consulta por objeto (máx. 20) y por cometa (máx. 12), 1 s entre consultas.
- NASA/JPL Fireball Data API: bólidos (meteoros brillantes) detectados por sensores del gobierno de EUA, con lugar,
  altura, velocidad y energía, últimos 365 días.
- COBS (Comet Observation Database, Observatorio de Črni Vrh, Eslovenia; `cobs.si/api/comet_list.api`): magnitud
  estimada actual de los cometas; se toman los de magnitud 12 o más brillantes (visibles con binoculares o telescopio
  pequeño; 6 o menos = a simple vista en cielo oscuro).
- USNO Astronomical Applications API: fases de la Luna y eclipses solares del año.
- Lluvias de estrellas: lista de trabajo de la Organización Internacional de Meteoros (IMO), valores típicos (fecha
  del máximo ±1 día según el año; la tasa ZHR es la de un cielo ideal con el radiante en el cenit).
Ritmo: asteroides y cometas cada 12 h; bólidos, Luna y eclipses cada 24 h. Si una parte falla, se conserva su archivo.
Salidas: vivos/neo.geojson, vivos/cielo.geojson, vivos/bolidos.geojson, vivos/cielo_calendario.json.
"""
import json
import math
import os
import sys
import time
import urllib.parse
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

V = os.path.join(ROOT, "vivos")
OUT_NEO, OUT_CIELO = os.path.join(V, "neo.geojson"), os.path.join(V, "cielo.geojson")
OUT_BOLIDOS, OUT_CAL = os.path.join(V, "bolidos.geojson"), os.path.join(V, "cielo_calendario.json")
CAD = "https://ssd-api.jpl.nasa.gov/cad.api"
FIREBALL = "https://ssd-api.jpl.nasa.gov/fireball.api"
HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"
COBS = "https://cobs.si/api/comet_list.api"
USNO = "https://aa.usno.navy.mil/api"
UA_KM = 149597870.7
LD_KM = 384400.0
MAX_NEO, MAX_COMETAS = 20, 12

# Lluvias de estrellas principales (IMO): código, nombre, inicio, máximo, fin (mes, día), ZHR, radiante AR/Dec (°), velocidad (km/s), cuerpo padre.
LLUVIAS = [
    ("QUA", "Cuadrántidas", (12, 28), (1, 3), (1, 12), 80, 230, 49, 41, "asteroide 2003 EH1"),
    ("LYR", "Líridas", (4, 14), (4, 22), (4, 30), 18, 271, 34, 49, "cometa C/1861 G1 (Thatcher)"),
    ("ETA", "Eta Acuáridas", (4, 19), (5, 6), (5, 28), 50, 338, -1, 66, "cometa 1P/Halley"),
    ("SDA", "Delta Acuáridas del Sur", (7, 12), (7, 31), (8, 23), 25, 340, -16, 41, "cometa 96P/Machholz (probable)"),
    ("CAP", "Alfa Capricórnidas", (7, 3), (7, 31), (8, 15), 5, 307, -10, 23, "cometa 169P/NEAT"),
    ("PER", "Perseidas", (7, 17), (8, 12), (8, 24), 100, 48, 58, 59, "cometa 109P/Swift-Tuttle"),
    ("DRA", "Dracónidas", (10, 6), (10, 8), (10, 10), 10, 262, 54, 20, "cometa 21P/Giacobini-Zinner"),
    ("STA", "Táuridas del Sur", (9, 10), (10, 10), (11, 20), 5, 32, 9, 27, "cometa 2P/Encke"),
    ("ORI", "Oriónidas", (10, 2), (10, 21), (11, 7), 20, 95, 16, 66, "cometa 1P/Halley"),
    ("NTA", "Táuridas del Norte", (10, 20), (11, 12), (12, 10), 5, 58, 22, 29, "cometa 2P/Encke"),
    ("LEO", "Leónidas", (11, 6), (11, 17), (11, 30), 15, 152, 22, 71, "cometa 55P/Tempel-Tuttle"),
    ("GEM", "Gemínidas", (12, 4), (12, 14), (12, 20), 150, 112, 33, 35, "asteroide 3200 Faetón"),
    ("URS", "Úrsidas", (12, 17), (12, 22), (12, 26), 10, 217, 76, 33, "cometa 8P/Tuttle"),
]
FASES = {"New Moon": "Luna nueva", "First Quarter": "Cuarto creciente", "Full Moon": "Luna llena", "Last Quarter": "Cuarto menguante"}
SINODICO = 29.530588853
LUNA_NUEVA_REF = datetime(2000, 1, 6, 18, 14, tzinfo=timezone.utc)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def viejo(ruta, horas, ahora):
    try:
        gen = json.load(open(ruta, encoding="utf-8")).get("generado_utc", "")
        return ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) >= timedelta(hours=horas)
    except (OSError, ValueError):
        return True


def guardar(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    json.dump(datos, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


def get_json(url, timeout=60):
    if not F.permitido_por_robots(url):
        raise PermissionError(f"robots.txt no permite {url}")
    return json.loads(F.get(url, timeout=timeout))


# ---------- astronomía básica ----------

def jd(dt):
    return dt.timestamp() / 86400 + 2440587.5


def gmst_grados(dt):
    """Tiempo sidéreo medio de Greenwich (aprox. IAU 1982, error < 1 s para estos fines)."""
    return (280.46061837 + 360.98564736629 * (jd(dt) - 2451545.0)) % 360


def lon180(x):
    return (x + 180) % 360 - 180


def punto_subyacente(x, y, z, dt):
    """Vector geocéntrico ecuatorial (km) → punto de la Tierra que tiene el objeto en el cenit (lon, lat)."""
    r = math.sqrt(x * x + y * y + z * z)
    ra, dec = math.degrees(math.atan2(y, x)), math.degrees(math.asin(z / r))
    return [round(lon180(ra - gmst_grados(dt)), 2), round(dec, 2)]


def iluminacion_luna(dt):
    """Fracción iluminada aproximada (0 a 1) a partir de la edad de la Luna; suficiente para «¿estorba la Luna?»."""
    edad = ((dt - LUNA_NUEVA_REF).total_seconds() / 86400) % SINODICO
    return round((1 - math.cos(2 * math.pi * edad / SINODICO)) / 2, 2)


def banda_visible(dec, alt_min=20):
    """Latitudes desde donde un objeto con esa declinación sube al menos `alt_min` grados sobre el horizonte."""
    return round(max(-90, dec - (90 - alt_min)), 1), round(min(90, dec + (90 - alt_min)), 1)


def poligono_banda(s, n):
    return {"type": "Polygon", "coordinates": [[[-180, s], [180, s], [180, n], [-180, n], [-180, s]]]}


def diametro_m(h):
    """Rango de diámetro (m) desde la magnitud absoluta H con albedo de 0.25 (claro) a 0.05 (oscuro)."""
    d = lambda p: 1329 / math.sqrt(p) * 10 ** (-h / 5) * 1000
    return round(d(0.25)), round(d(0.05))


# ---------- Horizons ----------

def horizons(params):
    base = {"format": "json", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES", "CENTER": "'500@399'", "CSV_FORMAT": "YES"}
    url = f"{HORIZONS}?{urllib.parse.urlencode({**base, **params})}"
    res = get_json(url, timeout=60).get("result", "")
    if "$$SOE" not in res:
        lineas = [l.strip() for l in res.splitlines() if l.strip() and not set(l.strip()) <= set("*")]
        raise ValueError((lineas[-1] if lineas else "sin efemérides")[:160])
    cab = res.split("$$SOE")[0].strip().splitlines()
    cols = [c.strip() for c in (cab[-2] if cab[-1].startswith("*") else cab[-1]).split(",")]
    filas = [[c.strip() for c in l.split(",")] for l in res.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines() if l.strip()]
    return cols, filas


def comando(des, cometa=False):
    return f"'DES={des};{'CAP;NOFRAG;' if cometa else ''}'"


def fecha_horizons(s):
    s = s.replace("A.D. ", "").strip()
    for fmt in ("%Y-%b-%d %H:%M:%S.%f", "%Y-%b-%d %H:%M:%S", "%Y-%b-%d %H:%M"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    raise ValueError(f"fecha de Horizons no reconocida: {s}")


def trayectoria(des, ca):
    """Vectores geocéntricos ±2 días alrededor del máximo acercamiento → puntos proyectados en el plano de la órbita
    relativa (en distancias lunares, Tierra en el origen) y punto subyacente en el máximo acercamiento."""
    cols, filas = horizons({"COMMAND": comando(des), "EPHEM_TYPE": "VECTORS", "REF_PLANE": "FRAME", "VEC_TABLE": "1", "OUT_UNITS": "KM-S",
                            "START_TIME": f"'{(ca - timedelta(days=2)):%Y-%m-%d %H:%M}'", "STOP_TIME": f"'{(ca + timedelta(days=2)):%Y-%m-%d %H:%M}'",
                            "STEP_SIZE": "'2h'"})
    ix, iy, iz, it = cols.index("X"), cols.index("Y"), cols.index("Z"), cols.index("Calendar Date (TDB)")
    pts = [(fecha_horizons(f[it]), float(f[ix]), float(f[iy]), float(f[iz])) for f in filas]
    k = min(range(len(pts)), key=lambda i: pts[i][1] ** 2 + pts[i][2] ** 2 + pts[i][3] ** 2)
    _, x0, y0, z0 = pts[k]
    r0 = math.sqrt(x0 * x0 + y0 * y0 + z0 * z0)
    u = (x0 / r0, y0 / r0, z0 / r0)
    a, b = pts[max(0, k - 1)], pts[min(len(pts) - 1, k + 1)]
    v = (b[1] - a[1], b[2] - a[2], b[3] - a[3])
    vu = sum(v[i] * u[i] for i in range(3))
    w = tuple(v[i] - vu * u[i] for i in range(3))
    nw = math.sqrt(sum(c * c for c in w)) or 1
    w = tuple(c / nw for c in w)
    plano = [[round(sum(p[1 + i] * u[i] for i in range(3)) / LD_KM, 3), round(sum(p[1 + i] * w[i] for i in range(3)) / LD_KM, 3)] for p in pts]
    return {"plano": plano, "subpunto": punto_subyacente(x0, y0, z0, pts[k][0])}


def neos(ahora):
    q = {"date-min": ahora.strftime("%Y-%m-%d"), "date-max": (ahora + timedelta(days=30)).strftime("%Y-%m-%d"), "dist-max": "0.05",
         "fullname": "true", "diameter": "true", "sort": "dist"}
    d = get_json(f"{CAD}?{urllib.parse.urlencode(q)}")
    campos = d.get("fields", [])
    filas = [dict(zip(campos, f)) for f in d.get("data", [])][:MAX_NEO]
    feats, errores = [], []
    for r in filas:
        ca = datetime.strptime(r["cd"], "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)
        dist_ld = float(r["dist"]) * UA_KM / LD_KM
        h = float(r["h"]) if r.get("h") else None
        props = {"des": r["des"], "nombre": (r.get("fullname") or r["des"]).strip(), "fecha_utc": iso(ca), "dist_ld": round(dist_ld, 2),
                 "dist_km": round(float(r["dist"]) * UA_KM), "vel_kms": round(float(r["v_rel"]), 1), "h": h,
                 "diametro_m": [round(float(r["diameter"]) * 1000)] * 2 if r.get("diameter") else (list(diametro_m(h)) if h is not None else None),
                 "incertidumbre": r.get("t_sigma_f", ""), "url": f"https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr={urllib.parse.quote(r['des'])}"}
        try:
            t = trayectoria(r["des"], ca)
            props["trayectoria_ld"] = t["plano"]
            coords = t["subpunto"]
        except Exception as e:  # noqa: BLE001  sin trayectoria: se ubica en el meridiano 0 a la latitud 0 y se avisa
            errores.append(f"{r['des']}: {e}"[:140])
            coords, props["sin_ubicacion"] = [0, 0], True
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": coords}, "properties": props})
        time.sleep(1)
    return feats, errores


# ---------- cometas ----------

def cometas(ahora):
    lista = get_json(COBS, timeout=90).get("objects", [])
    cand = []
    for c in lista:
        try:
            mag = float(c.get("current_mag"))
        except (TypeError, ValueError):
            continue
        if mag <= 12 and c.get("is_active") and c.get("type") in ("C", "P", "D", "I"):
            cand.append((mag, c))
    cand.sort(key=lambda x: x[0])
    feats, errores = [], []
    for mag, c in cand[:MAX_COMETAS]:
        des = c["name"]
        try:
            cols, filas = horizons({"COMMAND": comando(des, True), "EPHEM_TYPE": "OBSERVER", "QUANTITIES": "'1,23'", "ANG_FORMAT": "DEG",
                                    "START_TIME": f"'{ahora:%Y-%m-%d}'", "STOP_TIME": f"'{ahora + timedelta(days=1):%Y-%m-%d}'", "STEP_SIZE": "'1d'"})
            f0 = filas[0]
            ira = next(i for i, n in enumerate(cols) if n.startswith("R.A."))
            idec = next(i for i, n in enumerate(cols) if n.startswith("DEC"))
            ielo = next((i for i, n in enumerate(cols) if n.startswith("S-O-T")), None)
            ra, dec = float(f0[ira]), float(f0[idec])
            elong = float(f0[ielo]) if ielo is not None else None
        except Exception as e:  # noqa: BLE001
            errores.append(f"{des}: {e}"[:140])
            time.sleep(1)
            continue
        s, n = banda_visible(dec)
        props = {"kind": "cometa", "nombre": c.get("fullname") or des, "codigo": des, "magnitud": mag, "ar": round(ra, 2), "dec": round(dec, 2),
                 "elongacion": round(elong) if elong is not None else None, "lat_desde": round(s), "lat_hasta": round(n),
                 "perihelio": c.get("perihelion_date", ""), "mag_pico": c.get("peak_mag"), "fecha_pico": c.get("peak_mag_date", ""),
                 "simple_vista": mag <= 6, "cerca_del_sol": elong is not None and elong < 30, "opacidad": 0.05,
                 "url": f"https://cobs.si/comet/{c.get('id')}/" if c.get("id") else "https://cobs.si"}
        feats.append({"type": "Feature", "geometry": poligono_banda(s, n), "properties": props})
        time.sleep(1)
    return feats, errores


# ---------- lluvias de estrellas ----------

def fecha_lluvia(md, anio):
    return datetime(anio, md[0], md[1], tzinfo=timezone.utc)


def lluvias(ahora, dias=30):
    """Lluvias activas hoy o con máximo en los próximos `dias` días."""
    out = []
    for cod, nombre, ini, pico, fin, zhr, ra, dec, vel, padre in LLUVIAS:
        for anio in (ahora.year - 1, ahora.year, ahora.year + 1):
            p = fecha_lluvia(pico, anio)
            i = fecha_lluvia(ini, anio - (1 if ini[0] > pico[0] else 0))
            f = fecha_lluvia(fin, anio + (1 if fin[0] < pico[0] else 0)) + timedelta(days=1)
            activa = i <= ahora < f
            proxima = timedelta(0) <= p - ahora <= timedelta(days=dias)
            if activa or proxima:
                s, n = banda_visible(dec)
                out.append({"type": "Feature", "geometry": poligono_banda(s, n), "properties": {
                    "kind": "lluvia", "codigo": cod, "nombre": nombre, "inicio": i.strftime("%Y-%m-%d"), "maximo": p.strftime("%Y-%m-%d"),
                    "fin": (f - timedelta(days=1)).strftime("%Y-%m-%d"), "zhr": zhr, "ar": ra, "dec": dec, "vel_kms": vel, "padre": padre,
                    "activa": activa, "luna_en_maximo": iluminacion_luna(p + timedelta(hours=6)), "lat_desde": round(s), "lat_hasta": round(n),
                    "opacidad": 0.05, "url": "https://www.imo.net/resources/calendar/"}})
                break
    return out


def etiquetas(feats):
    """Un punto de etiqueta por banda (centro en latitud; las longitudes solo separan las etiquetas)."""
    out = []
    for i, f in enumerate(feats):
        p = f["properties"]
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [-150 + (i * 47) % 300, round((p["lat_desde"] + p["lat_hasta"]) / 2)]},
                    "properties": {**p, "opacidad": None, "etiqueta": True}})
    for o in out:
        o["properties"].pop("opacidad")
    return out


# ---------- bólidos ----------

def bolidos(ahora):
    q = {"date-min": (ahora - timedelta(days=365)).strftime("%Y-%m-%d"), "req-loc": "true"}
    d = get_json(f"{FIREBALL}?{urllib.parse.urlencode(q)}")
    campos = d.get("fields", [])
    feats = []
    for f in d.get("data", []):
        r = dict(zip(campos, f))
        try:
            lat = float(r["lat"]) * (1 if r["lat-dir"] == "N" else -1)
            lon = float(r["lon"]) * (1 if r["lon-dir"] == "E" else -1)
        except (TypeError, ValueError, KeyError):
            continue
        num = lambda k: float(r[k]) if r.get(k) not in (None, "") else None
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": {
            "fecha_utc": r["date"].replace(" ", "T") + "Z", "energia_kt": num("impact-e"), "energia_radiada_j10": num("energy"),
            "altura_km": num("alt"), "vel_kms": num("vel"), "url": "https://cneos.jpl.nasa.gov/fireballs/"}})
    return feats


# ---------- calendario ----------

def calendario(ahora):
    fases = get_json(f"{USNO}/moon/phases/date?date={ahora:%Y-%m-%d}&nump=8").get("phasedata", [])
    eclipses = []
    for anio in (ahora.year, ahora.year + 1):
        for e in get_json(f"{USNO}/eclipses/solar/year?year={anio}").get("eclipses_in_year", []):
            d = date(e["year"], e["month"], e["day"])
            if d >= ahora.date():
                tipo = next((t for k, t in (("Total", "total"), ("Annular", "anular"), ("Hybrid", "híbrido"), ("Partial", "parcial")) if k in e["event"]), "")
                eclipses.append({"fecha": d.isoformat(), "tipo": tipo, "nombre": f"Eclipse solar {tipo} del {d.day}/{d.month}/{d.year}",
                                 "url": "https://science.nasa.gov/eclipses/future-eclipses/"})
        time.sleep(1)
    return {"generado_utc": iso(ahora), "fuente": "USNO Astronomical Applications API", "luna_hoy": iluminacion_luna(ahora),
            "fases": [{"fecha_utc": f"{p['year']}-{p['month']:02d}-{p['day']:02d}T{p['time']}:00Z", "fase": FASES.get(p["phase"], p["phase"])} for p in fases],
            "eclipses_solares": eclipses[:4]}


def main():
    ahora = datetime.now(timezone.utc)
    if viejo(OUT_NEO, 12, ahora):
        try:
            feats, err = neos(ahora)
            if feats or not os.path.exists(OUT_NEO):
                guardar(OUT_NEO, {"type": "FeatureCollection", "generado_utc": iso(ahora), "fuente": "NASA/JPL CNEOS (Close-Approach Data) y Horizons",
                                  "errores": err[:10], "features": feats})
            print(f"neo: {len(feats)} acercamientos a menos de 0.05 UA en 30 días; sin trayectoria: {len(err)} {err[:3]}")
        except Exception as e:  # noqa: BLE001
            print(f"neo: error {e}")
    if viejo(OUT_CIELO, 12, ahora):
        try:
            ll = lluvias(ahora)
            try:
                co, err = cometas(ahora)
            except Exception as e:  # noqa: BLE001  sin cometas se publican las lluvias
                co, err = [], [f"COBS: {e}"[:140]]
            feats = ll + co
            guardar(OUT_CIELO, {"type": "FeatureCollection", "generado_utc": iso(ahora), "fuente": "IMO (lluvias), COBS y NASA/JPL Horizons (cometas)",
                                "errores": err[:10], "features": feats + etiquetas(feats)})
            print(f"cielo: {len(ll)} lluvias ({', '.join(f['properties']['nombre'] for f in ll)}), {len(co)} cometas ({', '.join(f['properties']['codigo'] for f in co)}); errores: {err[:3]}")
        except Exception as e:  # noqa: BLE001
            print(f"cielo: error {e}")
    if viejo(OUT_BOLIDOS, 24, ahora):
        try:
            b = bolidos(ahora)
            if b:
                guardar(OUT_BOLIDOS, {"type": "FeatureCollection", "generado_utc": iso(ahora), "fuente": "NASA/JPL CNEOS Fireball Data", "features": b})
            print(f"bólidos: {len(b)} en 365 días")
        except Exception as e:  # noqa: BLE001
            print(f"bólidos: error {e}")
    if viejo(OUT_CAL, 24, ahora):
        try:
            c = calendario(ahora)
            guardar(OUT_CAL, c)
            print(f"calendario: {len(c['fases'])} fases, eclipses {[e['fecha'] for e in c['eclipses_solares']]}")
        except Exception as e:  # noqa: BLE001
            print(f"calendario: error {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
