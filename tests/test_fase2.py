"""Pruebas sin red de los observadores locales de Fase 2."""
import hashlib
import json
from pathlib import Path
import pytest
from tools.fase2.inspeccionar import inspeccionar, objetivo
from tools.fase2 import multimedia


class Sock:
    def getpeercert(self):
        return {'notAfter': 'Oct 29 12:00:00 2030 GMT', 'issuer': ((('commonName', 'Test CA'),),)}

    def version(self):
        return 'TLSv1.3'

    def cipher(self):
        return ('TLS_AES_256_GCM_SHA384', 'TLSv1.3', 256)


class Conn:
    requests = []
    closed = False

    def __init__(self, host, port, **kwargs):
        assert host == 'example.org' and port == 443
        self.sock = Sock()

    def connect(self):
        pass

    def request(self, method, path, **kwargs):
        self.requests.append((method, path))

    def getresponse(self):
        return self

    status = 302

    def getheaders(self):
        return [('Location', 'https://another.example/'), ('Server', 'test'), ('Set-Cookie', 'secret')]

    def close(self):
        Conn.closed = True


def test_tls_no_redirect_no_secret_headers():
    Conn.requests = []
    r = inspeccionar('https://example.org/a?b=1', True, Conn)
    assert Conn.requests == [('HEAD', '/a?b=1')]
    assert Conn.closed
    assert r['tipo'] == 'servicios'
    assert 'secret' not in json.dumps(r)
    assert '302' in r['registro']['evidencia']
    assert 'TLSv1.3' in r['registro']['tls']


@pytest.mark.parametrize('url', ['http://example.org', 'https://u:p@example.org', 'https://example.org/#a', 'file:///x'])
def test_rechaza_objetivos_invalidos(url):
    with pytest.raises(ValueError):
        objetivo(url)


def test_exige_autorizacion():
    with pytest.raises(ValueError):
        inspeccionar('https://example.org')


def test_hash_y_herramientas_ausentes(tmp_path, monkeypatch):
    p = tmp_path / 'archivo.txt'
    p.write_bytes(b'abc')
    monkeypatch.setattr(multimedia.shutil, 'which', lambda _: None)
    r = multimedia.analizar(p)['registro']
    assert r['sha256'] == hashlib.sha256(b'abc').hexdigest()
    assert 'no instalado' in r['c2pa']
    assert 'no instalado' in r['metadatos']
    assert 'no prueba falsedad' in r['confianza']


def test_multimedia_timeout_no_confunde_con_validacion(tmp_path, monkeypatch):
    p = tmp_path / 'archivo.txt'
    p.write_bytes(b'abc')
    monkeypatch.setattr(multimedia.shutil, 'which', lambda _: '/tool')
    def timeout(*args, **kwargs):
        raise multimedia.subprocess.TimeoutExpired('tool', 45)
    monkeypatch.setattr(multimedia.subprocess, 'run', timeout)
    assert json.loads(multimedia.analizar(p)['registro']['c2pa'])['estado'] == 'error'
