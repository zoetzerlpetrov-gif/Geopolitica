#!/usr/bin/env python3
"""Leyes federales vigentes de México con su fecha de publicación y de última reforma (Cámara de Diputados).

Fuente: https://www.diputados.gob.mx/LeyesBiblio/index.htm (robots.txt lo permite; verificado el 21-oct-2026). Es la
compilación oficial de la Cámara: unas 300 leyes, cada una con «DOF dd/mm/aaaa» de publicación, la fecha de su última
reforma (o «Sin reforma») y enlaces al texto vigente. Se lee una vez por semana.

Salida: vivos/leyes_federales.json  {generado_utc, leyes: [{n, ref, pdf, pub, ult}], por_anio: {año: leyes cuya última
reforma fue ese año}}. Ojo: solo trae la ÚLTIMA reforma de cada ley; el historial completo de reformas está en la
página de cada ley y en el DOF (vivos/dof_resumen.json).
"""
import html
import json
import os
import re
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

URL = "https://www.diputados.gob.mx/LeyesBiblio/index.htm"
BASE = "https://www.diputados.gob.mx/LeyesBiblio/"
OUT = os.path.join(ROOT, "vivos", "leyes_federales.json")
CADA_S = 7 * 86400


def iso(dmy):
    d, m, a = dmy.split("/")
    return f"{a}-{m}-{d}"


def leer(html_texto):
    """Filas de la tabla del índice → [{n, ref, pdf, pub, ult}] (ult = None si «Sin reforma»)."""
    out = []
    for fila in re.findall(r"<tr[^>]*>(.*?)</tr>", html_texto, re.S | re.I):
        ref = re.search(r'href="(ref/[^"]+\.htm)"[^>]*>(.*?)</a>', fila, re.S | re.I)
        fechas = re.findall(r"DOF\s+(\d{2}/\d{2}/\d{4})", fila)
        if not ref or not fechas:
            continue
        nombre = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", ref.group(2)))).strip()
        pdf = re.search(r'href="(pdf/[^"]+\.pdf)"', fila, re.I)
        sin = re.search(r"sin reforma", fila, re.I)
        out.append({"n": nombre[:220], "ref": BASE + ref.group(1), "pdf": BASE + pdf.group(1) if pdf else "", "pub": iso(fechas[0]),
                    "ult": None if sin or len(fechas) < 2 else iso(fechas[1])})
    return out


def por_anio(leyes):
    c = {}
    for ley in leyes:
        if ley["ult"]:
            c[ley["ult"][:4]] = c.get(ley["ult"][:4], 0) + 1
    return dict(sorted(c.items()))


def main():
    ahora = datetime.now(timezone.utc)
    try:
        previo = json.load(open(OUT, encoding="utf-8"))
        if ahora.timestamp() - datetime.strptime(previo["generado_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp() < CADA_S:
            print("leyes federales: datos de esta semana; se conservan")
            return 0
    except (OSError, ValueError, KeyError):
        pass
    if not F.permitido_por_robots(URL):
        print("leyes federales: el robots.txt no lo permite")
        return 0
    leyes = leer(F.get(URL, timeout=60).decode("latin-1"))
    if len(leyes) < 100:  # la página cambió de formato: no se pisa lo anterior
        print(f"leyes federales: solo {len(leyes)} filas; se conserva lo anterior")
        return 1
    leyes.sort(key=lambda x: x["ult"] or x["pub"], reverse=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": "Cámara de Diputados, Leyes Federales Vigentes", "url": URL,
               "leyes": leyes, "por_anio": por_anio(leyes)}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"leyes federales: {len(leyes)} leyes; última reforma por año (últimos 5): {list(por_anio(leyes).items())[-5:]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
