#!/usr/bin/env python3
"""Clima Táctico propio: corre la copia del generador de WarRoomViajero (fetch_data.py) y escribe en vivos/ct/.

Así las capas de incendios, ciclones, GDACS, pronóstico, calidad del aire, volcanes, clima severo, deslaves, señales de
seguridad y clima espacial no dependen de que el repositorio WarRoomViajero siga existiendo. El navegador lee primero
data/vivos/ct/ y, si falta un archivo, cae al sitio de WarRoomViajero.

Cada 6 h (WarRoomViajero corre 2 veces al día). Varias fuentes conservan su archivo anterior si fallan (ciclones,
feed de seguridad, incidentes aéreos); además vivos/ se recupera de la corrida previa, así que un archivo que no se
reescribe sigue disponible.
Incendios (NASA FIRMS) necesita el secreto FIRMS_MAP_KEY: sin él no se publica fires.geojson y el mapa usa el de
WarRoomViajero mientras exista.
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
        print("clima táctico: datos recientes")
        return 0
    os.makedirs(SALIDA, exist_ok=True)
    os.environ["CLIMA_TACTICO_DIR"] = SALIDA
    sys.path.insert(0, os.path.dirname(__file__))
    import fetch_data  # noqa: E402  (lee CLIMA_TACTICO_DIR al importarse)
    fetch_data.main()
    # Sin llave de FIRMS el archivo sale vacío: se borra para que el mapa use el de WarRoomViajero.
    if not os.environ.get("FIRMS_MAP_KEY", "").strip():
        try:
            os.remove(os.path.join(SALIDA, "fires.geojson"))
        except OSError:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
