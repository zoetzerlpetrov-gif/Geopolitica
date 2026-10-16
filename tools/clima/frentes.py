#!/usr/bin/env python3
"""Frentes fríos y cálidos (América del Norte y océanos vecinos) y eventos de «Norte» en el Golfo de México.

1. Frentes: boletín codificado de posiciones frontales (CODSUS, versión de alta resolución) del Weather Prediction
   Center de NOAA (`wpc.ncep.noaa.gov/discussions/codsus_hr`). Es un producto del gobierno de EUA (dominio público), se
   publica cada 3 h y cubre de ~10° N al Ártico, del Pacífico central al Atlántico. Cada línea trae un tipo (COLD,
   WARM, STNRY, OCFNT, TROF) y una lista de puntos «LLLOOOO»: latitud en décimas de grado norte y longitud en décimas
   de grado oeste (p. ej. 3051001 = 30.5° N, 100.1° O). HIGHS/LOWS traen la presión en hPa y el centro.
   Se consulta como mucho una vez por hora.
2. Nortes: el SMN de México avisa de «evento de Norte» cuando, tras un frente frío, el viento del norte sopla fuerte
   en el Golfo de México y el Istmo de Tehuantepec («Tehuano»). El SMN no tiene una API abierta, así que aquí se
   estima con el pronóstico horario de Open-Meteo (7 días) en puertos del Golfo y del Istmo: hay «Norte» cuando la
   dirección del viento está entre 300° y 60° (del NO al NE) y la ráfaga llega a 50 km/h o más. Es una ESTIMACIÓN
   propia; el aviso oficial es el del SMN (smn.conagua.gob.mx). Se consulta cada 3 h (1 petición).

Salidas: vivos/frentes.geojson y vivos/nortes.geojson. Si una fuente falla se conserva el archivo anterior.
"""
import json
import os
import re
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT_FRENTES = os.path.join(ROOT, "vivos", "frentes.geojson")
OUT_NORTES = os.path.join(ROOT, "vivos", "nortes.geojson")
URL_WPC = "https://www.wpc.ncep.noaa.gov/discussions/codsus_hr"
URL_PRONOSTICO = "https://api.open-meteo.com/v1/forecast"
TIPOS = {"COLD": ("frio", "Frente frío"), "WARM": ("calido", "Frente cálido"), "STNRY": ("estacionario", "Frente estacionario"),
         "OCFNT": ("ocluido", "Frente ocluido"), "TROF": ("vaguada", "Vaguada"), "DRYLINE": ("linea_seca", "Línea seca"),
         "SQLN": ("linea_turbonada", "Línea de turbonada")}

# Puertos y costas donde el SMN suele avisar de Norte (Golfo de México, Península de Yucatán e Istmo de Tehuantepec).
PUERTOS = [("Matamoros, Tamps.", 25.87, -97.50), ("La Pesca, Tamps.", 23.78, -97.75), ("Tampico, Tamps.", 22.25, -97.85),
           ("Tuxpan, Ver.", 20.96, -97.40), ("Nautla, Ver.", 20.21, -96.77), ("Veracruz, Ver.", 19.20, -96.13),
           ("Alvarado, Ver.", 18.77, -95.76), ("Coatzacoalcos, Ver.", 18.15, -94.42), ("Paraíso, Tab.", 18.40, -93.21),
           ("Ciudad del Carmen, Camp.", 18.65, -91.83), ("Campeche, Camp.", 19.85, -90.53), ("Celestún, Yuc.", 20.86, -90.40),
           ("Progreso, Yuc.", 21.28, -89.66), ("Río Lagartos, Yuc.", 21.60, -88.16), ("Cancún, Q. Roo", 21.16, -86.85),
           ("Salina Cruz, Oax. (Istmo)", 16.17, -95.20), ("Juchitán, Oax. (Istmo)", 16.43, -95.02), ("La Ventosa, Oax. (Istmo)", 16.55, -94.95),
           ("Puerto Chiapas, Chis.", 14.70, -92.40)]
ISTMO = "Istmo"
RAFAGA_NORTE = 50   # km/h
RAFAGA_FUERTE = 70
RAFAGA_MUY_FUERTE = 90


def viejo(ruta, horas, ahora):
    try:
        gen = json.load(open(ruta, encoding="utf-8")).get("generado_utc", "")
        return ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) >= timedelta(hours=horas)
    except (OSError, ValueError):
        return True


def guardar(ruta, fc):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    json.dump(fc, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


def punto(cod):
    """«LLLOOOO» (alta resolución) o «LLOOO» (normal) → (lon, lat) en grados; longitud oeste negativa."""
    if len(cod) == 7:
        lat, lon_o = int(cod[:3]) / 10, int(cod[3:]) / 10
    elif len(cod) in (4, 5):
        lat, lon_o = int(cod[:2]), int(cod[2:])
    else:
        return None
    lon = -lon_o if lon_o <= 180 else 360 - lon_o
    return [round(lon, 1), lat]


def valido_de(texto, ahora):
    """«VALID 101600Z» = mes 10, día 16, 00 UTC."""
    m = re.search(r"VALID\s+(\d{2})(\d{2})(\d{2})Z", texto)
    if not m:
        return None
    mes, dia, hora = map(int, m.groups())
    anio = ahora.year - (1 if mes > ahora.month + 6 else 0)
    try:
        return datetime(anio, mes, dia, hora, tzinfo=timezone.utc)
    except ValueError:
        return None


def frentes_de(texto, ahora=None):
    """Texto CODSUS → lista de features (líneas de frentes y puntos de altas/bajas presiones)."""
    ahora = ahora or datetime.now(timezone.utc)
    valido = valido_de(texto, ahora)
    vfecha = valido.strftime("%Y-%m-%dT%H:%M:%SZ") if valido else ""
    # Las líneas que no empiezan con palabra clave continúan la anterior.
    bloques, actual = [], None
    for linea in texto.splitlines():
        partes = linea.split()
        if not partes:
            continue
        if re.fullmatch(r"[A-Z]+", partes[0]) and (partes[0] in TIPOS or partes[0] in ("HIGHS", "LOWS")):
            actual = [partes[0], partes[1:]]
            bloques.append(actual)
        elif actual and all(re.fullmatch(r"\d+", p) for p in partes):
            actual[1].extend(partes)
        else:
            actual = None
    feats = []
    for clave, toks in bloques:
        if clave in ("HIGHS", "LOWS"):
            for i in range(0, len(toks) - 1, 2):
                p = punto(toks[i + 1])
                if not p:
                    continue
                feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": p}, "properties": {
                    "kind": "alta" if clave == "HIGHS" else "baja", "presion_hpa": int(toks[i]), "valido_utc": vfecha,
                    "nombre": f"{'Alta' if clave == 'HIGHS' else 'Baja'} presión {toks[i]} hPa"}})
            continue
        pts = [p for p in (punto(t) for t in toks) if p]
        # Quita puntos repetidos seguidos (el boletín a veces repite el último).
        pts = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
        if len(pts) < 2:
            continue
        kind, nombre = TIPOS[clave]
        mexico = any(14 <= lat <= 32.7 and -118 <= lon <= -86 for lon, lat in pts)
        feats.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": pts}, "properties": {
            "kind": kind, "nombre": nombre, "valido_utc": vfecha, "toca_mexico": mexico,
            "lat_min": min(lat for _, lat in pts)}})
    return feats, vfecha


def nivel_rafaga(r):
    return 3 if r >= RAFAGA_MUY_FUERTE else 2 if r >= RAFAGA_FUERTE else 1 if r >= RAFAGA_NORTE else 0


def del_norte(d):
    return d is not None and (d >= 300 or d <= 60)


def nortes_de(respuestas, puertos=PUERTOS):
    """Respuestas de Open-Meteo (una por puerto, mismo orden) → features con las horas de Norte de los próximos 7 días."""
    feats = []
    for (nombre, lat, lon), r in zip(puertos, respuestas):
        h = (r or {}).get("hourly") or {}
        horas = []
        for t, d, v, g in zip(h.get("time", []), h.get("wind_direction_10m", []), h.get("wind_speed_10m", []), h.get("wind_gusts_10m", [])):
            if g is not None and del_norte(d) and g >= RAFAGA_NORTE:
                horas.append([t, round(d), round(v or 0), round(g)])
        maxr = max((x[3] for x in horas), default=0)
        dias = sorted({x[0][:10] for x in horas})
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": {
            "name": nombre, "istmo": ISTMO in nombre, "nivel": nivel_rafaga(maxr), "rafaga_max_kmh": maxr,
            "inicio": horas[0][0] if horas else "", "fin": horas[-1][0] if horas else "", "dias": dias, "horas": len(horas),
            "serie": [[x[0], x[3]] for x in horas[:: max(1, len(horas) // 40)]]}})
    return feats


def actualizar_frentes(ahora):
    if not viejo(OUT_FRENTES, 1, ahora):
        return "frentes: datos recientes"
    if not F.permitido_por_robots(URL_WPC):
        return "frentes: robots.txt no lo permite"
    texto = F.get(URL_WPC, timeout=40).decode("utf-8", "replace")
    feats, valido = frentes_de(texto, ahora)
    if not any(f["geometry"]["type"] == "LineString" for f in feats):
        return "frentes: boletín sin frentes; se conserva el anterior"
    guardar(OUT_FRENTES, {"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "valido_utc": valido,
                          "fuente": "NOAA WPC, posiciones frontales codificadas (CODSUS)", "features": feats})
    frios = [f for f in feats if f["properties"]["kind"] == "frio"]
    return f"frentes: {len(feats)} objetos, {len(frios)} frentes fríos ({sum(f['properties']['toca_mexico'] for f in frios)} sobre México), válido {valido}"


def actualizar_nortes(ahora):
    if not viejo(OUT_NORTES, 3, ahora):
        return "nortes: datos recientes"
    q = {"latitude": ",".join(str(p[1]) for p in PUERTOS), "longitude": ",".join(str(p[2]) for p in PUERTOS),
         "hourly": "wind_speed_10m,wind_direction_10m,wind_gusts_10m", "forecast_days": 7, "timezone": "UTC"}
    datos = json.loads(F.get(f"{URL_PRONOSTICO}?{urllib.parse.urlencode(q)}", timeout=60))
    datos = datos if isinstance(datos, list) else [datos]
    if len(datos) != len(PUERTOS):
        return f"nortes: respuesta con {len(datos)} puntos (se esperaban {len(PUERTOS)}); se conserva el anterior"
    feats = nortes_de(datos)
    guardar(OUT_NORTES, {"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"),
                         "fuente": "Estimación propia con el pronóstico de Open-Meteo (el aviso oficial es del SMN)",
                         "umbral": f"viento del NO al NE con ráfagas de {RAFAGA_NORTE} km/h o más", "features": feats})
    con = [f["properties"]["name"] for f in feats if f["properties"]["nivel"]]
    return f"nortes: {len(con)} de {len(feats)} puertos con Norte en 7 días: {', '.join(con[:8])}"


def main():
    ahora = datetime.now(timezone.utc)
    for paso in (actualizar_frentes, actualizar_nortes):
        try:
            print(paso(ahora))
        except Exception as e:  # noqa: BLE001  se conserva el archivo anterior
            print(f"{paso.__name__}: error {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
