import sys
from pathlib import Path
from datetime import datetime, timezone
import pytest
from google.transit import gtfs_realtime_pb2 as G
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'transporte'))
import trenes as T


def renfe_entry(ident='123',timestamp=None,lon=-3.7):
    return {'id':'vp-'+ident,'vehicle':{'timestamp':str(timestamp or int(datetime.now(timezone.utc).timestamp())), 'position':{'latitude':40.4,'longitude':lon,'speed':10},'vehicle':{'id':ident,'label':'C1-123'},'trip':{'tripId':'trip-qa'},'currentStatus':'STOPPED_AT'}}


def test_renfe_edad_coordenadas_y_deduplicacion():
    now=int(datetime.now(timezone.utc).timestamp())
    a=renfe_entry(); d={'entity':[a,a,renfe_entry('old',now-4000),renfe_entry('future',now+300),renfe_entry('nan',lon=float('nan')),{'id':'sin-pos','vehicle':{}}]}
    out=T.renfe_json(d)
    assert len(out)==1
    p=out[0]['properties']
    assert p['red']=='renfe' and p['pais']=='ESP' and p['vel_kmh']==36
    assert p['observado_utc']==p['hora'] and p['recibido_utc']
    no_timestamp=renfe_entry();del no_timestamp['vehicle']['timestamp']
    assert T.renfe_json({'header':{'timestamp':now},'entity':[no_timestamp]})==[]
    with pytest.raises(ValueError):T.renfe_json({'header':{'incrementality':'DIFFERENTIAL'},'entity':[]})


def test_ktmb_proto_timestamp_real_y_campos_opcionales():
    f=G.FeedMessage();f.header.gtfs_realtime_version='2.0';f.header.timestamp=int(datetime.now(timezone.utc).timestamp())
    for ident,ts,lon in [('qa',f.header.timestamp,101.7),('old',f.header.timestamp-4000,101.7),('bad',f.header.timestamp,300)]:
        e=f.entity.add();e.id=ident;e.vehicle.timestamp=ts;e.vehicle.position.latitude=3.1;e.vehicle.position.longitude=lon;e.vehicle.vehicle.id=ident
    out=T.ktmb_protobuf(f.SerializeToString());assert len(out)==1
    assert out[0]['properties']['vel_kmh'] is None
    assert out[0]['properties']['red']=='ktmb'
    f.entity[0].vehicle.ClearField('timestamp')
    assert T.ktmb_protobuf(f.SerializeToString())==[]
    f.header.incrementality=G.FeedHeader.DIFFERENTIAL
    with pytest.raises(ValueError):T.ktmb_protobuf(f.SerializeToString())


def test_se_conservan_las_cinco_redes_y_las_dos_nuevas():
    assert {'finlandia','noruega','irlanda','boston','filadelfia','renfe','ktmb'}==set(T.REDES)
    assert T.gtfs_timestamp(None) is None
    assert T.gtfs_vehicle('ktmb','MYS','x','',{'longitude':True,'latitude':3},1) is None
