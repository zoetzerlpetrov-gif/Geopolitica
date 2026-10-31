import importlib.util
import io
import json
import zipfile
from pathlib import Path
import pytest

spec = importlib.util.spec_from_file_location('gtfs_colector', Path(__file__).parents[1] / 'tools/transporte/gtfs.py')
gtfs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gtfs)


def archive():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as z:
        for name in ['agency.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt']:
            z.writestr(name, 'campo\nvalor\n')
    return buffer.getvalue()


def test_copias_fijas_y_hash_sin_consultas_privadas(tmp_path):
    calls = []
    def opener(request, timeout):
        calls.append(request.full_url)
        return io.BytesIO(archive())
    result = gtfs.collect(tmp_path, opener=opener)
    assert set(calls) == {url for _, url in gtfs.SOURCES.values()}
    assert len(result['feeds']) == 3
    assert all(row['status'] == 'ok' and len(row['sha256']) == 64 for row in result['feeds'])
    assert json.loads((tmp_path / 'manifest.json').read_text()) == result


def test_fallo_conserva_hash_fecha_y_archivo_previo(tmp_path):
    prior, output = tmp_path / 'prior', tmp_path / 'out'
    first = gtfs.collect(prior, opener=lambda *a, **k: io.BytesIO(archive()))
    def fail(*args, **kwargs):
        raise OSError('sin conexión')
    last = gtfs.collect(output, previous=prior, opener=fail)
    for old, row in zip(first['feeds'], last['feeds']):
        assert row['collectedAt'] == old['collectedAt']
        assert row['sha256'] == old['sha256']
        assert row['status'] == 'copia anterior; actualización fallida'
        assert (output / row['file']).read_bytes() == (prior / old['file']).read_bytes()


def test_fallo_sin_copia_no_inventa_datos_y_zip_incompleto_rechazado(tmp_path):
    result = gtfs.collect(tmp_path, opener=lambda *a, **k: io.BytesIO(b'no zip'))
    assert all(row['file'] is None and row['collectedAt'] is None for row in result['feeds'])
    with pytest.raises((ValueError, zipfile.BadZipFile)):
        gtfs.validate_zip(b'no zip')
