"""Copias públicas GTFS estáticas, sin consultas ni expedientes de usuarios."""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import shutil
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

SOURCES = {
    'ktmb': ('KTMB · trenes de Malasia', 'https://api.data.gov.my/gtfs-static/ktmb'),
    'mybas-johor': ('BAS.MY · autobuses de Johor Bahru', 'https://api.data.gov.my/gtfs-static/mybas-johor'),
    'mybas-kangar': ('BAS.MY · autobuses de Kangar', 'https://api.data.gov.my/gtfs-static/mybas-kangar'),
}
LIMIT = 25 * 1024 * 1024


def validate_zip(raw: bytes) -> None:
    if len(raw) > LIMIT:
        raise ValueError('GTFS mayor de 25 MB')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        if len(entries) > 100 or sum(x.file_size for x in entries) > 100 * 1024 * 1024:
            raise ValueError('GTFS descomprimido excede límites')
        names = [x.filename for x in entries]
        if len(set(n.lower() for n in names)) != len(names):
            raise ValueError('Nombres duplicados')
        required = {'agency.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt'}
        if not required.issubset(names) or not {'calendar.txt', 'calendar_dates.txt'}.intersection(names):
            raise ValueError('Tablas GTFS incompletas')
        for item in entries:
            if item.flag_bits & 1 or item.file_size > 60 * 1024 * 1024 or item.compress_type not in (0, 8):
                raise ValueError('Entrada GTFS no admitida')
            if item.filename.startswith('/') or '\\' in item.filename or '..' in item.filename.split('/'):
                raise ValueError('Ruta ZIP inválida')
        if archive.testzip():
            raise ValueError('CRC GTFS inválido')


def collect(output: Path, previous: Path | None = None, opener=urllib.request.urlopen) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    prior = {}
    if previous and (previous / 'manifest.json').is_file():
        try:
            prior = {x['id']: x for x in json.loads((previous / 'manifest.json').read_text())['feeds']}
        except (ValueError, KeyError, TypeError):
            prior = {}
    now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    rows = []
    for key, (name, url) in SOURCES.items():
        filename = key + '.zip'
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'DOMINUS-Geopolitica/1.0 (+https://zoetzerlpetrov-gif.github.io/Geopolitica/)'})
            with opener(request, timeout=35) as response:
                raw = response.read(LIMIT + 1)
            validate_zip(raw)
            (output / filename).write_bytes(raw)
            rows.append({'id': key, 'name': name, 'url': url, 'license': 'CC BY 4.0 · data.gov.my / operador',
                         'file': filename, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                         'collectedAt': now, 'attemptedAt': now, 'status': 'ok'})
            print(f'{key}: {len(raw)} bytes')
        except Exception as exc:
            old = prior.get(key)
            path = previous / filename if previous else None
            if old and path and path.is_file() and path.stat().st_size <= LIMIT and old.get('url') == url:
                raw = path.read_bytes()
                if hashlib.sha256(raw).hexdigest() == old.get('sha256'):
                    validate_zip(raw)
                    shutil.copyfile(path, output / filename)
                    rows.append({**old, 'attemptedAt': now, 'status': 'copia anterior; actualización fallida'})
                    print(f'{key}: se conserva copia de {old.get("collectedAt")}')
                    continue
            rows.append({'id': key, 'name': name, 'url': url, 'license': 'CC BY 4.0 · data.gov.my / operador',
                         'file': None, 'bytes': 0, 'sha256': None, 'collectedAt': None,
                         'attemptedAt': now, 'status': 'sin copia disponible'})
            print(f'{key}: sin copia ({type(exc).__name__})')
    manifest = {'format': 'dominus-gtfs-manifest-v1', 'generatedAt': now, 'feeds': rows}
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--previous', type=Path)
    args = parser.parse_args()
    collect(args.output, args.previous)
