#!/usr/bin/env python3
"""Alertas/noticias de estafas (30 días), por país citado o ámbito de organismo emisor.
Reutiliza el Noticiero, la ingesta y los avisos públicos de INCIBE/CONDUSEF. No consulta números privados ni asigna ubicaciones a personas.
Las notas sin país permanecen en el Noticiero y en sin_ubicacion; no se inventan coordenadas.
"""
import json
import os
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'ingest'))
from geo import Gazetteer
import fuentes as F
from estafas_prevencion import perfil_estafa, normal, FUENTES

DIAS = 30


def leer(ruta, defecto):
    if not os.path.exists(ruta):
        return defecto
    with open(ruta, encoding='utf-8') as f:
        return json.load(f)


def construir(noticiero, eventos, anteriores, ahora, gaz=None):
    gaz = gaz or Gazetteer()
    minimo = ahora - timedelta(days=DIAS)
    nuevas = [{'t': n.get('t'), 'f': n.get('m'), 'url': n.get('u'), 'fecha': n.get('f'),
               **{k: n[k] for k in ('ambito_iso3', 'ambito_nombre') if k in n}}
              for n in noticiero.get('notas', []) if 'ciberseguridad' in n.get('s', [])]
    nuevas += [{'t': n.get('titulo'), 'f': n.get('fuente'), 'url': n.get('url'), 'fecha': n.get('fecha_utc')}
               for n in eventos.get('eventos', []) if n.get('tipo_fuente') == 'noticia']
    notas = []
    for n in nuevas + anteriores:
        perfil = perfil_estafa(n.get('t'))
        if not perfil or urlparse(n.get('url') or '').scheme not in ('http', 'https'):
            continue
        try:
            dt = datetime.fromisoformat((n.get('fecha') or '').replace('Z', '+00:00'))
            if dt.tzinfo is None or not minimo <= dt <= ahora + timedelta(hours=1):
                continue
        except ValueError:
            continue
        paises = gaz.paises_en_texto(n['t'])
        referencia = 'País citado en el titular; no confirma el lugar del incidente ni del autor.'
        host = urlparse(n['url']).hostname or ''
        emisor = {'www.incibe.es': 'ESP', 'revista.condusef.gob.mx': 'MEX'}.get(host)
        if not paises and emisor:
            paises = [emisor]
            referencia = 'Ámbito del organismo emisor del aviso; no lugar confirmado del incidente.'
        elif not paises and n.get('ambito_iso3') in gaz.paises:
            paises = [n['ambito_iso3']]
            referencia = f"Ámbito editorial: {n.get('ambito_nombre', n['ambito_iso3'])}. País de cobertura, no ubicación confirmada del caso."
        notas.append({**n, 't': str(n['t'])[:220], 'fecha': dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                      'paises': paises, 'ubicacion': referencia, **perfil})
    unicas, urls, titulos = [], set(), set()
    for n in sorted(notas, key=lambda n: n['fecha'], reverse=True):
        titulo = normal(n['t'])
        if n['url'] in urls or titulo in titulos:
            continue
        urls.add(n['url']); titulos.add(titulo); unicas.append(n)
    recursos = leer(os.path.join(ROOT, "config", "estafas_recursos.json"), {}).get("recursos", [])
    features = []
    for iso in sorted({p for n in unicas for p in n['paises']}):
        pais = gaz.paises.get(iso)
        if not pais:
            continue
        ns = [n for n in unicas if iso in n['paises']]
        features.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [pais['lon'], pais['lat']]},
                         'properties': {'iso3': iso, 'pais': pais['es'], 'n': len(ns), 'ultimo_utc': ns[0]['fecha'],
                                        'canales': dict(Counter(c for n in ns for c in n['canales'])),
                                        'reportes': ns[:30], 'recursos': [r for r in recursos if r.get('pais_iso3') == iso], 'fuente': 'Noticiero DOMINUS · fuentes enlazadas'}})
    return {'type': 'FeatureCollection', 'generado_utc': ahora.strftime('%Y-%m-%dT%H:%M:%SZ'), 'ventana_dias': DIAS,
            'total_notas': len(unicas), 'sin_ubicacion': [n for n in unicas if not n['paises']],
            'guias': [{'nombre': n, 'url': u} for n, u in FUENTES], 'features': features}, unicas


def avisos_publicos(leer_feed=F.rss, feeds=None):
    """Oficiales y canales temáticos seleccionados: conserva hasta 30 días, no solo las 72 h del Noticiero."""
    if feeds is None:
        cfg = leer(os.path.join(ROOT, 'config', 'noticiero.json'), {})
        feeds = next((s for s in cfg.get('secciones', []) if s['id'] == 'ciberseguridad'), {}).get('feeds', [])
    elegidos = [fd for fd in feeds if fd.get('seguimiento_estafas') or
                urlparse(fd['url']).hostname in ('www.incibe.es', 'revista.condusef.gob.mx')]
    def consultar(fd):
        try:
            items = leer_feed({**fd, 'max_items': 80 if fd.get('seguimiento_estafas') else 40})
            notas = [{'t': n['titulo'], 'm': n['fuente'], 'u': n['url'], 'f': n['fecha_utc'], 's': ['ciberseguridad'],
                      **{k: n[k] for k in ('ambito_iso3', 'ambito_nombre') if k in n}}
                     for n in items if perfil_estafa(n['titulo'])]
            return fd['nombre'], notas, {'estado': 'ok', 'entradas': len(items), 'relevantes': len(notas)}
        except Exception as exc:
            return fd['nombre'], [], {'estado': 'error', 'error': str(exc)[:160]}
    notas, estado = [], {}
    # Máximo tres consultas en paralelo: los feeds temáticos no prolongan indefinidamente el workflow.
    with ThreadPoolExecutor(max_workers=3) as pool:
        for nombre, ns, est in pool.map(consultar, elegidos):
            notas.extend(ns); estado[nombre] = est
    return notas, estado


def main():
    vivos = os.path.join(ROOT, 'vivos')
    out = os.path.join(vivos, 'estafas.geojson')
    estado = os.path.join(vivos, 'estafas_estado.json')
    ahora = datetime.now(timezone.utc)
    noticiero = leer(os.path.join(vivos, 'noticiero.json'), {})
    avisos, fuentes = avisos_publicos()
    noticiero = {**noticiero, 'notas': noticiero.get('notas', []) + avisos}
    fc, notas = construir(noticiero, leer(os.path.join(ROOT, 'data', 'events.json'), {}),
                          leer(estado, {}).get('notas', []), ahora)
    fc['fuentes'] = fuentes
    os.makedirs(vivos, exist_ok=True)
    for path, datos in [(out, fc), (estado, {'generado_utc': fc['generado_utc'], 'notas': notas})]:
        with open(path + '.tmp', 'w', encoding='utf-8') as f:
            json.dump(datos, f, ensure_ascii=False)
        os.replace(path + '.tmp', path)
    print(f"estafas: {len(notas)} notas, {len(fc['features'])} países, {len(fc['sin_ubicacion'])} sin ubicación (no mapeadas)")
    return 0


if __name__ == '__main__':
    sys.exit(main())
