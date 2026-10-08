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
  aeronaves: [hex, indicativo, lon, lat, alt_m, rumbo, vel_kmh, subtipo, pais_origen, edad_s]
  buques:    [mmsi, nombre, lon, lat, rumbo, vel_nudos, subtipo, imo, edad_s]

Privacidad (en código):
  - Se excluyen aeronaves marcadas por sus dueños como privadas (banderas PIA/LADD de adsb.lol).
  - No se guarda propietario ni se vincula ninguna aeronave o buque a personas.
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
GRUPOS_SAT = ["stations", "gnss", "geo", "weather", "military", "visual", "last-30-days"]
HORAS_TLE = 6

# Prefijos OACI de aerolíneas de carga (indicativo de 3 letras).
CARGA_SOLO = {"FDX", "UPS", "GTI", "CLX", "ABW", "CKS", "BOX", "DHK", "DHL", "BCS", "CAO", "CKK", "AJT", "ATN", "MPH", "NCA", "SQC", "TAY", "LCO", "MXY", "ABX", "PAC", "WGN"}
# Indicativos de vuelos de Estado conocidos públicamente (misiones VIP de fuerzas aéreas y gobiernos).
ESTADO = ("SAM", "EXEC", "VENUS", "CFC0", "GAF6", "RRR", "FAF", "IAM", "CTM", "ASY", "MMF", "FAM", "SPAR")
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
    grupos = {}
    for g in GRUPOS_SAT:
        texto = get(f"https://celestrak.org/NORAD/elements/gp.php?GROUP={g}&FORMAT=tle").decode("utf-8").strip().splitlines()
        sats = []
        for i in range(0, len(texto) - 2, 3):
            nombre, l1, l2 = texto[i].strip(), texto[i + 1].strip(), texto[i + 2].strip()
            if l1.startswith("1 ") and l2.startswith("2 "):
                sats.append([nombre, l1, l2])
        grupos[g] = sats
        time.sleep(2)
    escribir("satelites.json", {"generado_utc": ahora(), "fuente": "CelesTrak", "grupos": grupos})
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


def aeronaves():
    sanc = set(leer("sanciones.json", {}).get("matriculas", []))
    t = time.time()
    filas, fuentes = {}, {}
    try:
        d = json.loads(get("https://opensky-network.org/api/states/all", timeout=90))
        for s in d.get("states") or []:
            if s[5] is None or s[6] is None:
                continue
            hexid = s[0]
            alt = s[13] if s[13] is not None else s[7]
            filas[hexid] = [hexid, (s[1] or "").strip(), round(s[5], 3), round(s[6], 3), round(alt or 0), round(s[10] or 0),
                            round((s[9] or 0) * 3.6), _subtipo_avion(s[1], False, s[8], None, sanc), s[2] or "", int(t - (s[4] or t))]
        fuentes["opensky"] = len(filas)
    except Exception as e:  # noqa: BLE001
        fuentes["opensky"] = f"error: {e}"
    try:
        d = json.loads(get("https://api.adsb.lol/v2/mil", timeout=60))
        n = 0
        for a in d.get("ac") or []:
            if a.get("lat") is None or a.get("lon") is None:
                continue
            banderas = a.get("dbFlags") or 0
            if banderas & 4 or banderas & 8:  # PIA / LADD: el dueño pidió privacidad → se excluye
                continue
            en_tierra = a.get("alt_baro") == "ground"
            alt = 0 if en_tierra else round((a.get("alt_geom") or a.get("alt_baro") or 0) * 0.3048)
            filas[a["hex"]] = [a["hex"], (a.get("flight") or "").strip(), round(a["lon"], 3), round(a["lat"], 3), alt, round(a.get("track") or 0),
                               round((a.get("gs") or 0) * 1.852), _subtipo_avion(a.get("flight"), True, en_tierra, a.get("r"), sanc), "", round(a.get("seen_pos") or 0)]
            n += 1
        fuentes["adsb.lol (militares)"] = n
    except Exception as e:  # noqa: BLE001
        fuentes["adsb.lol (militares)"] = f"error: {e}"
    if not filas:
        raise RuntimeError(f"ninguna fuente respondió: {fuentes}")
    escribir("aeronaves.json", {"generado_utc": ahora(), "campos": ["hex", "indicativo", "lon", "lat", "alt_m", "rumbo", "vel_kmh", "subtipo", "pais", "edad_s"],
                                "fuentes": fuentes, "a": list(filas.values())})
    return len(filas)


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
