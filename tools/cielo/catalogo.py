#!/usr/bin/env python3
"""Catálogo compacto del cielo para el fondo del globo (js/universo.js) → data/base/cielo.json.

Fuente: datos de d3-celestial (Olaf Frohn, licencia BSD-3-Clause), que reúnen catálogos públicos:
- estrellas hasta magnitud 5.5 (Hipparcos / Yale Bright Star Catalogue): ascensión recta, declinación, magnitud, B−V;
- líneas y nombres en español de las 88 constelaciones de la IAU;
- contorno de la Vía Láctea (5 niveles de brillo);
- objetos de cielo profundo brillantes (galaxias, nebulosas, cúmulos);
- elementos orbitales keplerianos de los planetas (JPL, E. M. Standish, válidos 1800–2050).
Se ejecuta a mano cuando se quiera regenerar; el resultado se guarda en el repositorio.
"""
import json
import os
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SALIDA = os.path.join(ROOT, "data", "base", "cielo.json")
BASE = "https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/"
MAG_MAX = 5.5

# Estrellas brillantes con nombre propio (nombre en español). Clave: número HIP.
NOMBRES = {32349: "Sirio", 30438: "Canopus", 69673: "Arturo", 91262: "Vega", 24608: "Capella", 24436: "Rigel", 37279: "Proción",
           27989: "Betelgeuse", 7588: "Achernar", 68702: "Hadar", 97649: "Altair", 60718: "Ácrux", 21421: "Aldebarán", 80763: "Antares",
           65474: "Espiga", 37826: "Pólux", 113368: "Fomalhaut", 102098: "Deneb", 62434: "Mimosa", 49669: "Régulo", 11767: "Polar",
           71683: "Rigil Kentaurus", 33579: "Adhara", 36850: "Cástor", 25336: "Bellatrix", 26727: "Alnitak", 26311: "Alnilam", 25930: "Mintaka"}

# Galaxias, nebulosas y cúmulos (nombre en español, tipo, ascensión recta y declinación en grados, J2000).
OBJETOS = [
    ("Galaxia de Andrómeda (M31)", "galaxia", 10.68, 41.27), ("Galaxia del Triángulo (M33)", "galaxia", 23.46, 30.66),
    ("Gran Nube de Magallanes", "galaxia", 80.89, -69.76), ("Pequeña Nube de Magallanes", "galaxia", 13.19, -72.83),
    ("Galaxia del Remolino (M51)", "galaxia", 202.47, 47.20), ("Galaxia de Bode (M81)", "galaxia", 148.89, 69.07),
    ("Galaxia del Sombrero (M104)", "galaxia", 190.00, -11.62), ("Centaurus A", "galaxia", 201.37, -43.02), ("M87 (agujero negro fotografiado en 2019)", "galaxia", 187.71, 12.39),
    ("Nebulosa de Orión (M42)", "nebulosa", 83.82, -5.39), ("Nebulosa de la Quilla", "nebulosa", 161.27, -59.87), ("Nebulosa de la Laguna (M8)", "nebulosa", 270.90, -24.38),
    ("Pléyades (M45)", "cumulo", 56.75, 24.12), ("Omega Centauri", "cumulo", 201.70, -47.48), ("47 Tucanae", "cumulo", 6.02, -72.08),
    ("Centro de la Vía Láctea (Sagitario A*)", "centro", 266.42, -29.01),
]
PLANETAS = {"mer": "Mercurio", "ven": "Venus", "ter": "Tierra", "mar": "Marte", "jup": "Júpiter", "sat": "Saturno", "ura": "Urano", "nep": "Neptuno"}


def bajar(nombre):
    with urllib.request.urlopen(BASE + nombre, timeout=120) as r:
        return json.loads(r.read())


def r2(x):
    return round(x, 2)


def ra360(x):
    return r2(x % 360)


def main():
    est = bajar("stars.6.json")["features"]
    nombres_hip = {}
    estrellas = []
    for f in sorted(est, key=lambda f: f["properties"]["mag"]):
        p, (ra, dec) = f["properties"], f["geometry"]["coordinates"]
        if p["mag"] > MAG_MAX:
            continue
        try:
            bv = round(float(p.get("bv") or 0.6), 2)
        except ValueError:
            bv = 0.6
        estrellas.append([ra360(ra), r2(dec), round(p["mag"], 2), bv])
        if f["id"] in NOMBRES:
            nombres_hip[f["id"]] = [NOMBRES[f["id"]], ra360(ra), r2(dec)]
    lineas = []
    for f in bajar("constellations.lines.json")["features"]:
        for tramo in f["geometry"]["coordinates"]:
            lineas.append([[ra360(a), r2(d)] for a, d in tramo])
    constelaciones = []
    for f in bajar("constellations.json")["features"]:
        p = f["properties"]
        ra, dec = p["display"][0], p["display"][1]
        constelaciones.append([p.get("es") or p["name"], ra360(ra), r2(dec), int(p.get("rank", 3))])
    via = []
    for f in bajar("mw.json")["features"]:
        nivel = int(f["id"][-1])
        for poli in f["geometry"]["coordinates"]:
            for anillo in poli:
                if len(anillo) < 12:  # manchas diminutas: no se notan en un fondo difuso
                    continue
                paso = max(1, len(anillo) // 30)
                via.append([nivel, [[round(a % 360, 1), round(d, 1)] for a, d in anillo[::paso]]])
    pl = bajar("planets.json")
    planetas = {k: {"nombre": v, "el": {c: pl[k]["elements"][0][c] for c in ("a", "e", "i", "L", "W", "N", "da", "de", "di", "dL", "dW", "dN")}} for k, v in PLANETAS.items()}
    salida = {"fuente": "d3-celestial (Olaf Frohn, BSD-3-Clause): Hipparcos, Yale BSC, IAU; elementos orbitales de JPL (Standish)",
              "mag_max": MAG_MAX, "estrellas": estrellas, "nombres": list(nombres_hip.values()), "lineas": lineas,
              "constelaciones": constelaciones, "via_lactea": via, "objetos": [list(o) for o in OBJETOS], "planetas": planetas}
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))
    print(f"cielo: {len(estrellas)} estrellas, {len(nombres_hip)} con nombre, {len(lineas)} trazos, {len(via)} contornos; {os.path.getsize(SALIDA) // 1024} KB")


if __name__ == "__main__":
    main()
