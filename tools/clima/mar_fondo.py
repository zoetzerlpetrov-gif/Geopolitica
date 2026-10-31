#!/usr/bin/env python3
"""Mar de fondo: oleaje de periodo largo que llega desde tormentas lejanas (pronóstico de 7 días).

«Mar de fondo» es el oleaje («swell») que se formó lejos y llega a la costa aunque allí no haya viento: olas largas
y potentes que causan corrientes de resaca, inundan malecones y cierran puertos. Aquí se usa el modelo de oleaje
GFS-Wave de NOAA (0.25°, global; dominio público, permite uso comercial) en puntos frente a la costa de México y en
puertos y estrechos del mundo: altura, periodo medio y dirección del oleaje de fondo total, cada 6 h hasta 7 días.
Antes se usaba la API marina de Open-Meteo, que solo es gratuita para uso no comercial.

Regla propia (ESTIMACIÓN, no aviso oficial): hay mar de fondo cuando el oleaje de fondo («swell») pronosticado mide
2 m o más con un periodo de 12 s o más. Nivel: 2-2.9 m moderado, 3-3.9 m fuerte, 4 m o más muy fuerte. En México el
aviso oficial es del SMN y de la Secretaría de Marina (capitanías de puerto).
Se consulta cada 6 h (el modelo corre cada 6 h): 29 descargas de ~2 MB. Salida: vivos/mar_fondo.geojson.
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gfs_puntos as G  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "mar_fondo.geojson")
HORAS = list(range(0, 169, 6))
PASO_H = 6
ALTURA, PERIODO = 2.0, 12.0
# Frente a la costa de México (unos km mar adentro, para que caiga en una celda de mar del modelo).
MEXICO = [("Ensenada, B.C.", 31.80, -116.80), ("San Quintín, B.C.", 30.35, -116.10), ("Guerrero Negro, B.C.S.", 27.90, -114.40),
          ("Bahía Magdalena, B.C.S.", 24.50, -112.20), ("Todos Santos, B.C.S.", 23.40, -110.40), ("Cabo San Lucas, B.C.S.", 22.80, -109.85),
          ("La Paz, B.C.S.", 24.35, -110.45), ("San Felipe, B.C.", 30.95, -114.65), ("Guaymas, Son.", 27.80, -111.00),
          ("Topolobampo, Sin.", 25.45, -109.20), ("Mazatlán, Sin.", 23.10, -106.50), ("San Blas, Nay.", 21.50, -105.40),
          ("Puerto Vallarta, Jal.", 20.60, -105.40), ("Manzanillo, Col.", 19.00, -104.40), ("Lázaro Cárdenas, Mich.", 17.85, -102.20),
          ("Zihuatanejo, Gro.", 17.55, -101.65), ("Acapulco, Gro.", 16.75, -99.90), ("Puerto Escondido, Oax.", 15.78, -97.10),
          ("Huatulco, Oax.", 15.65, -96.10), ("Salina Cruz, Oax.", 16.05, -95.20), ("Puerto Chiapas, Chis.", 14.60, -92.50),
          ("Matamoros, Tamps.", 25.90, -97.00), ("Tampico, Tamps.", 22.30, -97.60), ("Tuxpan, Ver.", 21.00, -97.20),
          ("Veracruz, Ver.", 19.30, -96.00), ("Coatzacoalcos, Ver.", 18.30, -94.40), ("Ciudad del Carmen, Camp.", 18.80, -91.90),
          ("Campeche, Camp.", 19.95, -90.80), ("Progreso, Yuc.", 21.50, -89.70), ("Cancún, Q. Roo", 21.20, -86.60),
          ("Cozumel, Q. Roo", 20.40, -86.80), ("Mahahual, Q. Roo", 18.70, -87.60)]
# Mundo: costas expuestas a mar de fondo y puertos principales (frente a la costa).
MUNDO = [("Honolulu, EUA", 21.20, -157.90), ("Los Ángeles, EUA", 33.60, -118.40), ("San Francisco, EUA", 37.70, -122.70),
         ("Seattle (costa), EUA", 47.60, -124.60), ("Miami, EUA", 25.75, -80.05), ("Nueva York, EUA", 40.40, -73.80),
         ("Outer Banks, EUA", 35.20, -75.40), ("Galveston, EUA", 29.10, -94.60), ("San Juan, Puerto Rico", 18.55, -66.10),
         ("Santo Domingo, R. Dominicana", 18.40, -69.90), ("La Habana, Cuba", 23.25, -82.35), ("Kingston, Jamaica", 17.85, -76.80),
         ("Ciudad de Panamá", 8.80, -79.50), ("Puerto Limón, Costa Rica", 10.00, -82.95), ("Puntarenas, Costa Rica", 9.85, -84.95),
         ("La Libertad, El Salvador", 13.40, -89.35), ("Puerto San José, Guatemala", 13.85, -90.85), ("Cartagena, Colombia", 10.35, -75.60),
         ("Buenaventura, Colombia", 3.85, -77.30), ("Guayaquil (golfo), Ecuador", -2.60, -80.40), ("Callao, Perú", -12.05, -77.25),
         ("Valparaíso, Chile", -33.00, -71.70), ("Mar del Plata, Argentina", -38.05, -57.45), ("Montevideo, Uruguay", -34.95, -56.10),
         ("Río de Janeiro, Brasil", -23.05, -43.15), ("Salvador, Brasil", -13.05, -38.45), ("Fortaleza, Brasil", -3.65, -38.45),
         ("Caracas (La Guaira), Venezuela", 10.70, -66.95), ("Lisboa, Portugal", 38.60, -9.45), ("Nazaré, Portugal", 39.60, -9.15),
         ("Biarritz, Francia", 43.50, -1.65), ("Brest, Francia", 48.30, -4.80), ("A Coruña, España", 43.45, -8.45),
         ("Canarias (Tenerife), España", 28.40, -16.30), ("Casablanca, Marruecos", 33.65, -7.70), ("Dakar, Senegal", 14.65, -17.50),
         ("Lagos, Nigeria", 6.35, 3.40), ("Ciudad del Cabo, Sudáfrica", -33.95, 18.30), ("Durban, Sudáfrica", -29.90, 31.10),
         ("Mombasa, Kenia", -4.10, 39.75), ("Mogadiscio, Somalia", 2.00, 45.40), ("Mumbai, India", 18.90, 72.70),
         ("Colombo, Sri Lanka", 6.95, 79.80), ("Chennai, India", 13.10, 80.40), ("Malé, Maldivas", 4.15, 73.55),
         ("Perth, Australia", -31.95, 115.65), ("Sídney, Australia", -33.85, 151.35), ("Gold Coast, Australia", -28.00, 153.50),
         ("Auckland (costa oeste), N. Zelanda", -36.90, 174.35), ("Suva, Fiyi", -18.20, 178.45), ("Tahití, Polinesia Fr.", -17.50, -149.65),
         ("Manila, Filipinas", 14.55, 120.85), ("Hong Kong", 22.20, 114.25), ("Taiwán (este)", 23.90, 121.75),
         ("Okinawa, Japón", 26.20, 127.55), ("Tokio (bahía), Japón", 35.10, 139.80), ("Busan, Corea del Sur", 35.05, 129.15),
         ("Bali, Indonesia", -8.80, 115.05), ("Yakarta, Indonesia", -6.00, 106.80), ("Singapur (estrecho)", 1.20, 103.85),
         ("Estrecho de Ormuz", 26.55, 56.40), ("Bab el-Mandeb", 12.60, 43.35), ("Canal de Suez (Port Said)", 31.35, 32.35),
         ("Estrecho de Gibraltar", 35.95, -5.60), ("Canal de la Mancha", 50.40, -0.90), ("Islandia (Reikiavik)", 64.10, -22.20)]
PUNTOS = MEXICO + MUNDO


def nivel(h):
    return 3 if h >= 4 else 2 if h >= 3 else 1 if h >= ALTURA else 0


def feature(nombre, lat, lon, r, mexico, paso_h=1):
    h = (r or {}).get("hourly") or {}
    t, alt, per, dirc = h.get("time", []), h.get("swell_wave_height", []), h.get("swell_wave_period", []), h.get("swell_wave_direction", [])
    validos = [i for i, a in enumerate(alt) if a is not None]
    if not validos:
        return None  # celda de tierra para el modelo: no hay oleaje
    eventos = [i for i in validos if alt[i] >= ALTURA and (per[i] or 0) >= PERIODO]
    imax = max(validos, key=lambda i: alt[i])
    emax = max(eventos, key=lambda i: alt[i]) if eventos else None
    paso = max(1, len(validos) // 28)  # una muestra cada ~6 h
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": {
        "name": nombre, "mexico": mexico, "nivel": nivel(alt[emax]) if emax is not None else 0,
        "altura_max_m": round(alt[imax], 1), "periodo_en_max_s": round(per[imax] or 0, 1), "direccion_en_max": round(dirc[imax] or 0) if dirc else None,
        "hora_max": t[imax], "inicio": t[eventos[0]] if eventos else "", "fin": t[eventos[-1]] if eventos else "",
        "horas_evento": len(eventos) * paso_h, "serie": [[t[i], round(alt[i], 2), round(per[i] or 0, 1)] for i in validos[::paso]]}}


def main():
    ahora = datetime.now(timezone.utc)
    try:
        texto = open(OUT, encoding="utf-8").read()
        if "NaN" in texto:
            raise ValueError("archivo anterior con NaN (no es JSON válido): se regenera")
        gen = json.loads(texto).get("generado_utc", "")
        if ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=PASO_H):
            print("mar de fondo: datos recientes")
            return 0
    except (OSError, ValueError):
        pass
    try:
        pasos, corrida = G.series(PUNTOS, G.url_olas, HORAS, {"shts", "mpts", "swdir"}, ahora)
    except Exception as e:  # noqa: BLE001
        print(f"mar de fondo: NOAA no respondió ({e}); se conserva el anterior")
        return 0
    datos = G.a_horario(pasos, PUNTOS, {"shts": "swell_wave_height", "mpts": "swell_wave_period", "swdir": "swell_wave_direction"})
    feats = [f for k, ((nombre, lat, lon), r) in enumerate(zip(PUNTOS, datos)) if (f := feature(nombre, lat, lon, r, k < len(MEXICO), PASO_H))]
    if not feats:
        print("mar de fondo: sin datos; se conserva el anterior")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"),
               "fuente": "Modelo GFS-Wave de NOAA (estimación propia; el aviso oficial es del SMN/SEMAR)",
               "corrida": corrida.strftime("%Y-%m-%dT%H:%MZ"), "pasos": len(pasos),
               "umbral": f"oleaje de fondo de {ALTURA:g} m o más con periodo de {PERIODO:g} s o más", "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    con = [f["properties"]["name"] for f in feats if f["properties"]["nivel"]]
    print(f"mar de fondo: {len(feats)} de {len(PUNTOS)} puntos con datos, {len(con)} con mar de fondo en 7 días ({', '.join(con[:10])}); corrida {corrida:%Y-%m-%d %H} UTC, {len(pasos)} pasos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
