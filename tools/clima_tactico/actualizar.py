#!/usr/bin/env python3
"""Riesgos y clima: corre el generador propio (fetch_data.py) y escribe en vivos/ct/.

Capas de incendios, ciclones, GDACS, pronóstico, calidad del aire, volcanes, clima severo, deslaves, señales de
seguridad y clima espacial. No dependen de ningún otro repositorio: el navegador lee solo data/vivos/ct/.

Cada 6 h. Varias fuentes conservan su archivo anterior si fallan (ciclones, feed de seguridad, incidentes aéreos);
además vivos/ se recupera de la corrida previa, así que un archivo que no se reescribe sigue disponible.
Incendios (NASA FIRMS): con el secreto opcional FIRMS_MAP_KEY usa la API; sin él, el archivo mundial público de 24 h.
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SALIDA = os.path.join(ROOT, "vivos", "ct")
CADA_H = 6


def reciente(ruta, ahora, horas=CADA_H):
    try:
        gen = json.load(open(ruta, encoding="utf-8")).get("generated", "")
        t = datetime.fromisoformat(gen.replace("Z", "+00:00"))
        return ahora - t < timedelta(hours=horas)
    except (OSError, ValueError, AttributeError):
        return False


def main():
    ahora = datetime.now(timezone.utc)
    if reciente(os.path.join(SALIDA, "manifest.json"), ahora) and "--forzar" not in sys.argv:
        print("riesgos y clima: datos recientes")
        return 0
    os.makedirs(SALIDA, exist_ok=True)
    os.environ["CLIMA_TACTICO_DIR"] = SALIDA
    sys.path.insert(0, os.path.dirname(__file__))
    import fetch_data  # noqa: E402  (lee CLIMA_TACTICO_DIR al importarse)
    fetch_data.main()
    return 0


if __name__ == "__main__":
    sys.exit(main())
