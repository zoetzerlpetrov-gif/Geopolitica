import hashlib
import hmac
import json
import secrets
import time
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import HTTPException
import pyotp
from sqlalchemy import select
from .db import Audit, Case, CaseAccess, LoginAttempt, Membership, Organization, Session, User

PASSWORDS = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
DUMMY_HASH = PASSWORDS.hash(secrets.token_urlsafe(32))
ROLES = {'owner', 'analyst', 'reviewer', 'viewer'}


def audit(store, s, org, actor, action, target):
    # Bloqueo por organización serializa la cadena entre múltiples workers.
    s.execute(select(Organization).where(Organization.id == org).with_for_update()).scalar_one()
    prev = s.execute(select(Audit).where(Audit.org == org).order_by(Audit.id.desc()).limit(1)).scalar_one_or_none()
    now = time.time()
    previous = prev.digest if prev else '0' * 64
    fields = json.dumps([org, actor, action, target, now, previous], separators=(',', ':'))
    key = hashlib.sha256((store.settings.master_key + ':audit').encode()).digest()
    digest = hmac.new(key, fields.encode(), hashlib.sha256).hexdigest()
    s.add(Audit(org=org, actor=actor, action=action, target=target, created=now, previous=previous, digest=digest))
    s.flush()


def verify_audit(store, rows):
    previous = '0' * 64
    key = hashlib.sha256((store.settings.master_key + ':audit').encode()).digest()
    for row in rows:
        fields = json.dumps([row.org, row.actor, row.action, row.target, row.created, row.previous], separators=(',', ':'))
        expected = hmac.new(key, fields.encode(), hashlib.sha256).hexdigest()
        if row.previous != previous or not hmac.compare_digest(expected, row.digest):
            return False
        previous = row.digest
    return True


def rate_limit(store, keys, limit=8, seconds=900):
    now = time.time()
    exceeded = False
    with store.tx() as s:
        for key in keys:
            # La inserción idempotente evita la carrera de primera petición.
            table = LoginAttempt.__table__
            dialect = store.engine.dialect.name
            if dialect == 'postgresql':
                from sqlalchemy.dialects.postgresql import insert
            else:
                from sqlalchemy.dialects.sqlite import insert
            s.execute(insert(table).values(key=key, count=0, window=now).on_conflict_do_nothing())
            row = s.execute(select(LoginAttempt).where(LoginAttempt.key == key).with_for_update()).scalar_one()
            if now - row.window >= seconds:
                row.window, row.count = now, 0
            row.count += 1
            exceeded |= row.count > limit
    if exceeded:
        raise HTTPException(429, 'Límite temporal de intentos; espera antes de volver a intentar.')


def login(store, username, password, code):
    # Llamador aplica límites persistentes antes de esta función.
    with store.tx() as s:
        user = s.execute(select(User).where(User.username == username).with_for_update()).scalar_one_or_none()
        try:
            valid = PASSWORDS.verify(user.password_hash if user else DUMMY_HASH, password)
        except (VerificationError, InvalidHashError):
            valid = False
        if not user or not user.active or not valid:
            raise HTTPException(401, 'Credenciales inválidas.')
        secret = store.open(user.otp, 'otp:' + user.id)
        counter = int(time.time()) // 30
        totp = pyotp.TOTP(secret)
        matches = [c for c in (counter - 1, counter, counter + 1) if c > user.otp_counter and hmac.compare_digest(totp.at(c * 30), code)]
        if not matches:
            raise HTTPException(401, 'Credenciales inválidas o código MFA reutilizado.')
        user.otp_counter = max(matches)
        return create_session(s, user.id)


def create_session(s, user_id):
    token, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
    s.add(Session(token_hash=hashlib.sha256(token.encode()).hexdigest(), user=user_id, csrf=csrf, expires=time.time() + 8 * 3600))
    return token, csrf


def principal(store, request):
    token = request.cookies.get('dominus_session', '')
    if not token:
        raise HTTPException(401, 'Inicia sesión.')
    with store.tx() as s:
        session = s.get(Session, hashlib.sha256(token.encode()).hexdigest())
        if not session or session.expires <= time.time():
            raise HTTPException(401, 'Sesión vencida o revocada.')
        user = s.get(User, session.user)
        if not user or not user.active:
            raise HTTPException(401, 'Sesión revocada.')
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            if request.headers.get('origin') != store.settings.origin.rstrip('/') or not hmac.compare_digest(request.headers.get('x-csrf-token', ''), session.csrf):
                raise HTTPException(403, 'Origen o token CSRF inválido.')
        return {'id': user.id, 'username': user.username, 'csrf': session.csrf, 'session': session.token_hash}


def membership(s, org, actor, roles=ROLES):
    m = s.get(Membership, (org, actor['id']))
    if not m or m.role not in roles:
        raise HTTPException(403, 'No tienes permiso en esta organización.')
    return m


def case_permission(s, case_id, org, actor, permission='read', include_deleted=False):
    m = membership(s, org, actor)
    if permission == 'write' and m.role not in ('owner', 'analyst'):
        raise HTTPException(403, 'Rol sin escritura.')
    case = s.get(Case, case_id)
    if not case or case.org != org or (case.deleted_at and not include_deleted):
        raise HTTPException(404, 'Expediente no disponible.')
    if m.role == 'owner' or case.owner == actor['id']:
        if permission == 'review' and m.role not in ('owner', 'reviewer'):
            raise HTTPException(403, 'Se requiere rol de revisor.')
        return case
    access = s.get(CaseAccess, (case.id, actor['id']))
    allowed = {'read': {'read', 'write', 'review'}, 'write': {'write'}, 'review': {'review'}}[permission]
    if not access or access.expires <= time.time() or access.permission not in allowed:
        raise HTTPException(403, 'Sin acceso vigente al expediente.')
    if permission == 'write' and m.role not in ('analyst', 'owner'):
        raise HTTPException(403, 'Rol de lectura o revisión.')
    if permission == 'review' and m.role not in ('reviewer', 'owner'):
        raise HTTPException(403, 'Se requiere rol de revisor.')
    return case
