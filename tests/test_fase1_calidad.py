"""F027: fechas reportadas, recibidas y datos de caché no se confunden."""
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/transporte'))
import trenes as T


def test_fecha_futura_y_posicion_antigua_no_son_recientes():
    ahora = datetime(2026, 10, 28, 18, tzinfo=timezone.utc)
    assert not T.reciente((ahora + timedelta(days=1)).isoformat(), ahora)
    assert not T.reciente((ahora - timedelta(minutes=31)).isoformat(), ahora)
    assert T.reciente((ahora - timedelta(seconds=20)).isoformat(), ahora)


def test_septa_no_fabrica_hora_de_posicion():
    f = T.filadelfia_json([{'trainno':'7','lat':39.95,'lon':-75.16}])[0]
    p = f['properties']
    assert p['hora'] is None
    assert p['observado_utc'] is None
    assert p['recibido_utc'].endswith('Z')
    assert p['hora_tipo'] == 'desconocida'


def test_posicion_con_fecha_conserva_observacion_y_recepcion():
    f = T.tren('prueba','USA','1',-75,40,hora='2026-10-28T18:00:00Z')
    assert f['properties']['observado_utc'] == '2026-10-28T18:00:00Z'
    assert f['properties']['recibido_utc']
