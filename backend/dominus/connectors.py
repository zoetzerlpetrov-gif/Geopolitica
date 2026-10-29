"""Conectores de destinos fijos. Ninguna URL es suministrada por un expediente."""
import datetime as dt
import hashlib
from html.parser import HTMLParser
import ipaddress
import json
import re
import socket
import time
import unicodedata
from urllib.parse import urlsplit
import httpx
from defusedxml import ElementTree as XML

SOURCES = {
    'ofac': {'name': 'OFAC SDN · lista oficial', 'recipient': 'sanctionslistservice.ofac.treas.gov', 'key': False, 'interval': 86400, 'license': 'Fuente gubernamental oficial; conservar atribución y alcance SDN', 'docs': 'https://ofac.treasury.gov/sanctions-list-service'},
    'usaspending': {'name': 'USAspending · contratos federales EE. UU.', 'recipient': 'api.usaspending.gov', 'key': False, 'interval': 86400, 'license': 'Datos públicos del Tesoro de EE. UU.; revisar campos y fechas', 'docs': 'https://api.usaspending.gov/docs/endpoints'},
    'epo_weekly': {'name': 'EPO EPS · publicaciones semanales europeas', 'recipient': 'data.epo.org', 'key': False, 'interval': 86400, 'license': 'Condiciones EPO; cuota local conservadora 100 MB/7 días y 60 peticiones/hora compartidas', 'docs': 'https://www.epo.org/en/searching-for-patents/data/web-services/publication-server'},
    'epo_document': {'name': 'EPO EPS · documento europeo conocido', 'recipient': 'data.epo.org', 'key': False, 'interval': 604800, 'license': 'Condiciones EPO; no prueba vigencia jurídica ni cobertura mundial', 'docs': 'https://www.epo.org/en/service-support/ordering/fair-use'},
    'sat69b': {'name': 'SAT 69-B · copia pública existente de DOMINUS', 'recipient': 'zoetzerlpetrov-gif.github.io', 'key': False, 'interval': 604800, 'license': 'Fuente original SAT; copia del proyecto, preservar corte/fecha y estados', 'docs': 'http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv'},
}
for _id, _meta in SOURCES.items():
    _meta['query_sent'] = _id in ('usaspending', 'epo_document')

BASE_EPO = 'https://data.epo.org/publication-server/rest/v1.2'
OFAC = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML'
SAT = 'https://zoetzerlpetrov-gif.github.io/Geopolitica/data/vivos/efos_69b.json'
HOSTS = {s['recipient'] for s in SOURCES.values()}


class ConnectorError(Exception):
    pass


class BudgetError(ConnectorError):
    pass


class PublicHTTP:
    def __init__(self, client=None, budget=None):
        self.client = client or httpx.Client(timeout=httpx.Timeout(30, connect=10), follow_redirects=False, trust_env=False)
        self.budget = budget
        self.downloaded = 0
        self.requests = 0

    def request(self, method, url, body=None, limit=40 * 1024 * 1024):
        u = urlsplit(url)
        if u.scheme != 'https' or u.hostname not in HOSTS or u.port not in (None, 443) or u.username or u.password or u.fragment:
            raise ConnectorError('Destino no permitido.')
        # Destinos constantes de configuración; nunca se aceptan hosts, redirects o proxies aportados por usuarios.
        try:
            addresses = socket.getaddrinfo(u.hostname, 443, type=socket.SOCK_STREAM)
        except OSError as exc:
            raise ConnectorError('DNS no disponible para fuente configurada.') from exc
        if any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            raise ConnectorError('La fuente resolvió a una red no pública.')
        if self.budget:
            settle = self.budget(u.hostname, limit)
        else:
            settle = None
        address = addresses[0][4][0]
        pinned = httpx.URL(url).copy_with(host=address)
        headers = {'Host': u.hostname, 'User-Agent': 'DOMINUS-Intelligence/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)', 'Accept': 'application/json, application/xml, text/html'}
        with self.client.stream(method, pinned, json=body, headers=headers, extensions={'sni_hostname': u.hostname}) as res:
            self.requests += 1
            if res.status_code != 200:
                raise ConnectorError('HTTP ' + str(res.status_code) + '; no se siguen redirecciones.')
            raw = bytearray()
            transfer_start = time.monotonic()
            for chunk in res.iter_bytes():
                raw.extend(chunk)
                if len(raw) > limit:
                    raise ConnectorError('Respuesta mayor del límite configurado.')
                if u.hostname == 'data.epo.org':
                    pause = len(raw) / (120 * 1024) - (time.monotonic() - transfer_start)
                    if pause > 0:
                        time.sleep(pause)
            self.downloaded += len(raw)
            if settle:
                settle(len(raw))
            return bytes(raw)


def normalize(s):
    return ' '.join(''.join(c for c in unicodedata.normalize('NFKD', s).casefold() if not unicodedata.combining(c)).split())


def validate_parameters(source, p):
    if source not in SOURCES or not isinstance(p, dict):
        raise ValueError('Fuente o parámetros inválidos.')
    allowed = {'ofac': {'query'}, 'usaspending': {'query', 'start', 'end'}, 'epo_weekly': {'prefix'}, 'epo_document': {'publication'}, 'sat69b': {'rfc'}}[source]
    if set(p) - allowed or any(not isinstance(v, str) or len(v) > 120 for v in p.values()):
        raise ValueError('Criterios no permitidos; no se aceptan URL ni secretos.')
    if source in ('ofac', 'usaspending') and not 3 <= len(p.get('query', '').strip()) <= 120:
        raise ValueError('Consulta de 3 a 120 caracteres requerida.')
    if source == 'sat69b' and not re.fullmatch(r'[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}', p.get('rfc', '')):
        raise ValueError('RFC exacto requerido.')
    if source == 'epo_document' and not re.fullmatch(r'EP\d{7,10}(?:NW)?[AB]\d', p.get('publication', '')):
        raise ValueError('Número EPS requerido, por ejemplo EP1004359NWB1.')
    if source == 'epo_weekly' and p.get('prefix') and not re.fullmatch(r'EP\d{4,10}', p['prefix']):
        raise ValueError('Prefijo EP numérico requerido; no es búsqueda por titular.')
    if source == 'usaspending':
        for k in ('start', 'end'):
            if p.get(k):
                dt.date.fromisoformat(p[k])
        if p.get('start') and p.get('end') and p['start'] > p['end']:
            raise ValueError('Periodo invertido.')
    return p


def ofac_parse(raw, query):
    root = XML.fromstring(raw)
    for e in root.iter():
        e.tag = e.tag.split('}')[-1]
    if root.tag != 'sdnList' or root.find('publshInformation') is None:
        raise ConnectorError('Esquema OFAC no reconocido; no se reemplaza el resultado anterior.')
    wanted = normalize(query)
    matches, count = [], 0
    for e in root.findall('sdnEntry'):
        count += 1
        names = [' '.join(filter(None, [e.findtext('firstName'), e.findtext('lastName')]))]
        names += [' '.join(filter(None, [a.findtext('firstName'), a.findtext('lastName')])) for a in e.findall('.//aka')]
        ids = [{'tipo': n.findtext('idType', ''), 'valor': n.findtext('idNumber', ''), 'pais': n.findtext('idCountry', '')} for n in e.findall('.//id')]
        if any(wanted in normalize(n) for n in names):
            matches.append({'id': e.findtext('uid'), 'nombre': names[0], 'alias': names[1:], 'tipo': e.findtext('sdnType'), 'programas': [p.text for p in e.findall('.//program')], 'identificadores': ids, 'coincidencia': 'Candidato por nombre normalizado; identidad no confirmada', 'url': 'https://sanctionssearch.ofac.treas.gov/'})
    if not count:
        raise ConnectorError('Lista OFAC vacía; revisar el esquema.')
    return {'corte': root.findtext('publshInformation/Publish_Date'), 'total_lista': count, 'resultados': matches, 'alcance': 'Solo lista SDN; ausencia de coincidencia no equivale a libre de sanciones.'}


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []
    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.hrefs.extend(v for k, v in attrs if k == 'href' and v)


def links(raw):
    p = Links()
    p.feed(raw.decode('utf-8'))
    return p.hrefs


def fetch_source(source, parameters, transport=None, checkpoint=None):
    p = validate_parameters(source, parameters)
    h = transport or PublicHTTP()
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    partial = False
    if source == 'ofac':
        result = ofac_parse(h.request('GET', OFAC), p['query'])
    elif source == 'sat69b':
        raw = json.loads(h.request('GET', SAT, limit=12 * 1024 * 1024))
        if raw.get('campos', [])[:3] != ['rfc', 'nombre', 'situacion'] or not raw.get('generado_utc') or not isinstance(raw.get('filas'), list) or not raw['filas']:
            raise ConnectorError('Esquema de copia SAT no reconocido.')
        result = {'corte': raw.get('corte_sat'), 'generado_utc_copia': raw['generado_utc'], 'resultados': [dict(zip(raw['campos'], r)) for r in raw['filas'] if r[0] == p['rfc']], 'alcance': 'Copia pública del proyecto; revisar antigüedad, corte y fuente original SAT. Estados conservados sin reinterpretación.'}
    elif source == 'usaspending':
        result = {'resultados': [], 'alcance': 'Contratos federales EE. UU.; búsqueda por palabras, candidatos sin atribución automática.'}
        checkpoint = checkpoint or {}
        first_page = max(1, int(checkpoint.get('continuacion') or 1))
        period = checkpoint.get('periodo') if first_page > 1 else {}
        period = period or {}
        end = p.get('end') or period.get('hasta') or dt.date.today().isoformat()
        start = p.get('start') or period.get('desde') or (dt.date.fromisoformat(end) - dt.timedelta(days=90)).isoformat()
        result['pagina_desde'] = first_page
        result['periodo'] = {'desde': start, 'hasta': end}
        for page in range(first_page, first_page + 10):
            body = {'filters': {'award_type_codes': ['A', 'B', 'C', 'D'], 'keywords': [p['query']], 'time_period': [{'start_date': start, 'end_date': end}]}, 'fields': ['Award ID', 'Recipient Name', 'Recipient UEI', 'Award Amount', 'Awarding Agency', 'Start Date', 'End Date', 'Description', 'generated_internal_id'], 'page': page, 'limit': 100, 'sort': 'Award Amount', 'order': 'desc'}
            raw = json.loads(h.request('POST', 'https://api.usaspending.gov/api/v2/search/spending_by_award/', body, limit=2 * 1024 * 1024))
            if not isinstance(raw.get('results'), list) or not isinstance(raw.get('page_metadata'), dict):
                raise ConnectorError('Esquema USAspending no reconocido.')
            result['resultados'].extend(raw['results'])
            if not raw['page_metadata'].get('hasNext'):
                break
        else:
            partial = True
        result['paginas'] = page - first_page + 1
        result['continuacion'] = page + 1 if partial else None
        partial = partial or first_page > 1
    elif source == 'epo_weekly':
        raw = h.request('GET', BASE_EPO + '/publication-dates', limit=2 * 1024 * 1024)
        dates = sorted({m.group(1) for u in links(raw) if (m := re.search(r'/publication-dates/(\d{8})/patents/?$', u)) and m.group(1) <= dt.date.today().strftime('%Y%m%d')})
        if not dates:
            raise ConnectorError('EPO no devolvió fechas de publicación reconocibles.')
        date = dates[-1]
        raw = h.request('GET', BASE_EPO + '/publication-dates/' + date + '/patents', limit=4 * 1024 * 1024)
        patents = sorted({u.rstrip('/').split('/')[-1] for u in links(raw) if re.search(r'/patents/EP\d+(?:NW)?[AB]\d/?$', u)})
        if not patents:
            raise ConnectorError('Lista semanal EPO vacía o esquema cambiado.')
        result = {'corte': date, 'total_publicaciones': len(patents), 'resultados': [{'publicacion': n, 'url': BASE_EPO + '/patents/' + n} for n in patents if n.startswith(p.get('prefix') or 'EP')], 'alcance': 'Última semana de publicaciones europeas. Prefijo de publicación, sin búsqueda por titular ni conclusión de vigencia jurídica.'}
    else:
        publication = p['publication']
        raw = h.request('GET', BASE_EPO + '/patents/' + publication + '/document.xml', limit=4 * 1024 * 1024)
        root = XML.fromstring(raw, forbid_dtd=False, forbid_entities=True, forbid_external=True)
        if root.tag.split('}')[-1] != 'ep-patent-document':
            raise ConnectorError('Documento EPS no reconocido.')
        result = {'publicacion': publication, 'fecha_publicacion': root.attrib.get('date-publ'), 'titulo': [' '.join(e.itertext()).strip() for e in root.iter() if e.tag.split('}')[-1] in ('invention-title', 'B542')][:8], 'sha256_documento': hashlib.sha256(raw).hexdigest(), 'url': BASE_EPO + '/patents/' + publication + '/document.xml', 'alcance': 'Documento publicado por EPO, no certificado de vigencia ni de titularidad actual.'}
    reference = result.get('generado_utc_copia') or result.get('corte')
    if reference:
        try:
            if re.fullmatch(r'\d{8}', reference):
                observed = dt.datetime.strptime(reference, '%Y%m%d').replace(tzinfo=dt.timezone.utc)
            else:
                observed = dt.datetime.fromisoformat(reference.replace('Z', '+00:00'))
                if observed.tzinfo is None:
                    observed = observed.replace(tzinfo=dt.timezone.utc)
            age = (dt.datetime.now(dt.timezone.utc) - observed).total_seconds() / 86400
            result['age_days'] = round(age, 2)
            result['stale'] = age > 14 or age < -1 / 720
        except (ValueError, TypeError):
            result['fecha_fuente_no_interpretable'] = True
    return {'source': source, 'observado_utc': now, 'contrato': 1, 'parcial': partial, 'datos': result, 'bytes': h.downloaded, 'requests': h.requests}


def fingerprint(result):
    # No incluir el reloj de descarga ni métricas de red para evitar novedades falsas.
    data = dict(result['datos'])
    data.pop('age_days', None)
    if isinstance(data.get('resultados'), list):
        data['resultados'] = sorted(data['resultados'], key=lambda r: json.dumps(r, sort_keys=True, ensure_ascii=False))
    raw = json.dumps({'datos': data, 'parcial': result['parcial']}, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(raw.encode()).hexdigest()
