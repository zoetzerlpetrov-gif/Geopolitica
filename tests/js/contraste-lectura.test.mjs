import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rgb,contraste,legible,tokensLectura,revisarPaleta} from '../../js/contraste.js';
import {PRESETS} from '../../js/apariencia_admin.js';
import {validar} from '../../cloudflare/apariencia/service.js';
import {separarAnotaciones} from '../../js/pruebas.js';

test('colores de severidad mantienen el mínimo en ambos temas y todas las superficies',()=>{
  for(const preset of Object.values(PRESETS))for(const t of [preset.claro,preset.oscuro]){
    const tokens=tokensLectura(t);
    for(const k of ['danger','success','warning','info','link'])for(const bg of [t.bg,t.surface,t['surface-2']])assert.ok(contraste(tokens[k],bg)>=4.5,`${k}: ${tokens[k]} / ${bg}`);
    assert.ok(contraste(tokens['on-accent'],t.accent)>=4.5);
    assert.ok(contraste(tokens['warn-text'],tokens['warn-bg'])>=4.5);
  }
});
test('el umbral no se redondea para declarar accesibilidad',()=>{
  const c=contraste('#777777','#ffffff');assert.ok(c<4.5);assert.notEqual(c,Math.round(c*10)/10);
  assert.equal(contraste('#000000','#ffffff'),21);
});
test('el corrector conserva colores que ya son legibles y ajusta sólo los insuficientes',()=>{
  assert.equal(legible('#14171c',['#fbfaf6']), '#14171c');
  for(const bg of ['#ffffff','#101826'])assert.ok(contraste(legible('#b8860b',[bg]),bg)>=4.5);
  assert.equal(legible('#888888',['#000000','#ffffff'],12),null);
  assert.deepEqual(rgb('rgba(20, 30, 40, 0.5)'),[20,30,40,0.5]);
});
test('Apariencia valida también campos y enlaces, incluso si llega directamente al Worker',()=>{
  const p=structuredClone(PRESETS.tactico);p.claro['surface-2']='#14171c';
  assert.ok(revisarPaleta(p).some(x=>x.includes('surface-2')));assert.match(validar(p).error,/Contraste/);
  const b=structuredClone(PRESETS.tactico);b.claro.accent='#aaaaaa';assert.match(validar(b).error,/Contraste/);
});
test('capas vacías de informes previos son avisos; un error de descarga sigue como problema',()=>{
  const a=separarAnotaciones({problemas:['Capa vacía o sin datos (aviso): Asaltos','Capa con error de carga: Casetas · sin respuesta'],avisos:['Otra cobertura']});
  assert.equal(a.problemas.length,1);assert.match(a.problemas[0],/sin respuesta/);assert.equal(a.avisos.length,2);
  assert.match(a.avisos[1],/no implica ausencia de hechos/);
});
