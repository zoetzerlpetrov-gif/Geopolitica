"""Validación del formato documental, sin ejecutar contenido importado."""
import datetime as dt
import json
import math
from decimal import Decimal
from pathlib import Path
import re
from urllib.parse import urlsplit
from shapely.geometry import shape

SCHEMA = json.loads(Path(__file__).with_name('record_schema.json').read_text())
ID = re.compile(r'^[\w-]{1,100}$', re.ASCII)


def document(value):
    if not isinstance(value, dict) or set(value) - {'fase1', 'fase2'}:
        raise ValueError('El expediente acepta solo fase1 y fase2.')
    if len(json.dumps(value).encode()) > 4 * 1024 * 1024:
        raise ValueError('Máximo 4 MB de datos documentales.')
    for phase, raw in value.items():
        if raw is None:
            continue
        if not isinstance(raw, dict) or type(raw.get('version')) is not int or raw.get('version') != (1 if phase == 'fase1' else 2):
            raise ValueError('Versión documental incompatible.')
        tipos = SCHEMA['fase1']['tipos'] if phase == 'fase1' else SCHEMA['fase2']
        if set(raw) - set(tipos) - {'version', 'actualizado'}:
            raise ValueError('Colección no permitida.')
        seen = set()
        for k, definition in tipos.items():
            rows = raw.get(k)
            if not isinstance(rows, list) or len(rows) > 1000:
                raise ValueError('Colección inválida o mayor de 1000.')
            fields = definition['campos']
            for r in rows:
                if not isinstance(r, dict) or not isinstance(r.get('id'), str) or not ID.fullmatch(r['id']) or r['id'] in seen:
                    raise ValueError('ID inválido o duplicado.')
                seen.add(r['id'])
                if set(r) - set(fields) - {'id', 'creado', 'actualizado', 'historial'}:
                    raise ValueError('Campo no permitido.')
                for f, v in r.items():
                    if f == 'historial':
                        if not isinstance(v, list) or len(v) > 100:
                            raise ValueError('Historial inválido.')
                        for h in v:
                            if not isinstance(h, dict) or set(h) != {'fecha', 'motivo', 'campos'} or not isinstance(h['campos'], dict):
                                raise ValueError('Revisión inválida.')
                            if not isinstance(h['fecha'], str) or len(h['fecha']) > 50 or not isinstance(h['motivo'], str) or len(h['motivo']) > 12000:
                                raise ValueError('Revisión inválida.')
                            if set(h['campos']) != set(fields) or any(not isinstance(x, str) or len(x) > 12000 for x in h['campos'].values()):
                                raise ValueError('Campos históricos inválidos.')
                    elif not isinstance(v, str) or len(v) > 12000:
                        raise ValueError('Campo inválido o mayor de 12000 caracteres.')
                if not r.get('titulo', '').strip():
                    raise ValueError('Título obligatorio.')
                if phase == 'fase2':
                    if not isinstance(r.get('historial'), list):
                        raise ValueError('Historial obligatorio.')
                    for f, meta in fields.items():
                        v = r.get(f, '')
                        kind = meta['tipo']
                        if kind == 'select' and v not in meta['opciones']:
                            raise ValueError('Opción inválida.')
                        if kind == 'date' and v:
                            fecha(v)
                        if kind == 'url' and v:
                            u = urlsplit(v)
                            if u.scheme not in ('http', 'https') or not u.hostname or u.username or u.password:
                                raise ValueError('URL documental inválida.')
                        if kind.startswith('ref:') and not any(x.get('id') == v for x in raw[kind[4:]]):
                            raise ValueError('Referencia documental inexistente.')
                    if k == 'empresas' and not all(r.get(f) for f in ('jurisdiccion', 'fuente', 'fecha')):
                        raise ValueError('Empresa sin jurisdicción, fuente o fecha.')
                    if k == 'empresas':
                        if r.get('lei') and not re.fullmatch(r'[A-Z0-9]{18}\d{2}', r['lei']):
                            raise ValueError('Formato LEI inválido.')
                        if r.get('rfc') and not re.fullmatch(r'[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}', r['rfc']):
                            raise ValueError('Formato RFC inválido.')
                    if k == 'contratos' and r.get('importe') and (not re.fullmatch(r'\d+(\.\d{1,2})?', r['importe']) or not re.fullmatch(r'[A-Z]{3}', r.get('moneda', ''))):
                        raise ValueError('Importe o moneda inválidos.')
                    if k == 'multimedia' and r.get('sha256') and not re.fullmatch(r'[a-fA-F0-9]{64}', r['sha256']):
                        raise ValueError('SHA-256 inválido.')
                    if k == 'evidencias' and not all(r.get(f) for f in ('codigo', 'fuente', 'fecha')):
                        raise ValueError('Evidencia sin código, fuente o fecha.')
                    if k == 'telefonos' and (not re.fullmatch(r'\+[1-9]\d{6,14}', r.get('numero', '')) or not r.get('fuente') or not r.get('url')):
                        raise ValueError('Teléfono sin formato internacional o fuente.')
                    if k == 'hallazgos' and r.get('estado') in ('resuelto', 'falso positivo') and not r.get('revalidacion'):
                        raise ValueError('Cierre técnico sin revalidación.')
                    if k == 'hipotesis' and r.get('estado') == 'revisada' and not all(r.get(f) for f in ('conclusion', 'revisor', 'refutacion')):
                        raise ValueError('Hipótesis revisada incompleta.')
                    if k == 'diligencia' and r.get('estado') == 'revisada' and not all(r.get(f) for f in ('dictamen', 'revisor', 'fuente', 'fecha', 'responsable')):
                        raise ValueError('Diligencia revisada incompleta.')
                else:
                    if r.get('estado') not in SCHEMA['fase1']['estados']:
                        raise ValueError('Estado inválido.')
                    if r.get('plazo'):
                        fecha(r['plazo'])
                    if k in ('cobertura', 'productos', 'lecciones') and r.get('requerimiento') and not any(x.get('id') == r['requerimiento'] for x in raw['requerimientos']):
                        raise ValueError('Requerimiento inexistente.')
                    if k == 'requerimientos' and r.get('tipo') not in ('PIR', 'IR', 'EEI'):
                        raise ValueError('Tipo de requerimiento inválido.')
                    if k == 'requerimientos' and r.get('estado') != 'borrador' and not all(r.get(f) for f in ('pregunta', 'responsable', 'plazo', 'criterio')):
                        raise ValueError('Requerimiento activo incompleto.')
                    if k == 'productos' and r.get('estado') == 'aprobado' and not all(r.get(f) for f in ('juicio', 'fuentes', 'confianza', 'revisor')):
                        raise ValueError('Producto aprobado incompleto.')
                    if k == 'relevos' and r.get('estado') == 'cerrado' and not all(r.get(f) for f in ('receptor', 'recepcion')):
                        raise ValueError('Relevo sin recepción.')
        if phase == 'fase2':
            keys = set()
            for r in raw['empresas']:
                for field in ('rfc', 'lei', 'registro'):
                    if r.get(field):
                        key = (field, r['jurisdiccion'].upper(), r[field].upper())
                        if key in keys:
                            raise ValueError('Identificador empresarial duplicado.')
                        keys.add(key)
            pairs = [(r['hipotesis'], r['codigo']) for r in raw['evidencias']]
            if len(pairs) != len(set(pairs)):
                raise ValueError('Valoración de evidencia duplicada.')
    return value


def fecha(v):
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', v):
        raise ValueError('Fecha ISO inválida.')
    dt.date.fromisoformat(v)


def polygon(value):
    if not isinstance(value, dict) or value.get('type') not in ('Polygon', 'MultiPolygon') or len(json.dumps(value)) > 500000:
        raise ValueError('Se requiere Polygon/MultiPolygon GeoJSON hasta 500 KB.')
    count = 0
    def walk(x):
        nonlocal count
        if not isinstance(x, list) or not x:
            raise ValueError('Coordenadas inválidas.')
        if isinstance(x[0], (int, float)):
            count += 1
            if len(x) != 2 or count > 5000 or any(isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) for n in x) or not -180 <= x[0] <= 180 or not -90 <= x[1] <= 90:
                raise ValueError('Coordenadas fuera de rango o más de 5000 vértices.')
        else:
            for child in x:
                walk(child)
    walk(value.get('coordinates'))
    g = shape(value)
    if g.is_empty or not g.is_valid:
        raise ValueError('Geometría vacía o inválida.')
    return value
