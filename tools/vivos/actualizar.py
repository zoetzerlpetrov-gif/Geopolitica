#!/usr/bin/env python3
"""Instantáneas de capas en movimiento (Fases C3 y C4): satélites, aeronaves y buques.

Salida en vivos/ (se publica en la rama huérfana "datos-vivos", que se reescribe en cada corrida para
no acumular historial; el workflow de Pages la copia a data/vivos/):
  vivos/satelites.json   TLE por grupo de CelesTrak (se refresca como máximo cada 6 h, según su guía de uso)
  vivos/aeronaves.json   posiciones ADS-B: OpenSky (global, anónimo) + adsb.lol (militares)
  vivos/buques.json      posiciones AIS de AISStream (solo si existe el secreto AISSTREAM_API_KEY)
  vivos/sanciones.json   matrículas de aeronaves e IMO de buques en la lista SDN de OFAC (diaria)
  vivos/estado.json      qué fuente respondió, cuántos objetos y cuándo

Formato compacto (arreglos, no objetos) para que el archivo pese poco:
  aeronaves: [hex, indicativo, lon, lat, alt_m, rumbo, vel_kmh, subtipo, pais_origen, edad_s,
              vs_ms, squawk, cat, tipo_av, matricula, ruta]
    vs_ms: velocidad vertical (m/s, + sube); cat: categoría ADS-B (A1…C3); ruta: "ORIG-DEST" en OACI.
  vivos/rutas.json            caché de rutas por indicativo (12 h) y aeropuertos (nombre, ciudad, país, lat, lon)
  vivos/aeropuertos-ruta.json solo los aeropuertos de las rutas actuales (lo pide la ficha del avión)
  vivos/rastros/0-f.json      últimas posiciones (cada 20 min, hasta 3 h) por avión, en 16 archivos por
                              el primer carácter del código ICAO: la ficha descarga solo uno.
  buques:    [mmsi, nombre, lon, lat, rumbo, vel_nudos, subtipo, imo, edad_s]

Privacidad (en código):
  - Se excluyen aeronaves marcadas por sus dueños como privadas (banderas PIA/LADD de adsb.lol).
  - No se guarda propietario ni se vincula ninguna aeronave o buque a personas.
  - Rutas y trayectorias SOLO para vuelos de aerolínea, carga, militares y de Estado; nunca para
    aviación general (avionetas y jets privados), para no permitir seguir a particulares.
Uso: python3 tools/vivos/actualizar.py [satelites] [aeronaves] [buques] [sanciones]
"""
import asyncio
import csv
import io
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "vivos")
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
# "last-30-days" (lanzamientos recientes) devolvió 404 en CelesTrak (oct 2026): se omite hasta confirmar su nombre actual.
GRUPOS_SAT = ["stations", "gnss", "geo", "weather", "military", "visual"]
HORAS_TLE = 6

# Prefijos OACI de aerolíneas de carga (indicativo de 3 letras).
CARGA_SOLO = {"FDX", "UPS", "GTI", "CLX", "ABW", "CKS", "BOX", "DHK", "DHL", "BCS", "CAO", "CKK", "AJT", "ATN", "MPH", "NCA", "SQC", "TAY", "LCO", "MXY", "ABX", "PAC", "WGN"}
# Indicativos de vuelos de Estado conocidos públicamente (misiones VIP de fuerzas aéreas y gobiernos).
ESTADO = ("SAM", "EXEC", "VENUS", "CFC0", "GAF6", "RRR", "FAF", "IAM", "CTM", "ASY", "MMF", "FAM", "SPAR")
# Subtipos con ruta y trayectoria (nunca aviación general: ver «Privacidad» arriba).
CON_RUTA = {"civil_comercial", "carga"}
CON_RASTRO = {"civil_comercial", "carga", "militar", "estado", "sancionada"}
RASTRO_MAX = 10            # posiciones por avión (cada 20 min ≈ 3 h)
RASTRO_HORAS = 3
RUTAS_TTL_H = 12           # una ruta encontrada se reutiliza 12 h; una no encontrada, 6 h
RUTAS_NUEVAS_MAX = 2000    # consultas nuevas por corrida (lotes de 100), por cortesía con adsb.lol
# Categorías de OpenSky (número) → código ADS-B (letra+número), el mismo que da adsb.lol.
CAT_OPENSKY = {2: "A1", 3: "A2", 4: "A3", 5: "A4", 6: "A5", 7: "A6", 8: "A7", 9: "B1", 10: "B2", 11: "B3", 12: "B4",
               14: "B6", 15: "B7", 16: "C1", 17: "C2", 18: "C3", 19: "C3", 20: "C3"}
AIS_TIPO = [((30, 30), "pesca"), ((31, 32), "remolque_servicio"), ((35, 35), "militares"), ((36, 37), "vela_recreo"),
            ((52, 52), "remolque_servicio"), ((60, 69), "pasaje"), ((70, 79), "carga"), ((80, 89), "tanqueros")]


def get(url, timeout=120, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def ahora():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def leer(nombre, defecto):
    ruta = os.path.join(OUT, nombre)
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    return defecto


def escribir(nombre, datos):
    with open(os.path.join(OUT, nombre), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, separators=(",", ":"))


# ------------------------------------------------------------------ sanciones (OFAC SDN)
def sanciones():
    texto = get("https://www.treasury.gov/ofac/downloads/sdn.csv", timeout=180).decode("latin-1")
    matriculas, imos = set(), set()
    for fila in csv.reader(io.StringIO(texto)):
        if len(fila) < 12:
            continue
        nota = fila[11]
        for m in re.findall(r"Aircraft Tail Number\s+([A-Z0-9-]+)", nota):
            matriculas.add(m.replace("-", "").upper())
        for m in re.findall(r"IMO\s+(\d{7})", nota):
            imos.add(m)
    escribir("sanciones.json", {"generado_utc": ahora(), "fuente": "OFAC SDN (dominio público)", "matriculas": sorted(matriculas), "imo": sorted(imos)})
    return len(matriculas) + len(imos)


# ------------------------------------------------------------------ satélites (CelesTrak)
def satelites():
    previo = leer("satelites.json", {})
    if previo.get("generado_utc"):
        edad_h = (datetime.now(timezone.utc) - datetime.strptime(previo["generado_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds() / 3600
        if edad_h < HORAS_TLE:
            print(f"  TLE de hace {edad_h:.1f} h: se conservan (CelesTrak pide no descargar el mismo grupo más de una vez cada 2 h)")
            return sum(len(g) for g in previo["grupos"].values())
    grupos, fallidos = {}, {}
    for g in GRUPOS_SAT:
        try:
            texto = get(f"https://celestrak.org/NORAD/elements/gp.php?GROUP={g}&FORMAT=tle").decode("utf-8").strip().splitlines()
        except Exception as e:  # noqa: BLE001  un grupo inexistente no debe tumbar a los demás
            fallidos[g] = str(e)
            print(f"  grupo {g}: {e}")
            continue
        sats = []
        for i in range(0, len(texto) - 2, 3):
            nombre, l1, l2 = texto[i].strip(), texto[i + 1].strip(), texto[i + 2].strip()
            if l1.startswith("1 ") and l2.startswith("2 "):
                sats.append([nombre, l1, l2])
        grupos[g] = sats
        time.sleep(2)
    if not grupos:
        raise RuntimeError(f"ningún grupo respondió: {fallidos}")
    escribir("satelites.json", {"generado_utc": ahora(), "fuente": "CelesTrak", "grupos": grupos, "fallidos": fallidos})
    return sum(len(g) for g in grupos.values())


# ------------------------------------------------------------------ aeronaves
def _subtipo_avion(indicativo, militar, en_tierra, matricula, sancionadas):
    cs = (indicativo or "").strip().upper()
    if matricula and matricula.replace("-", "").upper() in sancionadas:
        return "sancionada"
    if en_tierra:
        return "en_tierra"
    if cs.startswith(ESTADO):
        return "estado"
    if militar:
        return "militar"
    if re.match(r"^[A-Z]{3}\d", cs):
        return "carga" if cs[:3] in CARGA_SOLO else "civil_comercial"
    return "aviacion_general"


CAMPOS_AVION = ["hex", "indicativo", "lon", "lat", "alt_m", "rumbo", "vel_kmh", "subtipo", "pais", "edad_s",
                "vs_ms", "squawk", "cat", "tipo_av", "matricula", "ruta"]


def fila_opensky(s, t, sanc):
    """Vector de estado de OpenSky (con ?extended=1) → fila compacta, o None sin posición."""
    if s[5] is None or s[6] is None:
        return None
    alt = s[13] if s[13] is not None else s[7]
    cat = CAT_OPENSKY.get(s[17], "") if len(s) > 17 and s[17] is not None else ""
    return [s[0], (s[1] or "").strip(), round(s[5], 3), round(s[6], 3), round(alt or 0), round(s[10] or 0),
            round((s[9] or 0) * 3.6), _subtipo_avion(s[1], False, s[8], None, sanc), s[2] or "", int(t - (s[4] or t)),
            round(s[11] or 0, 1), s[14] or "", cat, "", "", ""]


def fila_adsblol(a, sanc):
    """Aeronave de adsb.lol → fila compacta, o None si no tiene posición o pidió privacidad (PIA/LADD)."""
    if a.get("lat") is None or a.get("lon") is None:
        return None
    banderas = a.get("dbFlags") or 0
    if banderas & 4 or banderas & 8:  # PIA / LADD: se pidió privacidad → se excluye
        return None
    en_tierra = a.get("alt_baro") == "ground"
    alt = 0 if en_tierra else round((a.get("alt_geom") or a.get("alt_baro") or 0) * 0.3048)
    vs = a.get("baro_rate") if a.get("baro_rate") is not None else a.get("geom_rate")
    return [a["hex"], (a.get("flight") or "").strip(), round(a["lon"], 3), round(a["lat"], 3), alt, round(a.get("track") or 0),
            round((a.get("gs") or 0) * 1.852), _subtipo_avion(a.get("flight"), True, en_tierra, a.get("r"), sanc), "",
            round(a.get("seen_pos") or 0), round((vs or 0) * 0.00508, 1), a.get("squawk") or "", a.get("category") or "",
            a.get("t") or "", a.get("r") or "", ""]


def aeronaves():
    sanc = set(leer("sanciones.json", {}).get("matriculas", []))
    t = time.time()
    filas, fuentes = {}, {}
    try:
        d = json.loads(get("https://opensky-network.org/api/states/all?extended=1", timeout=90))
        for s in d.get("states") or []:
            f = fila_opensky(s, t, sanc)
            if f:
                filas[f[0]] = f
        fuentes["opensky"] = len(filas)
    except Exception as e:  # noqa: BLE001
        fuentes["opensky"] = f"error: {e}"
    try:
        d = json.loads(get("https://api.adsb.lol/v2/mil", timeout=60))
        n = 0
        for a in d.get("ac") or []:
            f = fila_adsblol(a, sanc)
            if f:
                filas[f[0]] = f
                n += 1
        fuentes["adsb.lol (militares)"] = n
    except Exception as e:  # noqa: BLE001
        fuentes["adsb.lol (militares)"] = f"error: {e}"
    if not filas:
        raise RuntimeError(f"ninguna fuente respondió: {fuentes}")
    try:
        fuentes["rutas (adsb.lol)"] = asignar_rutas(filas)
    except Exception as e:  # noqa: BLE001  sin rutas el mapa sigue funcionando
        fuentes["rutas (adsb.lol)"] = f"error: {e}"
    try:
        actualizar_rastros(filas, t)
    except Exception as e:  # noqa: BLE001
        fuentes["rastros"] = f"error: {e}"
    escribir("aeronaves.json", {"generado_utc": ahora(), "campos": CAMPOS_AVION, "fuentes": fuentes, "a": list(filas.values())})
    return len(filas)


# ------------------------------------------------------------------ rutas (origen y destino)
def _dist_km(lat1, lon1, lat2, lon2):
    import math
    r = math.radians
    a = math.sin(r(lat2 - lat1) / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lon2 - lon1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


def elegir_tramo(codigos, aeropuertos, lat, lon):
    """Ruta con escalas (A-B-C): el tramo donde el desvío por pasar por la posición actual es menor."""
    if len(codigos) < 2:
        return None
    mejor = None
    for a, b in zip(codigos, codigos[1:]):
        pa, pb = aeropuertos.get(a), aeropuertos.get(b)
        if not pa or not pb:
            continue
        desvio = _dist_km(pa[3], pa[4], lat, lon) + _dist_km(lat, lon, pb[3], pb[4]) - _dist_km(pa[3], pa[4], pb[3], pb[4])
        if mejor is None or desvio < mejor[0]:
            mejor = (desvio, a, b)
    return (mejor[1], mejor[2]) if mejor else (codigos[0], codigos[1])


def parsear_routeset(respuesta):
    """Respuesta de POST /api/0/routeset de adsb.lol → ({indicativo: [códigos OACI]}, {OACI: aeropuerto})."""
    rutas, aeropuertos = {}, {}
    for r in respuesta or []:
        cs = (r.get("callsign") or "").strip().upper()
        codigos = [c for c in (r.get("airport_codes") or "").split("-") if c and c != "unknown"]
        for ap in r.get("_airports") or []:
            icao = ap.get("icao")
            if icao and ap.get("lat") is not None and ap.get("lon") is not None:
                aeropuertos[icao] = [ap.get("name") or icao, ap.get("location") or "", ap.get("countryiso2") or "",
                                     round(float(ap["lat"]), 4), round(float(ap["lon"]), 4), ap.get("iata") or ""]
        if cs:
            rutas[cs] = codigos if r.get("plausible", True) not in (False, 0) else []
    return rutas, aeropuertos


def asignar_rutas(filas):
    """Pone "ORIG-DEST" en las filas de vuelos de aerolínea y carga; consulta solo indicativos sin caché."""
    cache = leer("rutas.json", {"rutas": {}, "aeropuertos": {}})
    ahora_s = time.time()
    vigentes = {cs: r for cs, r in cache["rutas"].items() if ahora_s - r[1] < RUTAS_TTL_H * 3600 * (1 if r[0] else 0.5)}
    aeropuertos = cache["aeropuertos"]
    pendientes = []
    for f in filas.values():
        cs = f[1].upper()
        if f[7] in CON_RUTA and cs and cs not in vigentes:
            pendientes.append({"callsign": cs, "lat": f[3], "lng": f[2]})
    consultados, fallos = 0, 0
    for i in range(0, min(len(pendientes), RUTAS_NUEVAS_MAX), 100):
        lote = pendientes[i:i + 100]
        try:
            req = urllib.request.Request("https://api.adsb.lol/api/0/routeset", data=json.dumps({"planes": lote}).encode(),
                                         headers={"User-Agent": UA, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                rutas, aps = parsear_routeset(json.loads(r.read()))
        except Exception as e:  # noqa: BLE001
            fallos += 1
            print(f"  routeset: {e}")
            if fallos >= 3:
                break
            continue
        aeropuertos.update(aps)
        for p in lote:
            vigentes[p["callsign"]] = [rutas.get(p["callsign"], []), ahora_s]
        consultados += len(lote)
        time.sleep(1)
    usados, con_ruta = {}, 0
    for f in filas.values():
        r = vigentes.get(f[1].upper())
        if f[7] not in CON_RUTA or not r or len(r[0]) < 2:
            continue
        tramo = elegir_tramo(r[0], aeropuertos, f[3], f[2])
        if tramo:
            f[15] = f"{tramo[0]}-{tramo[1]}"
            con_ruta += 1
            for c in tramo:
                if c in aeropuertos:
                    usados[c] = aeropuertos[c]
    escribir("rutas.json", {"generado_utc": ahora(), "fuente": "adsb.lol routeset (base comunitaria de rutas)", "rutas": vigentes, "aeropuertos": aeropuertos})
    escribir("aeropuertos-ruta.json", {"generado_utc": ahora(), "campos": ["nombre", "ciudad", "pais_iso2", "lat", "lon", "iata"], "aeropuertos": usados})
    return f"{con_ruta} con ruta ({consultados} consultas nuevas)"


# ------------------------------------------------------------------ rastros (trayectoria reciente)
def actualizar_rastros(filas, t):
    """Agrega la posición actual al rastro de cada avión permitido y descarta lo de más de 3 h."""
    carpeta = os.path.join(OUT, "rastros")
    os.makedirs(carpeta, exist_ok=True)
    minuto = int(t // 60)
    limite = minuto - RASTRO_HORAS * 60
    for clave in "0123456789abcdef":
        ruta = os.path.join(carpeta, f"{clave}.json")
        previos = {}
        if os.path.exists(ruta):
            with open(ruta, encoding="utf-8") as fh:
                previos = json.load(fh).get("r", {})
        nuevo = {}
        for hexid, puntos in previos.items():
            puntos = [p for p in puntos if p[3] >= limite]
            if puntos:
                nuevo[hexid] = puntos
        for f in filas.values():
            if f[0][:1].lower() != clave or f[7] not in CON_RASTRO:
                continue
            puntos = nuevo.get(f[0], [])
            if not puntos or puntos[-1][3] != minuto:
                puntos.append([f[2], f[3], f[4], minuto])
            nuevo[f[0]] = puntos[-RASTRO_MAX:]
        with open(ruta, "w", encoding="utf-8") as fh:
            json.dump({"campos": ["lon", "lat", "alt_m", "minuto_unix"], "r": nuevo}, fh, separators=(",", ":"))


# ------------------------------------------------------------------ buques (AISStream)
def _subtipo_buque(tipo, imo, sancionados):
    if imo and str(imo) in sancionados:
        return "sancionados"
    for (a, b), st in AIS_TIPO:
        if a <= (tipo or 0) <= b:
            return st
    return "otros"


def buques(segundos=75):
    clave = os.environ.get("AISSTREAM_API_KEY")
    if not clave:
        raise RuntimeError("falta el secreto AISSTREAM_API_KEY (registro gratuito en aisstream.io)")
    import websockets  # dependencia solo de este paso

    sanc = set(leer("sanciones.json", {}).get("imo", []))
    pos, estaticos = {}, {}

    async def escuchar():
        async with websockets.connect("wss://stream.aisstream.io/v0/stream", open_timeout=30) as ws:
            await ws.send(json.dumps({"APIKey": clave, "BoundingBoxes": [[[-90, -180], [90, 180]]],
                                      "FilterMessageTypes": ["PositionReport", "ShipStaticData"]}))
            fin = time.time() + segundos
            while time.time() < fin:
                try:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                except asyncio.TimeoutError:
                    continue
                meta = m.get("MetaData", {})
                mmsi = meta.get("MMSI")
                if m.get("MessageType") == "PositionReport":
                    p = m["Message"]["PositionReport"]
                    pos[mmsi] = (meta.get("ShipName", "").strip(), round(p["Longitude"], 3), round(p["Latitude"], 3), round(p.get("TrueHeading") or p.get("Cog") or 0), round(p.get("Sog") or 0, 1))
                elif m.get("MessageType") == "ShipStaticData":
                    s = m["Message"]["ShipStaticData"]
                    estaticos[mmsi] = (s.get("Type"), s.get("ImoNumber"))

    asyncio.run(escuchar())
    filas = []
    for mmsi, (nombre, lon, lat, rumbo, vel) in pos.items():
        tipo, imo = estaticos.get(mmsi, (None, None))
        filas.append([mmsi, nombre, lon, lat, rumbo, vel, _subtipo_buque(tipo, imo, sanc), imo or 0, 0])
    escribir("buques.json", {"generado_utc": ahora(), "campos": ["mmsi", "nombre", "lon", "lat", "rumbo", "vel_nudos", "subtipo", "imo", "edad_s"],
                             "fuentes": {"aisstream": len(filas)}, "ventana_s": segundos, "b": filas})
    return len(filas)


PASOS = {"sanciones": sanciones, "satelites": satelites, "aeronaves": aeronaves, "buques": buques}


def main(pedidos):
    os.makedirs(OUT, exist_ok=True)
    estado = leer("estado.json", {"pasos": {}})
    for nombre, fn in PASOS.items():
        if pedidos and nombre not in pedidos:
            continue
        if nombre == "sanciones" and not pedidos and os.path.exists(os.path.join(OUT, "sanciones.json")):
            hecho = estado["pasos"].get("sanciones", {}).get("actualizado_utc", "")
            if hecho[:10] == ahora()[:10]:
                continue  # la lista SDN se baja una vez al día
        t0 = time.time()
        try:
            n = fn()
            estado["pasos"][nombre] = {"estado": "ok", "objetos": n, "actualizado_utc": ahora(), "segundos": round(time.time() - t0)}
        except Exception as e:  # noqa: BLE001
            prev = estado["pasos"].get(nombre, {})
            prev.update({"estado": "error", "error": str(e)[:300], "intento_utc": ahora()})
            estado["pasos"][nombre] = prev
        print(nombre, estado["pasos"][nombre])
    estado["generado_utc"] = ahora()
    escribir("estado.json", estado)
    return 0


if __name__ == "__main__":
    sys.exit(main(set(sys.argv[1:])))
