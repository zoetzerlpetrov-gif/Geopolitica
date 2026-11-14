"""Cisnes blancos y negros: probabilidad base y señales actuales de eventos de alto impacto (cisnes.html, solo admin).

Para cada evento de config/cisnes.json:
  * Probabilidad base a 12 meses: de una tasa anual publicada (base_anual) o, para eventos frecuentes, de una frecuencia
    por año (frecuencia_anual, Poisson: 1 - e^-λ). Sin tasa confiable, no se inventa una: queda null.
  * Señales: menciones en los titulares del Noticiero de las últimas 72 h (vivos/noticiero.json) frente a su propio
    promedio de 72 h en los últimos 30 días (historial guardado aquí), y alertas oficiales vigentes del registro de
    protocolos (vivos/protocolos.geojson) cuyo ámbito coincide, con nivel 3 o más (sin avisos de viaje).
  * Nivel de señales: bajo, normal, elevado o alto. Con base, la probabilidad ajustada multiplica la base por un factor
    entre 0.75 y 2.5 según el nivel (heurística propia, explicada en la página; no es un modelo validado).
Salida: vivos/cisnes.json y vivos/cisnes_historial.json (conteos diarios, 60 días).
"""
import json
import math
import os
import re
import sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
VIVOS = os.path.join(ROOT, "data", "vivos")
CONFIG = os.path.join(ROOT, "config", "cisnes.json")
OUT = os.path.join(VIVOS, "cisnes.json")
HIST = os.path.join(VIVOS, "cisnes_historial.json")
DIAS_HIST = 60
DIAS_BASE = 30
FACTOR = {"bajo": 0.75, "normal": 1.0, "elevado": 1.5, "alto": 2.5}


def leer(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def menciones(notas, rx, desde):
    return sum(1 for n in notas if (n.get("f") or "") >= desde and rx.search(n.get("t") or ""))


def alertas(protocolos, rx, desde_reciente=""):
    """Llamados oficiales y niveles nacionales de amenaza vigentes (nivel ≥ 3; sin avisos de viaje, que son por país)
    cuyo ámbito, título o resumen coincide."""
    out = []
    for f in (protocolos or {}).get("features", []):
        p = f.get("properties", {})
        if p.get("tipo") == "viaje" or str(p.get("estado") or "").startswith(("retir", "conclu", "termin")):
            continue
        if ((p.get("nivel") or 0) >= 3 or p.get("cisne_negro")) and rx.search(" ".join(str(p.get(k) or "") for k in ("ambitos", "titulo", "resumen"))):
            # Solo las emitidas o actualizadas en los últimos 90 días suben el nivel: las campañas permanentes
            # («Ready.gov», «Be Ready») se listan como contexto pero no marcarían «elevado» para siempre.
            out.append({"titulo": p.get("titulo", "")[:160], "nivel": p.get("nivel"), "organismo": p.get("organismo", ""), "url": p.get("url", ""),
                        "fecha": str(p.get("fecha") or "")[:10], "reciente": str(p.get("fecha") or "")[:10] >= desde_reciente})
    return out


def nivel(actual, promedio, n_alertas, dias_hist):
    """Compara las menciones de 72 h con su promedio; con menos de 7 días de historial solo cuentan las alertas."""
    razon = (actual + 1) / (promedio + 1) if dias_hist >= 7 else None
    if n_alertas >= 3 or (razon is not None and razon >= 3 and actual >= 5):
        return "alto", razon
    if n_alertas >= 1 or (razon is not None and razon >= 1.6 and actual >= 3):
        return "elevado", razon
    if razon is not None and razon < 0.5:
        return "bajo", razon
    return "normal", razon


def probabilidad(ev):
    if ev.get("base_anual") is not None:
        return float(ev["base_anual"])
    if ev.get("frecuencia_anual") is not None:
        return 1 - math.exp(-float(ev["frecuencia_anual"]))
    return None


def calcular(cfg, noticiero, protocolos, historial, ahora):
    hoy = ahora.strftime("%Y-%m-%d")
    desde72 = (ahora - timedelta(hours=72)).strftime("%Y-%m-%dT%H:%M:%SZ")
    notas = (noticiero or {}).get("notas") or []
    dias = {d: v for d, v in (historial.get("dias") or {}).items() if d >= (ahora - timedelta(days=DIAS_HIST)).strftime("%Y-%m-%d")}
    previos = sorted(d for d in dias if d < hoy and d >= (ahora - timedelta(days=DIAS_BASE)).strftime("%Y-%m-%d"))
    eventos, conteo_hoy = [], {}
    for ev in cfg.get("eventos", []):
        rx = re.compile(ev["noticias"], re.I)
        actual = menciones(notas, rx, desde72)
        conteo_hoy[ev["id"]] = actual
        serie = [dias[d].get(ev["id"]) for d in previos if dias[d].get(ev["id"]) is not None]
        promedio = sum(serie) / len(serie) if serie else 0.0
        al = alertas(protocolos, re.compile(ev["protocolos"], re.I), (ahora - timedelta(days=90)).strftime("%Y-%m-%d")) if ev.get("protocolos") else []
        al.sort(key=lambda a: (not a["reciente"], a["fecha"]), reverse=False)
        niv, razon = nivel(actual, promedio, sum(a["reciente"] for a in al), len(serie))
        base = probabilidad(ev)
        ajustada = min(0.95, base * FACTOR[niv]) if base is not None and base < 0.5 else base
        ejemplos = [{"t": n["t"][:200], "u": n.get("u", ""), "m": n.get("m", ""), "f": n.get("f", "")}
                    for n in sorted(notas, key=lambda n: n.get("f") or "", reverse=True) if (n.get("f") or "") >= desde72 and rx.search(n.get("t") or "")][:5]
        eventos.append({"id": ev["id"], "nombre": ev["nombre"], "tipo": ev["tipo"], "impacto": ev["impacto"], "base_texto": ev["base_texto"],
                        "fuentes": ev["fuentes"], "prob_base_12m": base, "prob_ajustada_12m": ajustada, "nivel": niv,
                        "menciones_72h": actual, "promedio_72h": round(promedio, 1), "razon": round(razon, 2) if razon is not None else None,
                        "dias_historial": len(serie), "alertas": al[:5], "n_alertas": len(al), "n_alertas_recientes": sum(a["reciente"] for a in al), "notas": ejemplos})
    dias[hoy] = conteo_hoy  # el último conteo del día queda como el del día
    orden = {"alto": 0, "elevado": 1, "normal": 2, "bajo": 3}
    eventos.sort(key=lambda e: (orden[e["nivel"]], -(e["prob_ajustada_12m"] or 0)))
    return eventos, {"dias": dict(sorted(dias.items()))}


def main(ahora=None):
    ahora = ahora or datetime.now(timezone.utc)
    cfg = leer(CONFIG, {})
    noticiero = leer(os.path.join(VIVOS, "noticiero.json"), None)
    if not noticiero:
        print("cisnes: sin noticiero; se conserva el anterior")
        return 0
    eventos, historial = calcular(cfg, noticiero, leer(os.path.join(VIVOS, "protocolos.geojson"), {}), leer(HIST, {}), ahora)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "factores": FACTOR, "eventos": eventos,
                   "nota": cfg.get("_nota", "")}, f, ensure_ascii=False, separators=(",", ":"))
    with open(HIST, "w", encoding="utf-8") as f:
        json.dump(historial, f, ensure_ascii=False, separators=(",", ":"))
    print("cisnes: " + " · ".join(f"{e['id']} {e['nivel']} ({e['menciones_72h']})" for e in eventos))
    return 0


if __name__ == "__main__":
    sys.exit(main())
