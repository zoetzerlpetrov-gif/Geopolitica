"""Anomalías: medios propios y GDELT en varios idiomas (filtro del tema, ubicación y entidades de HTML)."""
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tools", "anomalias")))
import anomalias as A  # noqa: E402

U = A.Ubicador()

RSS = b"""<?xml version="1.0"?><rss><channel>
<item><title>UFO spotted over Shiraz, Iran&nbsp;</title><link>https://ej.org/1</link><pubDate>Tue, 03 Nov 2026 10:00:00 +0000</pubDate></item>
<item><title>Oil prices rise in Tehran</title><link>https://ej.org/2</link><pubDate>Tue, 03 Nov 2026 10:00:00 +0000</pubDate></item>
</channel></rss>"""


def test_feeds_propios_filtran_y_limpian_entidades():
    f, est = A.de_feeds_propios(U, leer=lambda u: RSS, permitido=lambda u: True, feeds=[("Medio", "https://ej.org/feed", False)])
    assert est["Medio"] == "2 notas, 1 del tema"
    p = f[0]["properties"]
    assert p["lugar"] == "Shiraz" and p["capa"] == "anom_recientes" and p["url"] == "https://ej.org/1" and p["resumen"] == ""


def test_titulos_en_otros_idiomas():
    n = A.nota_propia("مشاهده بشقاب پرنده در آسمان تهران", "https://ej.org/3", "2026-11-04", "x (vía GDELT)", U, origen="gdelt")
    assert n["properties"]["lugar"] == "Teherán"
    n = A.nota_propia("НЛО над Москвой", "https://ej.org/4", "2026-11-04", "x", U, pais_medio="RUS")
    assert n["properties"]["precision"].startswith("país del medio")
    assert A.nota_propia("Webinar about markets", "https://ej.org/5", "", "x", U, pais_medio="RUS") is None


def test_gdelt_dos_consultas():
    resp = json.dumps({"articles": [{"title": "Strange lights: UFO over Isfahan", "url": "https://ej.org/6", "seendate": "20261104T101500Z",
                                      "sourcecountry": "Iran", "domain": "ej.org"}]}).encode()
    f, est = A.de_gdelt(U, leer=lambda u: resp, pausa=0)
    assert len(f) == 2 and f[0]["properties"]["lugar"] == "Isfahán" and f[0]["properties"]["fecha"] == "2026-11-04"
    assert "consulta 2" in est


def test_fauna_se_clasifica_sin_confundirla_con_ovni():
    ejemplos = [
        ('Captan supuesto pterodáctilo en Ciudad Juárez', 'prehistoric'),
        ('Graban presunto Pterodón en Ciudad Juárez', 'prehistoric'),
        ('Pteranodon filmed over Ciudad Juárez', 'prehistoric'),
        ('Avistan supuesto dragón en Madrid', 'mythical'),
        ('Video de presunto unicornio en Londres', 'mythical'),
        ('Bigfoot spotted near London', 'cryptid'),
        ('Reportan al chupacabras en México', 'cryptid'),
        ('Filman al hombre polilla en Ciudad Juárez', 'cryptid'),
    ]
    for titulo, tipo in ejemplos:
        assert A.es_del_tema(titulo, []), titulo
        assert A.tipo_por_texto(titulo) == tipo
    n = A.nota_propia(ejemplos[0][0], 'https://ej.org/fauna', '2026-11-15', 'Medio', U)
    assert n['properties']['lugar'] == 'Ciudad Juárez, Chihuahua'
    assert n['properties']['fecha_tipo'] == 'publicacion'
    assert 'No confirmada' in n['properties']['fecha_evento']


def test_fauna_excluye_fosiles_ficcion_y_usos_comerciales_incluso_en_feed_dedicado():
    for titulo in [
        'Hallan fósil de pterodáctilo en México',
        'Estreno de película de dinosaurios en Londres',
        'Videojuego de dragones aparece en Madrid',
        'Kraken exchange reports profits in London',
        'Imagine Dragons spotted in London',
        'SpaceX Dragon spotted over London',
        'Video de animatrónico de pterodáctilo en exposición de Ciudad Juárez',
    ]:
        assert not A.es_del_tema(titulo, ['Inexplicata (es)']), titulo
        assert A.nota_propia(titulo, 'https://ej.org/ruido', '', 'Inexplicata (es)', U, dedicado=True) is None
    assert A.es_del_tema('Paleontólogo descarta supuesto pterodáctilo en Ciudad Juárez', [])


def test_reclasifica_archivo_y_separa_fauna_de_ovnis_por_pais():
    from datetime import datetime, timezone
    def punto(sid, titulo, tipo):
        return {'type': 'Feature', 'geometry': {'type':'Point','coordinates':[-102,23]}, 'properties':{
            'id':sid,'titulo':titulo,'tipo':tipo,'tipo_nombre':'x','fecha':'2026-11-10','capa':'anom_recientes',
            'lugar':'México','precision':'país','url':'https://ej.org/'+sid,'fuente':'Medio'}}
    archivo = A.unir_archivo([punto('a','Captan supuesto pterodáctilo en México','ufo'), punto('b','UFO spotted in México','ufo')], [], datetime(2026,11,16,tzinfo=timezone.utc))
    assert archivo[0]['properties']['tipo'] == 'prehistoric'
    grupos = A.agrupar_por_pais(archivo)
    assert len(grupos) == 2
    fauna = next(f['properties'] for f in grupos if f['properties']['tipo']=='prehistoric')
    assert fauna['n'] == 1 and fauna['tipos'] == ['prehistoric']
    assert len(fauna['notas']) == 1 and 'pterodáctilo' in fauna['notas'][0]['titulo']


def test_caso_juarez_tiene_fuente_contraste_y_coordenadas_aproximadas():
    from pathlib import Path
    fc = json.loads((Path(__file__).resolve().parents[1] / 'data/anomalias-fauna.geojson').read_text())
    f = fc['features'][0]
    p = f['properties']
    assert p['tipo'] == 'prehistoric' and p['nivel'] == 'medios'
    assert p['fecha'] == '2026-11-09' and p['fecha_tipo'] == 'publicacion'
    assert p['aprox'] is True and p['precision'] == 'ciudad'
    assert 'No confirmada' in p['fecha_evento']
    assert 'nortedigital.mx' in p['url'] and 'aztecaciudadjuarez.com' in p['contraste_url']


def test_gkg_en_operacion_acepta_fauna_y_descarta_entretenimiento():
    def fila(titulo, uid):
        f = [''] * 27
        f[1], f[3], f[4], f[26] = '20261115090000', 'medio.mx', 'https://ej.org/'+uid, '<PAGE_TITLE>'+titulo+'</PAGE_TITLE>'
        return f
    rows = [fila('Captan supuesto pterodáctilo en Ciudad Juárez','fauna'), fila('Estreno de película de dinosaurios en México','cine')]
    notas, estado = A.de_gkg(U, archivos=1, filas_de=lambda _:rows, lista_de=lambda *_:['archivo'])
    assert notas and all(f['properties']['tipo']=='prehistoric' for f in notas)
    assert all(f['properties']['lugar']=='Ciudad Juárez, Chihuahua' for f in notas)
    assert all(f['properties']['fecha_tipo']=='deteccion' for f in notas)
    assert 'GKG:' in estado


def test_phoenix_como_ciudad_no_reclasifica_los_ovnis_como_animales():
    assert A.tipo_fauna('UFO spotted over Phoenix') == ''
    assert A.es_del_tema('UFO spotted over Phoenix', [])
    assert A.tipo_por_texto('Luces misteriosas sobre Phoenix') == 'lights_sky'
