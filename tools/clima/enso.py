#!/usr/bin/env python3
"""El Niño / La Niña (ENSO): estado oficial de NOAA y temperatura del mar en las regiones Niño.

Fuentes (Climate Prediction Center de NOAA, dominio público del gobierno de EUA):
- `oni.ascii.txt`: Índice Oceánico de El Niño (ONI), anomalía de 3 meses en la región Niño 3.4 desde 1950.
  El Niño = ONI ≥ +0.5 °C; La Niña = ONI ≤ −0.5 °C (umbral de NOAA, sostenido 5 trimestres para un «episodio»).
- `wksst9120.for`: anomalía semanal de la temperatura del mar en Niño 1+2, 3, 3.4 y 4 (base 1991-2020).
- `ensodisc.shtml`: discusión mensual; de ella solo se toma la línea «ENSO Alert System Status» y la «Synopsis»
  (una o dos frases), con enlace al texto completo.
Se consulta una vez al día (los datos son semanales y mensuales).
Salida: vivos/enso.geojson (las cuatro regiones Niño como polígonos con su anomalía, más el estado y el ONI).
"""
import html
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "enso.geojson")
BASE = "https://www.cpc.ncep.noaa.gov"
URL_ONI = BASE + "/data/indices/oni.ascii.txt"
URL_SEMANAL = BASE + "/data/indices/wksst9120.for"
URL_DISC = BASE + "/products/analysis_monitoring/enso_advisory/ensodisc.shtml"
# Cajas de las regiones Niño (lon oeste negativa; Niño 4 cruza la línea de cambio de fecha: 160° E a 150° O).
REGIONES = {"nino12": ("Niño 1+2", -90, -80, -10, 0), "nino3": ("Niño 3", -150, -90, -5, 5),
            "nino34": ("Niño 3.4", -170, -120, -5, 5), "nino4": ("Niño 4", 160, 210, -5, 5)}
ESTADOS = {"el nino advisory": "Aviso de El Niño (El Niño presente)", "la nina advisory": "Aviso de La Niña (La Niña presente)",
           "el nino watch": "Vigilancia de El Niño (podría formarse en los próximos 6 meses)",
           "la nina watch": "Vigilancia de La Niña (podría formarse en los próximos 6 meses)",
           "final el nino advisory": "Aviso final de El Niño (terminó)", "final la nina advisory": "Aviso final de La Niña (terminó)",
           "not active": "Sin aviso (condiciones neutrales)"}


def oni_de(texto):
    """→ lista [[«DJF 2026», anomalía], ...] en orden."""
    out = []
    for linea in texto.splitlines():
        p = linea.split()
        if len(p) == 4 and re.fullmatch(r"[A-Z]{3}", p[0]) and p[1].isdigit():
            try:
                out.append([f"{p[0]} {p[1]}", float(p[3])])
            except ValueError:
                pass
    return out


def fase(anom):
    return "nino" if anom >= 0.5 else "nina" if anom <= -0.5 else "neutral"


def semanal_de(texto):
    """Última fila del archivo semanal → {"semana": "08OCT2026", "nino12": anomalía, ...}."""
    # Columnas de ancho fijo: el signo menos de la anomalía va pegado a la temperatura («20.6-0.1»).
    filas = []
    for l in texto.splitlines():
        m = re.match(r"\s*(\d{2}[A-Z]{3}\d{4})\s+(.*)", l)
        nums = re.findall(r"-?\d+\.\d", m.group(2)) if m else []
        if len(nums) == 8:
            filas.append([m.group(1)] + [float(x) for x in nums])
    if not filas:
        return {}
    f = filas[-1]
    return {"semana": f[0], "nino12": f[2], "nino3": f[4], "nino34": f[6], "nino4": f[8], "serie34": [[x[0], x[6]] for x in filas[-26:]]}


def discusion_de(texto):
    plano = html.unescape(re.sub(r"<[^>]+>", " ", texto))
    plano = re.sub(r"\s+", " ", plano)
    est = re.search(r"ENSO Alert System Status:\s*([A-Za-zñÑ ]+?)(?:\s{1,}Synopsis|\s*$|\s{2})", plano)
    sin = re.search(r"Synopsis:\s*(.{20,400}?\.)(?:\s|$)", plano)
    fecha = re.search(r"issued by\s+CLIMATE PREDICTION CENTER.*?(\d{1,2} \w+ \d{4})", plano, re.I)
    estado_en = (est.group(1).strip() if est else "").replace("ñ", "n").replace("Ñ", "N")
    return {"estado_en": estado_en, "estado": ESTADOS.get(estado_en.lower(), estado_en), "sinopsis_en": sin.group(1).strip() if sin else "",
            "emitido": fecha.group(1) if fecha else ""}


def caja(o, e, s, n):
    return {"type": "Polygon", "coordinates": [[[o, s], [e, s], [e, n], [o, n], [o, s]]]}


def features(oni, sem, disc):
    ult = oni[-1] if oni else ["", 0.0]
    comunes = {"oni_trimestre": ult[0], "oni": ult[1], "fase_oni": fase(ult[1]), "oni_serie": oni[-24:], "estado": disc.get("estado", ""),
               "estado_en": disc.get("estado_en", ""), "sinopsis_en": disc.get("sinopsis_en", ""), "emitido": disc.get("emitido", ""),
               "semana": sem.get("semana", ""), "serie34": sem.get("serie34", [])}
    out = []
    for k, (nombre, o, e, s, n) in REGIONES.items():
        anom = sem.get(k)
        out.append({"type": "Feature", "geometry": caja(o, e, s, n), "properties": {
            "kind": "region", "region": k, "nombre": nombre, "anomalia": anom, "fase_semana": fase(anom) if anom is not None else "", **comunes}})
    return out


def main():
    ahora = datetime.now(timezone.utc)
    try:
        gen = json.load(open(OUT, encoding="utf-8")).get("generado_utc", "")
        if ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=24):
            print("enso: datos recientes")
            return 0
    except (OSError, ValueError):
        pass
    try:
        if not F.permitido_por_robots(URL_ONI):
            raise PermissionError("robots.txt no lo permite")
        oni = oni_de(F.get(URL_ONI, timeout=40).decode("utf-8", "replace"))
        sem = semanal_de(F.get(URL_SEMANAL, timeout=60).decode("utf-8", "replace"))
        try:
            disc = discusion_de(F.get(URL_DISC, timeout=40).decode("windows-1252", "replace"))
        except Exception as e:  # noqa: BLE001  sin la discusión se publican los índices
            print(f"enso: discusión no disponible ({e})")
            disc = {}
    except Exception as e:  # noqa: BLE001  se conserva el archivo anterior
        print(f"enso: error {e}")
        return 0
    if not oni or not sem:
        print("enso: datos incompletos; se conserva el anterior")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"),
               "fuente": "NOAA Climate Prediction Center (ONI, SST semanal y discusión ENSO)", "features": features(oni, sem, disc)},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"enso: ONI {oni[-1]}, semana {sem.get('semana')} Niño3.4 {sem.get('nino34')}, estado «{disc.get('estado_en', '')}»")
    return 0


if __name__ == "__main__":
    sys.exit(main())
