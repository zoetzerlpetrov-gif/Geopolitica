#!/usr/bin/env python3
"""Bloquea publicar si una actualización de cámaras alteró otra capa."""
import hashlib
import json
from pathlib import Path
import sys


def inventario(base=Path('capas')):
    archivos = {}
    for p in base.rglob('*'):
        if not p.is_file():
            continue
        rel = p.relative_to(base)
        # Lo que «construir.py camaras» escribe (mismo contrato que fusionar_camaras.py), incluidos los grupos por zona
        # y la caché de objetos, que antes faltaban y hacían fallar cada corrida.
        if rel.parts[0] == 'camaras_cache' or str(rel) in ('camaras.geojson', 'camaras.grupos.json', 'camaras.crudo.ndjson.gz',
                                                           'camaras_estado.json', 'buscar_camaras.json', 'manifest.json'):
            continue
        archivos[str(rel)] = hashlib.sha256(p.read_bytes()).hexdigest()
    manifest = json.loads((base / 'manifest.json').read_text())
    return {'archivos': archivos, 'familias': {k: v for k, v in manifest['familias'].items() if k != 'camaras'},
            'manifest_extra': {k: v for k, v in manifest.items() if k not in ('familias', 'generado_utc')}}


if __name__ == '__main__':
    modo, destino = sys.argv[1:]
    actual = inventario()
    if modo == 'guardar':
        Path(destino).write_text(json.dumps(actual, sort_keys=True))
    elif modo == 'verificar':
        if actual != json.loads(Path(destino).read_text()):
            raise SystemExit('Se alteraron datos ajenos a cámaras: publicación cancelada.')
        print('Verificado: todas las demás capas y sus metadatos siguen idénticos.')
    else:
        raise SystemExit('Modo desconocido')
