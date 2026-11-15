import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analizarLugar,frescura,simularCosto,tendenciaPrecio,filtrarAmenazas,validarBitacora,celdasCSV} from '../../js/clima-impactos-logica.js';
const t=Date.parse('2026-11-15T12:00:00Z');
const registro={ok:true,dato:{emitido_utc:'2026-11-15T10:00:00Z',horas:[{t:'2026-11-15T13:00:00Z',temp_c:36,viento_kmh:65,lluvia_6h_mm:32,lluvia_1h_mm:null},{t:'2026-11-16T13:00:00Z',temp_c:-1,viento_kmh:null,lluvia_6h_mm:null}]}};
test('señales por valores y ventana; no convierte el escenario en probabilidad',()=>{
 const a=analizarLugar(registro,{},t);assert.equal(a.vigente,true);assert.equal(a.señales.length,4);assert.equal(a.resumen[0].muestras,1);assert.equal(a.resumen[0].lluvia6h,32);assert.ok(a.señales.every(s=>!('probabilidad' in s)));
});
test('datos antiguos, sin fecha o sin horizonte futuro no generan señales actuales',()=>{
 assert.equal(analizarLugar({...registro,dato:{...registro.dato,emitido_utc:'2026-10-01T00:00:00Z'}},{},t).señales.length,0);
 assert.equal(analizarLugar({}, {},t).vigente,false);
 assert.equal(analizarLugar(registro,{},t+20*86400000).vigente,false);
 assert.equal(frescura('2027-01-01',45,t).vigente,false);
});
test('variables ausentes no equivalen a cero y se pueden cambiar umbrales',()=>{
 const r={dato:{emitido_utc:'2026-11-15T10:00:00Z',horas:[{t:'2026-11-15T13:00:00Z',temp_c:null,viento_kmh:null,lluvia_6h_mm:null}]}};
 const a=analizarLugar(r,{},t);assert.equal(a.señales.length,0);assert.equal(a.resumen[0].min,null);assert.equal(a.resumen[0].viento,null);
 assert.equal(analizarLugar(registro,{calor:40,frio:-5,lluvia:100,viento:100},t).señales.length,0);
});
test('simulación explícita, merma por cantidad útil y entradas inválidas',()=>{
 assert.ok(Math.abs(simularCosto(1000,10,5,100).total-1257.8947368)<.00001);
 assert.equal(simularCosto(1000,-100,0,0).total,0);
 assert.equal(simularCosto(1000,10,100,0),null);assert.equal(simularCosto(-1,10,0,0),null);assert.equal(simularCosto('',10,0,0),null);
});
test('precios: solo observaciones válidas, sin valores futuros ni causalidad inventada',()=>{
 const r=tendenciaPrecio({puntos:[['2026-10-01',100],['2026-11-01',110],['2027-01-01',500],['x',0]]},t);
 assert.equal(r.valor,110);assert.ok(Math.abs(r.cambio-10)<1e-9);assert.equal(r.vigente,true);assert.equal(r.anterior,'2026-10-01');
 assert.equal(tendenciaPrecio({puntos:[['2026-10-01',0],['2026-11-01',10]]},t).cambio,null);
});
test('filtros combinados respetan horizonte, sector y acentos',()=>{
 const c=JSON.parse(fs.readFileSync(new URL('../../config/clima-impactos.json',import.meta.url)));
 assert.ok(filtrarAmenazas(c.amenazas,{texto:'nino',horizonte:'meses',sector:'alimentos'}).length>0);
 assert.equal(filtrarAmenazas(c.amenazas,{texto:'xyz-no-existe'}).length,0);
});
test('importación acotada y exportación CSV protege fórmulas sin alterar cifras',()=>{
 const b=validarBitacora({tareas:[{texto:'a',hecho:'false'},null,{texto:3}],notas:'x'});assert.equal(b.tareas.length,1);assert.equal(b.tareas[0].hecho,false);
 assert.match(celdasCSV([['=cmd','texto, "cita"',-5]]),/"'=cmd","texto, ""cita""", "-5"|"'=cmd","texto, ""cita""","-5"/);
 assert.equal(validarBitacora({tareas:Array(400).fill({texto:'x'})}).tareas.length,300);
});
