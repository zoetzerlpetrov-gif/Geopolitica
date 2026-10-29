import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TIPOS, ESTADOS} from '../../js/fase1-logica.js';
import {SECCIONES} from '../../js/fase2-modelo.js';
test('el contrato documental del backend coincide con las versiones locales de Fase 1 y 2',()=>{
 const schema=JSON.parse(readFileSync(new URL('../../backend/dominus/record_schema.json',import.meta.url),'utf8'));
 assert.deepEqual(schema.fase1,{tipos:TIPOS,estados:ESTADOS});
 assert.deepEqual(schema.fase2,SECCIONES);
});
