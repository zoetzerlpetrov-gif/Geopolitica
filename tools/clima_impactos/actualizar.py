#!/usr/bin/env python3
"""Panorama climático Admin. Solo datos públicos y consultas compartidas desde GitHub Actions.
Conserva el último dato bueno con su fecha original y expone errores por fuente.
MET Norway: identificación, coordenadas <=4 decimales, Expires/Last-Modified y pausa entre ciudades.
No extrapola el tiempo meteorológico ni estima inflación atribuible al clima.
"""
import argparse
import copy
import gzip
import html
import json
import math
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UA = 'DOMINUS-clima/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)'
PAGES = 'https://dominusosint.com/'
URL_ENSO = 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml'
URL_PROB = 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/probabilities/'
MESES = {n: i + 1 for i, n in enumerate('January February March April May June July August September October November December'.split())}
TEMPORADAS = ['DJF', 'JFM', 'FMA', 'MAM', 'AMJ', 'MJJ', 'JJA', 'JAS', 'ASO', 'SON', 'OND', 'NDJ']


def iso(t=None):
    return (t or datetime.now(timezone.utc)).strftime('%Y-%m-%dT%H:%M:%SZ')


def plano(texto):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', texto))).strip()


def numero(x):
    return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) else None


def discusion(texto):
    s = plano(texto)
    fecha = re.search(r'(\d{1,2})\s+(' + '|'.join(MESES) + r')\s+(20\d{2})', s)
    estado = re.search(r'ENSO Alert System Status:\s*(.+?)(?:Synopsis:|\s[-—]{3,})', s, re.I)
    if not fecha or not estado:
        raise ValueError('boletín ENSO sin fecha o estado reconocible')
    dia, mes, anio = fecha.groups()
    f = datetime(int(anio), MESES[mes], int(dia), tzinfo=timezone.utc)
    nombre = estado.group(1).strip(' -—')[:160]
    n = nombre.lower().replace('ñ', 'n')
    fase = 'neutral' if ('not active' in n or 'final ' in n) else 'nina' if 'la nina advisory' in n else 'nino' if 'el nino advisory' in n else 'vigilancia'
    # El resto del boletín se consulta en origen; DOMINUS no reproduce la discusión completa.
    return {'estado_en': nombre, 'fase': fase, 'emitido': f.date().isoformat()}


def probabilidades(texto):
    s = plano(texto)
    fecha = re.search(r'Issued\s+(' + '|'.join(MESES) + r')\s+(20\d{2})', s)
    if not fecha:
        raise ValueError('probabilidades sin mes de emisión')
    mes, anio = MESES[fecha[1]], int(fecha[2])
    filas, vistas, anterior = [], set(), mes - 2
    patron = r'\b(' + '|'.join(TEMPORADAS) + r')\s+(?:[A-Za-z]{3}\s+){0,3}(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\b'
    for m in re.finditer(patron, s):
        periodo, nina, neutral, nino = m[1], *map(int, m.groups()[1:])
        if periodo in vistas or any(x < 0 or x > 100 for x in (nina, neutral, nino)) or abs(nina + neutral + nino - 100) > 1:
            continue
        inicio = TEMPORADAS.index(periodo)  # DJF inicia en diciembre: índice 0 representa mes 12 del año previo.
        inicio_mes = (inicio + 11) % 12 + 1
        # Busca el año que mantiene orden cronológico desde el trimestre en curso, sin ambigüedad de NDJ/DJF.
        candidatos = [12 * y + inicio_mes - 1 for y in (anio - 1, anio, anio + 1, anio + 2)]
        minimo = 12 * anio + mes - 3 if not filas else anterior + 1
        serial = min(x for x in candidatos if x >= minimo)
        anterior = serial
        fi, mi = divmod(serial, 12)
        ff, mf = divmod(serial + 2, 12)
        filas.append({'temporada': periodo, 'desde': f'{fi:04d}-{mi+1:02d}', 'hasta': f'{ff:04d}-{mf+1:02d}', 'nina': nina, 'neutral': neutral, 'nino': nino})
        vistas.add(periodo)
        if len(filas) == 9:
            break
    if not filas:
        raise ValueError('tabla de probabilidades no reconocida')
    return {'emitido': f'{anio:04d}-{mes:02d}', 'periodos': filas, 'indice': 'RONI; ver definición y climatología en NOAA CPC'}


def meteorologia(j):
    p = j.get('properties') or {}
    emitido = (p.get('meta') or {}).get('updated_at')
    if not emitido:
        raise ValueError('pronóstico sin fecha de actualización del proveedor')
    horas = []
    for paso in p.get('timeseries', []):
        t, d = paso.get('time', ''), paso.get('data') or {}
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', t):
            continue
        x = (d.get('instant') or {}).get('details') or {}
        lluvia = lambda h: numero(((d.get('next_' + str(h) + '_hours') or {}).get('details') or {}).get('precipitation_amount'))
        temp, vel = numero(x.get('air_temperature')), numero(x.get('wind_speed'))
        if temp is None and vel is None:
            continue
        horas.append({'t': t, 'temp_c': temp, 'humedad_pct': numero(x.get('relative_humidity')), 'viento_kmh': round(vel * 3.6, 2) if vel is not None else None,
                      'lluvia_1h_mm': lluvia(1), 'lluvia_6h_mm': lluvia(6)})
    horas.sort(key=lambda x: x['t'])
    if not horas:
        raise ValueError('pronóstico sin valores numéricos válidos')
    return {'emitido_utc': emitido, 'desde_utc': horas[0]['t'], 'hasta_utc': horas[-1]['t'], 'horas': horas,
            'fuente': 'MET Norway · Locationforecast', 'licencia': 'CC BY 4.0; selección y conversión de m/s a km/h por DOMINUS'}


def obtener(url, cabeceras=None):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip', **(cabeceras or {})})
    with urllib.request.urlopen(req, timeout=25) as r:
        b = r.read(5_000_001)
        if len(b) > 5_000_000:
            raise ValueError('respuesta demasiado grande')
        if r.headers.get('Content-Encoding') == 'gzip':
            b = gzip.decompress(b)
        return b.decode(r.headers.get_content_charset() or 'utf-8', 'replace'), dict(r.headers)


def actualizar_fuente(previo, url, parser, ahora, pedir=obtener):
    r = copy.deepcopy(previo or {})
    r.update(url=url, intento_utc=iso(ahora))
    try:
        texto, _ = pedir(url)
        dato = parser(texto)
        r.update(ok=True, dato=dato, consultado_utc=iso(ahora))
        r.pop('error', None)
    except Exception as e:  # aislamiento por proveedor; conserva fecha y dato anteriores
        r.update(ok=False, error=f'{type(e).__name__}: {str(e)[:180]}')
    return r


def actualizar_lugar(previo, lugar, cache, ahora, pedir=obtener):
    url = f'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={lugar["lat"]:.4f}&lon={lugar["lon"]:.4f}'
    r = copy.deepcopy(previo or {})
    r.update(lugar=lugar['id'], url=url, intento_utc=iso(ahora))
    c = cache.setdefault(lugar['id'], {})
    try:
        expira = parsedate_to_datetime(c['expires']) if c.get('expires') else None
        if expira and expira > ahora and r.get('dato'):
            return r
    except (TypeError, ValueError):
        pass
    try:
        texto, headers = pedir(url, {'If-Modified-Since': c['last_modified']} if c.get('last_modified') else {})
        dato = meteorologia(json.loads(texto))
        r.update(ok=True, dato=dato, consultado_utc=iso(ahora))
        r.pop('error', None)
        h = {k.lower(): v for k, v in headers.items()}
        c.update(expires=h.get('expires', ''), last_modified=h.get('last-modified', ''))
    except urllib.error.HTTPError as e:
        if e.code == 304 and r.get('dato'):
            r.update(ok=True, consultado_utc=iso(ahora))
            r.pop('error', None)
            h = {k.lower(): v for k, v in (e.headers or {}).items()}
            if h.get('expires'):
                c['expires'] = h['expires']
        else:
            r.update(ok=False, error=f'HTTP {e.code}')
    except Exception as e:
        r.update(ok=False, error=f'{type(e).__name__}: {str(e)[:160]}')
    return r


def compacto(nombre, j):
    if nombre == 'precios':
        return {'generado_utc': j.get('generado_utc'), 'series': [{**s, 'puntos': (s.get('puntos') or [])[-36:]} for s in j.get('series', [])], 'errores': j.get('errores', [])}
    if nombre == 'ciclones':
        return {'generado_utc': j.get('generado_utc') or (j.get('metadata') or {}).get('generated'), 'features': j.get('features', [])[:80]}
    return j


def cargar(p, defecto):
    try:
        return json.loads(p.read_text())
    except (OSError, ValueError):
        return defecto


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--salida', default=str(ROOT / 'data/clima-impactos'))
    ap.add_argument('--pausa', type=float, default=1.1)
    args = ap.parse_args()
    out = Path(args.salida)
    out.mkdir(parents=True, exist_ok=True)
    previo = cargar(out / 'panorama.json', {})
    cache = cargar(out / 'cache.json', {})
    ahora = datetime.now(timezone.utc)
    config = cargar(ROOT / 'config/clima-impactos.json', {})
    res = {'version': 1, 'generado_utc': iso(ahora), 'fuentes': {}, 'lugares': {}}
    for nombre, url, fn in [('enso', URL_ENSO, discusion), ('probabilidades', URL_PROB, probabilidades),
        ('polos', PAGES + 'data/vivos/polos_indicadores.json', json.loads), ('ciclones', PAGES + 'data/vivos/ciclones_mundo.geojson', json.loads),
        ('precios', PAGES + 'data/economia/precios_mx.json', json.loads)]:
        res['fuentes'][nombre] = actualizar_fuente(previo.get('fuentes', {}).get(nombre), url, lambda s, fn=fn, n=nombre: compacto(n, fn(s)), ahora)
        print(nombre, 'ok' if res['fuentes'][nombre]['ok'] else res['fuentes'][nombre].get('error'), flush=True)
    for lugar in config.get('lugares', []):
        r = actualizar_lugar(previo.get('lugares', {}).get(lugar['id']), lugar, cache, ahora)
        res['lugares'][lugar['id']] = r
        print(lugar['id'], 'ok' if r.get('ok') else r.get('error'), flush=True)
        time.sleep(max(1.0, args.pausa))
    (out / 'panorama.json').write_text(json.dumps(res, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    (out / 'cache.json').write_text(json.dumps(cache, separators=(',', ':')) + '\n')
    return 0 if any(x.get('dato') for x in [*res['fuentes'].values(), *res['lugares'].values()]) else 1


if __name__ == '__main__':
    raise SystemExit(main())
