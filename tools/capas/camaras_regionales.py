"""Adaptadores regionales de cámaras que sus operadores publican intencionalmente.

No ejecuta JavaScript del proveedor ni consulta dispositivos: lee únicamente
páginas e inventarios oficiales publicados, con límites de conexiones y tamaño.
"""
import concurrent.futures
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import threading
import time
import urllib.parse

IDS = {'seattle', 'tallinn', 'dgac_chile', 'cetsp', 'izmir', 'kamchatka'}


class Enlaces(HTMLParser):
    def __init__(self, texto):
        super().__init__(convert_charrefs=True)
        self.links, self.imgs = [], []
        self.feed(texto)

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == 'a' and d.get('href'):
            self.links.append(d)
        elif tag == 'img' and d.get('src'):
            self.imgs.append(d)


def texto(raw):
    return raw.decode('utf-8-sig', 'replace') if isinstance(raw, bytes) else raw


def aerodromos(html_indice, html_coords):
    enlaces = Enlaces(texto(html_indice)).links
    codigos = {m.group(1) for a in enlaces if (m := re.fullmatch(r'/camara_ubicacion/show/designador/([A-Z]{4})', a['href'])) and '(MIL)' not in a.get('title', '')}
    patron = r"var point\s*=\s*\{'latitude':([\d.-]+),'longitude':([\d.-]+),'type':'[^']*'\}.*?marker\s*=\s*createMarker\(point,\"([A-Z]{4})\\n([^\"]+)\""
    out = {}
    for lat, lon, codigo, nombre in re.findall(patron, texto(html_coords), re.S):
        if codigo in codigos and '(MIL)' not in nombre:
            out[codigo] = {'lat': float(lat), 'lon': float(lon), 'nombre': html.unescape(nombre)}
    return out


def cargar(s, descargar, root):
    raw = descargar(s['api'])
    sid = s['id']
    if sid in ('seattle', 'izmir'):
        return json.loads(texto(raw))
    if sid == 'tallinn':
        ciudades = json.loads((Path(root) / 'config/ciudades.json').read_text())['ciudades']
        ciudad = next(c for c in ciudades if c[2] == 'EST' and c[0] == 'Tallinn')
        return {'html': texto(raw), 'lat': ciudad[3], 'lon': ciudad[4]}
    posiciones = json.loads((Path(root) / 'config/camaras_regionales_ubicaciones.json').read_text())
    if sid in ('cetsp', 'kamchatka'):
        return {'html': texto(raw), 'ubicaciones': posiciones[sid]}
    if sid == 'dgac_chile':
        coords = descargar(s['api_coordenadas'])
        estaciones = aerodromos(raw, coords)
        if not estaciones:
            raise ValueError('sin aeródromos públicos con coordenadas')
        paginas, fallos = {}, 0
        turno, proximo = threading.Lock(), [0.0]
        def leer(codigo):
            with turno:
                pausa = max(0, proximo[0] - time.monotonic())
                if pausa:
                    time.sleep(pausa)
                proximo[0] = time.monotonic() + 1
            try:
                return codigo, texto(descargar('https://aipchile.dgac.gob.cl/camara_ubicacion/show/designador/' + codigo))
            except Exception:
                return codigo, None
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
            for codigo, pagina in ex.map(leer, sorted(estaciones)):
                if pagina is None:
                    fallos += 1
                else:
                    paginas[codigo] = pagina
        return {'estaciones': estaciones, 'paginas': paginas, 'fallos': fallos}
    raise ValueError('adaptador regional desconocido')


def registros(s, d):
    sid = s['id']
    if sid == 'seattle':
        for feature in d.get('Features', []):
            xy = feature.get('PointCoordinate') or []
            if len(xy) < 2:
                continue
            # El servicio usa [lat, lon]. Solo cámaras SDOT, no socios con condiciones distintas.
            for c in feature.get('Cameras') or []:
                filename = str(c.get('ImageUrl') or '')
                if c.get('Type') != 'sdot' or not re.fullmatch(r'[^/\\\x00-\x1f]+\.jpg', filename, re.I) or filename.startswith('.'):
                    continue
                yield c.get('Id'), c.get('Description'), xy[1], xy[0], {'imgs': ['https://www.seattle.gov/trafficcams/images/' + urllib.parse.quote(filename, safe='')], 'nota': s.get('nota', '')}
    elif sid == 'tallinn':
        vistos = set()
        for cid, contenido in re.findall(r"<a\s+href=['\"]#modal_(cam\d+)['\"][^>]*>(.*?)</a>", d['html'], re.S | re.I):
            if cid in vistos or not any(im['src'] == f'/last/{cid}.jpg' for im in Enlaces(contenido).imgs):
                continue
            vistos.add(cid)
            limpio = re.sub(r'<!--.*?--!?\s*>', '', contenido, flags=re.S)
            nombre = html.unescape(re.sub(r'<[^>]+>', '', limpio)).strip()
            yield cid, nombre or f'Tallinn · {cid}', d['lon'], d['lat'], {
                'imgs': [f'https://ristmikud.tallinn.ee/last/{cid}.jpg'], 'aprox': 1,
                'credito': 'City of Tallinn',
                'nota': 'Ubicación aproximada de la ciudad de Tallinn, no de la cámara ni de la intersección. Nombre y captura del portal municipal.'}
    elif sid == 'dgac_chile':
        for codigo, pagina in d['paginas'].items():
            e = d['estaciones'][codigo]
            vistas = set()
            for a in Enlaces(pagina).links:
                u = urllib.parse.urljoin('https://aipchile.dgac.gob.cl/', a['href'])
                m = re.fullmatch(r'https://aipchile\.dgac\.gob\.cl/camara/ftp/([A-Z]{4})/([^/]+)/[^/?]+\.(?:jpg|jpeg)', u, re.I)
                if not m or m.group(1) != codigo or m.group(2) in vistas:
                    continue
                vistas.add(m.group(2))
                titulo = a.get('title', '')
                fecha = titulo.split('tomada el ', 1)[-1] if 'tomada el ' in titulo else ''
                yield codigo + '-' + m.group(2), f"{e['nombre']} · {codigo} · {m.group(2)}", e['lon'], e['lat'], {
                    'imgs': [u], 'st': 'yt_aeropuertos', 'p': 'ATA' if e['lat'] < -60 else 'CHL', 'aprox': 1,
                    'x': 'https://aipchile.dgac.gob.cl/camara_ubicacion/show/designador/' + codigo,
                    'captura_utc': fecha + ' UTC' if fecha else '',
                    'nota': 'Ubicación del aeródromo publicada por DGAC, no posición exacta de la cámara. Captura publicada por el operador; no es video continuo.'}
    elif sid == 'cetsp':
        patron = r"gCams\.push\(\{pasta:(\d+),titulo:'([^']*)',subTitulo:'([^']*)',detalhe:'[^']*',ativa:(true|false),apImg:(\d+)"
        for cid, titulo, sub, activa, numero in re.findall(patron, d['html']):
            pos = d['ubicaciones'].get(cid)
            if activa != 'true' or not pos:
                continue
            yield cid, html.unescape(titulo + ' · ' + sub), pos['lon'], pos['lat'], {
                'imgs': [f'https://cameras.cetsp.com.br/Cams/{cid}/{numero}.jpg'], 'aprox': 1,
                'credito': 'CET São Paulo; ubicación aproximada de la vía © OpenStreetMap contributors (ODbL)',
                'nota': 'Coordenadas aproximadas de la vía mencionada por CET, no de la instalación. CET puede retirar imágenes de incidentes graves para proteger a los involucrados.'}
    elif sid == 'izmir':
        result = d.get('result') or {}
        records = result.get('records') or []
        if result.get('total', 0) > len(records):
            raise ValueError('catálogo truncado')
        for c in records:
            yield c.get('_id'), c.get('ADI'), c.get('BOYLAM'), c.get('ENLEM'), {'nota': 'Inventario municipal de posiciones. La licencia del inventario no se extiende automáticamente a las imágenes; consulta la señal en el portal oficial.'}
    elif sid == 'kamchatka':
        vistos = set()
        for im in Enlaces(d['html']).imgs:
            m = re.fullmatch(r'/video/([A-Za-z0-9-]+)/img_1\.jpg', im['src'])
            if not m or m.group(1) in vistos:
                continue
            cid = m.group(1)
            pos = d['ubicaciones'].get(cid)
            if not pos:
                continue
            vistos.add(cid)
            yield cid, im.get('alt') or cid, pos['lon'], pos['lat'], {'st': 'volcanes_clima', 'aprox': 1,
                'nota': 'Punto aproximado del volcán observado, no de la cámara. Observación pública de la Academia de Ciencias de Rusia; se enlaza al portal original mientras se verifica el permiso de incorporación de imágenes.'}
