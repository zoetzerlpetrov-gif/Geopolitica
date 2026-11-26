"""Histórico de riesgo de 12 meses por zona, para la matriz de riesgo por sede y por país (Inteligencia corporativa).

El historial diario de eventos se conserva 90 días (eventos/historial/AAAA-MM-DD.json). Este resumen se acumula en cada
corrida de la ingesta y guarda 12 meses: por celda de 0.5° × 0.5° y por mes, cuántos eventos hubo, la suma de su
severidad y cuántos de cada tipo. No guarda títulos ni enlaces (solo conteos). También resume por país (ISO-3).

Uso: python3 tools/corporativo/riesgo_historico.py --eventos eventos --salida eventos/riesgo_historico.json
"""
import argparse
import glob
import json
import os
from datetime import date

CELDA = 0.5
MESES = 12
TIPO_AREA = {"seguridad": "conflicto", "clima": "clima", "salud": "salud", "tecnologia": "corte", "infraestructura": "corte", "geoeconomia": "sancion"}


def celda(lat, lon):
    """Clave de la celda de 0.5° que contiene el punto (esquina suroeste)."""
    f = lambda v: round((v // CELDA) * CELDA, 1) + 0.0  # + 0.0 evita «-0.0»
    return f"{f(lat)},{f(lon)}"


def meses_vigentes(hoy, n=MESES):
    """Los últimos n meses (AAAA-MM), del más antiguo al actual."""
    y, m = hoy.year, hoy.month
    out = []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return sorted(out)


def sumar(destino, clave, mes, tipo, sev):
    d = destino.setdefault(clave, {}).setdefault(mes, {"n": 0, "sev": 0, "tipos": {}})
    d["n"] += 1
    d["sev"] += sev
    d["tipos"][tipo] = d["tipos"].get(tipo, 0) + 1


def acumular(previo, dias, hoy):
    """Suma los días nuevos (dict dia → lista de eventos) al resumen previo y recorta a 12 meses."""
    res = {"celda_grados": CELDA, "dias_incluidos": sorted(set(previo.get("dias_incluidos", []))), "celdas": previo.get("celdas", {}), "paises": previo.get("paises", {})}
    ya = set(res["dias_incluidos"])
    for dia, eventos in sorted(dias.items()):
        if dia in ya:
            continue
        mes = dia[:7]
        for e in eventos:
            sev = int(e.get("severidad") or 2)
            tipo = TIPO_AREA.get(e.get("area_principal"), "otro")
            if e.get("lat") is not None and e.get("lon") is not None:
                sumar(res["celdas"], celda(float(e["lat"]), float(e["lon"])), mes, tipo, sev)
            for iso in (e.get("paises") or [e.get("pais_iso3")]):
                if isinstance(iso, str) and len(iso) == 3:
                    sumar(res["paises"], iso.upper(), mes, tipo, sev)
        res["dias_incluidos"].append(dia)
    vigentes = set(meses_vigentes(hoy))
    for grupo in ("celdas", "paises"):
        for k in list(res[grupo]):
            res[grupo][k] = {m: v for m, v in res[grupo][k].items() if m in vigentes}
            if not res[grupo][k]:
                del res[grupo][k]
    res["dias_incluidos"] = sorted(d for d in set(res["dias_incluidos"]) if d[:7] in vigentes)
    res["meses"] = sorted(vigentes)
    res["generado"] = hoy.isoformat()
    res["nota"] = "Conteos por celda de 0.5° y por país, por mes (12 meses). Sin títulos ni enlaces. Fuente: eventos del mapa de DOMINUS."
    return res


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--eventos", default="eventos")
    a.add_argument("--salida", default="eventos/riesgo_historico.json")
    args = a.parse_args()
    previo = {}
    if os.path.exists(args.salida):
        try:
            previo = json.load(open(args.salida, encoding="utf-8"))
        except (OSError, ValueError):
            previo = {}
    dias = {}
    for f in sorted(glob.glob(os.path.join(args.eventos, "historial", "*.json"))):
        try:
            d = json.load(open(f, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        dia = d.get("dia") or os.path.basename(f)[:10]
        # El día de hoy aún está incompleto: se suma cuando ya terminó.
        if dia < date.today().isoformat():
            dias[dia] = d.get("eventos", [])
    res = acumular(previo, dias, date.today())
    with open(args.salida, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Riesgo histórico: {len(res['celdas'])} celdas, {len(res['paises'])} países, {len(res['dias_incluidos'])} días ({res['meses'][0]} a {res['meses'][-1]}).")


if __name__ == "__main__":
    main()
