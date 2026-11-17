"""Publicación de estafas: no regresa a esquemas antiguos ni pierde noticias por una descarga parcial."""
import json
import sys
from pathlib import Path
from datetime import datetime, timezone
import estafas as E

ARCHIVOS = ('estafas.geojson', 'estafas_estado.json')


def cargar(carpeta):
    datos = [json.loads((Path(carpeta) / f).read_text()) for f in ARCHIVOS]
    fc, estado = datos
    if any(d.get('version_esquema', 0) < 2 for d in datos):
        raise ValueError('Esquema antiguo de estafas: no se permite sustituir la publicación vigente.')
    if fc.get('type') != 'FeatureCollection' or not isinstance(fc.get('features'), list) or not isinstance(estado.get('notas'), list):
        raise ValueError('Publicación de estafas incompleta.')
    fecha = datetime.fromisoformat(fc.get('generado_utc', '').replace('Z', '+00:00'))
    if fecha.tzinfo is None or estado.get('generado_utc') != fc.get('generado_utc'):
        raise ValueError('Fechas de estafas incoherentes o sin zona horaria.')
    return fc, estado, fecha


def fusionar(remoto, nuevo, salida):
    previo, estado_previo, fecha_previa = cargar(remoto)
    fc, estado, fecha = cargar(nuevo)
    fuentes = fc.get('fuentes', {})
    if fc['version_esquema'] < previo['version_esquema'] or fecha <= fecha_previa:
        fc, estado = previo, estado_previo
    else:
        # El estado dedicado es la referencia: una corrida que restauró datos-vivos viejos no borra México.
        fc, notas = E.construir({}, {}, estado['notas'] + estado_previo['notas'], fecha.astimezone(timezone.utc))
        fc['fuentes'] = fuentes
        estado = {'version_esquema': 2, 'generado_utc': fc['generado_utc'], 'notas': notas}
    Path(salida).mkdir(parents=True, exist_ok=True)
    for nombre, datos in zip(ARCHIVOS, [fc, estado]):
        (Path(salida) / nombre).write_text(json.dumps(datos, ensure_ascii=False))


if __name__ == '__main__':
    fusionar(*sys.argv[1:])
