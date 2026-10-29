"""Proceso aislado para C2PA; nunca hace solicitudes a URL presentes en el archivo."""
import json
import os
import httpx
from pathlib import Path
import subprocess
import sys
import tempfile


def limits():
    import resource
    resource.setrlimit(resource.RLIMIT_CPU, (30, 30))
    resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))


def verify_bytes(content, suffix):
    if suffix.lower() not in ('.jpg', '.jpeg', '.png', '.webp', '.mp4', '.pdf', '.avif') or len(content) > 4 * 1024 * 1024:
        raise ValueError('Formato no admitido o mayor de 4 MB.')
    socket_path = os.environ.get('MEDIA_SOCKET')
    if socket_path:
        try:
            with httpx.Client(transport=httpx.HTTPTransport(uds=socket_path), timeout=45, trust_env=False) as client:
                result = client.post('http://validator/verify/' + suffix.lower().lstrip('.'), content=content, headers={'Content-Type': 'application/octet-stream'})
                if result.status_code != 200:
                    raise ValueError('El verificador aislado rechazó el archivo.')
                return result.json()
        except httpx.HTTPError as exc:
            raise ValueError('Verificador aislado no disponible; no se ejecuta fallback en la API.') from exc
    script = Path(__file__).parents[2] / 'tools' / 'fase2' / 'c2pa_sdk.py'
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / ('asset' + suffix.lower())
        source.write_bytes(content)
        try:
            p = subprocess.run([sys.executable, str(script), str(source)], capture_output=True, timeout=40, check=False,
                               preexec_fn=limits if sys.platform != 'win32' else None, cwd=tmp,
                               env={'PATH': os.defpath, 'LANG': 'C.UTF-8'}, close_fds=True)
        except subprocess.TimeoutExpired as exc:
            raise ValueError('La validación excedió el tiempo de proceso.') from exc
    if p.returncode or len(p.stdout) > 100000:
        raise ValueError('No fue posible completar la validación aislada.')
    return json.loads(p.stdout)
