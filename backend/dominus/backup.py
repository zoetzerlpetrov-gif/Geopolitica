"""Respaldo lógico cifrado, restauración offline solo sobre base vacía."""
import base64
import json
import os
from sqlalchemy import select, text
from .db import Base, Session, LoginAttempt

EXCLUDED = {'sessions', 'login_attempts', 'connector_cache'}


def export_all(store):
    with store.engine.connect() as connection:
        if store.engine.dialect.name == 'postgresql':
            connection = connection.execution_options(isolation_level='REPEATABLE READ')
        with connection.begin():
            tables = {t.name: [dict(r) for r in connection.execute(select(t)).mappings()] for t in Base.metadata.sorted_tables if t.name not in EXCLUDED}
    payload = json.dumps({'format': 'dominus-full-v1', 'tables': tables}, separators=(',', ':')).encode()
    nonce = os.urandom(12)
    return b'DOMINUS1\n' + base64.urlsafe_b64encode(nonce + store.backup_aes.encrypt(nonce, payload, b'dominus-full-v1'))


def restore_all(store, blob):
    if len(blob) > 256 * 1024 * 1024 or not blob.startswith(b'DOMINUS1\n'):
        raise ValueError('Formato de copia incompatible o demasiado grande.')
    raw = base64.urlsafe_b64decode(blob.split(b'\n', 1)[1])
    data = json.loads(store.backup_aes.decrypt(raw[:12], raw[12:], b'dominus-full-v1'))
    expected = {t.name for t in Base.metadata.sorted_tables if t.name not in EXCLUDED}
    if data.get('format') != 'dominus-full-v1' or set(data.get('tables', {})) != expected:
        raise ValueError('Esquema de copia incompatible.')
    with store.engine.begin() as c:
        for t in Base.metadata.sorted_tables:
            if c.execute(select(t).limit(1)).first():
                raise ValueError('La restauración requiere una base completamente vacía.')
        for t in Base.metadata.sorted_tables:
            if t.name in expected and data['tables'][t.name]:
                c.execute(t.insert(), data['tables'][t.name])
        if store.engine.dialect.name == 'postgresql':
            c.execute(text("SELECT setval(pg_get_serial_sequence('audit','id'), COALESCE((SELECT max(id) FROM audit),1), EXISTS(SELECT 1 FROM audit))"))
            c.execute(text('UPDATE areas SET geom=ST_SetSRID(ST_GeomFromGeoJSON(geojson),4326)'))
    return {k: len(v) for k, v in data['tables'].items()}
