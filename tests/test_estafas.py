"""Estafas: trazabilidad, límites de ubicación, prevención y guion, sin red ni publicación."""
import sys
import json
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
for ruta in ['tools/red', 'tools/noticiero', 'tools/noticiero_video']:
    sys.path.insert(0, str(ROOT / ruta))
import estafas as E
from estafas_prevencion import perfil_estafa
import noticiero as N
import guion as G

AHORA = datetime(2026, 11, 17, 12, tzinfo=timezone.utc)


def nota(t, u='https://medio.example/reporte', f='2026-11-17T10:00:00Z'):
    return {'t': t, 'u': u, 'm': 'Medio', 'f': f, 's': ['ciberseguridad', 'tecnologia'], 'via': 'rss'}


def test_canales_y_limites_del_patron():
    for titulo, canal in [('Alerta por estafa mediante SMS', 'SMS'), ('Estafa de llamadas bancarias', 'Llamadas'),
                          ('Estafa en WhatsApp', 'WhatsApp'), ('Phishing en correos electrónicos', 'Correo'),
                          ('Estafa en Instagram', 'Redes sociales'), ('Fraude en compras por internet', 'Compras'),
                          ('Estafa de inversión con criptomonedas', 'Inversiones')]:
        p = perfil_estafa(titulo)
        assert canal in p['canales'] and p['prevencion'] and 'no reconstrucción' in p['alcance']
    assert 'no detalla' in perfil_estafa('Investigan una estafa')['modus']
    assert perfil_estafa('Se denuncia fraude electoral en México') is None
    assert perfil_estafa('La inflación sube en México') is None


def test_mapa_no_inventa_ubicacion_ni_confunde_notas_con_victimas():
    ns = [nota('Alerta por estafa bancaria en México'),
          nota('Alerta por estafa bancaria en México', 'https://otro.example/copia'),
          nota('Alerta por estafa vía SMS', 'https://medio.example/sin-pais'),
          nota('Estafa bancaria en Chile', 'https://medio.example/vieja', '2026-09-01T10:00:00Z'),
          nota('Estafa bancaria en Perú', 'https://medio.example/futura', '2026-12-01T10:00:00Z'),
          nota('Alerta de estafa en WhatsApp', 'https://www.incibe.es/ciudadania/avisos/ejemplo')]
    fc, todas = E.construir({'notas': ns}, {}, [], AHORA)
    assert fc['total_notas'] == 3 and len(fc['sin_ubicacion']) == 1
    por = {f['properties']['iso3']: f['properties'] for f in fc['features']}
    assert set(por) == {'MEX', 'ESP'} and por['MEX']['n'] == 1
    assert 'Ámbito del organismo' in por['ESP']['reportes'][0]['ubicacion']
    assert all('victimas' not in f['properties'] for f in fc['features'])
    assert len(E.construir({}, {}, todas, AHORA)[1]) == 3
    assert E.construir({}, {}, [], AHORA)[0]['features'] == []
    json.dumps(fc)  # Todo serializable: sin conjuntos ni objetos de fecha.


def test_alerta_alimenta_noticiario_y_bloque_preventivo_video():
    cfg = json.loads((ROOT / 'config/noticiero.json').read_text())
    reglas = N.reglas_de(cfg)
    sec = next(s for s in cfg['secciones'] if s['id'] == 'ciberseguridad')
    assert {'MVS Noticias', 'Latinus', 'INCIBE · avisos de ciudadanía', 'CONDUSEF · Proteja su Dinero'} <= {f['nombre'] for f in sec['feeds']}
    items = [{'titulo': 'Alerta en México por la estafa bancaria mediante llamadas falsas', 'url': 'https://medio.example/alerta',
              'fuente': 'Medio', 'tipo_fuente': 'noticia', 'fecha_utc': '2026-11-17T10:00:00Z'}]
    notas = N.notas_de_feed(items, ['ciberseguridad', 'tecnologia'], reglas, filtrar=True)
    c = G.candidatos_seccion({'notas': notas}, ahora_iso='2026-11-17T12:00:00Z')
    assert 'ciberseguridad' in c and 'tecnologia' not in c
    g = G.guion('2026-11-17', G.elegir_sin_ia(c))
    escenas = [e for e in g['escenas'] if e.get('seccion') == 'ciberseguridad']
    assert [e['encabezado'] for e in escenas] == ['Ciberseguridad', 'Modus operandi · orientación general', 'Cómo evitar la estafa']
    assert all(e['voz'] and e['texto'] for e in escenas)
    assert 'NIP' in escenas[-1]['texto'] and 'cuelga' in escenas[-1]['voz'].lower()
    assert 'incibe.es' in g['descripcion'] and 'condusef.gob.mx' in g['descripcion']
    assert g['usadas'] == ['https://medio.example/alerta']  # guías no contaminan el historial de noticias
    assert not G.candidatos_seccion({'notas': notas}, usadas=frozenset(g['usadas']))


def test_sin_noticia_no_se_inventa_una_alerta_y_fraude_electoral_se_excluye():
    g = G.guion('2026-11-17', [])
    assert not any(e.get('seccion') == 'ciberseguridad' for e in g['escenas'])
    cfg = json.loads((ROOT / 'config/noticiero.json').read_text())
    assert 'ciberseguridad' not in N.secciones_de('Denuncian fraude electoral en México', 'medio.example', N.reglas_de(cfg))


def test_avisos_oficiales_conservan_fallos_por_fuente_sin_impedir_las_demas():
    llamadas = []
    def leer(fd):
        llamadas.append(fd['url'])
        if 'condusef' in fd['url']:
            raise TimeoutError('fuente temporalmente inaccesible')
        return [{'titulo': 'Un falso concurso permite utilizar tu cuenta de WhatsApp',
                 'fuente': fd['nombre'], 'url': 'https://www.incibe.es/aviso', 'fecha_utc': '2026-11-01T10:00:00Z'}]
    avisos, estado = E.avisos_publicos(leer)
    assert len(llamadas) == 2 and len(avisos) == 1
    assert len([e for e in estado.values() if e['estado'] == 'error']) == 1
    fc, _ = E.construir({'notas': avisos}, {}, [], AHORA)
    assert fc['features'][0]['properties']['iso3'] == 'ESP'
    assert not N.unir([], [{**n, 'via': 'rss'} for n in avisos], AHORA)  # fuera de 72 h; la capa conserva 30 días
