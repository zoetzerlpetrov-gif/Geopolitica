#!/usr/bin/env python3
"""Dióxido de carbono (CO2) en la atmósfera: promedio mensual de Mauna Loa (Hawái) y promedio global de la NOAA.

Fuente: páginas públicas «Trends in Atmospheric Carbon Dioxide» del Global Monitoring Laboratory de la NOAA (dominio
público). Su robots.txt prohíbe /webdata/ (los archivos de datos), así que solo se leen las dos páginas permitidas
(/ccgg/trends/ y /ccgg/trends/global.html) y de ellas el último mes y el mismo mes del año anterior.
El CO2 al aire libre varía poco de un lugar a otro (unas pocas ppm; más cerca de ciudades e industrias): no hay una red
abierta de mediciones por ciudad, por eso se muestra el valor de referencia mundial y no uno por punto del mapa.
Salida: vivos/co2.json (una vez al día como máximo; lo llama «Datos en movimiento»).
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "vivos", "co2.json")
AGENTE = "DOMINUS-OSINT clima (github.com/zoetzerlpetrov-gif/Geopolitica)"
PAGINAS = {"mauna_loa": "https://gml.noaa.gov/ccgg/trends/", "global": "https://gml.noaa.gov/ccgg/trends/global.html"}
MESES = {"January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6, "July": 7, "August": 8,
         "September": 9, "October": 10, "November": 11, "December": 12}
CADA_H = 20


def leer_pagina(html):
    """Primeras dos filas «Mes Año: NNN.NN ppm» (último mes y el mismo mes del año anterior) y la fecha de actualización."""
    texto = re.sub(r"<[^>]+>", " ", html).replace("&nbsp;", " ")
    pares = re.findall(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4}):\s+(\d{3}\.\d{1,2})\s*ppm", texto)
    if len(pares) < 2:
        return None
    (m1, a1, v1), (m0, a0, v0) = pares[0], pares[1]
    act = re.search(r"Last updated:\s*([A-Z][a-z]{2}) (\d{1,2}), (\d{4})", texto)
    return {"mes": f"{a1}-{MESES[m1]:02d}", "ppm": float(v1), "mes_anterior": f"{a0}-{MESES[m0]:02d}", "ppm_anterior": float(v0),
            "aumento_ppm": round(float(v1) - float(v0), 2),
            "actualizado": f"{act.group(3)}-{act.group(1)}-{int(act.group(2)):02d}" if act else ""}


def main(ahora=None, pedir=None):
    ahora = ahora or datetime.now(timezone.utc)
    try:
        previo = json.load(open(OUT, encoding="utf-8"))
        if ahora - datetime.strptime(previo["generado_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=CADA_H):
            print("co2: aún vigente")
            return 0
    except (OSError, ValueError, KeyError):
        previo = {}
    datos, errores = {}, []
    for clave, url in PAGINAS.items():
        try:
            if pedir:
                html = pedir(url)
            else:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": AGENTE}), timeout=60) as r:
                    html = r.read().decode("utf-8", "replace")
            d = leer_pagina(html)
            if d:
                datos[clave] = {**d, "url": url}
            else:
                errores.append(f"{clave}: formato no reconocido")
        except Exception as e:  # noqa: BLE001  una página con error no borra lo anterior
            errores.append(f"{clave}: {type(e).__name__}")
    for clave in PAGINAS:
        if clave not in datos and clave in (previo.get("series") or {}):
            datos[clave] = previo["series"][clave]
    if not datos:
        print("co2: sin datos; " + "; ".join(errores))
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": "NOAA Global Monitoring Laboratory (dominio público)",
                   "series": datos, "errores": errores}, f, ensure_ascii=False, separators=(",", ":"))
    print("co2: " + " · ".join(f"{k} {v['mes']} {v['ppm']} ppm (+{v['aumento_ppm']} en un año)" for k, v in datos.items()) + ("; " + "; ".join(errores) if errores else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
