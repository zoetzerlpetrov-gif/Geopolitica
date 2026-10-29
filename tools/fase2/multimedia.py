"""Hash, metadatos opcionales y resultado c2patool. No clasifica falsedad ni IA."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


def herramienta(nombre, argumentos):
    ejecutable = shutil.which(nombre)
    if not ejecutable:
        return {'estado': 'no instalado', 'salida': None}
    try:
        p = subprocess.run([ejecutable, *argumentos], capture_output=True, text=True, timeout=45, check=False)
        # Limitar el informe; no ejecutar comandos procedentes del archivo.
        salida = p.stdout[:8000]
        try:
            contenido = json.loads(salida)
        except ValueError:
            contenido = salida
        return {'estado': 'ejecutado', 'codigo': p.returncode, 'salida': contenido, 'error': p.stderr[:1500]}
    except (OSError, subprocess.TimeoutExpired) as e:
        return {'estado': 'error', 'error': str(e)[:1000]}


def analizar(ruta, anclas=None):
    archivo = Path(ruta).resolve(strict=True)
    if not archivo.is_file():
        raise ValueError('Selecciona un archivo regular.')
    h = hashlib.sha256()
    with archivo.open('rb') as f:
        for bloque in iter(lambda: f.read(1024 * 1024), b''):
            h.update(bloque)
    meta = herramienta('exiftool', ['-json', '-G', '-s', str(archivo)])
    argumentos = [str(archivo)]
    if anclas:
        pem = Path(anclas).resolve(strict=True)
        argumentos += ['--trust_anchors', str(pem)]
    c2pa = herramienta('c2patool', argumentos)
    fecha = dt.datetime.now(dt.timezone.utc).isoformat()
    registro = {
        'titulo': archivo.name, 'sha256': h.hexdigest(), 'fecha': fecha[:10],
        'origen': 'Archivo aportado por el operador; completar origen y cadena de custodia.',
        'cronologia': f'Procesado {fecha}. Las fechas del sistema de archivos no acreditan captura.',
        'metadatos': json.dumps(meta, ensure_ascii=False)[:12000],
        'c2pa': json.dumps(c2pa, ensure_ascii=False)[:12000],
        'confianza': ('Anclas aportadas por el operador: ' + Path(anclas).name if anclas else 'Sin anclas explícitas aportadas por el operador; revisar configuración de confianza de c2patool.') + ' Interpretar validation_status y errores; código de salida cero por sí solo no prueba autenticidad de la escena. La ausencia de manifiesto no prueba falsedad.',
        'fuente': 'Archivo local; completar referencia documental.',
    }
    return {'formato': 'dominus-fase2-informe-v1', 'tipo': 'multimedia', 'registro': registro}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('archivo')
    p.add_argument('--anclas', help='PEM local de anclas de confianza para c2patool')
    p.add_argument('--salida', required=True)
    a = p.parse_args()
    try:
        informe = analizar(a.archivo, a.anclas)
        Path(a.salida).write_text(json.dumps(informe, ensure_ascii=False, indent=2), encoding='utf-8')
    except (ValueError, OSError) as e:
        p.exit(1, f'No se generó informe: {e}\n')


if __name__ == '__main__':
    main()
