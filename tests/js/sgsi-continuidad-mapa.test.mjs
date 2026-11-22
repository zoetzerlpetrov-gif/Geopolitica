import {test} from 'node:test';
import assert from 'node:assert/strict';
import {textoDocumento, documentosHTML} from '../../js/sgsi-documentos.js';
import {estiloPrivado, puntosTraslado, lineasTraslado, baseTraslado} from '../../js/continuidad-mapa-interactivo.js';
import {htmlVigia} from '../../js/vigia_panel.js';

test('SGSI renderiza tablas y párrafos sin ejecutar HTML ni enlaces del documento', () => {
  const h = textoDocumento('# Título\n\n| Control | Estado |\n|---|---|\n| <img src=x onerror=alert(1)> | Pendiente |\n\n- A\n- B');
  assert.match(h, /<table/); assert.match(h, /<ul/); assert.ok(!h.includes('<img')); assert.match(h, /&lt;img/);
  const d = documentosHTML({revisado:'2026-11-22', documentos:[{titulo:'<script>x</script>', texto:'Pendiente'}]});
  assert.ok(!d.includes('<script>')); assert.match(d, /<details/);
});

test('vigía explica transformación sin ocultar una alerta real', () => {
  const h = htmlVigia({nivel:'alerta', motivos:['Alteración'], detalle:{sitios:[{sitio:'Dominio', ok:true, estado:200, integro:false, transformaciones:['Beacon <script>']}]}});
  assert.match(h, /distinto al repositorio/); assert.match(h, /Beacon &lt;script&gt;/);
});

const geo = {type:'FeatureCollection',features:[]};
const p = {ruta:{origen:{nombre:'Salida',coords:[-99,19]}, intermedio:{nombre:'Resguardo',coords:[-89,21]}},destinos:[
  {id:'a',destino:'Destino',rol:'Principal',coords:[-3,40],estancia_dias:180}, {id:'sin',destino:'Sin punto'}]};

test('base local no necesita proveedores ni carga de estilos externos', async () => {
  const local = await baseTraslado('local', geo, () => { throw Error('No debe llamar a red'); });
  assert.deepEqual(local, estiloPrivado(geo)); assert.ok(!local.glyphs);
  assert.deepEqual(Object.keys(local.sources), ['paises']); assert.equal(local.sources.paises.data, geo);
});

test('calles, satélite y relieve reusan estilos del proyecto sólo al elegirlos', async () => {
  for (const tipo of ['calles','satelite','relieve']) {
    const calls = [], style = {version:8,sources:{},layers:[]};
    assert.equal(await baseTraslado(tipo, geo, async (...args) => { calls.push(args); return {style}; }), style);
    assert.deepEqual(calls, [['light',{base:tipo}]]);
  }
  await assert.rejects(baseTraslado('invalido',geo));
});

test('las conexiones son locales, conservan destinos y no incluyen contactos ni fechas', () => {
  const puntos = puntosTraslado(p,{dias:{a:12}});
  assert.equal(puntos.length,3); assert.equal(puntos[2].extra,'día 12 de 180');
  const rutas = lineasTraslado(p);
  assert.equal(rutas.features.length,2);
  assert.deepEqual(rutas.features[1].geometry.coordinates,[[-99,19],[-3,40]]);
  assert.deepEqual(Object.keys(rutas.features[0].properties),['color']);
});
