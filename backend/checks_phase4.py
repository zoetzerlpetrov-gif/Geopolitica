"""Fase 4A: unificación, originales protegidos, permisos y recuperación."""
import base64
import copy
import hashlib
import json
import time
from sqlalchemy import select
from checks_backend import env, create, endpoint, key
from dominus.backup import export_all, restore_all
from dominus.cli import rotate_master
from dominus.config import Settings
from dominus.db import Case, CaseAccess, Revision, Store, Session
from dominus.phase4 import empty, nodes
from dominus.validation import SCHEMA
from dominus.worker import purge


def data():
    f = empty()
    f['assets'].append({'id':'a1','title':'Terminal QA','kind':'instalación','owner':'Operaciones','identifier':'TERM-QA-01','location':'Ubicación ficticia','criticality':'alta','authorization':'Registro documental; sin escaneo','notes':'Prueba'})
    f['entities'].append({'id':'e1','title':'Interrupción QA','kind':'evento','reference':'Fuente de laboratorio','notes':'No es un incidente real'})
    f['links'].append({'id':'l1','from':'entity:e1','to':'asset:a1','relation':'afecta','notes':'Ejercicio sintético'})
    return {'fase4':f}


def original(version=1, **kw):
    return dict({'version':version,'filename':'original-qa.txt','content':base64.b64encode(b'evidencia sintetica\n').decode(),'source':'Generado en laboratorio','acquired_at':'2026-10-29T10:00:00-06:00','custodian':'Custodio QA','reason':'Recepción de laboratorio'},**kw)


def put(c, cid, d, version=1):
    return c.put(endpoint(cid),json={'version':version,'data':d,'reason':'Cambio de prueba'})


def test_assets_relations_and_phase12_nodes_share_one_case(env):
    _,store,c,_,_=env
    d=data()
    d['fase1']={'version':1,**{k:[] for k in SCHEMA['fase1']['tipos']}}
    d['fase1']['requerimientos']=[{'id':'pir1','titulo':'Pregunta QA','estado':'borrador','tipo':'PIR'}]
    d['fase4']['links'].append({'id':'l2','from':'fase1:requerimientos:pir1','to':'asset:a1','relation':'relacionado con','notes':'Vínculo sin copia'})
    cid=create(c['analyst'],data=d)
    received=c['analyst'].get(endpoint(cid)).json()
    assert received['data']==d
    assert nodes(d)['fase1:requerimientos:pir1']=='Pregunta QA'
    with store.tx() as s:
        assert 'Terminal QA' not in s.get(Case,cid).data
    bad=copy.deepcopy(d);bad['fase1']['requerimientos']=[]
    assert put(c['analyst'],cid,bad).status_code==422
    assert c['analyst'].get(endpoint(cid)).json()['version']==1
    for change in ['missing','self','duplicate','fields']:
        bad=copy.deepcopy(d)
        if change=='missing':bad['fase4']['links'][0]['to']='asset:not-present'
        if change=='self':bad['fase4']['links'][0]['to']='entity:e1'
        if change=='duplicate':bad['fase4']['links'].append({**bad['fase4']['links'][0],'id':'duplicate'})
        if change=='fields':bad['fase4']['assets'][0]['run_scan']=True
        assert put(c['analyst'],cid,bad).status_code==422,change


def test_original_bytes_custody_and_generic_edit_cannot_rewrite_history(env):
    _,store,c,_,_=env
    cid=create(c['analyst'],data=data())
    r=c['analyst'].post(endpoint(cid,'/evidence'),json=original())
    assert r.status_code==200,r.text
    eid=r.json()['id']
    assert r.json()['version']==2
    d=c['analyst'].get(endpoint(cid)).json()['data']
    e=d['fase4']['evidence'][0]
    assert e['sha256']==hashlib.sha256(b'evidencia sintetica\n').hexdigest()
    assert e['actor']=='analyst' and e['custody'][0]['actor']=='analyst'
    r=c['analyst'].get(endpoint(cid,'/evidence/'+eid+'/download'))
    assert r.content==b'evidencia sintetica\n'
    assert r.headers['content-type']=='application/octet-stream'
    assert r.headers['content-disposition'].startswith('attachment;')
    assert r.headers['cache-control']=='no-store'
    for change in ['remove','replace','custody','drop-phase','null']:
        forged=copy.deepcopy(d)
        if change=='remove':forged['fase4']['evidence']=[]
        if change=='replace':forged['fase4']['evidence'][0]['source']='Alterado'
        if change=='custody':forged['fase4']['evidence'][0]['custody'][0]['custodian']='Otro'
        if change=='drop-phase':del forged['fase4']
        if change=='null':forged['fase4']=None
        assert put(c['analyst'],cid,forged,2).status_code==422,change
    assert c['analyst'].post('/api/orgs/o1/cases',json={'title':'Importación falsificada','data':d}).status_code==422
    d['fase4']['assets'][0]['title']='Terminal actualizada'
    assert put(c['analyst'],cid,d,2).status_code==200
    assert c['analyst'].post(endpoint(cid,'/evidence/'+eid+'/custody'),json={'version':3,'custodian':'Segundo QA','reason':'Entrega declarada'}).status_code==200
    e=c['analyst'].get(endpoint(cid)).json()['data']['fase4']['evidence'][0]
    assert len(e['custody'])==2 and e['custody'][0]['custodian']=='Custodio QA'
    assert e['custody'][1]['actor']=='analyst'
    with store.tx() as s:
        assert 'evidencia sintetica' not in s.get(Case,cid).data
        assert len(s.execute(select(Revision).where(Revision.case==cid)).scalars().all())==4


def test_evidence_permissions_revocation_deleted_case_csrf_and_stale_version(env):
    _,store,c,_,_=env
    cid=create(c['analyst'])
    assert c['viewer'].post(endpoint(cid,'/evidence'),json=original()).status_code==403
    r=c['analyst'].post(endpoint(cid,'/evidence'),json=original());eid=r.json()['id']
    url=endpoint(cid,'/evidence/'+eid+'/download')
    assert c['other'].get(url).status_code==403
    assert c['other'].get(endpoint(cid,'/evidence/'+eid+'/download',org='o2')).status_code==404
    assert c['analyst'].post(endpoint(cid,'/evidence'),json=original(1,content=base64.b64encode(b'otro').decode())).status_code==409
    assert c['analyst'].post(endpoint(cid,'/evidence'),json=original(2)).status_code==409
    assert c['analyst'].post(endpoint(cid,'/evidence/'+eid+'/custody'),json={'version':1,'custodian':'QA','reason':'stale'}).status_code==409
    assert c['analyst'].post(endpoint(cid,'/evidence/'+eid+'/custody'),json={'version':2,'custodian':'QA','reason':'csrf'},headers={'X-CSRF-Token':'bad'}).status_code==403
    assert c['analyst'].put(endpoint(cid,'/access'),json={'user':'viewer','permission':'read','days':1}).status_code==200
    assert c['viewer'].get(url).status_code==200
    assert c['viewer'].post(endpoint(cid,'/evidence/'+eid+'/custody'),json={'version':2,'custodian':'QA','reason':'read only'}).status_code==403
    c['analyst'].delete(endpoint(cid,'/access/viewer'))
    assert c['viewer'].get(url).status_code==403
    assert c['owner'].post(endpoint(cid,'/trash'),json={'confirmation':cid,'reason':'Papelera de prueba'}).status_code==200
    assert c['analyst'].get(url).status_code==404


def test_evidence_limits_invalid_input_no_phantom_versions(env):
    _,_,c,_,_=env
    cid=create(c['analyst'])
    for kw in [{'content':'***'},{'content':''},{'content':base64.b64encode(b'x'*(512*1024+1)).decode()},{'acquired_at':'2026-10-29T10:00:00'},{'filename':'bad\r\n.txt'},{'version':True},{'actor':'forged'}]:
        assert c['analyst'].post(endpoint(cid,'/evidence'),json=original(**kw)).status_code==422,kw.keys()
    assert c['analyst'].get(endpoint(cid)).json()['version']==1
    assert c['analyst'].get(endpoint(cid,'/evidence/missing/download')).status_code==404


def test_download_checks_hash_even_if_database_content_is_resealed(env):
    _,store,c,_,_=env
    cid=create(c['analyst']);eid=c['analyst'].post(endpoint(cid,'/evidence'),json=original()).json()['id']
    with store.tx() as s:
        row=s.get(Case,cid);d=store.open(row.data,'case:'+cid)
        d['fase4']['evidence'][0]['content']=base64.b64encode(b'alterado').decode()
        row.data=store.seal(d,'case:'+cid)
    assert c['analyst'].get(endpoint(cid,'/evidence/'+eid+'/download')).status_code==409


def test_evidence_restore_rotation_and_retention_use_existing_lifecycle(env,tmp_path):
    _,store,c,cfg,_=env
    cid=create(c['analyst'],data=data());c['analyst'].post(endpoint(cid,'/evidence'),json=original())
    d=c['analyst'].get(endpoint(cid)).json()['data']
    backup=export_all(store)
    target=Store(Settings(database_url='sqlite:///'+str(tmp_path/'restore4.db'),origin=cfg.origin,master_key=cfg.master_key,backup_key=cfg.backup_key,allow_local_http=True));target.initialize();restore_all(target,backup)
    with target.tx() as s:assert target.open(s.get(Case,cid).data,'case:'+cid)==d
    new_key=key();rotate_master(target,new_key)
    from dataclasses import replace
    rotated=Store(replace(target.settings,master_key=new_key))
    with rotated.tx() as s:assert rotated.open(s.get(Case,cid).data,'case:'+cid)==d
    rotated.engine.dispose()
    with store.tx() as s:
        row=s.get(Case,cid);row.deleted_at=time.time()-3*86400;row.retention_days=1;row.hold=True
    purge(store)
    with store.tx() as s:assert s.get(Case,cid) is not None;s.get(Case,cid).hold=False
    purge(store)
    with store.tx() as s:assert s.get(Case,cid) is None
    target.engine.dispose()
