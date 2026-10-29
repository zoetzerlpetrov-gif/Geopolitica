"""Pruebas operativas: aislamiento, permisos, conflictos, copias y conectores."""
import base64
import json
import os
from pathlib import Path
import time
import sys
import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dominus.app import create_app
from dominus.backup import export_all, restore_all
from dominus.cli import rotate_master
from dominus.config import Settings
from dominus.connectors import ConnectorError, PublicHTTP, fetch_source, fingerprint, ofac_parse, validate_parameters
from dominus.db import Base, Case, CaseAccess, Membership, Organization, Secret, Store, User, Watch, Observation, Audit, Session
from dominus.security import PASSWORDS, verify_audit
from dominus.validation import SCHEMA, document, polygon
from dominus.worker import process_one, purge, reserve


def key():
    return base64.urlsafe_b64encode(os.urandom(32)).decode()


@pytest.fixture
def env(tmp_path):
    cfg = Settings(database_url=os.environ.get('TEST_DATABASE_URL', 'sqlite:///' + str(tmp_path / 'test.db')),
                   origin='http://127.0.0.1:8000', master_key=key(), backup_key=key(), allow_local_http=True)
    app = create_app(cfg)
    store = app.state.store
    Base.metadata.drop_all(store.engine)
    store.initialize()
    password = 'QA only temporary password 2026'
    hashed = PASSWORDS.hash(password)
    roles = {'owner': ('o1', 'owner'), 'analyst': ('o1', 'analyst'), 'reviewer': ('o1', 'reviewer'), 'viewer': ('o1', 'viewer'), 'other': ('o2', 'owner')}
    with store.tx() as s:
        s.add_all([Organization(id='o1', name='Cliente 1'), Organization(id='o2', name='Cliente 2')])
        s.flush()
        for name, (org, role) in roles.items():
            secret = pyotp.random_base32()
            s.add(User(id=name, username=name, password_hash=hashed, otp=store.seal(secret, 'otp:' + name)))
            s.flush()
            s.add(Membership(org=org, user=name, role=role))
    clients = {}
    codes = {}
    for name in roles:
        c = TestClient(app, base_url=cfg.origin)
        with store.tx() as s:
            secret = store.open(s.get(User, name).otp, 'otp:' + name)
        code = pyotp.TOTP(secret).now()
        r = c.post('/api/login', json={'username': name, 'password': password, 'otp': code}, headers={'Origin': cfg.origin})
        assert r.status_code == 200, r.text
        c.headers.update({'Origin': cfg.origin, 'X-CSRF-Token': r.json()['csrf']})
        clients[name], codes[name] = c, code
    yield app, store, clients, cfg, codes
    store.engine.dispose()


def create(client, org='o1', data=None):
    r = client.post('/api/orgs/' + org + '/cases', json={'title': 'Expediente sintético', 'data': data or {}})
    assert r.status_code == 200, r.text
    return r.json()['id']


def endpoint(cid, suffix='', org='o1'):
    return '/api/orgs/' + org + '/cases/' + cid + suffix


def test_isolation_including_known_object_id_and_search(env):
    _, _, c, _, _ = env
    cid = create(c['analyst'])
    assert c['other'].get(endpoint(cid)).status_code == 403
    assert c['other'].get(endpoint(cid, org='o2')).status_code == 404
    assert c['other'].get('/api/orgs/o2/cases').json() == []
    assert c['viewer'].get(endpoint(cid)).status_code == 403
    assert c['viewer'].post('/api/orgs/o1/cases', json={'title': 'x'}).status_code == 403


def test_grant_expiry_revoke_and_no_cross_client(env):
    _, store, c, _, _ = env
    cid = create(c['analyst'])
    assert c['analyst'].put(endpoint(cid, '/access'), json={'user': 'viewer', 'permission': 'read', 'days': 1}).status_code == 200
    assert c['viewer'].get(endpoint(cid)).status_code == 200
    assert c['viewer'].put(endpoint(cid), json={'version': 1, 'data': {}, 'reason': 'x'}).status_code == 403
    assert c['analyst'].put(endpoint(cid, '/access'), json={'user': 'other', 'permission': 'read', 'days': 1}).status_code == 422
    assert c['analyst'].delete(endpoint(cid, '/access/viewer')).status_code == 200
    assert c['viewer'].get(endpoint(cid)).status_code == 403
    c['analyst'].put(endpoint(cid, '/access'), json={'user': 'viewer', 'permission': 'read', 'days': 1})
    with store.tx() as s:
        s.get(CaseAccess, (cid, 'viewer')).expires = time.time() - 1
    assert c['viewer'].get(endpoint(cid)).status_code == 403


def test_optimistic_conflict_preserves_first_edit_and_revisions(env):
    _, store, c, _, _ = env
    cid = create(c['analyst'])
    r = c['analyst'].put(endpoint(cid), json={'version': 1, 'data': {}, 'reason': 'Primera edición'})
    assert r.json()['version'] == 2
    assert c['analyst'].put(endpoint(cid), json={'version': 1, 'data': {}, 'reason': 'Edición obsoleta'}).status_code == 409
    assert c['analyst'].get(endpoint(cid)).json()['version'] == 2
    assert len(c['analyst'].get(endpoint(cid, '/revisions')).json()) == 2


def test_independent_authenticated_review_preserves_note(env):
    _, _, c, _, _ = env
    cid = create(c['owner'])
    assert c['owner'].post(endpoint(cid, '/review'), json={'version': 1, 'note': 'Auto revisión'}).status_code == 403
    c['owner'].put(endpoint(cid, '/access'), json={'user': 'reviewer', 'permission': 'review', 'days': 1})
    assert c['reviewer'].post(endpoint(cid, '/review'), json={'version': 1, 'note': 'Revisión sintética'}).status_code == 200
    r = c['owner'].get(endpoint(cid)).json()
    assert r['authenticated_reviews'][0]['note'] == 'Revisión sintética'
    c['owner'].put(endpoint(cid), json={'version': 1, 'data': {}, 'reason': 'Nueva evidencia'})
    assert c['owner'].get(endpoint(cid)).json()['authenticated_reviews'] == []


def test_csrf_host_logout_and_totp_replay(env):
    app, store, c, cfg, codes = env
    cid = create(c['owner'])
    assert c['owner'].post(endpoint(cid, '/review'), headers={'X-CSRF-Token': 'bad'}, json={'version': 1, 'note': 'x'}).status_code == 403
    assert c['owner'].post(endpoint(cid, '/review'), headers={'Origin': 'https://evil.example'}, json={'version': 1, 'note': 'x'}).status_code == 403
    assert c['owner'].get('/api/me', headers={'Host': 'evil.example'}).status_code == 400
    r = c['owner'].post('/api/login', json={'username': 'owner', 'password': 'QA only temporary password 2026', 'otp': codes['owner']})
    assert r.status_code == 401
    assert c['owner'].post('/api/logout-all').status_code == 200
    assert c['owner'].get('/api/me').status_code == 401


def test_rate_limit_persistent_unknown_credentials(env):
    app, store, _, cfg, _ = env
    client = TestClient(app, base_url=cfg.origin, headers={'Origin': cfg.origin})
    for _ in range(8):
        assert client.post('/api/login', json={'username': 'does-not-exist', 'password': 'x', 'otp': '000000'}).status_code == 401
    assert client.post('/api/login', json={'username': 'does-not-exist', 'password': 'x', 'otp': '000000'}).status_code == 429


def test_headers_no_store_no_frame_and_no_private_static(env):
    app, _, c, _, _ = env
    r = c['owner'].get('/')
    assert r.headers['cache-control'] == 'no-store'
    assert r.headers['x-frame-options'] == 'DENY'
    assert "frame-ancestors 'none'" in r.headers['content-security-policy']
    assert c['owner'].get('/record-assets/config.py').status_code == 404
    assert c['owner'].get('/assets/../.env').status_code == 404


def test_secrets_encrypted_never_returned_and_rotation(env):
    _, store, c, _, _ = env
    assert c['viewer'].put('/api/orgs/o1/secrets/sam', json={'value': 'SECRET_TEST'}).status_code == 403
    assert c['owner'].put('/api/orgs/o1/secrets/sam', json={'value': 'SECRET_TEST'}).status_code == 200
    metadata = c['owner'].get('/api/orgs/o1/secrets').text
    assert 'SECRET_TEST' not in metadata
    with store.tx() as s:
        ciphertext = s.get(Secret, ('o1', 'sam')).value
        assert 'SECRET_TEST' not in ciphertext
        assert store.open(ciphertext, 'secret:o1:sam') == 'SECRET_TEST'
    assert c['owner'].put('/api/orgs/o1/secrets/sam', json={'value': 'NEW_SECRET'}).status_code == 200


def test_audit_tamper_detected_and_case_reads_recorded(env):
    _, store, c, _, _ = env
    cid = create(c['owner'])
    c['owner'].get(endpoint(cid))
    log = c['owner'].get('/api/orgs/o1/audit').json()
    assert log['chain_valid']
    assert any(e['action'] == 'case.read' for e in log['events'])
    with store.tx() as s:
        row = s.execute(select(Audit).where(Audit.org == 'o1').limit(1)).scalar_one()
        row.action = 'tampered'
    assert not c['owner'].get('/api/orgs/o1/audit').json()['chain_valid']


def test_encrypted_full_backup_restore_and_wrong_key(env, tmp_path):
    _, store, c, cfg, _ = env
    cid = create(c['owner'])
    blob = export_all(store)
    assert b'Expediente sint' not in blob and b'password_hash' not in blob
    target_cfg = Settings(database_url='sqlite:///' + str(tmp_path / 'restore.db'), origin=cfg.origin, master_key=cfg.master_key, backup_key=cfg.backup_key, allow_local_http=True)
    target = Store(target_cfg)
    target.initialize()
    counts = restore_all(target, blob)
    assert counts['cases'] == 1
    with target.tx() as s:
        row = s.get(Case, cid)
        assert target.open(row.data, 'case:' + cid) == {}
        assert not s.execute(select(Session)).first()
        assert verify_audit(target, s.execute(select(Audit).where(Audit.org == 'o1').order_by(Audit.id)).scalars().all())
    with pytest.raises(ValueError):
        restore_all(target, blob)
    bad = Store(Settings(database_url='sqlite:///' + str(tmp_path / 'bad.db'), origin=cfg.origin, master_key=cfg.master_key, backup_key=key(), allow_local_http=True))
    bad.initialize()
    with pytest.raises(Exception):
        restore_all(bad, blob)
    with bad.tx() as s:
        assert not s.execute(select(Case)).first()
    target.engine.dispose()
    bad.engine.dispose()


def test_master_rotation_preserves_data_audit_revokes_sessions(env):
    _, store, c, cfg, _ = env
    cid = create(c['owner'])
    c['owner'].put('/api/orgs/o1/secrets/sam', json={'value': 'TEST_SECRET'})
    new = key()
    rotate_master(store, new)
    updated = Store(Settings(database_url=cfg.database_url, origin=cfg.origin, master_key=new, backup_key=cfg.backup_key, allow_local_http=True))
    with updated.tx() as s:
        assert updated.open(s.get(Case, cid).data, 'case:' + cid) == {}
        assert updated.open(s.get(Secret, ('o1', 'sam')).value, 'secret:o1:sam') == 'TEST_SECRET'
        assert not s.execute(select(Session)).first()
        assert verify_audit(updated, s.execute(select(Audit).where(Audit.org == 'o1').order_by(Audit.id)).scalars().all())
    updated.engine.dispose()


def test_hold_soft_delete_restore_purge(env):
    _, store, c, _, _ = env
    cid = create(c['owner'])
    path = endpoint(cid)
    assert c['owner'].put(path + '/policy', json={'hold': True, 'retention_days': 1, 'reason': 'Preservación'}).status_code == 200
    assert c['owner'].post(path + '/trash', json={'confirmation': cid, 'reason': 'Borrar'}).status_code == 409
    c['owner'].put(path + '/policy', json={'hold': False, 'retention_days': 1, 'reason': 'Liberación'})
    assert c['owner'].post(path + '/trash', json={'confirmation': cid, 'reason': 'Borrar'}).status_code == 200
    assert c['owner'].get(path).status_code == 404
    purge(store)
    assert c['owner'].post(path + '/restore').status_code == 200
    c['owner'].post(path + '/trash', json={'confirmation': cid, 'reason': 'Borrar'})
    purge(store, now=time.time() + 2 * 86400)
    with store.tx() as s:
        assert s.get(Case, cid) is None
    assert c['owner'].get('/api/orgs/o1/audit').json()['chain_valid']


def test_watch_opsec_limits_retry_preserves_last_result(env):
    _, store, c, _, _ = env
    cid = create(c['analyst'])
    payload = {'source': 'ofac', 'parameters': {'query': 'QA EMPRESA'}, 'interval': 3600, 'acknowledge_external': False}
    assert c['analyst'].post(endpoint(cid, '/watches'), json=payload).status_code == 422
    payload['acknowledge_external'] = True
    r = c['analyst'].post(endpoint(cid, '/watches'), json=payload)
    assert r.status_code == 200, r.text
    wid = r.json()['id']
    assert r.json()['interval'] == 86400
    result = {'source': 'ofac', 'observado_utc': '2026-10-29', 'contrato': 1, 'parcial': False, 'datos': {'resultados': [{'nombre': 'QA candidato'}]}}
    assert process_one(store, lambda *_: result)
    with store.tx() as s:
        w = s.get(Watch, wid)
        assert w.status == 'ok' and w.last_success
        w.due = time.time() - 1
    def fail(*_):
        raise ConnectorError('ERROR with secret should not be logged')
    process_one(store, fail)
    with store.tx() as s:
        w = s.get(Watch, wid)
        assert w.status == 'error' and w.failures == 1 and 'secret' not in w.last_error
        assert len(s.execute(select(Observation).where(Observation.watch == wid)).scalars().all()) == 1
        w.due = time.time() - 1
    process_one(store, lambda *_: {**result, 'observado_utc': '2026-10-30'})
    assert len(c['analyst'].get(endpoint(cid, '/observations')).json()) == 1


def test_lease_prevents_duplicate_claim_and_downgraded_owner_no_write(env):
    _, store, c, _, _ = env
    cid = create(c['analyst'])
    r = c['analyst'].post(endpoint(cid, '/watches'), json={'source': 'ofac', 'parameters': {'query': 'QA Nombre'}, 'interval': 86400, 'acknowledge_external': True})
    with store.tx() as s:
        s.get(Watch, r.json()['id']).lease_until = time.time() + 900
        s.get(Membership, ('o1', 'analyst')).role = 'viewer'
    assert not process_one(store, lambda *_: None)
    assert c['analyst'].put(endpoint(cid), json={'version': 1, 'data': {}, 'reason': 'x'}).status_code == 403


def test_geometry_validation_and_postgis_intersection(env):
    _, store, c, _, _ = env
    cid = create(c['analyst'])
    geo = {'type': 'Polygon', 'coordinates': [[[-100, 18], [-99, 18], [-99, 19], [-100, 19], [-100, 18]]]}
    r = c['analyst'].post(endpoint(cid, '/areas'), json={'title': 'Zona sintética', 'geojson': geo})
    assert r.status_code == 200, r.text
    assert len(c['analyst'].get(endpoint(cid, '/areas?bbox=-100,18,-99,19')).json()) == 1
    assert c['analyst'].get(endpoint(cid, '/areas?bbox=1,1,2,2')).json() == []
    assert c['analyst'].get(endpoint(cid, '/areas?bbox=nan,1,2,2')).status_code == 422
    assert c['other'].get(endpoint(cid, '/areas')).status_code == 403
    with pytest.raises(ValueError):
        polygon({'type': 'Polygon', 'coordinates': [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]})


def test_invalid_record_import_is_atomic(env):
    _, _, c, _, _ = env
    cid = create(c['owner'])
    invalid = {'fase2': {'version': 2, **{k: [] for k in SCHEMA['fase2']}}}
    invalid['fase2']['empresas'] = [{'id': 'x', 'titulo': '<script>alert(1)</script>', 'historial': []}]
    assert c['owner'].put(endpoint(cid), json={'version': 1, 'data': invalid, 'reason': 'Importación'}).status_code == 422
    assert c['owner'].get(endpoint(cid)).json()['version'] == 1
    assert c['owner'].put(endpoint(cid), json={'version': 1, 'data': {'password': 'x'}, 'reason': 'x'}).status_code == 422


def test_quota_global_shared_and_reservation_settled(env):
    _, store, _, _, _ = env
    settle = reserve(store, 'data.epo.org', 4 * 1024 * 1024)
    settle(1024)
    from dominus.db import Quota
    with store.tx() as s:
        q = s.get(Quota, 'data.epo.org')
        assert q.bytes == 1024 and q.hour_count == 1
        q.hour_count = 60
    with pytest.raises(ConnectorError):
        reserve(store, 'data.epo.org', 100)


class FakeHTTP:
    def __init__(self, replies):
        self.replies = replies
        self.downloaded = self.requests = 0
        self.calls = []
    def request(self, method, url, body=None, **kwargs):
        self.calls.append((method, url, body))
        self.requests += 1
        raw = self.replies.pop(0)
        return raw if isinstance(raw, bytes) else json.dumps(raw).encode()


def test_usaspending_real_contract_pagination_and_partial_flag():
    fake = FakeHTTP([{'results': [{'Award ID': 'a'}], 'page_metadata': {'hasNext': True}}, {'results': [{'Award ID': 'b'}], 'page_metadata': {'hasNext': False}}])
    r = fetch_source('usaspending', {'query': 'energy', 'start': '2026-01-01', 'end': '2026-02-01'}, fake)
    assert len(r['datos']['resultados']) == 2 and r['datos']['paginas'] == 2 and not r['parcial']
    assert fake.calls[1][2]['page'] == 2
    assert fake.calls[0][2]['filters']['award_type_codes'] == ['A', 'B', 'C', 'D']
    fake = FakeHTTP([{'results': [], 'page_metadata': {'hasNext': True}}] * 10)
    assert fetch_source('usaspending', {'query': 'energy'}, fake)['parcial']


def test_ofac_namespaces_aliases_cannot_prove_identity_or_accept_xxe():
    xml = b'<sdnList xmlns="https://test"><publshInformation><Publish_Date>2026-10-29</Publish_Date></publshInformation><sdnEntry><uid>1</uid><lastName>EMPRESA QA</lastName><sdnType>Entity</sdnType><akaList><aka><lastName>ALIAS QA</lastName></aka></akaList></sdnEntry></sdnList>'
    result = ofac_parse(xml, 'alias qa')
    assert result['resultados'][0]['id'] == '1'
    assert 'no confirmada' in result['resultados'][0]['coincidencia']
    with pytest.raises(Exception):
        ofac_parse(b'<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><sdnList>&e;</sdnList>', 'test')
    with pytest.raises(ConnectorError):
        ofac_parse(b'<sdnList/>', 'x')


def test_epo_weekly_and_document_no_registration_or_external_dtd():
    fake = FakeHTTP([b'<a href="/publication-server/rest/v1.2/publication-dates/20261028/patents">x</a>', b'<a href="/patents/EP1004359NWB1">p</a><a href="/patents/EP1234567NWA1">q</a>'])
    r = fetch_source('epo_weekly', {'prefix': 'EP1004'}, fake)
    assert r['datos']['total_publicaciones'] == 2 and len(r['datos']['resultados']) == 1
    fake = FakeHTTP([b'<!DOCTYPE ep-patent-document SYSTEM "https://evil.example/dtd"><ep-patent-document date-publ="20261028"><invention-title>QA</invention-title></ep-patent-document>'])
    r = fetch_source('epo_document', {'publication': 'EP1004359NWB1'}, fake)
    assert r['datos']['titulo'] == ['QA']
    assert len(fake.calls) == 1


def test_fixed_destinations_no_url_injection_and_no_redirection(monkeypatch):
    with pytest.raises(ValueError):
        validate_parameters('ofac', {'query': 'hello', 'url': 'http://127.0.0.1'})
    with pytest.raises(ValueError):
        validate_parameters('epo_document', {'publication': '../metadata'})
    with pytest.raises(ConnectorError):
        PublicHTTP().request('GET', 'https://127.0.0.1/')
    monkeypatch.setattr('dominus.connectors.socket.getaddrinfo', lambda *a, **k: [(None, None, None, None, ('127.0.0.1', 443))])
    with pytest.raises(ConnectorError):
        PublicHTTP().request('GET', 'https://data.epo.org/publication-server')


def test_sat_copy_preserves_distinct_status_and_age():
    raw = {'campos': ['rfc', 'nombre', 'situacion'], 'generado_utc': '2026-01-01T00:00:00Z', 'corte_sat': 'enero', 'filas': [['ABC010101AB1', 'QA', 'Sentencia favorable']]}
    r = fetch_source('sat69b', {'rfc': 'ABC010101AB1'}, FakeHTTP([raw]))
    assert r['datos']['resultados'][0]['situacion'] == 'Sentencia favorable'
    assert r['datos']['generado_utc_copia'] == raw['generado_utc']


def test_pagination_checkpoint_resumes_without_changing_period():
    fake = FakeHTTP([{'results': [{'Award ID': 'page11'}], 'page_metadata': {'hasNext': False}}])
    r = fetch_source('usaspending', {'query': 'energy'}, fake, checkpoint={'continuacion': 11, 'periodo': {'desde': '2026-01-01', 'hasta': '2026-02-01'}})
    assert fake.calls[0][2]['page'] == 11
    assert fake.calls[0][2]['filters']['time_period'][0]['end_date'] == '2026-02-01'
    assert r['parcial'] and r['datos']['continuacion'] is None


def test_fingerprints_ignore_row_order_and_download_clock():
    a = {'datos': {'resultados': [{'id': 2}, {'id': 1}]}, 'parcial': False, 'observado_utc': '2026-01-01'}
    b = {'datos': {'resultados': [{'id': 1}, {'id': 2}]}, 'parcial': False, 'observado_utc': '2026-01-02'}
    assert fingerprint(a) == fingerprint(b)


def test_source_old_copy_marked_stale():
    raw = {'campos': ['rfc', 'nombre', 'situacion'], 'generado_utc': '2020-01-01T00:00:00Z', 'filas': [['ABC010101AB1', 'QA', 'Desvirtuado']]}
    r = fetch_source('sat69b', {'rfc': 'ABC010101AB1'}, FakeHTTP([raw]))
    assert r['datos']['stale'] and r['datos']['age_days'] > 14


def test_private_media_process_unsigned_and_permissions(env, tmp_path):
    from PIL import Image
    _, _, c, _, _ = env
    cid = create(c['analyst'])
    image = tmp_path / 'qa.jpg'
    Image.new('RGB', (16, 16), (20, 40, 80)).save(image)
    raw = image.read_bytes()
    r = c['analyst'].post(endpoint(cid, '/c2pa'), files={'file': ('qa.jpg', raw, 'image/jpeg')})
    assert r.status_code == 200, r.text
    assert r.json()['result']['estado'] == 'sin_manifiesto'
    assert not r.json()['stored_original']
    assert c['viewer'].post(endpoint(cid, '/c2pa'), files={'file': ('qa.jpg', raw, 'image/jpeg')}).status_code == 403
    assert c['analyst'].post(endpoint(cid, '/c2pa'), files={'file': ('qa.exe', raw, 'application/octet-stream')}).status_code == 422
