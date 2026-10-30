#!/usr/bin/env python3
"""Fusiona dos copias de capas/ antes de publicar la rama datos-capas.

«Cámaras del mundo» y «Construir capas» corren en grupos de concurrencia distintos y los dos reescriben
datos-capas completa. Para que uno no borre lo que acaba de publicar el otro, justo antes de subir se
descarga la versión vigente de la rama y se combina con lo construido:

  BASE     aporta todo lo que no es de cámaras (y el resto de manifest.json).
  CAMARAS  aporta los archivos de cámaras y la entrada familias["camaras"] del manifest.

Con --solo-si-mas-reciente, las cámaras de CAMARAS se usan solo si su actualizado_utc es posterior al
de BASE (lo usa «Construir capas», que en su corrida mensual también reconstruye cámaras).

Uso: fusionar_camaras.py BASE CAMARAS DESTINO [--solo-si-mas-reciente]
"""
import json
import shutil
import sys
from pathlib import Path

# Mismo contrato que verificar_solo_camaras.py: lo único que una corrida de cámaras puede cambiar.
ARCHIVOS_CAMARAS = {"camaras.geojson", "camaras_estado.json", "buscar_camaras.json"}
CARPETAS_CAMARAS = {"camaras_cache"}


def es_de_camaras(rel):
    return rel.parts[0] in CARPETAS_CAMARAS or str(rel) in ARCHIVOS_CAMARAS


def _manifest(carpeta):
    ruta = Path(carpeta) / "manifest.json"
    return json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else {"familias": {}}


def _copiar(origen, destino, rel):
    d = Path(destino) / rel
    d.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(Path(origen) / rel, d)


def fusionar(base, camaras, destino, solo_si_mas_reciente=False):
    """Escribe en DESTINO la combinación. Devuelve True si las cámaras salieron de CAMARAS."""
    base, camaras, destino = Path(base), Path(camaras), Path(destino)
    mb, mc = _manifest(base), _manifest(camaras)
    cam_b = mb.get("familias", {}).get("camaras")
    cam_c = mc.get("familias", {}).get("camaras")
    usar = cam_c is not None and (
        not solo_si_mas_reciente or cam_b is None
        or cam_c.get("actualizado_utc", "") > cam_b.get("actualizado_utc", ""))
    origen_cam = camaras if usar else base

    destino.mkdir(parents=True, exist_ok=True)
    for p in base.rglob("*"):
        rel = p.relative_to(base)
        if p.is_file() and str(rel) != "manifest.json" and not es_de_camaras(rel):
            _copiar(base, destino, rel)
    for p in origen_cam.rglob("*"):
        rel = p.relative_to(origen_cam)
        if p.is_file() and es_de_camaras(rel):
            _copiar(origen_cam, destino, rel)

    manifest = dict(mb)
    familias = dict(mb.get("familias", {}))
    if usar:
        familias["camaras"] = cam_c
    manifest["familias"] = familias
    (destino / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return usar


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 3:
        raise SystemExit(__doc__)
    usadas = fusionar(*args, solo_si_mas_reciente="--solo-si-mas-reciente" in sys.argv)
    print("Cámaras tomadas de", args[1] if usadas else args[0])
