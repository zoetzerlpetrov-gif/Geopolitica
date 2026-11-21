#!/usr/bin/env python3
"""Resumen público, SIN contenido, de los archivos protegidos por plan: solo los campos que revisa el Centro de control
(fecha de generación, fuentes con error y mínimos de config/procesos.json). Así el Centro de control sigue vigilando
que estén al día aunque ya no estén en el sitio público. Salida: <sitio>/data/estado_protegidos.json.
Uso: python3 tools/pages/resumen_protegidos.py <carpeta del sitio> <archivo protegido> [...]"""
import json
import os
import sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(RAIZ, "tools", "estado_procesos"))
from estado_procesos import valor  # noqa: E402


def poner(destino, ruta, v):
    """destino["a"]["b"] = v para la ruta «a.b» (misma forma que el archivo original)."""
    partes = str(ruta).split(".")
    for k in partes[:-1]:
        destino = destino.setdefault(k, {})
    destino[partes[-1]] = v


def resumir(sitio, protegidos, reglas):
    out = {}
    for r in reglas:
        arch = r.get("archivo", "")
        if arch not in protegidos:
            continue
        try:
            datos = json.load(open(os.path.join(sitio, arch), encoding="utf-8"))
        except (OSError, ValueError):
            continue
        res = {}
        for campo in [r.get("campo"), r.get("errores"), (r.get("minimo") or {}).get("campo")]:
            if campo and valor(datos, campo) is not None:
                poner(res, campo, valor(datos, campo))
        out[arch] = res
    return out


def main(sitio, protegidos):
    reglas = json.load(open(os.path.join(RAIZ, "config", "procesos.json"), encoding="utf-8")).get("datos", [])
    res = resumir(sitio, set(protegidos), reglas)
    os.makedirs(os.path.join(sitio, "data"), exist_ok=True)
    with open(os.path.join(sitio, "data", "estado_protegidos.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False)
    print(f"Resumen de {len(res)} archivos protegidos para el Centro de control.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2:]))
