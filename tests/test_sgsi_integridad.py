"""Evidencia real, aprobación pendiente y excepciones estrictas de integridad."""
import copy
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/seguridad'))
sys.path.insert(0, str(ROOT / 'tools/autoauditoria'))
import vigia as V
import autoauditoria as A


def beacon(atributos=None, cuerpo=''):
    attrs = copy.deepcopy(json.loads((ROOT / 'config/integridad_publicacion.json').read_text())['transformaciones'][0]['atributos'])
    attrs.update(atributos or {})
    s = '<script ' + ' '.join(f"{k}='{json.dumps(v) if isinstance(v, dict) else v}'" for k, v in attrs.items()) + '>' + cuerpo + '</script>'
    return s


BASE = '<html>\n<body>\n<h1>DOMINUS</h1>\n</body>\n</html>\n'


def publicado(script):
    return BASE.replace('</body>', script + '\n</body>')


def test_beacon_exacto_conserva_comparacion_completa_y_muestra_huellas(monkeypatch):
    html = publicado(beacon())
    limpio, nombres = V.normalizar_publicacion(html, 'https://dominusosint.com/')
    assert limpio == BASE and nombres
    monkeypatch.setattr(V, 'SITIOS', [('dominusosint.com', 'https://dominusosint.com/')])
    r = V.revisar_sitios(lambda u: (200, html.encode(), 5), BASE)[0]
    assert r['integro'] and r['transformaciones'] and r['hash_publicado'] != r['hash_repositorio']
    assert r['hash_comparable'] == r['hash_repositorio']
    assert not V.decidir({'racha_integridad': 12}, [r], None, None, V.ahora())[1]


def test_scripts_o_atributos_no_autorizados_nunca_se_ocultan():
    alteraciones = [beacon({'onload': 'alert(1)'}), beacon({'src': 'https://evil.example/beacon.js'}),
                    beacon({'integrity': 'distinto'}), beacon({'data-cf-beacon': {'token': 'otro'}}),
                    beacon(cuerpo='alert(1)'), beacon(cuerpo='alert("x>")>'), beacon() + '\n' + beacon(),
                    beacon().replace('type=', "type='module' type=", 1)]
    for s in alteraciones:
        texto, _ = V.normalizar_publicacion(publicado(s), 'https://dominusosint.com/')
        assert V.huella_index(texto) != V.huella_index(BASE), s
    texto, _ = V.normalizar_publicacion(publicado(beacon()).replace('DOMINUS', 'ALTERADO'), 'https://dominusosint.com/')
    assert V.huella_index(texto) != V.huella_index(BASE)
    texto, nombres = V.normalizar_publicacion(publicado(beacon()), 'https://otro.example/')
    assert not nombres and V.huella_index(texto) != V.huella_index(BASE)


def test_evidencia_manual_no_se_inventa_aprobacion_ni_operacion(monkeypatch):
    controles = json.loads((ROOT / 'config/autoauditoria.json').read_text())['controles']
    for id_ in ['iso_5_2', 'nist_gv', 'lf_arco']:
        c = {**next(c for c in controles if c['id'] == id_), 'estado': 'cumple'}
        assert A.evidencia_manual(c)['estado'] == 'parcial'
    c = {'id': 'prueba', 'estado': 'cumple', 'evidencias_archivos': ['docs/no-existe.md']}
    assert A.evidencia_manual(c)['estado'] == 'no_cumple'


def test_matriz_fechada_tiene_escala_responsable_tratamiento_y_no_acepta_residuales():
    r = json.loads((ROOT / 'docs/sgsi/riesgos-2026-11-22.json').read_text())
    assert r['fecha'] == '2026-11-22' and len(r['riesgos']) == 14
    for x in r['riesgos']:
        assert 1 <= x['probabilidad'] <= 5 and 1 <= x['impacto'] <= 5
        assert x['puntaje'] == x['probabilidad'] * x['impacto']
        assert x['responsable'] and x['tratamiento'] and x['fecha_objetivo']
        assert x['riesgo_residual'] is None and x['aceptacion'] == 'pendiente'


def test_documentos_publicados_corresponden_a_originales(tmp_path):
    spec = importlib.util.spec_from_file_location('sgsi_publicar', ROOT / 'tools/pages/sgsi_documentos.py')
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    salida = tmp_path / 'documentos.json'; mod.generar(salida)
    d = json.loads(salida.read_text())
    assert d == json.loads((ROOT / 'config/sgsi_documentos.json').read_text())
    for x in d['documentos']:
        assert x['texto'] == (ROOT / x['origen']).read_text()
    assert d['gobierno']['politica']['estado'] == 'pendiente'
    assert d['gobierno']['arco']['canal_confirmado'] is True


def test_auditoria_identifica_origen_y_cobertura_sin_cambiar_formula():
    cfg = json.loads((ROOT / 'config/autoauditoria.json').read_text())
    res = A.evaluar(cfg, correr_pruebas=False)
    assert len(res['commit']) == 40 and res['config_revisado'] == '2026-11-22'
    c = res['cobertura']
    assert c['evaluados'] + c['sin_evaluar'] + c['no_aplica'] == c['total']
    assert res['puntaje_global'] == A.puntaje(res['controles'])
