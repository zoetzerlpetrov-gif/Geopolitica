"""Actualización exclusiva del video, sin escribir ni alterar datos del mapa.

Fecha de publicación en America/Mexico_City; pronósticos por fecha civil de cada ciudad.
Una consulta reciente no convierte una referencia diaria ni un cierre en precio en vivo.
"""
import copy
import json
import math
import os
import sys
import time
from threading import Lock
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'noticiero'))
import cifras as C  # noqa: E402

COINBASE = 'https://api.coinbase.com/v2/exchange-rates?currency=USD'
MET = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={lat:.3f}&lon={lon:.3f}'
# Nombre usado por el guion, coordenadas y zona civil (incluye cambios de horario).
CIUDADES = [
    ('Ciudad de Mexico', 19.433, -99.133, 'America/Mexico_City'),
    ('Guadalajara', 20.676, -103.348, 'America/Mexico_City'),
    ('Monterrey', 25.686, -100.316, 'America/Monterrey'),
    ('Puebla', 19.041, -98.206, 'America/Mexico_City'),
    ('Tijuana', 32.515, -117.038, 'America/Tijuana'),
    ('Merida', 20.967, -89.593, 'America/Merida'),
    ('Cancun', 21.161, -86.852, 'America/Cancun'),
    ('Nueva York', 40.713, -74.006, 'America/New_York'),
    ('Los Angeles', 34.052, -118.244, 'America/Los_Angeles'),
    ('Toronto', 43.653, -79.383, 'America/Toronto'),
    ('Bogota', 4.711, -74.072, 'America/Bogota'),
    ('Sao Paulo', -23.551, -46.633, 'America/Sao_Paulo'),
    ('Buenos Aires', -34.604, -58.382, 'America/Argentina/Buenos_Aires'),
    ('Madrid', 40.417, -3.704, 'Europe/Madrid'),
    ('Londres', 51.507, -0.128, 'Europe/London'),
    ('Paris', 48.857, 2.352, 'Europe/Paris'),
    ('Berlin', 52.520, 13.405, 'Europe/Berlin'),
    ('Moscú', 55.756, 37.617, 'Europe/Moscow'),
    ('El Cairo', 30.044, 31.236, 'Africa/Cairo'),
    ('Mumbai', 19.076, 72.878, 'Asia/Kolkata'),
    ('Pekin', 39.904, 116.407, 'Asia/Shanghai'),
    ('Tokio', 35.676, 139.650, 'Asia/Tokyo'),
]


def iso(dt):
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def positivo(v):
    n = float(v)
    if not math.isfinite(n) or n <= 0:
        raise ValueError('cotización no válida')
    return n


def divisas_indicativas(js, ahora):
    """Coinbase no fecha sus tasas: se declara la hora de consulta, nunca hora de operación."""
    d = js['data']
    if d['currency'] != 'USD':
        raise ValueError('moneda base inesperada')
    tasas = d['rates']
    mxn, eur = positivo(tasas['MXN']), positivo(tasas['EUR'])
    fecha = iso(ahora)
    return C.grupo('video_divisas', 'Divisas indicativas consultadas para el video', 'Coinbase Data API',
                   COINBASE, [
                       C.dato('USD_MXN_REF', 'Dólar indicativo', mxn, 'MXN por USD', fecha, corto='USD/MXN indicativo'),
                       C.dato('EUR_MXN_REF', 'Euro indicativo', mxn / eur, 'MXN por EUR', fecha, corto='EUR/MXN indicativo')],
                   'Conversión indicativa, no FIX ni precio garantizado de banco. Fecha y hora de consulta; la API no proporciona hora de operación.')


def actualizar_cifras(previo, ahora=None, bajar=C.bajar, token=None):
    ahora = ahora or datetime.now(timezone.utc)
    grupos = {g['id']: copy.deepcopy(g) for g in (previo or {}).get('grupos', [])}
    errores = []
    def intentar(id_, fn):
        try:
            grupo = fn()
            if not grupo.get('datos'):
                raise ValueError('sin datos')
            grupo['consultado_utc'] = iso(ahora)
            return id_, grupo, None
        except Exception as exc:  # una fuente caída no vuelve reciente su dato anterior
            return id_, None, f'{id_}: {exc}'[:180]
    def ecb():
        tasas, fecha = C.leer_ecb(bajar(C.ECB, timeout=25))
        return C.grupo('divisas', 'Divisas de referencia', 'BCE', C.ECB, C.divisas(tasas, fecha))
    tareas = [
        ('video_divisas', lambda: divisas_indicativas(json.loads(bajar(COINBASE, timeout=25)), ahora)),
        ('divisas', ecb),
        ('cripto', lambda: C.grupo('cripto', 'Criptomonedas', 'Kraken', C.KRAKEN,
                                  C.leer_kraken(json.loads(bajar(C.KRAKEN, timeout=25)), iso(ahora)))),
        ('eua_bonos', lambda: C.grupo('eua_bonos', 'Bonos del Tesoro', 'Tesoro de EUA', C.TESORO.format(mes=ahora.strftime('%Y%m')),
                                     C.leer_tesoro(bajar(C.TESORO.format(mes=ahora.strftime('%Y%m')), timeout=25).decode()))),
    ]
    token = os.environ.get('BANXICO_API_KEY', '') if token is None else token
    if token:
        try:
            mx = C.banxico(token, ahora)
            for id_ in ('mx', 'mx_valores'):
                datos = [d for d in mx if d['grupo'] == id_]
                if datos:
                    grupos[id_] = C.grupo(id_, 'Banco de México', 'Banxico SIE', 'https://www.banxico.org.mx/SieInternet/', datos)
        except Exception as exc:
            errores.append(f'Banxico: {exc}'[:180])
    with ThreadPoolExecutor(max_workers=4) as pool:
        for id_, grupo, error in pool.map(lambda tarea: intentar(*tarea), tareas):
            if grupo:
                grupos[id_] = grupo
            if error:
                errores.append(error)
    # No conservar una conversión indicativa de otra generación si falló la consulta.
    if any(e.startswith('video_divisas:') for e in errores):
        grupos.pop('video_divisas', None)
    return {'generado_utc': iso(ahora), 'grupos': list(grupos.values()), 'errores': errores}


def pronostico_ciudad(js, ciudad, fecha, ahora):
    nombre, lat, lon, zona = ciudad
    tz = ZoneInfo(zona)
    meta = (js.get('properties') or {}).get('meta') or {}
    actualizado = datetime.fromisoformat(meta['updated_at'].replace('Z', '+00:00'))
    if actualizado.tzinfo is None or not timedelta(hours=-1) <= ahora - actualizado <= timedelta(hours=18):
        raise ValueError('pronóstico demasiado antiguo o sin zona horaria')
    muestras = []
    for p in js.get('properties', {}).get('timeseries', []):
        t = datetime.fromisoformat(p['time'].replace('Z', '+00:00'))
        v = p.get('data', {}).get('instant', {}).get('details', {}).get('air_temperature')
        if t.astimezone(tz).date().isoformat() == fecha and v is not None and math.isfinite(float(v)):
            muestras.append((t, float(v)))
    if not muestras:
        raise ValueError('sin pronóstico para la fecha de publicación')
    temperaturas = [v for _, v in muestras]
    desde = min(t for t, _ in muestras).astimezone(tz)
    return {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
            'properties': {'name': nombre, 'serie': [[fecha, max(temperaturas), min(temperaturas)]],
                           'zona': zona, 'modelo_utc': iso(actualizado), 'desde_local': desde.isoformat(),
                           'parcial': desde.hour != 0 or desde.minute != 0}}


def actualizar_clima(fecha, ahora=None, bajar=C.bajar, ciudades=CIUDADES):
    ahora = ahora or datetime.now(timezone.utc)
    cerrojo, ultimo = Lock(), [0.0]
    def una(ciudad):
        try:
            _, lat, lon, _ = ciudad
            with cerrojo:
                time.sleep(max(0, 0.3 - (time.monotonic() - ultimo[0])))
                ultimo[0] = time.monotonic()
            js = json.loads(bajar(MET.format(lat=lat, lon=lon), timeout=25))
            return pronostico_ciudad(js, ciudad, fecha, ahora), None
        except Exception as exc:
            return None, f'{ciudad[0]}: {exc}'[:180]
    features, errores = [], []
    # Menos de cinco peticiones por segundo, una por ciudad y generación.
    with ThreadPoolExecutor(max_workers=3) as pool:
        for feature, error in pool.map(una, ciudades):
            if feature:
                features.append(feature)
            if error:
                errores.append(error)
    return {'type': 'FeatureCollection', 'features': features, 'generado_utc': iso(ahora), 'fecha': fecha,
            'fuente': 'MET Norway (CC BY 4.0)', 'actualizacion_video': True, 'errores': errores}


def sincronizar_economia(indicadores, cifras):
    out = copy.deepcopy(indicadores or {})
    filas = out.setdefault('indicadores', [])
    ids = {'SF43718': 'mx_fix', 'SF61745': 'mx_tasa', 'SP30578': 'mx_inflacion'}
    for grupo in (cifras or {}).get('grupos', []):
        for dato in grupo.get('datos', []):
            if dato['id'] in ids:
                id_ = ids[dato['id']]
                fila = next((x for x in filas if x['id'] == id_), None)
                if fila is None:
                    fila = {'id': id_, 'puntos': []}
                    filas.append(fila)
                puntos = {p[0]: p[1] for p in fila.get('puntos', [])}
                puntos[dato['fecha'][:10]] = dato['valor']
                fila['puntos'] = sorted(puntos.items())
    return out
