"""Convierte el resumen de grafología (Excel de la persona) en config/grafologia.json.

Estructura del Excel: columna A = sección («1. ORDEN …», «GESTOS TIPOS», «FIRMA»…); B = grupo o rasgo;
C = interpretación (o sub-rasgo cuando B está vacía); D = descripción (solo en Temperamento).
Uso: python3 tools/grafologia/desde_excel.py RUTA.xlsx > config/grafologia.json
"""
import json
import re
import sys

import openpyxl


def limpio(v):
    if v is None:
        return ""
    t = re.sub(r"[ \t]+", " ", str(v)).strip()
    # El Excel repite a veces el texto dos veces seguidas («A / B.A / B.»).
    m = len(t) // 2
    if len(t) > 20 and len(t) % 2 == 0 and t[:m] == t[m:]:
        t = t[:m]
    return t


def clave(t):
    t = t.lower()
    for a, b in zip("áéíóúüñ", "aeiouun"):
        t = t.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "_", t).strip("_")[:60]


def convertir(ruta):
    ws = openpyxl.load_workbook(ruta, data_only=True).worksheets[0]
    secciones, sec, grupo, item = [], None, None, None
    for celdas in ws.iter_rows():
        fila = [x.value for x in celdas]
        a, b, c, d = (limpio(x) for x in (list(fila) + [None] * 4)[:4])
        # Los encabezados de grupo vienen con relleno de color (naranja) en la columna B.
        encabezado = len(celdas) > 1 and celdas[1].fill is not None and celdas[1].fill.fill_type == "solid"
        if not (a or b or c or d):
            continue
        if a:
            m = re.match(r"^(\d+)\.\s*([^()]+?)\s*(?:\((.+)\))?$", a)
            nombre, lema = (m.group(2), m.group(3) or "") if m else (a, "")
            sec = {"id": clave(nombre), "nombre": nombre.strip().capitalize(), "lema": (lema or "").capitalize(), "descripcion": "", "grupos": []}
            secciones.append(sec)
            grupo, item = None, None
            continue
        if sec is None:
            continue
        if encabezado and b and len(b) > 40 and not sec["descripcion"]:
            sec["descripcion"] = b
            continue
        if encabezado and b:
            grupo = {"id": clave(b), "nombre": b.capitalize(), "rasgos": []}
            sec["grupos"].append(grupo)
            item = None
            continue
        if grupo is None:
            grupo = {"id": "general", "nombre": "", "rasgos": []}
            sec["grupos"].append(grupo)
        if b:
            partes = [p.strip() for p in b.split(" / ") if p.strip()]
            item = {"id": clave(partes[0]), "nombre": partes[0].capitalize(), "nota": " ".join(partes[1:]),
                    "interpretacion": c if not d else d, "indicadores": c if d else "", "variantes": []}
            grupo["rasgos"].append(item)
        elif c and item is not None:
            item["variantes"].append(c.capitalize())
        elif c:
            grupo["rasgos"].append({"id": clave(c), "nombre": c.capitalize(), "nota": "", "interpretacion": "", "indicadores": "", "variantes": []})
    return {"fuente": "Resumen de grafología de la persona usuaria (Excel), convertido sin cambios de contenido.", "secciones": secciones}


if __name__ == "__main__":
    json.dump(convertir(sys.argv[1]), sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write("\n")
