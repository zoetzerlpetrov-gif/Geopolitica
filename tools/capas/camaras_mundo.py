"""Catálogos oficiales de CCTV público. No escanea dispositivos ni retransmite imágenes.

Cada proveedor falla por separado. Solo los metadatos se guardan; las imágenes se
solicitan al operador al abrir una ficha. Las fuentes sin permiso de incorporación
se muestran mediante su página oficial. Ningún secreto se escribe en la salida.
"""
import concurrent.futures
from datetime import datetime, timezone
import gzip
import hashlib
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

UA = 'Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)'
MAX_BYTES = 24 * 1024 * 1024


def url_publica(u, hosts=None, http=False):
    """Valida enlaces públicos; los medios además tienen lista de dominios permitidos."""
    try:
        p = urllib.parse.urlsplit(str(u))
        if p.scheme not in (('https', 'http') if http else ('https',)) or p.username or p.password:
            return ''
        h = (p.hostname or '').lower()
        if not h or h == 'localhost' or h.endswith(('.local', '.internal')):
            return ''
        try:
            if not ipaddress.ip_address(h).is_global:
                return ''
        except ValueError:
            if '.' not in h:
                return ''
        if hosts is not None and not any(h == x or (x.startswith('*.') and h.endswith(x[1:])) for x in hosts):
            return ''
        if any(k.lower() in ('key', 'api_key', 'apikey', 'accesscode', 'token', 'access_token', 'signature', 'x-amz-signature')
               for k, _ in urllib.parse.parse_qsl(p.query)):
            return ''
        return str(u)
    except (TypeError, ValueError):
        return ''


def descargar(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json, application/xml;q=0.9, */*;q=0.8',
                                               'Accept-Encoding': 'gzip', 'Digitraffic-User': 'Geopolitica-monitor'})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError('catálogo demasiado grande')
        if r.headers.get('Content-Encoding') == 'gzip' or raw[:2] == b'\x1f\x8b':
            # Límite también después de descomprimir.
            import io
            with gzip.GzipFile(fileobj=io.BytesIO(raw)) as g:
                raw = g.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise ValueError('catálogo descomprimido demasiado grande')
        return raw


def json_de(raw):
    """JSON/JSONP conocido sin eval; Toronto publica JSONP con extensión .json."""
    s = raw.decode('utf-8-sig') if isinstance(raw, bytes) else raw
    m = re.fullmatch(r'\s*(?:jsonTMCEarthCamerasCallback|jsonCallback)\s*\((.*)\)\s*;?\s*', s, re.S)
    return json.loads(m.group(1) if m else s)


def campos(e):
    return {x.tag.rsplit('}', 1)[-1]: (x.text or '').strip() for x in e if x.text}


def registros(s, raw):
    """Normaliza cada esquema oficial a (id, nombre, lon, lat, extras)."""
    sid = s['id']
    if sid == 'tarktee':
        ns = {'d': 'http://datex2.eu/schema/2/2_0'}
        for e in ET.fromstring(raw).findall('.//d:predefinedLocation', ns):
            yield e.get('id'), e.findtext('.//d:predefinedLocationName/d:values/d:value', '', ns), e.findtext('.//d:longitude', '', ns), e.findtext('.//d:latitude', '', ns), {}
        return
    if sid == 'catalunya':
        for e in ET.fromstring(raw).iter():
            if e.tag.rsplit('}', 1)[-1] != 'cameres':
                continue
            p = campos(e)
            xy = next((x.text for x in e.iter() if x.tag.rsplit('}', 1)[-1] == 'coordinates'), '')
            if not xy:
                continue
            lon, lat = xy.split(',')[:2]
            # HTTP solo como enlace externo: no se incrustan imágenes mixtas.
            yield p.get('link'), f"{p.get('carretera', '')} · {p.get('municipi', '')} · {p.get('pk', '')}", lon, lat, {'x': p.get('link'), 'o': p.get('font', 'SCT')}
        return
    if sid == 'cita':
        ns = {'k': 'http://www.opengis.net/kml/2.2'}
        for e in ET.fromstring(raw).findall('.//k:Placemark', ns):
            xy = e.findtext('.//k:coordinates', '', ns).strip().split(',')
            if len(xy) < 2:
                continue
            desc = e.findtext('k:description', '', ns)
            match = re.search(r'https://www\.cita\.lu/webcam/map/\d+', desc)
            yield e.get('id'), e.findtext('k:name', 'Cámara CITA', ns), *xy[:2], {'x': match.group() if match else s['pagina']}
        return
    d = json_de(raw)
    if sid in ('noruega', 'nsw', 'queensland', 'kingcounty'):
        if d.get('exceededTransferLimit') or (d.get('numberMatched', 0) > len(d.get('features', []))):
            raise ValueError('catálogo truncado: requiere paginación')
        for f in d.get('features', []):
            p = f.get('properties') or {}
            xy = (f.get('geometry') or {}).get('coordinates') or []
            if len(xy) < 2:
                continue
            if sid == 'noruega':
                if p.get('status.stillImageAvailability') in ('notAvailable', 'outOfService'):
                    continue
                extra = {'imgs': [p.get('stillImageUrl')], 'hls': p.get('videoUrl'), 'captura_utc': p.get('lastUpdateTime')}
                yield p.get('cameraId'), p.get('description'), *xy[:2], extra
            elif sid == 'nsw':
                yield p.get('id') or p.get('href'), p.get('title'), *xy[:2], {'imgs': [p.get('href')], 'nota': p.get('view', '')[:500]}
            elif sid == 'queensland':
                yield p.get('id'), p.get('description'), *xy[:2], {'imgs': [p.get('image_url')], 'lugar': p.get('locality', ''), 'o': p.get('image_sourced_from') or s['operador']}
            elif str(p.get('CurrentStatus', '')).lower() == 'active':
                image = str(p.get('ImageURL') or '').replace('http://info.kingcounty.gov/', 'https://info.kingcounty.gov/')
                yield p.get('AssetID'), p.get('Location'), *xy[:2], {'imgs': [image], 'o': p.get('Owner') or s['operador']}
    elif sid == 'tfl':
        for c in d:
            p = {x.get('key'): x.get('value') for x in c.get('additionalProperties', [])}
            if p.get('available', 'true') != 'true':
                continue
            yield c.get('id'), c.get('commonName'), c.get('lon'), c.get('lat'), {'imgs': [p.get('imageUrl')], 'mp4': p.get('videoUrl'), 'modo': 'clip'}
    elif sid == 'drivebc':
        for c in d:
            xy = (c.get('location') or {}).get('coordinates') or []
            if len(xy) < 2 or c.get('is_on') is False or c.get('should_appear') is False:
                continue
            image = urllib.parse.urljoin(s['pagina'], (c.get('links') or {}).get('imageDisplay') or '')
            yield c.get('id'), c.get('name'), *xy[:2], {'imgs': [image], 'nota': c.get('caption', ''), 'credito': c.get('credit') or '',
                'captura_utc': c.get('last_update_modified'), 'demorada': bool(c.get('marked_stale') or c.get('marked_delayed'))}
    elif sid == 'calgary':
        for c in d:
            xy = (c.get('point') or {}).get('coordinates') or []
            if len(xy) >= 2:
                image = str((c.get('camera_url') or {}).get('url') or '').replace('http://trafficcam.calgary.ca/', 'https://trafficcam.calgary.ca/')
                yield image, c.get('camera_location'), *xy[:2], {'imgs': [image]}
    elif sid == 'vancouver':
        for c in d:
            p = c.get('geo_point_2d') or {}
            yield c.get('mapid'), c.get('name'), p.get('lon'), p.get('lat'), {'x': c.get('url')}
    elif sid == 'toronto':
        for c in d.get('Data', []):
            cid = str(c.get('Number', ''))
            if cid.isdigit():
                yield cid, c.get('Name'), c.get('Longitude'), c.get('Latitude'), {'imgs': [f'https://opendata.toronto.ca/transportation/tmc/rescucameraimages/CameraImages/loc{cid}.jpg']}
    elif sid == 'euskadi':
        for c in d:
            yield c.get('INDEX'), c.get('TITLE'), c.get('LONWGS84'), c.get('LATWGS84'), {'imgs': [c.get('URLCAM')], 'lugar': c.get('ROAD', '')}
    elif sid == 'geonet':
        for group in d:
            for c in group.get('features', []):
                p = c.get('properties') or {}
                xy = (c.get('geometry') or {}).get('coordinates') or []
                if len(xy) < 2:
                    continue
                # GeoNet publica [lat, lon], aunque lo llama GeoJSON.
                yield p.get('latest-image-large'), p.get('title'), xy[1], xy[0], {'imgs': [urllib.parse.urljoin(s['api'], p.get('latest-image-large') or '')],
                    'st': 'volcanes_clima', 'captura_utc': p.get('latest-timestamp')}
    elif sid == 'wsdot_publico':
        for c in d.get('features', []):
            p, g = c.get('attributes') or {}, c.get('geometry') or {}
            x, y = g.get('x'), g.get('y')
            if x is None or y is None:
                continue
            lon, lat = float(x) / 6378137 * 180 / math.pi, math.degrees(math.atan(math.sinh(float(y) / 6378137)))
            yield p.get('CameraID'), p.get('CameraTitle'), lon, lat, {'imgs': [p.get('ImageURL')]}
    elif sid == 'autostrade':
        for c in d.get('webcams', []):
            yield c.get('c_uuid'), c.get('t_des_pub'), c.get('n_crd_lon'), c.get('n_crd_lat'), {}
    elif sid == 'deldot':
        for c in d.get('videoCameras', []):
            if c.get('enabled') is False or c.get('status') != 'Active':
                continue
            yield c.get('id'), c.get('title'), c.get('lon'), c.get('lat'), {}
    else:
        raise ValueError('adaptador desconocido')


def normalizar(s, raw):
    out = []
    for cid, nombre, lon, lat, extra in registros(s, raw):
        try:
            lon, lat = float(lon), float(lat)
            if not (math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90) or (lon == 0 and lat == 0):
                continue
        except (TypeError, ValueError):
            continue
        if cid is None:
            continue
        # Los identificadores basados en URL se convierten en hash estable.
        cid = str(cid)
        if len(cid) > 100 or '://' in cid:
            cid = hashlib.sha256(cid.encode()).hexdigest()[:20]
        p = {'id': f"{s['id']}:{cid}", 'n': str(nombre or 'Cámara pública')[:300], 'p': s['pais'], 'st': 'trafico',
             'x': s['pagina'], 'o': s['operador'], 't': 'organismo_publico', 'lic': s['licencia'], 'lic_url': s['terminos'],
             'fuente': s['id'], 'modo': 'enlace', 'z': 4}
        p.update({k: v for k, v in extra.items() if v is not None})
        p['x'] = url_publica(p.get('x'), http=True) or s['pagina']
        imgs = [u for u in (url_publica(u, s.get('hosts', [])) for u in p.get('imgs', [])) if u]
        if imgs and s['medio'] != 'enlace':
            p['imgs'] = imgs[:4]
            p['modo'] = 'imagen'
        else:
            p.pop('imgs', None)
        for campo in ('hls', 'mp4'):
            u = url_publica(p.get(campo), s.get('hosts', []))
            if u and s['medio'] != 'enlace':
                p[campo] = u
                p['modo'] = 'clip' if campo == 'mp4' else 'video'
            else:
                p.pop(campo, None)
        if s['id'] == 'wsdot_publico' and not p.get('imgs'):
            continue  # No publicar medios de terceros bajo atribución WSDOT.
        if s['medio'] == 'enlace':
            p['nota'] = (str(p.get('nota') or '') + ' Consulta la cámara en el portal oficial; no se incorpora su señal.').strip()
        out.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(lon, 5), round(lat, 5)]}, 'properties': p})
    return out


def guardar(path, d):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    temp.replace(path)


def deduplicar(features):
    out, ids, medios = [], set(), set()
    for f in features:
        p = f['properties']
        if p['id'] in ids:
            continue
        keys = set()
        for u in p.get('imgs', []) + [p.get('hls'), p.get('mp4')]:
            if not u:
                continue
            up = urllib.parse.urlsplit(u)
            query = urllib.parse.urlencode([(k, v) for k, v in urllib.parse.parse_qsl(up.query) if k.lower() not in ('t', 'timestamp', '_')])
            keys.add(urllib.parse.urlunsplit((up.scheme, up.netloc.lower(), up.path, query, '')))
        if p.get('yt'):
            keys.add('youtube:' + p['yt'])
        if keys and keys <= medios:
            continue
        ids.add(p['id'])
        medios.update(keys)
        out.append(f)
    return out


def ampliar(C, inicial):
    """Restaura por proveedor, incluso en la primera migración del catálogo antiguo."""
    salida = Path(C.SALIDA)
    config = json.loads((Path(C.ROOT) / 'config/camaras_fuentes.json').read_text())
    anterior = []
    if (salida / 'camaras.geojson').exists():
        anterior = json.loads((salida / 'camaras.geojson').read_text()).get('features', [])
    viejos = {'wdm': 'webcams_mx', 'dt': 'digitraffic', 'ct': 'caltrans', 'ny': 'nyc_dot', 'sg': 'singapur', 'hk': 'hong_kong',
              'nz': 'nueva_zelanda', 'is': 'islandia', 'wa': 'wsdot', 'wy': 'windy', 'yt': 'youtube',
              'on': 'cam_511_on', 'ab': 'cam_511_ab', 'az': 'cam_511_az', 'nv': 'cam_511_nv', 'ga': 'cam_511_ga'}
    por_fuente = {}
    for f in anterior:
        p = f.get('properties') or {}
        sid = p.get('fuente') or viejos.get(str(p.get('id', '')).split(':')[0])
        if sid:
            por_fuente.setdefault(sid, []).append(f)
    ahora = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    informe = {}
    inicial = list(inicial)

    def ejecutar(sid, callback):
        cache = salida / 'camaras_cache' / f'{sid}.json'
        try:
            previo = json.loads(cache.read_text()) if cache.exists() else {'features': por_fuente.get(sid, []), 'actualizado_utc': None}
        except (ValueError, OSError):
            previo = {'features': por_fuente.get(sid, []), 'actualizado_utc': None}
        try:
            fs = callback()
            if not fs:
                raise ValueError('sin registros válidos')
            estado_legacy = C.CAM_FUENTES.get(sid, '')
            parcial = 'fallaron' in estado_legacy or estado_legacy.startswith('error')
            if parcial:
                nuevos_ids = {f['properties']['id'] for f in fs}
                retenidos = [dict(f, properties={**f['properties'], 'catalogo_anterior': True}) for f in previo['features'] if f['properties']['id'] not in nuevos_ids]
                fs += retenidos
            for f in fs:
                p = f['properties']
                p['fuente'] = sid
                if not p.get('catalogo_anterior'):
                    p['catalogo_utc'] = ahora
                # Windy devuelve ISO2; homogeneizar con la taxonomía del mapa.
                if len(p.get('p', '')) == 2:
                    p['p'] = C.iso3(p['p'])
            guardar(cache, {'features': fs, 'actualizado_utc': ahora})
            return fs, {'estado': 'parcial' if parcial else 'ok', 'camaras': len(fs), 'actualizado_utc': ahora}
        except Exception as e:  # Solo el tipo; mensajes HTTP pueden contener una clave.
            fs = [dict(f, properties={**f['properties'], 'fuente': sid, 'catalogo_anterior': True}) for f in previo['features']]
            for f in fs:
                if len(f['properties'].get('p', '')) == 2:
                    f['properties']['p'] = C.iso3(f['properties']['p'])
            return fs, {'estado': 'catalogo_anterior' if fs else 'error', 'camaras': len(fs), 'actualizado_utc': previo.get('actualizado_utc'), 'error': type(e).__name__}

    trabajos = []
    for s in config['fuentes']:
        if s['estado'] == 'activa':
            trabajos.append((s['id'], lambda s=s: normalizar(s, descargar(s['api']).decode('cp1252') if s['id'] == 'wsdot_publico' else descargar(s['api']))))
        else:
            informe[s['id']] = {'estado': s['estado'], 'camaras': 0, 'detalle': s.get('nota', '')}
    legacy = [
        ('webcams_mx', C.camaras_webcams_mx),
        ('digitraffic', lambda: C._fuente_camaras('digitraffic', [C.DIGITRAFFIC], C.camaras_digitraffic)),
        ('caltrans', lambda: C._fuente_camaras('caltrans', [C.CALTRANS.format(d=d) for d in range(1, 13)], C.camaras_caltrans)),
        ('singapur', lambda: C._fuente_camaras('singapur', [C.SINGAPUR], C.camaras_singapur)),
        ('hong_kong', lambda: C._fuente_camaras('hong_kong', [C.HONG_KONG], C.camaras_hong_kong, leer=descargar)),
        ('nueva_zelanda', lambda: C._fuente_camaras('nueva_zelanda', [C.NUEVA_ZELANDA], C.camaras_nueva_zelanda, leer=C.leer_json_aceptando)),
        ('islandia', lambda: C._fuente_camaras('islandia', [C.ISLANDIA], C.camaras_islandia)),
    ]
    if os.environ.get('CAM_NYC_ACUERDO') == 'true':
        legacy.append(('nyc_dot', lambda: C._fuente_camaras('nyc_dot', [C.NYC_DOT], C.camaras_nyc)))
    else:
        informe['nyc_dot'] = {'estado': 'permiso_pendiente', 'camaras': 0, 'detalle': 'Acuerdo de datos NYC DOT; CAM_NYC_ACUERDO=true tras su aceptación.'}
    # Claves opcionales: ejecución separada para conservar el último catálogo de cada operador.
    for sec, (base, pais, operador) in C.CAM_511.items():
        sid = sec.lower()
        key = os.environ.get(sec, '').strip()
        if key:
            url = f'{base}/api/v2/get/cameras?key={urllib.parse.quote(key, safe="")}&format=json'
            legacy.append((sid, lambda sid=sid, u=url, b=base, p=pais, o=operador, sec=sec: C._fuente_camaras(sid, [u], lambda d: C.camaras_511(d, b, p, o, sec[-2:].lower()), leer=C.leer_json_aceptando)))
        else:
            informe[sid] = {'estado': 'sin_clave', 'camaras': 0, 'secreto': sec}
    if os.environ.get('WSDOT_ACCESS_CODE', '').strip():
        url = 'https://wsdot.wa.gov/Traffic/api/HighwayCameras/HighwayCamerasREST.svc/GetCamerasAsJson?AccessCode=' + urllib.parse.quote(os.environ['WSDOT_ACCESS_CODE'].strip(), safe='')
        legacy.append(('wsdot', lambda u=url: C._fuente_camaras('wsdot', [u], C.camaras_wsdot, leer=C.leer_json_aceptando)))
    # Solo Windy de la función antigua; los 511/WSDOT ya se procesan arriba.
    key = os.environ.get('WINDY_WEBCAMS_KEY', '').strip()
    if key:
        def windy():
            def leer(u):
                req = urllib.request.Request(u, headers={'User-Agent': UA, 'Accept': 'application/json', 'x-windy-api-key': key})
                with urllib.request.urlopen(req, timeout=30) as r:
                    return json_de(r.read(MAX_BYTES))
            return C._fuente_camaras('windy', [f'https://api.windy.com/webcams/api/v3/webcams?limit=50&offset={o}&include=location' for o in range(0, 1000, 50)], C.camaras_windy, leer=leer)
        legacy.append(('windy', windy))
    else:
        informe['windy'] = {'estado': 'sin_clave', 'camaras': 0, 'secreto': 'WINDY_WEBCAMS_KEY'}
    if os.environ.get('YOUTUBE_API_KEY', '').strip():
        legacy.append(('youtube', C.camaras_youtube))
    else:
        informe['youtube'] = {'estado': 'sin_clave', 'camaras': 0, 'secreto': 'YOUTUBE_API_KEY'}
    trabajos += legacy
    # Deshabilitar una fuente o retirar su clave elimina también su caché pública.
    activos = {sid for sid, _ in trabajos}
    cache_dir = salida / 'camaras_cache'
    if cache_dir.exists():
        for p in cache_dir.glob('*.json'):
            if p.stem not in activos:
                p.unlink()
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        futures = {ex.submit(ejecutar, sid, cb): sid for sid, cb in trabajos}
        for future in concurrent.futures.as_completed(futures):
            sid = futures[future]
            fs, estado = future.result()
            informe[sid] = estado
            inicial.extend(fs)
            print(f"   cámaras {sid}: {estado['estado']} ({len(fs)})", flush=True)
    # Orden estable, sin depender de qué servidor respondió primero.
    inicial.sort(key=lambda f: (f['properties'].get('catalogo_anterior', False), f['properties'].get('fuente') == 'wsdot_publico', str(f['properties']['id'])))
    for f in inicial:
        if f["properties"].get("st") == "ciudad":
            f["properties"]["st"] = "turismo"
    out = deduplicar(inicial)
    conteos = {}
    for f in out:
        sid = f['properties'].get('fuente', 'curadas')
        conteos[sid] = conteos.get(sid, 0) + 1
    for sid, st in informe.items():
        st['publicadas'] = conteos.get(sid, 0)
        C.CAM_FUENTES[sid] = f"{st['estado']} ({st['publicadas']})" + (f" · {st['error']}" if st.get('error') else '')
    guardar(salida / 'camaras_estado.json', {'generado_utc': ahora, 'total': len(out), 'paises': sorted({f['properties'].get('p') for f in out if f['properties'].get('p')}), 'fuentes': informe})
    return out
