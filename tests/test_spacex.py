"""Efeméride real del operador, identificación, ventanas y error de ajuste."""
import json
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
import pytest

sys.path.insert(0,str(Path(__file__).parents[1]/'tools'/'vivos'))
import spacex as S

OCM=(Path(__file__).parent/'fixtures'/'spacex-ocm.txt').read_text()
AHORA=datetime(2026,11,15,14,30,tzinfo=timezone.utc)


def test_manifiesto_no_admite_rutas_ni_archivos_arbitrarios():
    d=S.manifiesto('MEME_100001_STARLINK-38128_3190959_Operational_1479031200_UNCLASSIFIED.txt\n../../secreto.txt\nMEME_1_OTRO_2.txt\n')
    assert d=={'100001':'STARLINK-38128'}


def test_ocm_real_ajusta_y_valida_sin_inventar_una_fecha_actual():
    meta,filas=S.leer_ocm(OCM)
    assert meta['OBJECT_NAME']=='STARLINK-35000' and len(filas)>300
    x=S.ajustar(OCM,AHORA,horizonte=3)
    assert x['omm']['NORAD_CAT_ID']==65278
    assert 0<=x['error_max_km']<=3 and x['error_rms_km']<=x['error_max_km']
    assert S.fecha(x['hasta'])<=filas[-1][0]
    assert S.fecha(x['desde'])>=AHORA-timedelta(minutes=2)
    with pytest.raises(ValueError,match='antigua'):
        S.ajustar(OCM,AHORA+timedelta(days=3))
    with pytest.raises(ValueError,match='referencia'):
        S.leer_ocm(OCM.replace('ITRF2000','GCRF'))


def test_identificador_provisional_no_se_presenta_como_norad():
    temporal=OCM.replace('OBJECT_DESIGNATOR = 65278','OBJECT_DESIGNATOR = 799501807')
    x=S.ajustar(temporal,AHORA,horizonte=3)
    assert x['omm']['NORAD_CAT_ID']==799501807 and x['tipo_id']=='SpaceX provisional'


def test_lanzamientos_gcat_no_deduce_lotes_por_cercania_de_nombre():
    t='#JCAT\tSatcat\tName\tLDate\tLaunch_Tag\tPiece\nS1\t100001\tStarlink 1234\t2026 Nov 13\t2026-234\t2026-234A\n'
    d=S.metadatos_lanzamientos(t)
    assert d['100001']=={'lanzamiento':'2026-11-13','lote':'2026-234','designador':'2026-234A'}
    assert S.metadatos_lanzamientos('')=={}


def test_error_http_detiene_lote_y_conserva_modelos_anteriores_vigentes(tmp_path,monkeypatch):
    ahora=datetime.now(timezone.utc)
    modelo=json.loads((Path(__file__).parent/'fixtures'/'spacex-modelo.json').read_text())
    modelo['omm']['EPOCH']=ahora.strftime('%Y-%m-%dT%H:%M:%S.%f')
    modelo['hasta']=S.iso(ahora+timedelta(hours=20))
    (tmp_path/'omm.json').write_text(json.dumps({'objetos':[modelo],'supgp_intentado_utc':S.iso(ahora)}))
    (tmp_path/'lanzamientos.json').write_text(json.dumps({'generado_utc':S.iso(ahora),'objetos':{}}))
    llamadas=[]
    def bajar(url,limite=None):
        llamadas.append(url)
        if url==S.MANIFEST:return 'MEME_65278_STARLINK-35000_a.txt\nMEME_100001_STARLINK-1_a.txt'
        raise OSError('HTTP 429')
    monkeypatch.setattr(S,'descargar',bajar)
    d=S.construir(tmp_path,limite=10,pausa=0)
    assert d['validos']==1 and len(d['errores'])==1
    assert len(llamadas)==2


def test_supgp_preserva_epoca_y_distinge_rms_de_error_maximo():
    raw={'OBJECT_NAME':'STARLINK-TEST','OBJECT_ID':'2026-100A','NORAD_CAT_ID':100001,'EPOCH':'2026-11-15T13:59:59.999962',
         'MEAN_MOTION':15.3,'ECCENTRICITY':.0003,'INCLINATION':53,'RA_OF_ASC_NODE':30,'ARG_OF_PERICENTER':0,
         'MEAN_ANOMALY':12,'BSTAR':0,'MEAN_MOTION_DOT':0,'MEAN_MOTION_DDOT':0,'RMS':'0.314','DATA_SOURCE':'SpaceX-E'}
    x=S.modelos_supgp([raw],AHORA)[0]
    assert x['omm']['EPOCH'].endswith('59.999962')
    assert x['error_rms_km']==.314 and 'error_max_km' not in x
    assert S.modelos_supgp([{**raw,'RMS':'99'}],AHORA)==[]
    assert S.modelos_supgp([{**raw,'DATA_SOURCE':'otro'}],AHORA)==[]
    assert S.modelos_supgp([raw],AHORA+timedelta(days=2))==[]
