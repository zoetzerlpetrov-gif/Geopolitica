"""Observación puntual HTTPS de un servicio propio/autorizado. Sin escaneo ni redirects."""
import argparse
import datetime as dt
import http.client
import json
import ssl
from urllib.parse import urlsplit


def objetivo(url):
    u = urlsplit(url)
    if u.scheme != 'https' or not u.hostname or u.username or u.password or u.fragment:
        raise ValueError('Se requiere HTTPS, sin credenciales ni fragmento.')
    port = u.port or 443
    if not 1 <= port <= 65535:
        raise ValueError('Puerto inválido.')
    return u, port


def inspeccionar(url, autorizado=False, conexion=http.client.HTTPSConnection):
    if not autorizado:
        raise ValueError('Confirma el alcance autorizado con --autorizado.')
    u, port = objetivo(url)
    conn = conexion(u.hostname, port, timeout=10, context=ssl.create_default_context())
    try:
        conn.connect()
        cert = conn.sock.getpeercert()
        protocolo = conn.sock.version()
        cipher = conn.sock.cipher()
        conn.request('HEAD', (u.path or '/') + ('?' + u.query if u.query else ''),
                     headers={'User-Agent': 'DOMINUS-Observacion-Autorizada/1.0'})
        res = conn.getresponse()
        permitidas = {'strict-transport-security', 'content-security-policy', 'x-content-type-options',
                      'x-frame-options', 'referrer-policy', 'permissions-policy', 'server', 'x-powered-by', 'location'}
        headers = {k.lower(): v for k, v in res.getheaders() if k.lower() in permitidas}
        vence = cert.get('notAfter', '')
        dias = None
        if vence:
            dias = round((ssl.cert_time_to_seconds(vence) - dt.datetime.now(dt.timezone.utc).timestamp()) / 86400, 1)
        ahora = dt.datetime.now(dt.timezone.utc).isoformat()
        emisor = ', '.join(f'{k}={v}' for grupo in cert.get('issuer', ()) for k, v in grupo)
        registro = {
            'titulo': u.hostname, 'url': url, 'fecha': ahora[:10],
            'tls': json.dumps({'version': protocolo, 'cifrado': cipher, 'emisor': emisor,
                               'expira': vence, 'dias_restantes': dias, 'cadena_y_hostname': 'validados por almacén TLS del equipo'}, ensure_ascii=False),
            'cabeceras': json.dumps(headers, ensure_ascii=False, indent=2),
            'tecnologias': 'Declaraciones no verificadas: ' + json.dumps({k: v for k, v in headers.items() if k in {'server', 'x-powered-by'}}),
            'evidencia': f'HEAD HTTP {res.status}; observado {ahora}. Sin seguir redirecciones. Sin cuerpo. No encontrar una cabecera no confirma vulnerabilidad. Un error TLS no se omite.',
            'alcance': f'Operador declaró autorización para {u.hostname}:{port}; observación puntual de esta URL.',
        }
        return {'formato': 'dominus-fase2-informe-v1', 'tipo': 'servicios', 'registro': registro}
    finally:
        conn.close()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('url')
    p.add_argument('--autorizado', action='store_true')
    p.add_argument('--salida', required=True)
    a = p.parse_args()
    try:
        informe = inspeccionar(a.url, a.autorizado)
        with open(a.salida, 'w', encoding='utf-8') as f:
            json.dump(informe, f, ensure_ascii=False, indent=2)
    except (ValueError, OSError, http.client.HTTPException) as exc:
        p.exit(1, f'No se generó informe: {exc}\n')


if __name__ == '__main__':
    main()
