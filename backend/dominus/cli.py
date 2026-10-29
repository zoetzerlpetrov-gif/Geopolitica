"""Administración local: no hay registro público ni claves predeterminadas."""
import argparse
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import time
import pyotp
from sqlalchemy import delete, select
from .backup import export_all, restore_all
from .config import Settings
from .db import (Audit, Cache, Case, CaseReview, Membership, Observation, Organization,
                 Revision, Secret, Session, Store, User, Watch, uid)
from .security import PASSWORDS, ROLES, audit


def write_private(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(data if isinstance(data, bytes) else data.encode())


def provision(store, org_name, username, role='owner', output=None):
    if role not in ROLES or not username or len(username) > 120 or not org_name or len(org_name) > 200:
        raise ValueError('Nombre, organización o rol inválido.')
    password, otp, user_id = secrets.token_urlsafe(24), pyotp.random_base32(), uid()
    with store.tx() as s:
        if s.execute(select(User).where(User.username == username)).first():
            raise ValueError('El usuario ya existe; utiliza members para asignar organizaciones.')
        org = s.execute(select(Organization).where(Organization.name == org_name)).scalar_one_or_none()
        if not org:
            org = Organization(name=org_name)
            s.add(org)
            s.flush()
        user = User(id=user_id, username=username, password_hash=PASSWORDS.hash(password), otp=store.seal(otp, 'otp:' + user_id))
        s.add(user)
        s.flush()
        s.add(Membership(org=org.id, user=user_id, role=role))
        audit(store, s, org.id, 'operator', 'user.provisioned', user_id)
        if output:
            # Si no se puede entregar la credencial, se revierte la creación de la cuenta.
            write_private(output, json.dumps({'username': username, 'password': password, 'totp_secret': otp,
                                             'otpauth': pyotp.TOTP(otp).provisioning_uri(username, issuer_name='DOMINUS'),
                                             'organization': org.id, 'instructions': 'Importar TOTP en autenticador, custodiar contraseña y retirar este archivo del servidor.'}, indent=2))
        return {'id': user_id, 'org': org.id, 'username': username}


def set_user_active(store, username, active):
    with store.tx() as s:
        user = s.execute(select(User).where(User.username == username).with_for_update()).scalar_one()
        user.active = active
        s.execute(delete(Session).where(Session.user == user.id))
        for m in s.execute(select(Membership).where(Membership.user == user.id)).scalars():
            audit(store, s, m.org, 'operator', 'user.enabled' if active else 'user.disabled', user.id)


def rotate_master(store, new_key):
    cfg = Settings(database_url=store.settings.database_url, origin=store.settings.origin, master_key=new_key,
                   backup_key=store.settings.backup_key, allow_local_http=store.settings.allow_local_http).validate()
    if new_key == store.settings.master_key:
        raise ValueError('La nueva clave debe ser distinta.')
    target = Store(cfg)
    with store.tx() as s:
        for cls, field, context in [
            (User, 'otp', lambda r: 'otp:' + r.id),
            (Case, 'data', lambda r: 'case:' + r.id),
            (Case, 'lifecycle', lambda r: 'lifecycle:' + r.id),
            (Revision, 'data', lambda r: 'case:' + r.case),
            (CaseReview, 'note', lambda r: 'review:' + r.id),
            (Watch, 'parameters', lambda r: 'watch:' + r.id),
            (Observation, 'data', lambda r: 'observation:' + r.id),
            (Secret, 'value', lambda r: 'secret:' + r.org + ':' + r.provider),
            (Cache, 'data', lambda r: 'cache:' + r.key),
        ]:
            for row in s.execute(select(cls)).scalars():
                ctx = context(row)
                if getattr(row, field):
                    setattr(row, field, target.seal(store.open(getattr(row, field), ctx), ctx))
        for org in s.execute(select(Organization)).scalars():
            previous = '0' * 64
            key = hashlib.sha256((new_key + ':audit').encode()).digest()
            for row in s.execute(select(Audit).where(Audit.org == org.id).order_by(Audit.id)).scalars():
                row.previous = previous
                fields = json.dumps([row.org, row.actor, row.action, row.target, row.created, previous], separators=(',', ':'))
                row.digest = hmac.new(key, fields.encode(), hashlib.sha256).hexdigest()
                previous = row.digest
            audit(target, s, org.id, 'operator', 'master.rotated', org.id)
        s.execute(delete(Session))
    target.engine.dispose()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest='action', required=True)
    sub.add_parser('init')
    provision_p = sub.add_parser('provision')
    provision_p.add_argument('--organization', required=True)
    provision_p.add_argument('--username', required=True)
    provision_p.add_argument('--role', choices=sorted(ROLES), default='owner')
    provision_p.add_argument('--output', required=True)
    for cmd in ('backup', 'restore'):
        pp = sub.add_parser(cmd)
        pp.add_argument('--file', required=True)
    reset = sub.add_parser('reset-user')
    reset.add_argument('--username', required=True)
    reset.add_argument('--output', required=True)
    for action in ('disable-user', 'enable-user'):
        status_p = sub.add_parser(action)
        status_p.add_argument('--username', required=True)
    sub.add_parser('rotate-master')
    oidc = sub.add_parser('link-sso')
    oidc.add_argument('--username', required=True)
    oidc.add_argument('--subject', required=True)
    a = p.parse_args()
    store = Store(Settings().validate())
    if a.action == 'init':
        store.initialize()
        print('Esquema inicializado.')
    elif a.action == 'provision':
        print(json.dumps(provision(store, a.organization, a.username, a.role, a.output)))
    elif a.action == 'backup':
        write_private(a.file, export_all(store))
        print('Respaldo cifrado escrito en el destino indicado.')
    elif a.action == 'restore':
        print(json.dumps(restore_all(store, Path(a.file).read_bytes())))
    elif a.action == 'reset-user':
        password, otp = secrets.token_urlsafe(24), pyotp.random_base32()
        with store.tx() as s:
            user = s.execute(select(User).where(User.username == a.username).with_for_update()).scalar_one()
            write_private(a.output, json.dumps({'username': user.username, 'password': password, 'totp_secret': otp,
                                               'otpauth': pyotp.TOTP(otp).provisioning_uri(user.username, issuer_name='DOMINUS')}, indent=2))
            user.password_hash, user.otp, user.otp_counter = PASSWORDS.hash(password), store.seal(otp, 'otp:' + user.id), -1
            s.execute(delete(Session).where(Session.user == user.id))
            for m in s.execute(select(Membership).where(Membership.user == user.id)).scalars():
                audit(store, s, m.org, 'operator', 'credentials.reset', user.id)
        print('Credenciales regeneradas y sesiones revocadas; archivo privado creado.')
    elif a.action in ('disable-user', 'enable-user'):
        set_user_active(store, a.username, a.action == 'enable-user')
        print('Estado de cuenta actualizado y sesiones revocadas.')
    elif a.action == 'rotate-master':
        rotate_master(store, os.environ.get('NEW_MASTER_KEY', ''))
        print('Datos recifrados y sesiones revocadas. Actualiza MASTER_KEY y reinicia API/worker; conserva las claves antiguas para copias antiguas.')
    elif a.action == 'link-sso':
        if not store.settings.oidc_issuer:
            raise ValueError('Configura OIDC_ISSUER antes de vincular un sub.')
        with store.tx() as s:
            user = s.execute(select(User).where(User.username == a.username)).scalar_one()
            subject = store.settings.oidc_issuer + '|' + a.subject
            if not a.subject or len(subject) > 300 or '\x00' in subject:
                raise ValueError('Subject OIDC inválido o demasiado largo.')
            user.oidc_subject = subject
            s.execute(delete(Session).where(Session.user == user.id))
        print('Identidad SSO vinculada; no se concede membresía por email ni por claims de organización.')


if __name__ == '__main__':
    main()
