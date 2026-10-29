"""Fase 4A: relaciones, activos y originales pequeños dentro del sobre cifrado del caso."""
import base64
import copy
import datetime as dt
import hashlib
import re
import time
from fastapi import Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import update
from .db import Case, Revision, uid
from .security import audit, case_permission

MAX_FILE = 512 * 1024
KINDS = {'empresa', 'persona de rol público', 'evento', 'otro'}
ASSETS = {'instalación', 'dominio', 'IP', 'equipo', 'servicio', 'proveedor', 'otro'}
RELATIONS = {'afecta', 'depende de', 'opera', 'pertenece a', 'sustenta', 'contradice', 'relacionado con'}


def empty():
    return {'version': 1, 'entities': [], 'assets': [], 'links': [], 'evidence': []}


def nodes(data):
    out = {}
    for phase in ('fase1', 'fase2'):
        for collection, rows in (data.get(phase) or {}).items():
            if isinstance(rows, list):
                for row in rows:
                    out[f'{phase}:{collection}:{row["id"]}'] = row['titulo']
    f4 = data.get('fase4') or empty()
    for collection, prefix in [('entities', 'entity'), ('assets', 'asset'), ('evidence', 'evidence')]:
        for row in f4[collection]:
            out[prefix + ':' + row['id']] = row.get('title', row.get('filename', ''))
    return out


def string(row, key, limit=2000, required=False):
    value = row.get(key)
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise ValueError('Campo Fase 4 inválido: ' + key)


def validate(data):
    value = data.get('fase4')
    if value is None:
        return
    if not isinstance(value, dict) or set(value) != set(empty()) or type(value['version']) is not int or value['version'] != 1:
        raise ValueError('Formato Fase 4 incompatible.')
    seen = set()
    fields = {
        'entities': {'id', 'title', 'kind', 'reference', 'notes'},
        'assets': {'id', 'title', 'kind', 'owner', 'identifier', 'location', 'criticality', 'authorization', 'notes'},
        'links': {'id', 'from', 'to', 'relation', 'notes'},
        'evidence': {'id', 'filename', 'content', 'sha256', 'size', 'source', 'acquired_at', 'received_at', 'actor', 'custody'},
    }
    for collection, allowed in fields.items():
        rows = value[collection]
        if not isinstance(rows, list) or len(rows) > (30 if collection == 'evidence' else 500):
            raise ValueError('Demasiados registros de Fase 4.')
        for row in rows:
            if not isinstance(row, dict) or set(row) != allowed:
                raise ValueError('Campos de Fase 4 incompatibles.')
            string(row, 'id', 100, True)
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', row['id']) or row['id'] in seen:
                raise ValueError('ID de Fase 4 duplicado o inválido.')
            seen.add(row['id'])
            if collection != 'evidence':
                for key in allowed - {'id'}:
                    string(row, key, 2000, key in {'title', 'owner', 'identifier', 'from', 'to', 'relation'})
            if collection == 'entities' and row['kind'] not in KINDS:
                raise ValueError('Tipo de entidad inválido.')
            if collection == 'assets' and (row['kind'] not in ASSETS or row['criticality'] not in {'baja', 'media', 'alta', 'crítica'}):
                raise ValueError('Tipo o criticidad de activo inválidos.')
            if collection == 'links' and row['relation'] not in RELATIONS:
                raise ValueError('Relación inválida.')
            if collection == 'evidence':
                for key in ('filename', 'source', 'acquired_at', 'actor'):
                    string(row, key, 2000, True)
                try:
                    stamp = dt.datetime.fromisoformat(row['acquired_at'])
                    raw = base64.b64decode(row['content'], validate=True)
                except (ValueError, TypeError):
                    raise ValueError('Original o fecha de adquisición inválidos.')
                if stamp.tzinfo is None or not 0 < len(raw) <= MAX_FILE or type(row['size']) is not int or len(raw) != row['size'] or hashlib.sha256(raw).hexdigest() != row['sha256']:
                    raise ValueError('Original, tamaño, fecha con zona o huella inválidos.')
                if type(row['received_at']) not in (int, float) or not isinstance(row['custody'], list) or not 1 <= len(row['custody']) <= 100:
                    raise ValueError('Recepción o custodia inválida.')
                for event in row['custody']:
                    if not isinstance(event, dict) or set(event) != {'actor', 'at', 'custodian', 'reason'}:
                        raise ValueError('Evento de custodia inválido.')
                    for key in ('actor', 'custodian', 'reason'):
                        string(event, key, 1000, True)
                    if type(event['at']) not in (int, float):
                        raise ValueError('Fecha de custodia inválida.')
    available = nodes(data)
    pairs = set()
    for link in value['links']:
        pair = (link['from'], link['relation'], link['to'])
        if link['from'] not in available or link['to'] not in available or link['from'] == link['to'] or pair in pairs:
            raise ValueError('Relación duplicada, consigo misma o referencia inexistente.')
        pairs.add(pair)


def preserve_originals(old, new):
    if (old.get('fase4') or empty())['evidence'] != (new.get('fase4') or empty())['evidence']:
        raise ValueError('Los originales y su custodia solo se incorporan por las acciones de evidencia. No se reemplazan ni se importan por edición documental.')


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class EvidenceInput(Input):
    version: int = Field(strict=True, ge=1)
    filename: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=700000)
    source: str = Field(min_length=1, max_length=2000)
    acquired_at: str = Field(min_length=1, max_length=60)
    custodian: str = Field(min_length=1, max_length=300)
    reason: str = Field(min_length=1, max_length=1000)


class TransferInput(Input):
    version: int = Field(strict=True, ge=1)
    custodian: str = Field(min_length=1, max_length=300)
    reason: str = Field(min_length=1, max_length=1000)


def register(app, store, actor):
    def commit(s, c, data, version, a, action, target, reason):
        from .validation import document
        document(data)
        payload = store.seal(data, 'case:' + c.id)
        r = s.execute(update(Case).where(Case.id == c.id, Case.version == version).values(data=payload, version=version + 1, updated=time.time()))
        if r.rowcount != 1:
            raise HTTPException(409, 'El expediente cambió. Recarga antes de volver a registrar evidencia.')
        s.add(Revision(case=c.id, version=version + 1, data=payload, actor=a['id'], reason=action + ': ' + target))
        audit(store, s, c.org, a['id'], action, target)
        return {'id': target, 'version': version + 1}

    @app.post('/api/orgs/{org}/cases/{cid}/evidence')
    def add_evidence(org: str, cid: str, body: EvidenceInput, a=Depends(actor)):
        with store.tx() as s:
            c = case_permission(s, cid, org, a, 'write', lock=True)
            if c.version != body.version:
                raise HTTPException(409, 'El expediente cambió. Recarga antes de incorporar el archivo.')
            data = copy.deepcopy(store.open(c.data, 'case:' + cid))
            f4 = data.setdefault('fase4', empty())
            try:
                raw = base64.b64decode(body.content, validate=True)
            except ValueError:
                raise ValueError('Archivo base64 inválido.')
            if not 0 < len(raw) <= MAX_FILE:
                raise ValueError('Original vacío o mayor de 512 KiB.')
            digest = hashlib.sha256(raw).hexdigest()
            if any(e['sha256'] == digest for e in f4['evidence']):
                raise HTTPException(409, 'Este original ya está incorporado; registra una transferencia si corresponde.')
            eid, now = uid(), time.time()
            filename = body.filename.replace('\\', '/').split('/')[-1]
            if not filename or any(ord(c) < 32 or ord(c) == 127 for c in filename):
                raise ValueError('Nombre de archivo inválido.')
            event = {'actor': a['id'], 'at': now, 'custodian': body.custodian, 'reason': body.reason}
            f4['evidence'].append({'id': eid, 'filename': filename, 'content': body.content, 'sha256': digest, 'size': len(raw), 'source': body.source, 'acquired_at': body.acquired_at, 'received_at': now, 'actor': a['id'], 'custody': [event]})
            return commit(s, c, data, body.version, a, 'evidence.received', eid, 'Recepción de evidencia: ' + body.reason)

    @app.post('/api/orgs/{org}/cases/{cid}/evidence/{eid}/custody')
    def custody(org: str, cid: str, eid: str, body: TransferInput, a=Depends(actor)):
        with store.tx() as s:
            c = case_permission(s, cid, org, a, 'write', lock=True)
            data = copy.deepcopy(store.open(c.data, 'case:' + cid))
            item = next((e for e in (data.get('fase4') or empty())['evidence'] if e['id'] == eid), None)
            if item is None:
                raise HTTPException(404, 'Evidencia no disponible.')
            item['custody'].append({'actor': a['id'], 'at': time.time(), 'custodian': body.custodian, 'reason': body.reason})
            return commit(s, c, data, body.version, a, 'evidence.custody', eid, 'Custodia de evidencia: ' + body.reason)

    @app.get('/api/orgs/{org}/cases/{cid}/evidence/{eid}/download')
    def download(org: str, cid: str, eid: str, a=Depends(actor)):
        with store.tx() as s:
            c = case_permission(s, cid, org, a)
            data = store.open(c.data, 'case:' + cid)
            item = next((e for e in (data.get('fase4') or empty())['evidence'] if e['id'] == eid), None)
            if item is None:
                raise HTTPException(404, 'Evidencia no disponible.')
            raw = base64.b64decode(item['content'], validate=True)
            if hashlib.sha256(raw).hexdigest() != item['sha256']:
                raise HTTPException(409, 'La huella no coincide. Descarga bloqueada; revisar integridad.')
            audit(store, s, org, a['id'], 'evidence.downloaded', eid)
            return Response(raw, media_type='application/octet-stream', headers={'Content-Disposition': 'attachment; filename="evidencia-' + eid + '.bin"'})
