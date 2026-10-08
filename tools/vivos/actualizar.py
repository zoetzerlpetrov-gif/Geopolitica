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
  buques:    [mmsi, nombre, lon, lat, rumbo, vel_nudos, subtipo, imo, edad_s, indicativo, tipo_ais,
              eslora_m, manga_m, calado_m, destino, eta, estado_nav, bandera]
    destino y eta: lo que declara la tripulación en el AIS (no hay puerto de origen en el AIS);
    bandera: país del MID del MMSI (ISO alfa-2).
  vivos/buques-estatico.json  caché de datos estáticos AIS por MMSI (72 h): llegan cada 6 min por buque.
  vivos/rastros-buques/0-9.json últimas posiciones (cada 20 min, hasta 6 h) por el último dígito del MMSI;
                              nunca para embarcaciones de recreo.

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
import urllib.error
import urllib.parse
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
RUTAS_NUEVAS_MAX = 2000    # consultas nuevas por corrida (lotes de 20), por cortesía con adsb.lol
RUTAS_LOTE = 20
ADSBDB_MAX = 300           # respaldo: consultas individuales a adsbdb.com si adsb.lol no responde (≈ 15 por minuto)
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


def parsear_adsbdb(d):
    """Respuesta de api.adsbdb.com/v0/callsign/<indicativo> → ([orig, dest], {OACI: aeropuerto})."""
    fr = ((d or {}).get("response") or {}).get("flightroute") if isinstance((d or {}).get("response"), dict) else None
    if not fr:
        return [], {}
    aeropuertos, codigos = {}, []
    for clave in ("origin", "destination"):
        ap = fr.get(clave) or {}
        icao = ap.get("icao_code")
        if not icao or ap.get("latitude") is None:
            return [], {}
        codigos.append(icao)
        aeropuertos[icao] = [ap.get("name") or icao, ap.get("municipality") or "", ap.get("country_iso_name") or "",
                             round(float(ap["latitude"]), 4), round(float(ap["longitude"]), 4), ap.get("iata_code") or ""]
    return codigos, aeropuertos


def _routeset(lote):
    req = urllib.request.Request("https://api.adsb.lol/api/0/routeset", data=json.dumps({"planes": lote}).encode(),
                                 headers={"User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        cuerpo = r.read()
        try:
            return parsear_routeset(json.loads(cuerpo))
        except ValueError:
            raise RuntimeError(f"HTTP {r.status} {r.headers.get('Content-Type')} sin JSON: {cuerpo[:200]!r}") from None


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
    consultados, fallos, respaldo = 0, 0, 0
    for i in range(0, min(len(pendientes), RUTAS_NUEVAS_MAX), RUTAS_LOTE):
        lote = pendientes[i:i + RUTAS_LOTE]
        try:
            rutas, aps = _routeset(lote)
        except Exception as e:  # noqa: BLE001
            fallos += 1
            print(f"  routeset: {e}")
            break  # adsb.lol no está respondiendo: se pasa directo al respaldo
            continue
        aeropuertos.update(aps)
        for p in lote:
            vigentes[p["callsign"]] = [rutas.get(p["callsign"], []), ahora_s]
        consultados += len(lote)
        time.sleep(1)
    if consultados == 0 and pendientes:
        # Respaldo: adsbdb.com, una consulta por indicativo (los primeros ADSBDB_MAX pendientes).
        for p in pendientes[:ADSBDB_MAX]:
            try:
                d = json.loads(get(f"https://api.adsbdb.com/v0/callsign/{urllib.parse.quote(p['callsign'])}", timeout=20))
            except urllib.error.HTTPError as e:
                if e.code == 404:  # indicativo sin ruta conocida
                    vigentes[p["callsign"]] = [[], ahora_s]
                    continue
                print(f"  adsbdb: {e}")
                break
            except Exception as e:  # noqa: BLE001
                print(f"  adsbdb: {e}")
                break
            codigos, aps = parsear_adsbdb(d)
            aeropuertos.update(aps)
            vigentes[p["callsign"]] = [codigos, ahora_s]
            respaldo += 1
            time.sleep(0.3)
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
    return f"{con_ruta} con ruta ({consultados} consultas nuevas a adsb.lol, {respaldo} a adsbdb, {fallos} fallos)"


# ------------------------------------------------------------------ rastros (trayectoria reciente)
def _actualizar_shards(carpeta, claves, clave_de, puntos_nuevos, t, horas, maximo, campos):
    """Rastros repartidos en archivos por `clave_de(id)`: agrega la posición actual y descarta lo viejo.

    puntos_nuevos: {id: [valores...]} (sin el minuto, que se agrega aquí).
    """
    os.makedirs(carpeta, exist_ok=True)
    minuto = int(t // 60)
    limite = minuto - horas * 60
    por_clave = {}
    for ident, valores in puntos_nuevos.items():
        por_clave.setdefault(clave_de(ident), {})[ident] = valores
    for clave in claves:
        ruta = os.path.join(carpeta, f"{clave}.json")
        previos = {}
        if os.path.exists(ruta):
            with open(ruta, encoding="utf-8") as fh:
                previos = json.load(fh).get("r", {})
        nuevo = {}
        for ident, puntos in previos.items():
            puntos = [p for p in puntos if p[-1] >= limite]
            if puntos:
                nuevo[ident] = puntos
        for ident, valores in por_clave.get(clave, {}).items():
            puntos = nuevo.get(ident, [])
            if not puntos or puntos[-1][-1] != minuto:
                puntos.append([*valores, minuto])
            nuevo[ident] = puntos[-maximo:]
        with open(ruta, "w", encoding="utf-8") as fh:
            json.dump({"campos": campos, "r": nuevo}, fh, separators=(",", ":"))


def actualizar_rastros(filas, t):
    """Agrega la posición actual al rastro de cada avión permitido y descarta lo de más de 3 h."""
    nuevos = {f[0]: [f[2], f[3], f[4]] for f in filas.values() if f[7] in CON_RASTRO}
    _actualizar_shards(os.path.join(OUT, "rastros"), "0123456789abcdef", lambda h: h[:1].lower(), nuevos, t,
                       RASTRO_HORAS, RASTRO_MAX, ["lon", "lat", "alt_m", "minuto_unix"])


# ------------------------------------------------------------------ buques (AISStream)
# Campos del formato compacto. Origen: el AIS no transmite puerto de salida, solo el destino que
# declara la tripulación (texto libre, a menudo un código UN/LOCODE como «MXZLO»).
CAMPOS_BUQUE = ["mmsi", "nombre", "lon", "lat", "rumbo", "vel_nudos", "subtipo", "imo", "edad_s",
                "indicativo", "tipo_ais", "eslora_m", "manga_m", "calado_m", "destino", "eta", "estado_nav", "bandera"]
ESTATICO_TTL_H = 72        # los datos estáticos llegan cada 6 min por buque: se guardan entre corridas
SIN_RASTRO_BUQUE = {"vela_recreo"}  # embarcaciones de recreo: sin trayectoria (pueden ser de particulares)
RASTRO_BUQUE_HORAS = 6
RASTRO_BUQUE_MAX = 18

# MID (3 primeros dígitos del MMSI de un buque) → país de bandera ISO-3166 alfa-2, según la tabla de la UIT.
# Solo los asignados a un país; los territorios se agrupan con su país cuando la UIT los asigna así.
MID = {
    201: "AL", 202: "AD", 203: "AT", 205: "BE", 206: "BY", 207: "BG", 208: "VA", 209: "CY", 210: "CY", 211: "DE",
    212: "CY", 213: "GE", 214: "MD", 215: "MT", 216: "AM", 218: "DE", 219: "DK", 220: "DK", 224: "ES", 225: "ES",
    226: "FR", 227: "FR", 228: "FR", 229: "MT", 230: "FI", 231: "FO", 232: "GB", 233: "GB", 234: "GB", 235: "GB",
    236: "GI", 237: "GR", 238: "HR", 239: "GR", 240: "GR", 241: "GR", 242: "MA", 243: "HU", 244: "NL", 245: "NL",
    246: "NL", 247: "IT", 248: "MT", 249: "MT", 250: "IE", 251: "IS", 252: "LI", 253: "LU", 254: "MC", 256: "MT",
    257: "NO", 258: "NO", 259: "NO", 261: "PL", 262: "ME", 263: "PT", 264: "RO", 265: "SE", 266: "SE", 267: "SK",
    268: "SM", 269: "CH", 270: "CZ", 271: "TR", 272: "UA", 273: "RU", 274: "MK", 275: "LV", 276: "EE", 277: "LT",
    278: "SI", 279: "RS",
    303: "US", 304: "AG", 305: "AG", 307: "AW", 308: "BS", 309: "BS", 310: "BM", 311: "BS", 312: "BZ", 314: "BB",
    316: "CA", 319: "KY", 321: "CR", 323: "CU", 325: "DM", 327: "DO", 330: "GD", 331: "GL", 332: "GT", 334: "HN",
    336: "HT", 338: "US", 339: "JM", 341: "KN", 343: "LC", 345: "MX", 350: "NI", 351: "PA", 352: "PA", 353: "PA",
    354: "PA", 355: "PA", 356: "PA", 357: "PA", 358: "PR", 359: "SV", 362: "TT", 364: "TC", 366: "US", 367: "US",
    368: "US", 369: "US", 370: "PA", 371: "PA", 372: "PA", 373: "PA", 374: "PA", 375: "VC", 376: "VC", 377: "VC",
    378: "VG", 379: "VI",
    401: "AF", 403: "SA", 405: "BD", 408: "BH", 410: "BT", 412: "CN", 413: "CN", 414: "CN", 416: "TW", 417: "LK",
    419: "IN", 422: "IR", 423: "AZ", 425: "IQ", 428: "IL", 431: "JP", 432: "JP", 434: "TM", 436: "KZ", 437: "UZ",
    438: "JO", 440: "KR", 441: "KR", 445: "KP", 447: "KW", 450: "LB", 451: "KG", 453: "MO", 455: "MV", 457: "MN",
    459: "NP", 461: "OM", 463: "PK", 466: "QA", 468: "SY", 470: "AE", 471: "AE", 472: "TJ", 473: "YE", 475: "YE",
    477: "HK", 478: "BA",
    503: "AU", 506: "MM", 508: "BN", 510: "FM", 511: "PW", 512: "NZ", 514: "KH", 515: "KH", 518: "CK", 520: "FJ",
    525: "ID", 529: "KI", 531: "LA", 533: "MY", 538: "MH", 540: "NC", 544: "NR", 546: "PF", 548: "PH", 553: "PG",
    557: "SB", 559: "AS", 561: "WS", 563: "SG", 564: "SG", 565: "SG", 566: "SG", 567: "TH", 570: "TO", 572: "TV",
    574: "VN", 576: "VU", 577: "VU",
    601: "ZA", 603: "AO", 605: "DZ", 609: "BI", 610: "BJ", 611: "BW", 612: "CF", 613: "CM", 615: "CG", 616: "KM",
    617: "CV", 619: "CI", 620: "KM", 621: "DJ", 622: "EG", 624: "ET", 625: "ER", 626: "GA", 627: "GH", 629: "GM",
    630: "GW", 631: "GQ", 632: "GN", 633: "BF", 634: "KE", 636: "LR", 637: "LR", 638: "SS", 642: "LY", 644: "LS",
    645: "MU", 647: "MG", 649: "ML", 650: "MZ", 654: "MR", 655: "MW", 656: "NE", 657: "NG", 659: "NA", 661: "RW",
    662: "SD", 663: "SN", 664: "SC", 666: "SO", 667: "SL", 668: "ST", 669: "SZ", 670: "TD", 671: "TG", 672: "TN",
    674: "TZ", 675: "UG", 676: "CD", 677: "TZ", 678: "ZM", 679: "ZW",
    701: "AR", 710: "BR", 720: "BO", 725: "CL", 730: "CO", 735: "EC", 740: "FK", 750: "GY", 755: "PY", 760: "PE",
    765: "SR", 770: "UY", 775: "VE",
}


def bandera_mmsi(mmsi):
    """País de bandera según el MID del MMSI (9 dígitos, el primero de 2 a 7). '' si no se puede saber."""
    s = str(mmsi or "")
    if len(s) != 9 or s[0] not in "234567":
        return ""
    return MID.get(int(s[:3]), "")


def _texto_ais(t):
    """Texto AIS: '@' es relleno y los espacios sobran."""
    return re.sub(r"\s+", " ", (t or "").replace("@", " ")).strip()


def eta_ais(e):
    """ETA declarada (mes, día, hora, minuto en UTC, sin año) → 'MM-DD HH:MM' o 'MM-DD'; '' si no se informó."""
    if not e:
        return ""
    mes, dia, hora, minuto = e.get("Month") or 0, e.get("Day") or 0, e.get("Hour"), e.get("Minute")
    if not (1 <= mes <= 12 and 1 <= dia <= 31):
        return ""
    if hora is None or hora >= 24 or minuto is None or minuto >= 60:
        return f"{mes:02d}-{dia:02d}"
    return f"{mes:02d}-{dia:02d} {hora:02d}:{minuto:02d}"


def estatico_de_mensaje(s, t):
    """ShipStaticData de AISStream → registro compacto para la caché (sin datos de personas)."""
    d = s.get("Dimension") or {}
    eslora = (d.get("A") or 0) + (d.get("B") or 0)
    manga = (d.get("C") or 0) + (d.get("D") or 0)
    calado = s.get("MaximumStaticDraught") or 0
    return {"t": int(t), "nombre": _texto_ais(s.get("Name")), "indicativo": _texto_ais(s.get("CallSign")),
            "imo": s.get("ImoNumber") or 0, "tipo": s.get("Type") or 0,
            "eslora": eslora if 0 < eslora < 500 else 0, "manga": manga if 0 < manga < 80 else 0,
            "calado": round(calado, 1) if 0 < calado < 30 else 0,
            "destino": _texto_ais(s.get("Destination"))[:20], "eta": eta_ais(s.get("Eta"))}


def posicion_de_mensaje(p):
    """PositionReport → (lon, lat, rumbo, vel_nudos, estado_nav) o None si la posición no está disponible.

    El AIS usa valores fuera de rango para «no disponible»: lon 181, lat 91, rumbo 511, rumbo sobre el
    fondo 360, velocidad 102.3.
    """
    lon, lat = p.get("Longitude"), p.get("Latitude")
    if lon is None or lat is None or abs(lon) > 180 or abs(lat) > 90 or (lon == 0 and lat == 0):
        return None
    rumbo = p.get("TrueHeading")
    if rumbo is None or rumbo >= 360:
        rumbo = p.get("Cog")
        if rumbo is None or rumbo >= 360:
            rumbo = 0
    vel = p.get("Sog") or 0
    if vel >= 102:
        vel = 0
    estado = p.get("NavigationalStatus")
    return round(lon, 3), round(lat, 3), round(rumbo), round(vel, 1), estado if isinstance(estado, int) else 15


def _subtipo_buque(tipo, imo, sancionados):
    if imo and str(imo) in sancionados:
        return "sancionados"
    for (a, b), st in AIS_TIPO:
        if a <= (tipo or 0) <= b:
            return st
    return "otros"


def fila_buque(mmsi, nombre, posicion, edad_s, est, sanc):
    lon, lat, rumbo, vel, estado = posicion
    est = est or {}
    imo = est.get("imo") or 0
    return [mmsi, nombre or est.get("nombre", ""), lon, lat, rumbo, vel, _subtipo_buque(est.get("tipo"), imo, sanc), imo, edad_s,
            est.get("indicativo", ""), est.get("tipo", 0), est.get("eslora", 0), est.get("manga", 0), est.get("calado", 0),
            est.get("destino", ""), est.get("eta", ""), estado, bandera_mmsi(mmsi)]


def depurar_estaticos(cache, t):
    """Quita de la caché los buques sin datos estáticos nuevos en ESTATICO_TTL_H horas."""
    limite = t - ESTATICO_TTL_H * 3600
    return {k: v for k, v in cache.items() if v.get("t", 0) >= limite}


def actualizar_rastros_buques(filas, t):
    nuevos = {str(f[0]): [f[2], f[3], f[5]] for f in filas if f[6] not in SIN_RASTRO_BUQUE}
    _actualizar_shards(os.path.join(OUT, "rastros-buques"), "0123456789", lambda m: m[-1:], nuevos, t,
                       RASTRO_BUQUE_HORAS, RASTRO_BUQUE_MAX, ["lon", "lat", "vel_nudos", "minuto_unix"])


def buques(segundos=75):
    clave = os.environ.get("AISSTREAM_API_KEY")
    if not clave:
        raise RuntimeError("falta el secreto AISSTREAM_API_KEY (registro gratuito en aisstream.io)")
    import websockets  # dependencia solo de este paso

    sanc = set(leer("sanciones.json", {}).get("imo", []))
    cache = leer("buques-estatico.json", {}).get("b", {})
    pos = {}
    nuevos_est = 0

    async def escuchar():
        nonlocal nuevos_est
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
                if not mmsi:
                    continue
                if m.get("MessageType") == "PositionReport":
                    p = posicion_de_mensaje(m["Message"]["PositionReport"])
                    if p:
                        pos[mmsi] = (_texto_ais(meta.get("ShipName")), p, time.time())
                elif m.get("MessageType") == "ShipStaticData":
                    cache[str(mmsi)] = estatico_de_mensaje(m["Message"]["ShipStaticData"], time.time())
                    nuevos_est += 1

    asyncio.run(escuchar())
    t = time.time()
    cache = depurar_estaticos(cache, t)
    filas = [fila_buque(mmsi, nombre, p, round(t - recibido), cache.get(str(mmsi)), sanc) for mmsi, (nombre, p, recibido) in pos.items()]
    escribir("buques-estatico.json", {"generado_utc": ahora(), "ttl_h": ESTATICO_TTL_H, "b": cache})
    escribir("buques.json", {"generado_utc": ahora(), "campos": CAMPOS_BUQUE,
                             "fuentes": {"aisstream": len(filas)}, "ventana_s": segundos, "con_estaticos": sum(1 for f in filas if f[10]), "b": filas})
    actualizar_rastros_buques(filas, t)
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
