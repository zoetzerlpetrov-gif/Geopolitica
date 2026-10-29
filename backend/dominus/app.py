import base64
import hashlib
import json
from pathlib import Path
import secrets
import time
from urllib.parse import urlsplit
from fastapi import Depends, FastAPI, HTTPException, Request, Response, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select, text, update
from starlette.middleware.sessions import SessionMiddleware
from .config import Settings
from .connectors import SOURCES, validate_parameters
from .db import (Area, Audit, Case, CaseAccess, Certificate, Membership, Observation,
                 Organization, Revision, Secret, Session, Store, User, Watch, CaseReview, uid)
from .security import (ROLES, audit, case_permission, create_session, login, membership,
                       principal, rate_limit, verify_audit)
from .validation import document, fecha, polygon


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Credentials(Input):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=500)
    otp: str = Field(pattern=r'^\d{6}$')


class NewCase(Input):
    title: str = Field(min_length=1, max_length=250)
    data: dict = Field(default_factory=dict)


class EditCase(Input):
    version: int = Field(ge=1)
    data: dict
    reason: str = Field(min_length=1, max_length=1000)


class Grant(Input):
    user: str = Field(max_length=36)
    permission: str = Field(pattern=r'^(read|write|review)$')
    days: int = Field(ge=1, le=7)


class NewWatch(Input):
    source: str = Field(max_length=40)
    parameters: dict
    interval: int = Field(ge=3600, le=2592000)
    acknowledge_external: bool


class Policy(Input):
    hold: bool
    retention_days: int = Field(ge=1, le=3650)
    reason: str = Field(min_length=1, max_length=1000)


class Confirmation(Input):
    confirmation: str
    reason: str = Field(min_length=1, max_length=1000)


class Review(Input):
    version: int = Field(ge=1)
    note: str = Field(min_length=1, max_length=1000)


class Member(Input):
    username: str = Field(min_length=1, max_length=120)
    role: str = Field(pattern=r'^(owner|analyst|reviewer|viewer)$')


class SecretValue(Input):
    value: str = Field(min_length=1, max_length=10000)


class NewArea(Input):
    title: str = Field(min_length=1, max_length=200)
    geojson: dict


class NewCertificate(Input):
    name: str = Field(min_length=1, max_length=200)
    expires: str = Field(max_length=30)
    fingerprint: str = Field(pattern=r'^[a-fA-F0-9:]{32,100}$')
    owner: str = Field(min_length=1, max_length=200)
    reference: str = Field(min_length=1, max_length=500)


def create_app(settings=None):
    cfg = (settings or Settings()).validate()
    store = Store(cfg)
    app = FastAPI(title='DOMINUS privado · Fase 3', docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store = store
    app.add_middleware(SessionMiddleware, secret_key=hashlib.sha256((cfg.master_key + ':oidc').encode()).hexdigest(), same_site='lax', https_only=cfg.secure_cookie, max_age=600)

    @app.middleware('http')
    async def protections(request, call_next):
        # Sin CORS: interfaz y API privadas deben compartir el mismo origen.
        if request.headers.get('host') != urlsplit(cfg.origin).netloc:
            return JSONResponse({'detail': 'Host no permitido.'}, status_code=400)
        raw = bytearray()
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            if request.headers.get('origin') != cfg.origin.rstrip('/'):
                return JSONResponse({'detail': 'Origen no permitido.'}, status_code=403)
            async for chunk in request.stream():
                raw.extend(chunk)
                if len(raw) > cfg.max_body:
                    return JSONResponse({'detail': 'Máximo 5 MB por petición.'}, status_code=413)
            request._body = bytes(raw)
            # Starlette usa el body almacenado para reproducirlo en el manejador.
        result = await call_next(request)
        result.headers.update({'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"})
        if cfg.secure_cookie:
            result.headers['Strict-Transport-Security'] = 'max-age=31536000'
        return result

    @app.exception_handler(ValueError)
    async def invalid(_, exc):
        return JSONResponse({'detail': str(exc)[:500]}, status_code=422)

    def actor(request: Request):
        return principal(store, request)

    def lifecycle(c, action, reason, actor_id):
        records = store.open(c.lifecycle, 'lifecycle:' + c.id) if c.lifecycle else []
        records.append({'action': action, 'reason': reason, 'actor': actor_id, 'at': time.time()})
        c.lifecycle = store.seal(records, 'lifecycle:' + c.id)

    def cookie(response, token):
        response.set_cookie('dominus_session', token, httponly=True, secure=cfg.secure_cookie, samesite='strict', max_age=8 * 3600, path='/')

    @app.get('/api/auth-options')
    def auth_options():
        return {'sso': bool(cfg.oidc_issuer), 'mfa': True}

    @app.get('/api/health')
    def health():
        with store.tx() as s:
            s.execute(text('SELECT 1'))
        return {'status': 'ok', 'version': 1, 'storage': store.engine.dialect.name, 'shared': True}

    @app.post('/api/login')
    def sign_in(body: Credentials, request: Request, response: Response):
        ip = request.client.host if request.client else 'unknown'
        rate_limit(store, [store.hash('ip:' + ip)], limit=30)
        rate_limit(store, [store.hash('user:' + body.username.casefold())], limit=8)
        token, csrf = login(store, body.username, body.password, body.otp)
        with store.tx() as s:
            uid_login = s.get(Session, store.hash(token)).user
            for m in s.execute(select(Membership).where(Membership.user == uid_login)).scalars():
                audit(store, s, m.org, uid_login, 'auth.login', uid_login)
        cookie(response, token)
        return {'csrf': csrf}

    @app.get('/api/me')
    def me(a=Depends(actor)):
        with store.tx() as s:
            memberships = s.execute(select(Membership, Organization).join(Organization, Membership.org == Organization.id).where(Membership.user == a['id'])).all()
            return {'id': a['id'], 'username': a['username'], 'csrf': a['csrf'], 'organizations': [{'id': o.id, 'name': o.name, 'role': m.role} for m, o in memberships]}

    @app.post('/api/logout')
    def logout(response: Response, a=Depends(actor)):
        with store.tx() as s:
            s.execute(delete(Session).where(Session.token_hash == a['session']))
            for m in s.execute(select(Membership).where(Membership.user == a['id'])).scalars():
                audit(store, s, m.org, a['id'], 'auth.logout', a['id'])
        response.delete_cookie('dominus_session', path='/')
        return {'ok': True}

    @app.post('/api/logout-all')
    def logout_all(response: Response, a=Depends(actor)):
        with store.tx() as s:
            s.execute(delete(Session).where(Session.user == a['id']))
            for m in s.execute(select(Membership).where(Membership.user == a['id'])).scalars():
                audit(store, s, m.org, a['id'], 'auth.logout_all', a['id'])
        response.delete_cookie('dominus_session', path='/')
        return {'ok': True}

    @app.get('/api/orgs/{org}/members')
    def members(org: str, a=Depends(actor)):
        with store.tx() as s:
            membership(s, org, a, {'owner'})
            return [{'id': u.id, 'username': u.username, 'role': m.role} for m, u in s.execute(select(Membership, User).join(User, Membership.user == User.id).where(Membership.org == org)).all()]

    @app.put('/api/orgs/{org}/members')
    def member(org: str, body: Member, a=Depends(actor)):
        with store.tx() as s:
            s.execute(select(Organization).where(Organization.id == org).with_for_update()).scalar_one_or_none()
            membership(s, org, a, {'owner'})
            u = s.execute(select(User).where(User.username == body.username)).scalar_one_or_none()
            if not u:
                raise HTTPException(404, 'La cuenta debe ser provisionada por el operador.')
            if u.id == a['id'] and body.role != 'owner':
                raise HTTPException(409, 'No puedes quitarte el rol de propietario.')
            row = s.get(Membership, (org, u.id))
            if row and row.role == 'owner' and body.role != 'owner':
                owners = s.execute(select(Membership).where(Membership.org == org, Membership.role == 'owner')).scalars().all()
                if len(owners) <= 1:
                    raise HTTPException(409, 'Debe permanecer al menos un propietario.')
            if not row:
                row = Membership(org=org, user=u.id, role=body.role)
                s.add(row)
            row.role = body.role
            audit(store, s, org, a['id'], 'membership.changed', u.id)
        return {'ok': True}

    @app.get('/api/orgs/{org}/cases')
    def cases(org: str, q: str = '', a=Depends(actor)):
        if len(q) > 200:
            raise HTTPException(422, 'Búsqueda demasiado larga.')
        with store.tx() as s:
            m = membership(s, org, a)
            query = select(Case).where(Case.org == org, Case.deleted_at.is_(None))
            if q:
                query = query.where(Case.title.ilike('%' + q.replace('%', '\\%').replace('_', '\\_') + '%', escape='\\'))
            allowed = []
            for c in s.execute(query.order_by(Case.updated.desc()).limit(200)).scalars():
                access = s.get(CaseAccess, (c.id, a['id']))
                if m.role == 'owner' or c.owner == a['id'] or (access and access.expires > time.time()):
                    allowed.append({'id': c.id, 'title': c.title, 'version': c.version, 'updated': c.updated, 'hold': c.hold})
            return allowed

    @app.post('/api/orgs/{org}/cases')
    def new_case(org: str, body: NewCase, a=Depends(actor)):
        content = document(body.data)
        with store.tx() as s:
            membership(s, org, a, {'owner', 'analyst'})
            cid = uid()
            payload = store.seal(content, 'case:' + cid)
            c = Case(id=cid, org=org, owner=a['id'], title=body.title, data=payload)
            s.add(c)
            s.flush()
            s.add(Revision(case=cid, version=1, data=payload, actor=a['id'], reason='Creación / importación documental local; estados previos no son aprobación autenticada.'))
            audit(store, s, org, a['id'], 'case.created', cid)
            return {'id': cid, 'version': 1}

    @app.get('/api/orgs/{org}/cases/{cid}')
    def get_case(org: str, cid: str, a=Depends(actor)):
        with store.tx() as s:
            c = case_permission(s, cid, org, a)
            audit(store, s, org, a['id'], 'case.read', cid)
            reviews = s.execute(select(CaseReview).where(CaseReview.case == cid, CaseReview.version == c.version)).scalars().all()
            return {'id': cid, 'title': c.title, 'version': c.version, 'data': store.open(c.data, 'case:' + cid), 'hold': c.hold, 'retention_days': c.retention_days, 'policy_history': store.open(c.lifecycle, 'lifecycle:' + cid) if c.lifecycle else [], 'authenticated_reviews': [{'actor': r.actor, 'at': r.created, 'note': store.open(r.note, 'review:' + r.id)} for r in reviews]}

    @app.put('/api/orgs/{org}/cases/{cid}')
    def edit_case(org: str, cid: str, body: EditCase, a=Depends(actor)):
        content = document(body.data)
        with store.tx() as s:
            c = case_permission(s, cid, org, a, 'write')
            payload = store.seal(content, 'case:' + cid)
            result = s.execute(update(Case).where(Case.id == cid, Case.version == body.version).values(data=payload, version=body.version + 1, updated=time.time()))
            if result.rowcount != 1:
                raise HTTPException(409, 'Otro usuario modificó el expediente. Recarga y compara antes de guardar.')
            s.add(Revision(case=cid, version=body.version + 1, data=payload, actor=a['id'], reason=body.reason))
            audit(store, s, org, a['id'], 'case.updated', cid)
            return {'id': cid, 'version': body.version + 1}

    @app.post('/api/orgs/{org}/cases/{cid}/review')
    def review(org: str, cid: str, body: Review, a=Depends(actor)):
        with store.tx() as s:
            c = case_permission(s, cid, org, a, 'review')
            c = s.execute(select(Case).where(Case.id == cid).with_for_update().execution_options(populate_existing=True)).scalar_one()
            if c.version != body.version:
                raise HTTPException(409, 'La versión cambió.')
            rev = s.execute(select(Revision).where(Revision.case == cid, Revision.version == c.version)).scalar_one()
            if rev.actor == a['id']:
                raise HTTPException(403, 'La revisión debe realizarla otra persona.')
            if s.execute(select(CaseReview).where(CaseReview.case == cid, CaseReview.version == c.version, CaseReview.actor == a['id'])).first():
                raise HTTPException(409, 'Ya revisaste esta versión.')
            review_id = uid()
            s.add(CaseReview(id=review_id, case=cid, version=c.version, actor=a['id'], note=store.seal(body.note, 'review:' + review_id)))
            audit(store, s, org, a['id'], 'case.reviewed', cid + ':' + str(c.version))
        return {'ok': True, 'version': body.version, 'meaning': 'Revisión autenticada de versión; no certifica veracidad.'}

    @app.get('/api/orgs/{org}/cases/{cid}/revisions')
    def revisions(org: str, cid: str, a=Depends(actor)):
        with store.tx() as s:
            case_permission(s, cid, org, a)
            return [{'version': r.version, 'actor': r.actor, 'reason': r.reason, 'created': r.created} for r in s.execute(select(Revision).where(Revision.case == cid).order_by(Revision.version.desc()).limit(100)).scalars()]

    @app.put('/api/orgs/{org}/cases/{cid}/access')
    def grant(org: str, cid: str, body: Grant, a=Depends(actor)):
        with store.tx() as s:
            c = case_permission(s, cid, org, a)
            m = membership(s, org, a)
            if m.role != 'owner' and c.owner != a['id']:
                raise HTTPException(403, 'Solo responsable o propietario puede compartir.')
            target = s.get(Membership, (org, body.user))
            if not target or (body.permission == 'write' and target.role not in ('owner', 'analyst')) or (body.permission == 'review' and target.role not in ('owner', 'reviewer')):
                raise HTTPException(422, 'Destino o rol incompatible con el permiso.')
            row = s.get(CaseAccess, (cid, body.user))
            if not row:
                row = CaseAccess(case=cid, user=body.user)
                s.add(row)
            row.permission, row.expires = body.permission, time.time() + body.days * 86400
            audit(store, s, org, a['id'], 'access.granted', cid + ':' + body.user)
        return {'ok': True}

    @app.get('/api/orgs/{org}/cases/{cid}/access')
    def access(org: str, cid: str, a=Depends(actor)):
        with store.tx() as s:
            c = case_permission(s, cid, org, a)
            m = membership(s, org, a)
            if c.owner != a['id'] and m.role != 'owner':
                raise HTTPException(403, 'Sin permiso para gestionar acceso.')
            return [{'user': r.user, 'permission': r.permission, 'expires': r.expires} for r in s.execute(select(CaseAccess).where(CaseAccess.case == cid)).scalars()]

    @app.delete('/api/orgs/{org}/cases/{cid}/access/{user}')
    def revoke(org: str, cid: str, user: str, a=Depends(actor)):
        with store.tx() as s:
            c = case_permission(s, cid, org, a)
            m = membership(s, org, a)
            if c.owner != a['id'] and m.role != 'owner':
                raise HTTPException(403, 'Sin permiso para revocar.')
            s.execute(delete(CaseAccess).where(CaseAccess.case == cid, CaseAccess.user == user))
            audit(store, s, org, a['id'], 'access.revoked', cid + ':' + user)
        return {'ok': True}

    @app.put('/api/orgs/{org}/cases/{cid}/policy')
    def policy(org: str, cid: str, body: Policy, a=Depends(actor)):
        with store.tx() as s:
            membership(s, org, a, {'owner'})
            c = case_permission(s, cid, org, a, include_deleted=True, lock=True)
            c.hold, c.retention_days = body.hold, body.retention_days
            lifecycle(c, 'policy', body.reason, a['id'])
            audit(store, s, org, a['id'], 'retention.changed', cid)
        return {'ok': True}

    @app.post('/api/orgs/{org}/cases/{cid}/trash')
    def trash(org: str, cid: str, body: Confirmation, a=Depends(actor)):
        with store.tx() as s:
            membership(s, org, a, {'owner'})
            c = case_permission(s, cid, org, a, lock=True)
            if c.hold or body.confirmation != cid:
                raise HTTPException(409, 'Bloqueado por conservación o falta confirmación del ID.')
            c.deleted_at = time.time()
            lifecycle(c, 'trash', body.reason, a['id'])
            for w in s.execute(select(Watch).where(Watch.case == cid)).scalars():
                w.enabled = False
            audit(store, s, org, a['id'], 'case.trashed', cid)
        return {'ok': True, 'message': 'Papelera; eliminación diferida conforme a la retención.'}

    @app.get('/api/orgs/{org}/trash')
    def trash_list(org: str, a=Depends(actor)):
        with store.tx() as s:
            membership(s, org, a, {'owner'})
            return [{'id': c.id, 'title': c.title, 'hold': c.hold, 'purge_after': c.deleted_at + c.retention_days * 86400} for c in s.execute(select(Case).where(Case.org == org, Case.deleted_at.is_not(None)).order_by(Case.deleted_at.desc()).limit(200)).scalars()]

    @app.post('/api/orgs/{org}/cases/{cid}/restore')
    def restore(org: str, cid: str, a=Depends(actor)):
        with store.tx() as s:
            membership(s, org, a, {'owner'})
            c = case_permission(s, cid, org, a, include_deleted=True, lock=True)
            c.deleted_at = None
            lifecycle(c, 'restore', 'Restauración explícita de papelera', a['id'])
            audit(store, s, org, a['id'], 'case.restored', cid)
        return {'ok': True, 'message': 'Vigilancias permanecen desactivadas hasta habilitarlas explícitamente.'}

    @app.get('/api/sources')
    def sources(a=Depends(actor)):
        return [{'id': k, **v} for k, v in SOURCES.items()]

    @app.post('/api/orgs/{org}/cases/{cid}/watches')
    def new_watch(org: str, cid: str, body: NewWatch, a=Depends(actor)):
        params = validate_parameters(body.source, body.parameters)
        if not body.acknowledge_external:
            raise HTTPException(422, 'Confirma qué proveedor recibirá estos criterios de consulta.')
        interval = max(body.interval, SOURCES[body.source]['interval'])
        with store.tx() as s:
            case_permission(s, cid, org, a, 'write')
            if len(s.execute(select(Watch).where(Watch.org == org)).scalars().all()) >= 50:
                raise HTTPException(409, 'Máximo 50 vigilancias por organización.')
            wid = uid()
            w = Watch(id=wid, org=org, case=cid, source=body.source, parameters=store.seal(params, 'watch:' + wid), interval=interval)
            s.add(w)
            audit(store, s, org, a['id'], 'watch.created', wid)
            return {'id': wid, 'interval': interval, 'recipient': SOURCES[body.source]['recipient']}

    @app.get('/api/orgs/{org}/cases/{cid}/watches')
    def watches(org: str, cid: str, a=Depends(actor)):
        with store.tx() as s:
            case_permission(s, cid, org, a)
            return [{'id': w.id, 'source': w.source, 'recipient': SOURCES[w.source]['recipient'], 'parameters': store.open(w.parameters, 'watch:' + w.id), 'enabled': w.enabled, 'status': w.status, 'last_success': w.last_success, 'next_run': w.due, 'failures': w.failures, 'error': w.last_error, 'count': w.count, 'checkpoint': json.loads(w.checkpoint)} for w in s.execute(select(Watch).where(Watch.case == cid)).scalars()]

    @app.post('/api/orgs/{org}/cases/{cid}/watches/{wid}/{action}')
    def watch_action(org: str, cid: str, wid: str, action: str, a=Depends(actor)):
        if action not in ('enable', 'disable', 'run'):
            raise HTTPException(404, 'Acción desconocida.')
        with store.tx() as s:
            case_permission(s, cid, org, a, 'write')
            w = s.get(Watch, wid)
            if not w or w.case != cid:
                raise HTTPException(404, 'Vigilancia no disponible.')
            if action == 'disable':
                w.enabled = False
            else:
                w.enabled = True
                w.due = time.time()
            audit(store, s, org, a['id'], 'watch.' + action, wid)
        return {'ok': True}

    @app.get('/api/orgs/{org}/cases/{cid}/observations')
    def observations(org: str, cid: str, a=Depends(actor)):
        with store.tx() as s:
            case_permission(s, cid, org, a)
            rows = s.execute(select(Observation, Watch).join(Watch, Observation.watch == Watch.id).where(Watch.case == cid).order_by(Observation.created.desc()).limit(100)).all()
            audit(store, s, org, a['id'], 'observations.read', cid)
            return [{'id': o.id, 'watch': w.id, 'source': w.source, 'at': o.created, 'fingerprint': o.fingerprint, 'data': store.open(o.data, 'observation:' + o.id)} for o, w in rows]

    @app.get('/api/orgs/{org}/audit')
    def audit_log(org: str, a=Depends(actor)):
        with store.tx() as s:
            membership(s, org, a, {'owner'})
            rows = s.execute(select(Audit).where(Audit.org == org).order_by(Audit.id)).scalars().all()
            return {'chain_valid': verify_audit(store, rows), 'events': [{'id': r.id, 'actor': r.actor, 'action': r.action, 'target': r.target, 'at': r.created} for r in rows[-1000:]], 'limitation': 'Cadena HMAC: no es almacenamiento WORM; el custodio de clave/base puede reescribirla.'}

    @app.get('/api/orgs/{org}/secrets')
    def secrets_list(org: str, a=Depends(actor)):
        with store.tx() as s:
            membership(s, org, a, {'owner'})
            return [{'provider': r.provider, 'updated': r.updated} for r in s.execute(select(Secret).where(Secret.org == org)).scalars()]

    @app.put('/api/orgs/{org}/secrets/{provider}')
    def secret_set(org: str, provider: str, body: SecretValue, a=Depends(actor)):
        if provider not in ('epo_ops', 'sam', 'opensanctions'):
            raise HTTPException(422, 'Proveedor no registrado en la bóveda.')
        with store.tx() as s:
            membership(s, org, a, {'owner'})
            row = s.get(Secret, (org, provider))
            if not row:
                row = Secret(org=org, provider=provider)
                s.add(row)
            row.value, row.updated = store.seal(body.value, 'secret:' + org + ':' + provider), time.time()
            audit(store, s, org, a['id'], 'secret.rotated', provider)
        return {'ok': True, 'message': 'Cifrado y almacenado. No activa un conector de pago.'}

    @app.get('/api/orgs/{org}/certificates')
    def certificates(org: str, a=Depends(actor)):
        with store.tx() as s:
            membership(s, org, a)
            return [{'id': c.id, 'name': c.name, 'expires': c.expires, 'fingerprint': c.fingerprint, 'owner': c.owner, 'reference': c.reference} for c in s.execute(select(Certificate).where(Certificate.org == org)).scalars()]

    @app.post('/api/orgs/{org}/certificates')
    def certificate(org: str, body: NewCertificate, a=Depends(actor)):
        fecha(body.expires)
        with store.tx() as s:
            membership(s, org, a, {'owner'})
            c = Certificate(org=org, **body.model_dump())
            s.add(c)
            s.flush()
            audit(store, s, org, a['id'], 'certificate.created', c.id)
            return {'id': c.id}

    @app.post('/api/orgs/{org}/cases/{cid}/areas')
    def new_area(org: str, cid: str, body: NewArea, a=Depends(actor)):
        geo = polygon(body.geojson)
        with store.tx() as s:
            case_permission(s, cid, org, a, 'write')
            area = Area(case=cid, title=body.title, geojson=json.dumps(geo))
            s.add(area)
            s.flush()
            if store.engine.dialect.name == 'postgresql':
                s.execute(text('UPDATE areas SET geom=ST_SetSRID(ST_GeomFromGeoJSON(:g),4326) WHERE id=:id'), {'g': json.dumps(geo), 'id': area.id})
            audit(store, s, org, a['id'], 'area.created', area.id)
            return {'id': area.id}

    @app.get('/api/orgs/{org}/cases/{cid}/areas')
    def areas(org: str, cid: str, bbox: str = '', a=Depends(actor)):
        from shapely.geometry import box, shape
        bounds = None
        if bbox:
            try:
                bounds = list(map(float, bbox.split(',')))
                if len(bounds) != 4 or not (-180 <= bounds[0] < bounds[2] <= 180 and -90 <= bounds[1] < bounds[3] <= 90):
                    raise ValueError()
            except ValueError:
                raise HTTPException(422, 'BBox inválido: oeste,sur,este,norte.')
        with store.tx() as s:
            case_permission(s, cid, org, a)
            if bounds and store.engine.dialect.name == 'postgresql':
                ids = s.execute(text('SELECT id FROM areas WHERE "case"=:cid AND ST_Intersects(geom,ST_MakeEnvelope(:w,:s,:e,:n,4326))'), {'cid': cid, **dict(zip(('w', 's', 'e', 'n'), bounds))}).scalars().all()
                rows = s.execute(select(Area).where(Area.id.in_(ids))).scalars()
            else:
                rows = s.execute(select(Area).where(Area.case == cid)).scalars()
            return [{'id': r.id, 'title': r.title, 'geojson': json.loads(r.geojson)} for r in rows if not bounds or store.engine.dialect.name == 'postgresql' or shape(json.loads(r.geojson)).intersects(box(*bounds))]

    @app.post('/api/orgs/{org}/cases/{cid}/c2pa')
    async def c2pa_verify(org: str, cid: str, file: UploadFile = File(...), a=Depends(actor)):
        from .media import verify_bytes
        from starlette.concurrency import run_in_threadpool
        with store.tx() as s:
            case_permission(s, cid, org, a, 'write')
        rate_limit(store, [store.hash('c2pa:' + a['id'])], limit=10, seconds=3600)
        content = await file.read(4 * 1024 * 1024 + 1)
        result = await run_in_threadpool(verify_bytes, content, Path(file.filename or '').suffix)
        with store.tx() as s:
            case_permission(s, cid, org, a, 'write')
            audit(store, s, org, a['id'], 'c2pa.checked', cid)
        return {'sha256': hashlib.sha256(content).hexdigest(), 'result': result, 'stored_original': False}

    @app.get('/api/schema')
    def schema(a=Depends(actor)):
        from .validation import SCHEMA
        return SCHEMA

    # SSO opcional; la cuenta se vincula por sub previamente provisionado, nunca por email.
    if cfg.oidc_issuer:
        from authlib.integrations.starlette_client import OAuth
        oauth = OAuth()
        oauth.register('sso', client_id=cfg.oidc_client, client_secret=cfg.oidc_secret, server_metadata_url=cfg.oidc_issuer.rstrip('/') + '/.well-known/openid-configuration', client_kwargs={'scope': 'openid', 'code_challenge_method': 'S256'})

        @app.get('/auth/sso')
        async def sso(request: Request):
            return await oauth.sso.authorize_redirect(request, cfg.origin.rstrip('/') + '/auth/callback')

        @app.get('/auth/callback')
        async def sso_callback(request: Request):
            token = await oauth.sso.authorize_access_token(request)
            claims = token.get('userinfo')
            if not claims or claims.get('iss') != cfg.oidc_issuer or not claims.get('sub') or not set(claims.get('amr', [])).intersection({'mfa', 'otp', 'hwk'}):
                raise HTTPException(403, 'SSO requiere identidad validada y evidencia MFA del proveedor.')
            with store.tx() as s:
                user = s.execute(select(User).where(User.oidc_subject == cfg.oidc_issuer + '|' + claims['sub'], User.active.is_(True))).scalar_one_or_none()
                if not user:
                    raise HTTPException(403, 'Identidad SSO sin cuenta provisionada.')
                raw, _ = create_session(s, user.id)
            response = RedirectResponse('/')
            cookie(response, raw)
            return response

    @app.get('/record-assets/{filename}')
    def record_asset(filename: str):
        if filename not in ('fase1-logica.js', 'fase2-modelo.js', 'fase2-importar.js', 'util.js'):
            raise HTTPException(404)
        return FileResponse(Path(__file__).parents[2] / 'js' / filename, media_type='text/javascript')

    web = Path(__file__).parent.parent / 'web'
    app.mount('/assets', StaticFiles(directory=web), name='assets')

    @app.get('/')
    def index():
        return FileResponse(web / 'index.html')

    return app
