"""Flujo HTTP real con Uvicorn y base temporal; no usa credenciales de usuarios."""
import base64
import json
import os
from pathlib import Path
import socket
import sys
import threading
import time
import httpx
import pyotp
import uvicorn
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dominus.app import create_app
from dominus.cli import provision
from dominus.config import Settings


def test_real_http_login_case_csrf_and_logout(tmp_path):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        sock.listen(128)
        port = sock.getsockname()[1]
        origin = 'http://127.0.0.1:' + str(port)
        cfg = Settings(database_url='sqlite:///' + str(tmp_path / 'http.db'), origin=origin, allow_local_http=True,
                       master_key=base64.urlsafe_b64encode(os.urandom(32)).decode(), backup_key=base64.urlsafe_b64encode(os.urandom(32)).decode())
        app = create_app(cfg)
        app.state.store.initialize()
        provision(app.state.store, 'QA HTTP', 'qa-http', output=tmp_path / 'onboarding.json')
        creds = json.loads((tmp_path / 'onboarding.json').read_text())
        server = uvicorn.Server(uvicorn.Config(app, log_level='error', access_log=False))
        thread = threading.Thread(target=lambda: server.run(sockets=[sock]), daemon=True)
        thread.start()
        try:
            for _ in range(50):
                if server.started:
                    break
                time.sleep(.1)
            assert server.started
            with httpx.Client(base_url=origin, trust_env=False, timeout=5) as c:
                assert c.get('/api/health').status_code == 200
                assert 'Espacio privado' in c.get('/').text
                r = c.post('/api/login', headers={'Origin': origin}, json={'username': 'qa-http', 'password': creds['password'], 'otp': pyotp.TOTP(creds['totp_secret']).now()})
                assert r.status_code == 200, r.text
                assert 'HttpOnly' in r.headers['set-cookie']
                c.headers.update({'Origin': origin, 'X-CSRF-Token': r.json()['csrf']})
                org = c.get('/api/me').json()['organizations'][0]['id']
                r = c.post('/api/orgs/' + org + '/cases', json={'title': 'QA HTTP', 'data': {}})
                assert r.status_code == 200, r.text
                cid = r.json()['id']
                assert c.get('/api/orgs/' + org + '/cases/' + cid).json()['title'] == 'QA HTTP'
                assert c.get('/record-assets/fase2-modelo.js').status_code == 200
                assert c.get('/assets/app.js').status_code == 200
                assert c.post('/api/orgs/' + org + '/cases', json={'title': 'x'}, headers={'X-CSRF-Token': 'invalid'}).status_code == 403
                assert c.post('/api/logout').status_code == 200
                assert c.get('/api/me').status_code == 401
        finally:
            server.should_exit = True
            thread.join(timeout=5)
            app.state.store.engine.dispose()
        assert not thread.is_alive()
