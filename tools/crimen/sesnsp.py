#!/usr/bin/env python3
"""Cifras oficiales de robos en carreteras y en el transporte (SESNSP, incidencia delictiva estatal del fuero común).

El Secretariado Ejecutivo del Sistema Nacional de Seguridad Pública publica cada mes, por estado, las carpetas de
investigación abiertas por delito (Registro Nacional de Incidencia Delictiva, RNID). Son cifras oficiales, mensuales y
sin lugar exacto; la capa «Carreteras y calles» del mapa son señales de noticias de las últimas 72 h. Las dos se
muestran juntas y por separado (no se suman ni se mezclan).

La página de datos abiertos enlaza los archivos en SharePoint (sspcgob-my.sharepoint.com): primero se abre el enlace
para recibir la galleta de sesión y luego se pide la descarga (así lo hace un navegador).
Delitos que se extraen (por subtipo o tipo): robo a transportista, robo en transporte público (colectivo e individual)
y robo de vehículo automotor. Salida: vivos/sesnsp_robos.json. Se renueva cada 3 días (el SESNSP publica cada mes).
"""
import csv
import http.cookiejar
import io
import json
import os
import re
import sys
import unicodedata
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "vivos", "sesnsp_robos.json")
PAGINA = "https://www.gob.mx/sesnsp/acciones-y-programas/datos-abiertos-de-incidencia-delictiva"
UA = "Mozilla/5.0 (compatible; Geopolitica-monitor/1.0; +https://github.com/zoetzerlpetrov-gif/Geopolitica)"
MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
# (clave, nombre en el mapa, expresión sobre «tipo subtipo» sin acentos y en minúsculas)
GRUPOS = [
    ("transportista", "Robo a transportista (transporte de carga)", r"transportista"),
    ("transporte_publico", "Robo en transporte público (colectivo e individual)", r"transporte publico"),
    ("vehiculo", "Robo de vehículo automotor", r"vehiculo automotor|robo de vehiculo"),
]


def norm(t):
    return unicodedata.normalize("NFD", str(t or "")).encode("ascii", "ignore").decode().lower().strip()


def enlace_estatal(html):
    """Enlace del archivo «(Fuero común - Delitos). Incidencia delictiva estatal» más reciente de la página."""
    limpio = html.replace("&nbsp;", " ").replace("&uacute;", "u").replace("&oacute;", "o")
    for m in re.finditer(r'<a[^>]+href="(https://[^"]*sharepoint\.com/[^"]+)"[^>]*>(.*?)</a>', limpio, re.S):
        texto = norm(re.sub(r"<[^>]+>|\s+", " ", m.group(2)))
        if "fuero comun - delitos" in texto and "estatal" in texto and "tablero" not in texto:
            return m.group(1).replace("&amp;", "&"), re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", m.group(2))).strip()
    return None, None


def descargar(url):
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.addheaders = [("User-Agent", UA)]
    op.open(url, timeout=60).read(2000)  # galleta de sesión (FedAuth) del enlace compartido
    with op.open(url + ("&" if "?" in url else "?") + "download=1", timeout=120) as r:
        return r.read()


def meses_publicados(descripcion):
    """«Enero - septiembre 2026 (…)» → 9; None si la descripción no lo dice (los meses sin publicar vienen en 0)."""
    vistos = [i + 1 for i, m in enumerate(MESES) if re.search(rf"\b{m.lower()}\b", norm(descripcion))]
    return max(vistos) if vistos else None


def resumir(filas, hasta_mes=None):
    """Filas del CSV estatal → {"meses": [...], "por_estado": {estado: {grupo: [n por mes]}}, "nacional": {grupo: [...]}}.
    `hasta_mes`: último mes publicado; sin él, el último mes con algún valor distinto de cero en el país."""
    meses_con_dato = 0
    por_estado, nacional, anio = {}, {}, None
    for f in filas:
        texto = norm(f"{f.get('Tipo de delito', '')} {f.get('Subtipo de delito', '')}")
        grupo = next((k for k, _, rx in GRUPOS if re.search(rx, texto)), None)
        if not grupo:
            continue
        anio = anio or f.get("Año") or f.get("Ano")
        valores = []
        for i, mes in enumerate(MESES):
            v = (f.get(mes) or "").strip()
            valores.append(int(float(v)) if re.fullmatch(r"\d+(\.0+)?", v) else None)
            if valores[-1]:
                meses_con_dato = max(meses_con_dato, i + 1)
        estado = f.get("Entidad", "").strip()
        for destino in (por_estado.setdefault(estado, {}).setdefault(grupo, [0] * 12), nacional.setdefault(grupo, [0] * 12)):
            for i, v in enumerate(valores):
                destino[i] += v or 0
    # Meses sin publicar (en cero al final del año) se recortan.
    meses_con_dato = hasta_mes or meses_con_dato
    for d in [nacional, *por_estado.values()]:
        for g in d:
            d[g] = d[g][:meses_con_dato]
    return {"anio": anio, "meses": MESES[:meses_con_dato], "por_estado": por_estado, "nacional": nacional}


def main():
    if os.path.exists(OUT):
        gen = json.load(open(OUT, encoding="utf-8")).get("generado_utc", "")
        if gen and datetime.now(timezone.utc) - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(days=3):
            print("sesnsp: datos de hace menos de 3 días; se conservan")
            return 0
    req = urllib.request.Request(PAGINA, headers={"User-Agent": UA})
    html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
    url, nombre = enlace_estatal(html)
    if not url:
        print("sesnsp: no se encontró el enlace del archivo estatal; se conserva el anterior")
        return 0
    datos = descargar(url)
    if datos[:2] != b"PK":
        print(f"sesnsp: la descarga no es un ZIP ({datos[:80]!r}); se conserva el anterior")
        return 0
    z = zipfile.ZipFile(io.BytesIO(datos))
    csv_nombre = next(n for n in z.namelist() if n.lower().endswith(".csv"))
    texto = z.read(csv_nombre).decode("utf-8-sig", "replace")
    r = resumir(csv.DictReader(io.StringIO(texto)), meses_publicados(nombre or ""))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": "SESNSP, incidencia delictiva estatal del fuero común (RNID)",
               "archivo": csv_nombre, "descripcion": nombre, "pagina": PAGINA, "grupos": {k: n for k, n, _ in GRUPOS}, **r},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    totales = {k: sum(v) for k, v in r["nacional"].items()}
    print(f"sesnsp: {csv_nombre}, {len(r['por_estado'])} estados, meses {r['meses']}, nacional {totales}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
