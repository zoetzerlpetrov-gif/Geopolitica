#!/usr/bin/env python3
"""Genera config/datos_por_plan.json: qué archivos de data/ necesita cada plan, medido con un navegador real.

La prueba por rol (tools/e2e/roles.mjs) anota los archivos de data/ que pide cada rol al prender sus capas y abrir sus
páginas. Un archivo que pide Demo es público. Uno que solo piden planes superiores queda con el plan más bajo que lo
pidió; uno que solo pide Admin queda como «admin». El Worker (fase 2) sirve esos archivos desde R2 solo a la sesión con
ese plan o superior. Mientras «activo» sea false, nada cambia en el sitio: la lista solo se revisa.
Uso: python3 tools/pages/datos_por_plan.py e2e/informe.json   (escribe config/datos_por_plan.json, conserva «activo»)
"""
import json
import os
import re
import sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SALIDA = os.path.join(RAIZ, "config", "datos_por_plan.json")
ORDEN = ["demo", "recon", "analyst", "command", "admin"]
# Datos que siempre son públicos (configuración del mapa, estado del sitio, índices): no se protegen nunca.
SIEMPRE_PUBLICO = re.compile(r"^data/(events\.json|indice-paises\.json|run-log\.json|base/|estado/|history/)")
# Directorios con muchos archivos que cambian de nombre (rastros, cortes de tiempo): se protegen por prefijo.
PREFIJO = re.compile(r"^(data/vivos/(rastros|rastros-buques|ct|clima|satcat)/)")


def clave(ruta):
    m = PREFIJO.match(ruta)
    return m.group(1) if m else ruta


def calcular(informe):
    pedidos = {}
    for r in (informe or {}).get("resultados", []):
        rol = r.get("rol")
        if rol not in ORDEN:
            continue
        for ruta in r.get("datos") or []:
            if not ruta.startswith("data/") or ".." in ruta or SIEMPRE_PUBLICO.match(ruta):
                continue
            k = clave(ruta)
            pedidos.setdefault(k, set()).add(rol)
    archivos = {}
    for k, roles in sorted(pedidos.items()):
        minimo = min(roles, key=ORDEN.index)
        if minimo != "demo":
            archivos[k] = minimo
    roles_medidos = sorted({r.get("rol") for r in (informe or {}).get("resultados", []) if r.get("datos")}, key=lambda x: ORDEN.index(x) if x in ORDEN else 99)
    return archivos, roles_medidos


def main(ruta_informe):
    informe = json.load(open(ruta_informe, encoding="utf-8"))
    archivos, medidos = calcular(informe)
    if set(medidos) != set(ORDEN):
        print(f"Faltan roles medidos ({medidos}); no se escribe la lista (haría públicos archivos de planes no medidos).")
        return 1
    previo = json.load(open(SALIDA, encoding="utf-8")) if os.path.exists(SALIDA) else {}
    datos = {"_nota": "Generado por tools/pages/datos_por_plan.py a partir de la prueba por rol. «activo»: false = solo lista; "
                      "true = el sitio público deja de publicar estos archivos y el Worker los sirve desde R2 al plan indicado o superior.",
             "activo": bool(previo.get("activo")), "medido": informe.get("fin", ""), "archivos": archivos}
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{len(archivos)} archivos o carpetas protegidos por plan: " + ", ".join(f"{p}={sum(1 for v in archivos.values() if v == p)}" for p in ORDEN[1:]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, "e2e", "informe.json")))
