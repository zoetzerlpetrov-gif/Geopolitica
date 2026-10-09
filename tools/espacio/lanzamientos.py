#!/usr/bin/env python3
"""Próximos lanzamientos espaciales (cohetes orbitales y suborbitales con transmisión) en su plataforma de lanzamiento.

Fuente: Launch Library 2 de The Space Devs (`ll.thespacedevs.com/2.3.0/launches/upcoming/`). Según su página, «la
base de datos completa es accesible para todos, gratis», con un límite de 15 consultas por hora sin cuenta; no
publica una licencia formal. Su robots.txt solo trae «señales de contenido» (búsqueda e IA) y no prohíbe este uso.
Se consulta 1 vez cada 6 horas (4 al día) y se guarda solo: nombre, cohete, empresa, misión (nombre, tipo, órbita),
plataforma, fecha prevista, estado y enlace. No se copian descripciones ni imágenes.
Salida: vivos/lanzamientos.geojson.
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "lanzamientos.geojson")
API = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=40&mode=normal"
CADA_H = 6
ESTADO = {"Go": "Confirmado (Go)", "TBC": "Por confirmar", "TBD": "Fecha por definir", "Hold": "En espera", "In Flight": "En vuelo",
          "Success": "Exitoso", "Failure": "Fallido", "Partial Failure": "Falla parcial"}


def _g(d, *ruta):
    for k in ruta:
        d = d.get(k) if isinstance(d, dict) else None
    return d


def features(resultados):
    out = []
    for r in resultados or []:
        pad = r.get("pad") or {}
        try:
            lat, lon = float(pad.get("latitude")), float(pad.get("longitude"))
        except (TypeError, ValueError):
            continue
        estado = _g(r, "status", "abbrev") or ""
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]}, "properties": {
            "id": r.get("id"), "nombre": r.get("name"), "fecha_utc": r.get("net"), "ventana_fin": r.get("window_end"),
            "precision": _g(r, "net_precision", "name") or "", "estado": ESTADO.get(estado, _g(r, "status", "name") or estado), "estado_corto": estado,
            "cohete": _g(r, "rocket", "configuration", "full_name") or _g(r, "rocket", "configuration", "name") or "",
            "empresa": _g(r, "launch_service_provider", "name") or "", "tipo_empresa": _g(r, "launch_service_provider", "type", "name") or _g(r, "launch_service_provider", "type") or "",
            "mision": _g(r, "mission", "name") or "", "tipo_mision": _g(r, "mission", "type") or "", "orbita": _g(r, "mission", "orbit", "abbrev") or _g(r, "mission", "orbit", "name") or "",
            "plataforma": pad.get("name") or "", "lugar": _g(pad, "location", "name") or "",
            "pais_iso3": _g(pad, "country", "alpha_3_code") or _g(pad, "location", "country", "alpha_3_code") or _g(pad, "location", "country_code") or "",
            "url": f"https://thespacedevs.com/launch/{r.get('id')}" if r.get("id") else "https://thespacedevs.com/llapi"}})
    return out


def main():
    ahora = datetime.now(timezone.utc)
    previo = {}
    try:
        previo = json.load(open(OUT, encoding="utf-8"))
        gen = datetime.strptime(previo.get("generado_utc", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        if ahora - gen < timedelta(hours=CADA_H):
            print("lanzamientos: datos recientes")
            return 0
    except (OSError, ValueError):
        pass
    try:
        if not F.permitido_por_robots(API):
            raise PermissionError("robots.txt no lo permite")
        datos = json.loads(F.get(API, timeout=60))
    except Exception as e:  # noqa: BLE001  se conserva el archivo anterior
        print(f"lanzamientos: error {e}")
        return 0
    feats = features(datos.get("results"))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": "The Space Devs, Launch Library 2",
               "features": feats}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"lanzamientos: {len(feats)} próximos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
