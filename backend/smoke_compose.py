"""Aceptación del stack efímero CI; no imprime credenciales ni claves."""
import base64
import io
import json
from pathlib import Path
import subprocess
import time
import httpx
from PIL import Image
import pyotp

ROOT = Path(__file__).resolve().parents[1]
CMD = ['docker', 'compose', '--env-file', str(ROOT / 'backend/.env'), '-f', str(ROOT / 'backend/compose.yml')]


def compose(*args):
    return subprocess.check_output([*CMD, *args], text=True)


def ready(client):
    for _ in range(50):
        try:
            if client.get('/api/health').status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(.2)
    raise RuntimeError('API no disponible en el plazo de aceptación.')


def main():
    creds = json.loads(compose('exec', '-T', 'api', 'cat', '/app/backend/private/ci-onboarding.json'))
    container_id = compose('ps', '-q', 'validator').strip()
    inspection = json.loads(subprocess.check_output(['docker', 'inspect', container_id], text=True))[0]
    assert inspection['HostConfig']['NetworkMode'] == 'none'
    assert not any(v.startswith(('MASTER_KEY=', 'BACKUP_KEY=', 'DATABASE_URL=', 'POSTGRES_PASSWORD=')) for v in inspection['Config']['Env'])
    assert not any(m['Destination'] == '/app/backend/private' for m in inspection['Mounts'])
    with httpx.Client(base_url='http://127.0.0.1:8000', trust_env=False, timeout=45) as c:
        ready(c)
        r = c.post('/api/login', headers={'Origin': 'http://127.0.0.1:8000'}, json={'username': creds['username'], 'password': creds['password'], 'otp': pyotp.TOTP(creds['totp_secret']).now()})
        assert r.status_code == 200, 'Login MFA falló.'
        c.headers.update({'Origin': 'http://127.0.0.1:8000', 'X-CSRF-Token': r.json()['csrf']})
        org = c.get('/api/me').json()['organizations'][0]['id']
        r = c.post('/api/orgs/' + org + '/cases', json={'title': 'Caso CI efímero', 'data': {}})
        assert r.status_code == 200, 'Creación de expediente falló.'
        cid = r.json()['id']
        path = '/api/orgs/' + org + '/cases/' + cid
        raw = io.BytesIO()
        Image.new('RGB', (16, 16)).save(raw, 'JPEG')
        r = c.post(path + '/c2pa', files={'file': ('unsigned-qa.jpg', raw.getvalue(), 'image/jpeg')})
        assert r.status_code == 200 and r.json()['result']['estado'] == 'sin_manifiesto', 'Verificador por socket falló.'
        r = c.post(path + '/evidence', json={'version': 1, 'filename': 'ci.txt', 'content': base64.b64encode(b'QA original').decode(), 'source': 'CI sintetico', 'acquired_at': '2026-10-29T10:00:00-06:00', 'custodian': 'QA', 'reason': 'Aceptacion CI'})
        assert r.status_code == 200, 'Recepcion Fase 4 fallo.'
        eid = r.json()['id']
        assert c.get(path + '/evidence/' + eid + '/download').content == b'QA original'
        assert c.get('/assets/phase4.js').status_code == 200
        compose('restart', 'api')
        ready(c)
        assert c.get(path).json()['title'] == 'Caso CI efímero', 'Persistencia tras reinicio falló.'
        assert c.get(path + '/evidence/' + eid + '/download').content == b'QA original', 'Original tras reinicio fallo.'
        assert c.post('/api/logout').status_code == 200
        assert c.get('/api/me').status_code == 401
    print('Stack Docker: MFA, HTTP, PostGIS, C2PA sin red/sin claves, Fase 4A originales/custodia, persistencia tras reinicio y cierre de sesión correctos.')


if __name__ == '__main__':
    main()
