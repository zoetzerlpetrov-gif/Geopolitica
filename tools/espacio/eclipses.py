#!/usr/bin/env python3
"""Eclipses de Sol y de Luna de los próximos años, con la franja de totalidad o anularidad en el mapa (NASA).

Catálogo de Fred Espenak en el sitio de eclipses de la NASA (eclipse.gsfc.nasa.gov): tablas por década con fecha, hora
del máximo, tipo, duración y zona de visibilidad, y para cada eclipse central (total, anular o híbrido) una tabla con
los límites norte y sur de la franja y la línea central cada pocos minutos. Con eso se dibuja el polígono de la franja.
Los eclipses parciales de Sol y los de Luna no tienen franja: van en la lista («otros») con su zona de visibilidad.
Se renueva cada 7 días. Salida: vivos/eclipses.geojson.
"""
import json
import os
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "vivos", "eclipses.geojson")
BASE = "https://eclipse.gsfc.nasa.gov/"
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
MESES = {m: i + 1 for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}
TIPOS = {"Total": "total", "Annular": "anular", "Hybrid": "híbrido", "Partial": "parcial", "Penumbral": "penumbral"}
ANIOS = 6  # horizonte
COORD = re.compile(r"(\d{1,2}) (\d\d\.\d)([NS])\s+(\d{3}) (\d\d\.\d)([EW])")


def get(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def sin_html(t):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t)).strip()


def filas_decada(html, cuerpo):
    """Filas de la tabla de una década: dicts con fecha, hora, tipo, duración, región y enlace a la franja."""
    out = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        celdas = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if len(celdas) < 6:
            continue
        m = re.search(r"(\d{4}) (\w{3}) (\d\d)", sin_html(celdas[0]))
        tipo = next((v for k, v in TIPOS.items() if k in sin_html(celdas[2])), None)
        if not m or not tipo or m.group(2) not in MESES:
            continue
        franja = re.search(r'href="\.\./(SEpath/[^"]+)"', tr)
        out.append({"cuerpo": cuerpo, "fecha": date(int(m.group(1)), MESES[m.group(2)], int(m.group(3))).isoformat(),
                    "hora_utc": sin_html(celdas[1]), "tipo": tipo, "duracion": sin_html(celdas[5]) if cuerpo == "sol" else sin_html(celdas[5]),
                    "region": sin_html(celdas[-1]).replace("[", "(").replace("]", ")"), "franja_url": BASE + franja.group(1) if franja else ""})
    return out


def grados(g, m, h):
    v = int(g) + float(m) / 60
    return -v if h in "SW" else v


def franja(html):
    """Tabla de la franja → (límite norte, límite sur, línea central) como listas de [lon, lat] sin saltos de 360°."""
    norte, sur, centro = [], [], []
    for linea in sin_html(html.replace("\n", " ⏎ ")).split("⏎"):
        if not re.match(r"\s*(\d\d:\d\d|Limits)\b", linea):
            continue
        c = COORD.findall(linea)
        if len(c) < 3:
            continue
        for lista, (la1, la2, lah, lo1, lo2, loh) in zip((norte, sur, centro), c[:3]):
            lista.append([grados(lo1, lo2, loh), grados(la1, la2, lah)])
    for lista in (norte, sur, centro):
        for i in range(1, len(lista)):  # continuidad en el antimeridiano
            while lista[i][0] - lista[i - 1][0] > 180:
                lista[i][0] -= 360
            while lista[i][0] - lista[i - 1][0] < -180:
                lista[i][0] += 360
    return norte, sur, centro


def main():
    if os.path.exists(OUT):
        gen = json.load(open(OUT, encoding="utf-8")).get("generado_utc", "")
        if gen and datetime.now(timezone.utc) - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(days=7):
            print("eclipses: datos de hace menos de 7 días; se conservan")
            return 0
    hoy = date.today()
    hasta = date(hoy.year + ANIOS, 12, 31)
    lista = []
    for decada in sorted({hoy.year // 10 * 10 + 1 - (10 if hoy.year % 10 == 0 else 0), (hoy.year + ANIOS) // 10 * 10 + 1}):
        for cuerpo, carpeta in (("sol", "SEdecade"), ("luna", "LEdecade")):
            try:
                lista += filas_decada(get(f"{BASE}{carpeta}/{carpeta}{decada}.html"), cuerpo)
            except Exception as e:  # noqa: BLE001
                print(f"eclipses: {carpeta}{decada}: {e}")
    lista = sorted({(e["cuerpo"], e["fecha"]): e for e in lista if hoy.isoformat() <= e["fecha"] <= hasta.isoformat()}.values(), key=lambda e: e["fecha"])
    feats, otros = [], []
    for e in lista:
        if e["cuerpo"] == "sol" and e["tipo"] in ("total", "anular", "híbrido") and e["franja_url"]:
            try:
                n, s, c = franja(get(e["franja_url"]))
            except Exception as ex:  # noqa: BLE001
                print(f"eclipses: franja {e['fecha']}: {ex}")
                n = s = c = []
            props = {k: v for k, v in e.items() if k != "cuerpo"}
            if len(n) >= 2 and len(s) >= 2:
                feats.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [n + s[::-1] + [n[0]]]}, "properties": {**props, "parte": "franja"}})
            if len(c) >= 2:
                feats.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": c}, "properties": {**props, "parte": "centro"}})
            if not (n and c):
                otros.append(e)
        else:
            otros.append(e)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "fuente": "NASA Eclipse Web Site (F. Espenak, GSFC)", "otros": otros, "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"eclipses: {len([f for f in feats if f['properties']['parte'] == 'franja'])} franjas; {len(otros)} eclipses sin franja hasta {hasta}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
