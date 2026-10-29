import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../../js/fase1-logica.js';
import fs from 'node:fs';
const requerimiento={titulo:'Continuidad de planta',tipo:'PIR',pregunta:'¿Qué puede interrumpir el suministro?',responsable:'Turno A',plazo:'2026-12-01',criterio:'Fuentes y alternativas documentadas',estado:'en curso'};
test('ciclo Fase 1: pregunta, fuente, producto revisado, lección y relevo; respaldo sin pérdida',()=>{
 let d=F.guardarRegistro(F.vacio(),'requerimientos',requerimiento);const id=d.requerimientos[0].id;
 d=F.guardarRegistro(d,'cobertura',{titulo:'Avisos oficiales',requerimiento:id,fuente:'Operador',url:'https://example.org',territorio:'Región',idioma:'es',periodo:'24 h',vacio:'Cobertura parcial'});
 d=F.guardarRegistro(d,'productos',{titulo:'SITREP',tipo:'SITREP',requerimiento:id,juicio:'Revisar el respaldo',fuentes:'Operador, fecha publicada',confianza:'Media; falta otra fuente',revisor:'Analista B',estado:'aprobado'});
 d=F.guardarRegistro(d,'lecciones',{titulo:'Revisión del resultado',requerimiento:id,esperado:'Menos tiempo sin servicio',resultado:'Se documentó una alternativa',evidencia:'Registro del turno',mejora:'Consultar antes'});
 d=F.guardarRegistro(d,'relevos',{titulo:'Cambio de turno',responsable:'A',receptor:'B',recepcion:'2026-10-28 18:00, recepción confirmada',estado:'cerrado',pendientes:'Revalidar alternativa'});
 assert.deepEqual(F.validarPaquete(JSON.parse(JSON.stringify(d))),d);
 assert.match(F.markdown('productos',d.productos[0],d),/Continuidad de planta/);
 assert.match(F.markdown('relevos',d.relevos[0],d),/Revalidar alternativa/);
 assert.throws(()=>F.eliminarRegistro(d,'requerimientos',id),/vinculados/);
 const edited=F.guardarRegistro(d,'requerimientos',{...requerimiento,titulo:'Pregunta revisada'},id);
 assert.equal(edited.requerimientos.length,1);assert.equal(edited.requerimientos[0].creado,d.requerimientos[0].creado);
 assert.equal(F.eliminarRegistro(d,'relevos',d.relevos[0].id).relevos.length,0);
});
test('revisión y recepción no se aprueban por campos vacíos',()=>{
 assert.throws(()=>F.guardarRegistro(F.vacio(),'productos',{titulo:'P',estado:'aprobado'}),/obligatorios/);
 assert.throws(()=>F.guardarRegistro(F.vacio(),'relevos',{titulo:'P',estado:'cerrado'}),/recepción/);
 assert.throws(()=>F.guardarRegistro(F.vacio(),'requerimientos',{titulo:'P',tipo:'PIR',estado:'en curso'}),/criterio/);
});
test('importación rechaza colección, referencia, estado, ID y tamaño de campo inválidos',()=>{
 assert.throws(()=>F.validarPaquete({version:2}),/incompatible/);
 let d=F.guardarRegistro(F.vacio(),'requerimientos',requerimiento);
 const changed=fn=>{const c=structuredClone(d);fn(c);return c;};
 for(const c of [changed(c=>c.requerimientos.push(c.requerimientos[0])),changed(c=>c.requerimientos[0].estado='ejecutar'),changed(c=>c.requerimientos[0].titulo={html:'x'}),changed(c=>c.requerimientos[0].titulo='x'.repeat(12001)),changed(c=>c.productos='no')])assert.throws(()=>F.validarPaquete(c));
 assert.throws(()=>F.guardarRegistro(d,'productos',{titulo:'No vinculado',requerimiento:'inexistente'}),/inexistente/);
});
test('certeza no infiere revisión humana ni derechos por contar medios',()=>{
 const q=F.procedencia({verificado:true,fuentes:[{fuente:'A'},{fuente:'A'},{fuente:'B'}]});
 assert.match(q.corroboracion,/2 medios/);assert.match(q.corroboracion,/no evaluada/);assert.match(q.revision,/no registrada/);
 assert.match(F.htmlCalidad({fuentes:[{fuente:'<script>'}]}),/Procedencia y certeza/);
});
test('precisión nunca se deduce exacta por ausencia de bandera aproximada',()=>{
 assert.match(F.precisionEspacial({aprox:'0'}),/no documentada/);
 assert.match(F.precisionEspacial({aprox:'1'}),/aproximada/);
 assert.match(F.precisionEspacial({precision:'ciudad'}),/ciudad/);
 assert.match(F.precisionEspacial({}),/no asumir/);
});
test('edad distingue hora de observación, descarga, futura y antigua, incluso caché SEPTA anterior',()=>{
 const ahora=Date.parse('2026-10-28T18:00:00Z');
 assert.equal(F.edadPosicion({hora:'2026-10-28T17:59:00Z'},ahora).estado,'reciente');
 assert.equal(F.edadPosicion({hora:'2026-10-28T17:00:00Z'},ahora).estado,'antigua');
 assert.equal(F.edadPosicion({hora:'2026-10-29T18:00:00Z'},ahora).estado,'futura');
 assert.equal(F.edadPosicion({red:'filadelfia',hora:'2026-10-28T17:59:00Z'},ahora).estado,'desconocida');
 assert.equal(F.edadPosicion({recibido_utc:'2026-10-28T18:00:00Z'},ahora).estado,'desconocida');
});
test('registro de licencias combina inventario sin aprobar proveedores desconocidos, y neutraliza HTML/enlaces activos',()=>{
 const registro=JSON.parse(fs.readFileSync(new URL('../../config/fase1_licencias.json',import.meta.url)));
 const r=F.inventarioLicencias(registro,{fuentes:[{id:'desconocida',operador:'<img src=x onerror=alert(1)>',pagina:'javascript:alert(1)'}]},{rss:[{nombre:'RSS nuevo',url:'https://example.org'}]});
 assert.equal(r.find(x=>x.id==='desconocida').comercial,'revisar');
 const out=F.htmlLicencias(r,'comercial','desconocida'); // buscar por ID también
 assert.ok(!out.includes('href="javascript:'));assert.ok(!out.includes('<img'));
 assert.match(F.htmlLicencias(r,'comercial','C2Intel'),/restringido/);
 assert.throws(()=>F.htmlLicencias(r,'otro'),/inválida/);
});
