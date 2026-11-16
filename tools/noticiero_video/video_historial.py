"""Identidad de noticias ya narradas. No confunde cotizaciones nuevas con titulares viejos."""
import json
import re
import unicodedata
from datetime import date
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def clave_url(url):
    try:
        p = urlsplit(str(url or '').strip())
        host = (p.hostname or '').lower().removeprefix('www.')
        if not host:
            return str(url or '').strip()
        q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
             if not k.lower().startswith('utm_') and k.lower() not in {'fbclid','gclid','dclid','mc_cid','mc_eid'}]
        if host == 'dof.gob.mx':
            codigo = next((v for k, v in q if k.lower() == 'codigo' and v.isdigit()), None)
            if codigo:
                return 'dof:codigo:' + codigo
        return urlunsplit(('', host, p.path.rstrip('/') or '/', urlencode(sorted(q)), ''))
    except ValueError:
        return str(url or '').strip()


def clave_titular(titulo):
    s = ''.join(c for c in unicodedata.normalize('NFD', str(titulo or '').casefold()) if unicodedata.category(c) != 'Mn')
    return ' '.join(re.findall(r'\w+', s))


def ya_publicada(url, titulo, urls, titulares=frozenset()):
    return bool(url and clave_url(url) in urls or titulo and clave_titular(titulo) in titulares)


def anteriores(carpeta, fecha, dias=3):
    if not carpeta or not Path(carpeta).is_dir():
        return []
    out = []
    for p in Path(carpeta).glob('*.json'):
        try:
            g = json.loads(p.read_text())
            dif = (date.fromisoformat(fecha)-date.fromisoformat(g.get('fecha',''))).days
            if 0 < dif <= dias:
                out.append(g)
        except (OSError, ValueError, TypeError, AttributeError):
            continue
    return out


def titulares_anteriores(carpeta, fecha, dias=3):
    # El DOF se identifica por código de publicación, no por encabezado: un acuerdo nuevo
    # puede tener el mismo título y cifras diferentes. Los guiones viejos sin metadatos usan URL.
    return frozenset(clave_titular(n.get('titulo')) for g in anteriores(carpeta, fecha, dias)
                     for n in g.get('noticias', []) if isinstance(n, dict) and n.get('titulo') and n.get('seccion') != 'dof')
