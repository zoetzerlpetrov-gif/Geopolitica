#!/usr/bin/env python3
"""Humedad relativa, punto de rocío y agua que se podría obtener del aire, en ~4,500 aeropuertos del mundo.

Fuente: reportes METAR de aeropuertos (archivo «metars.cache.csv.gz» del Aviation Weather Center de la NOAA, dominio
público; se actualiza cada minuto y trae la última observación de cada estación). Una sola descarga por corrida.
De cada observación se toman la temperatura del aire, el punto de rocío, el viento y la nubosidad, y se calcula:

  * Humedad relativa (fórmula de Magnus) y humedad absoluta (gramos de vapor por metro cúbico de aire).
  * Probabilidad de condensación sobre una superficie que se enfría de noche por radiación (colector pasivo de rocío):
    con cielo despejado y poco viento, una lámina expuesta al cielo baja hasta ~5 °C por debajo del aire; con nubes o
    viento casi no se enfría. Si esa caída alcanza el punto de rocío, se forma agua. Es una regla física simplificada,
    no un pronóstico.
  * Agua posible con un colector pasivo (mL por m² en una noche de 10 h): el límite físico es ~0.8 L/m² por noche
    (el enfriamiento radiativo de un cielo despejado es de ~60 W/m²); se reduce por nubes, viento y por la distancia
    entre la temperatura del aire y el punto de rocío. Los colectores reales miden de 0.1 a 0.6 L/m² en noches buenas.
  * Agua posible con un generador eléctrico (condensador a 5 °C): mL por cada m³ de aire que se enfría, y litros por
    día para un equipo de referencia que mueve 200 m³/h con 70 % de eficiencia. Cada equipo publica su propia curva.

Salida: vivos/humedad_estaciones.geojson (cada hora como máximo; lo llama «Datos en movimiento») y
vivos/humedad_historial.json: por aeropuerto y por mes, cuántas observaciones hubo y la suma de mL/m³ del generador y de
mL/m² de rocío (solo observaciones nocturnas), para estimar cuánta agua se obtendría cada mes del año (13 meses).
"""
import csv
import gzip
import io
import json
import math
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "vivos", "humedad_estaciones.geojson")
HIST = os.path.join(ROOT, "vivos", "humedad_historial.json")
MESES_HIST = 13
FUENTE = "https://aviationweather.gov/data/cache/metars.cache.csv.gz"
AGENTE = "DOMINUS-OSINT clima (github.com/zoetzerlpetrov-gif/Geopolitica)"
CADA_MIN = 55
MAX_EDAD_H = 3          # observaciones más viejas no se usan
NOCHE_H = 10            # horas de enfriamiento de una noche típica
ENFRIAMIENTO_MAX_C = 5  # cuánto baja una superficie expuesta al cielo despejado y sin viento
POTENCIA_MAX_W = 60     # enfriamiento radiativo neto de un cielo despejado (W/m²)
CALOR_LATENTE = 2.45e6  # J/kg
BOBINA_C = 5            # temperatura del condensador del generador de referencia
CAUDAL_M3H = 200        # aire que mueve el equipo de referencia
EFICIENCIA = 0.7
NUBES = {"SKC": 0, "CLR": 0, "CAVOK": 0, "NSC": 0, "NCD": 0, "FEW": 0.2, "SCT": 0.45, "BKN": 0.75, "OVC": 1, "OVX": 1, "VV": 1}


def presion_vapor(t):
    """Presión de vapor de saturación (hPa) a t °C (Magnus, sobre agua)."""
    return 6.112 * math.exp(17.62 * t / (243.12 + t))


def humedad_relativa(t, td):
    return max(0.0, min(100.0, 100 * presion_vapor(td) / presion_vapor(t)))


def humedad_absoluta(t, td):
    """Gramos de vapor de agua por m³ de aire a t °C con punto de rocío td."""
    return 216.7 * presion_vapor(td) / (273.15 + t)


def punto_rocio(t, hr):
    """Punto de rocío (°C) desde la temperatura y la humedad relativa (%)."""
    g = math.log(max(hr, 0.1) / 100) + 17.62 * t / (243.12 + t)
    return 243.12 * g / (17.62 - g)


def factor_viento(ms):
    """Con más de ~2 m/s el aire calienta la superficie y el enfriamiento cae; a 7 m/s queda en 30 %."""
    if ms is None or ms <= 2:
        return 1.0
    return max(0.3, 1 - 0.7 * (ms - 2) / 5)


def factor_nubes(nubosidad):
    return 1 - 0.85 * max(0.0, min(1.0, nubosidad))


def agua_del_aire(t, td, viento_ms=None, nubosidad=0.0):
    """Cálculos de una observación. Devuelve un dict con todo lo que muestra la ficha."""
    hr = humedad_relativa(t, td)
    ah = humedad_absoluta(t, td)
    deficit = t - td
    caida = ENFRIAMIENTO_MAX_C * factor_nubes(nubosidad) * factor_viento(viento_ms)
    # Margen: qué tanto pasa la superficie por debajo del punto de rocío (0 = apenas lo toca).
    margen = caida - deficit
    if margen >= 2:
        prob, nivel = "alta", 3
    elif margen >= 0:
        prob, nivel = "media", 2
    elif margen >= -2:
        prob, nivel = "baja", 1
    else:
        prob, nivel = "muy baja", 0
    rocio_ml = 0
    if margen > 0:
        maximo_ml = POTENCIA_MAX_W * NOCHE_H * 3600 / CALOR_LATENTE * 1000  # ≈ 880 mL/m²
        rocio_ml = round(maximo_ml * factor_nubes(nubosidad) * factor_viento(viento_ms) * min(1.0, margen / ENFRIAMIENTO_MAX_C))
    sat_bobina = humedad_absoluta(BOBINA_C, BOBINA_C)
    ml_m3 = max(0.0, ah - sat_bobina) if td > BOBINA_C else 0.0  # g/m³ = mL/m³
    litros_dia = ml_m3 * CAUDAL_M3H * 24 * EFICIENCIA / 1000
    return {"hr": round(hr, 1), "humedad_abs_g_m3": round(ah, 2), "deficit_c": round(deficit, 1), "enfriamiento_c": round(caida, 1),
            "condensacion": prob, "nivel": nivel, "rocio_ml_m2_noche": rocio_ml,
            "generador_ml_m3": round(ml_m3, 2), "generador_l_dia": round(litros_dia, 1)}


def elevacion_sol(lat, lon, hora):
    """Altura aproximada del Sol sobre el horizonte (grados); negativa = de noche. Precisión de ~1°, suficiente aquí."""
    dia = hora.timetuple().tm_yday
    decl = -23.44 * math.cos(math.radians(360 / 365 * (dia + 10)))
    solar = hora.hour + hora.minute / 60 + lon / 15
    angulo = math.radians(15 * (solar - 12))
    la, de = math.radians(lat), math.radians(decl)
    return math.degrees(math.asin(math.sin(la) * math.sin(de) + math.cos(la) * math.cos(de) * math.cos(angulo)))


def nubosidad(fila, encabezados):
    """Mayor cobertura reportada (0 a 1)."""
    valores = [NUBES.get((fila[i] or "").strip(), None) for i, h in enumerate(encabezados) if h == "sky_cover" and i < len(fila)]
    valores = [v for v in valores if v is not None]
    return max(valores) if valores else 0.0


def leer_metar(texto, ahora):
    lector = csv.reader(io.StringIO(texto))
    filas = list(lector)
    i = next((k for k, f in enumerate(filas) if f and f[0] == "raw_text"), None)
    if i is None:
        return []
    enc = filas[i]
    col = {h: enc.index(h) for h in ("station_id", "observation_time", "latitude", "longitude", "temp_c", "dewpoint_c", "wind_speed_kt", "elevation_m")}
    limite = ahora - timedelta(hours=MAX_EDAD_H)
    out, vistos = [], set()
    for f in filas[i + 1:]:
        try:
            sid = f[col["station_id"]]
            lat, lon = float(f[col["latitude"]]), float(f[col["longitude"]])
            t, td = float(f[col["temp_c"]]), float(f[col["dewpoint_c"]])
            hora = datetime.strptime(f[col["observation_time"]][:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
        except (ValueError, IndexError):
            continue
        if sid in vistos or not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == -99.99 or lon == -99.99) or hora < limite or td > t + 0.5:
            continue
        vistos.add(sid)
        try:
            viento = float(f[col["wind_speed_kt"]]) * 0.5144
        except ValueError:
            viento = None
        try:
            elev = float(f[col["elevation_m"]])
        except ValueError:
            elev = None
        out.append({"id": sid, "lat": lat, "lon": lon, "t": t, "td": min(td, t), "viento_ms": viento, "nubes": nubosidad(f, enc),
                    "elev_m": elev if elev is not None and elev < 9000 else None, "hora": hora.strftime("%Y-%m-%dT%H:%M:%SZ")})
    return out


def features(obs):
    out = []
    for o in obs:
        c = agua_del_aire(o["t"], o["td"], o["viento_ms"], o["nubes"])
        p = {"id": o["id"], "t_c": o["t"], "rocio_c": o["td"], "viento_ms": round(o["viento_ms"], 1) if o["viento_ms"] is not None else None,
             "nubes": o["nubes"], "elev_m": o["elev_m"], "hora_utc": o["hora"],
             "noche": elevacion_sol(o["lat"], o["lon"], datetime.strptime(o["hora"], "%Y-%m-%dT%H:%M:%SZ")) < 0, **c}
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(o["lon"], 3), round(o["lat"], 3)]}, "properties": p})
    return out


def acumular(hist, fs, ahora):
    """Suma cada observación nueva al mes de su estación: [observaciones, Σ mL/m³ generador, noches, Σ mL/m² rocío].
    Una estación solo suma una vez por hora de observación (el archivo METAR repite la última si no hay nueva)."""
    est = hist.setdefault("estaciones", {})
    hist.setdefault("desde", ahora.strftime("%Y-%m-%d"))
    nuevas = 0
    for f in fs:
        p = f["properties"]
        hora, mes = p["hora_utc"][:13], p["hora_utc"][:7]
        e = est.setdefault(p["id"], {"u": "", "m": {}})
        if e["u"] >= hora:
            continue
        e["u"] = hora
        a = e["m"].setdefault(mes, [0, 0.0, 0, 0])
        a[0] += 1
        a[1] = round(a[1] + p["generador_ml_m3"], 2)
        if p.get("noche"):
            a[2] += 1
            a[3] += p["rocio_ml_m2_noche"]
        nuevas += 1
    limite = (ahora - timedelta(days=31 * MESES_HIST)).strftime("%Y-%m")
    for e in est.values():
        e["m"] = {m: v for m, v in e["m"].items() if m >= limite}
    hist["actualizado_utc"] = ahora.strftime("%Y-%m-%dT%H:%M:%SZ")
    return nuevas


def main(ahora=None, descargar=None):
    ahora = ahora or datetime.now(timezone.utc)
    try:
        previo = json.load(open(OUT, encoding="utf-8"))
        hecho = datetime.strptime(previo.get("generado_utc", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        if ahora - hecho < timedelta(minutes=CADA_MIN):
            print("humedad: aún vigente")
            return 0
    except (OSError, ValueError):
        pass
    try:
        if descargar:
            texto = descargar()
        else:
            req = urllib.request.Request(FUENTE, headers={"User-Agent": AGENTE})
            with urllib.request.urlopen(req, timeout=90) as r:
                texto = gzip.decompress(r.read()).decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001  si falla se conservan los anteriores
        print(f"humedad: sin METAR ({type(e).__name__}); se conservan los anteriores")
        return 0
    fs = features(leer_metar(texto, ahora))
    if len(fs) < 100:
        print(f"humedad: solo {len(fs)} estaciones; se conservan los anteriores")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "fuente": "Reportes METAR de aeropuertos (NOAA Aviation Weather Center, dominio público); cálculos propios",
                   "referencia": {"bobina_c": BOBINA_C, "caudal_m3h": CAUDAL_M3H, "eficiencia": EFICIENCIA, "noche_h": NOCHE_H,
                                  "enfriamiento_max_c": ENFRIAMIENTO_MAX_C, "potencia_max_w": POTENCIA_MAX_W},
                   "features": fs}, f, ensure_ascii=False, separators=(",", ":"))
    try:
        hist = json.load(open(HIST, encoding="utf-8"))
    except (OSError, ValueError):
        hist = {}
    nuevas = acumular(hist, fs, ahora)
    hist["referencia"] = {"caudal_m3h": CAUDAL_M3H, "eficiencia": EFICIENCIA}
    with open(HIST, "w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False, separators=(",", ":"))
    print(f"humedad: historial con {len(hist['estaciones'])} estaciones ({nuevas} observaciones nuevas)")
    altas = sum(1 for x in fs if x["properties"]["nivel"] == 3)
    print(f"humedad: {len(fs)} estaciones; {altas} con condensación probable alta")
    return 0


if __name__ == "__main__":
    sys.exit(main())
