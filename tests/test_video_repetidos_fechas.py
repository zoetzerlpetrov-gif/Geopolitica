"""Fechas de voz y exclusión de publicaciones ya narradas, sin red ni render de video."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/noticiero_video'))
import guion as G
import render as R
from historial import clave_url, titulares_anteriores, clave_titular


def test_dof_excluye_la_publicacion_de_ayer_con_parametros_distintos():
    viejo = 'https://www.dof.gob.mx/nota_detalle.php?codigo=5803838&fecha=13/11/2026&utm_source=x'
    nuevo = 'http://dof.gob.mx/nota_detalle.php?fecha=13%2F11%2F2026&codigo=5803838#gsc.tab=0'
    assert clave_url(viejo) == clave_url(nuevo)
    entradas = [{'id': 'MEX:dof:1', 'pais': 'MEX','fecha':'2026-11-13','titulo':'Decreto por el que se reforma la Ley Federal del Trabajo','url':nuevo,'nivel':'ley'},
                {'id': 'MEX:dof:2', 'pais': 'MEX','fecha':'2026-11-16','titulo':'Decreto por el que se reforma la Ley Federal del Trabajo','url':'https://dof.gob.mx/nota_detalle.php?codigo=5809999','nivel':'ley'}]
    assert [x['url'] for x in G.notas_dof({'entradas':entradas},'2026-11-16',usadas={viejo})] == [entradas[1]['url']]
    assert G.notas_dof({'entradas':entradas[:1]},'2026-11-16',usadas={viejo}) == []


def test_noticias_no_repiten_tracking_ni_mismo_titular_y_admiten_actualizaciones():
    t='La empresa anuncia una nueva inversión de 200 millones en México'
    noticias={'generado_utc':'2026-11-16T12:00:00Z','notas':[
        {'t':t,'u':'https://www.medio.mx/nota/?utm_source=red','m':'Medio','f':'2026-11-16T10:00:00Z','s':['economia']},
        {'t':t,'u':'https://otro.mx/nota','m':'Otro','f':'2026-11-16T10:00:00Z','s':['economia']},
        {'t':t.replace('200','500'),'u':'https://otro.mx/nueva','m':'Otro','f':'2026-11-16T11:00:00Z','s':['economia']} ]}
    c=G.candidatos_seccion(noticias,usadas={'http://medio.mx/nota'},titulares_usados={clave_titular(t)})
    assert [n['url'] for n in c['economia']] == ['https://otro.mx/nueva']
    assert clave_url('https://x/nota?id=1') != clave_url('https://x/nota?id=2')


def test_historial_de_titulares_y_compatibilidad_con_guiones_anteriores(tmp_path):
    (tmp_path/'ayer.json').write_text(json.dumps({'fecha':'2026-11-15','usadas':['https://x/a'],'noticias':[{'titulo':'La empresa anunció una planta en México','seccion':'economia'}, {'titulo':'Decreto recurrente','seccion':'dof'}]}))
    (tmp_path/'antier.json').write_text(json.dumps({'fecha':'2026-11-14','usadas':['https://x/b']}))
    assert R.enlaces_usados(str(tmp_path),'2026-11-16') == {'https://x/a','https://x/b'}
    assert titulares_anteriores(str(tmp_path),'2026-11-16') == {clave_titular('La empresa anunció una planta en México')}


def test_persistencia_no_pierde_historial_y_los_dos_escritores_se_serializan():
    video=(ROOT/'.github/workflows/noticiero-video.yml').read_text()
    comentarios=(ROOT/'.github/workflows/comentarios-youtube.yml').read_text()
    assert 'group: datos-comentarios' in video and 'group: datos-comentarios' in comentarios
    guardar=video[video.index('      - name: Guardar el guion para responder'):]
    assert guardar.index('git init -q') < guardar.index('git fetch') < guardar.index('git archive')
    assert "'noticias': g.get('noticias', [])" in guardar
    assert 'if git fetch' not in guardar
    traer=video[video.index('      - name: Traer los guiones'):video.index('      - name: Armar el video')]
    assert 'continue-on-error' not in traer and '|| true' not in traer


def test_fechas_abreviadas_y_sep_educativa_se_distinguen():
    for abrev,mes in [('ene','enero'),('feb','febrero'),('mar','marzo'),('abr','abril'),('may','mayo'),('jun','junio'),('jul','julio'),('ago','agosto'),('sep','septiembre'),('sept','septiembre'),('oct','octubre'),('nov','noviembre'),('dic','diciembre')]:
        assert G.para_voz(f'El 15 {abrev}. de 2026 se publicó el aviso.') == f'El 15 de {mes} de 2026 se publicó el aviso.'
    assert G.para_voz('Del 15/nov/2026 al 20-dic-2026.') == 'Del 15 de noviembre de 2026 al 20 de diciembre de 2026.'
    assert G.para_voz('La SEP informó el 15 SEP de 2026.') == 'La sep informó el 15 de septiembre de 2026.'
    assert G.para_voz('La SEP de 2026 anunció becas.') == 'La sep de 2026 anunció becas.'
    assert G.para_voz('Dato de nov. 2026, previsto para dic. de 2026.') == 'Dato de noviembre de 2026, previsto para diciembre de 2026.'
    assert G.para_voz('El INE y la SEP trabajan con PRI y PAN.') == 'El ine y la sep trabajan con pri y pan.'


def test_normalizacion_solo_afecta_voz_y_el_guion_guarda_identidad_original():
    n={'seccion':'dof','seccion_nombre':'DOF','titulo':'Aviso del 15 nov. de 2026','resumen':'La SEP publica el aviso del 15 nov. de 2026.','medio':'DOF','url':'https://dof.gob.mx/a','fecha':'2026-11-15'}
    g=G.guion('2026-11-16',[n]);e=next(e for e in g['escenas'] if e['tipo']=='nota')
    assert e['texto']==n['resumen'] and '15 de noviembre de 2026' in e['voz']
    assert g['noticias'][0]['titulo']==n['titulo'] and g['noticias'][0]['fecha']=='2026-11-15'


def test_dof_leido_con_fecha_original_para_no_presentarlo_como_publicacion_de_hoy():
    n={'seccion':'dof','seccion_nombre':'DOF','titulo':'Se reforma la Ley Federal del Trabajo','resumen':'Se reformó una disposición de la Ley Federal del Trabajo.','medio':'DOF','url':'https://dof.gob.mx/a','fecha':'2026-11-13'}
    g=G.guion('2026-11-16',[n]);e=next(e for e in g['escenas'] if e['tipo']=='nota')
    assert 'Publicación del viernes 13 de noviembre de 2026.' in e['voz']
