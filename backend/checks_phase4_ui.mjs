// Prueba DOM de formularios. No inicia ni automatiza un navegador.
// npm install --prefix /tmp/dominus-f4-js --no-save jsdom@27.4.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {phase4} from './web/phase4.js';
const {JSDOM}=await import(pathToFileURL(process.env.DOMINUS_JSDOM||'/tmp/dominus-f4-js/node_modules/jsdom/lib/api.js'));
const tick=()=>new Promise(r=>setTimeout(r,0));
test('formularios Fase 4A: altas, relaciones, borrador, seguridad DOM y originales',async()=>{
 const dom=new JSDOM('<div id="phase4-workspace"></div>',{url:'https://private.example/'});
 globalThis.document=dom.window.document;globalThis.confirm=()=>true;
 let current={org:'o1',id:'case1',version:1,data:{fase1:{version:1,requerimientos:[{id:'pir1',titulo:'Pregunta de prueba'}]}}},saves=[],requests=[],messages=[];
 const root=document.getElementById('phase4-workspace');
 const mock=phase4({active:()=>current,save:async(data,reason)=>{saves.push({data,reason});current.data=data;current.version++;},status:(m,e)=>messages.push([m,e]),dirty:()=>{},download:()=>{},api:async(path,opt)=>{requests.push({path,opt});if(!opt)return current;if(path.endsWith('/evidence')){current.data.fase4.evidence.push({id:'ev1',filename:opt.body.filename,content:opt.body.content,sha256:'qa',size:3,source:opt.body.source,acquired_at:opt.body.acquired_at,received_at:1793280000,actor:'qa',custody:[{actor:'qa',at:1793280000,custodian:'QA',reason:'prueba'}]});current.version++;return {id:'ev1',version:current.version};}return {};}});
 mock.render();let form=root.querySelector('form');
 assert.equal(form.elements.kind.value,'instalación');assert.equal(form.elements.criticality.value,'baja');
 for(const [k,v]of Object.entries({title:'<img src=x onerror=alert(1)>',owner:'Operaciones',identifier:'TERM-QA'}))form.elements[k].value=v;
 form.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(mock.hasPending(),true);
 form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await tick();
 assert.equal(saves.length,1);assert.equal(current.data.fase1.requerimientos[0].id,'pir1');assert.equal(root.querySelectorAll('img').length,0);assert.equal(mock.hasPending(),false);
 const click=text=>[...root.querySelectorAll('button')].find(b=>b.textContent===text).click();
 click('Entidades y eventos');form=root.querySelector('form');form.elements.title.value='Evento QA';form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await tick();
 assert.equal(current.data.fase4.entities[0].kind,'empresa');
 click('Relaciones');form=root.querySelector('form');assert.equal(form.elements.from.options.length,4);
 form.elements.from.value='fase1:requerimientos:pir1';form.elements.to.value='asset:'+current.data.fase4.assets[0].id;form.elements.notes.value='Fundamento';form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await tick();assert.equal(current.data.fase4.links.length,1);
 click('Vista unificada');assert.match(root.textContent,/Pregunta de prueba → afecta →/);
 click('Originales y custodia');form=root.querySelector('form');
 Object.defineProperty(form.elements.file,'files',{value:[{name:'prueba.txt',size:3,arrayBuffer:async()=>new Uint8Array([65,66,67]).buffer}]});
 form.elements.source.value='Laboratorio';form.elements.acquired_at.value='2026-10-29T10:00:00-06:00';form.elements.custodian.value='QA';form.elements.reason.value='Prueba';form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await tick();await tick();
 assert.equal(requests[0].path,'/orgs/o1/cases/case1/evidence');assert.equal(requests[0].opt.body.content,'QUJD');assert.equal(root.querySelectorAll('input[type=file]').length,1);assert.match(root.textContent,/prueba.txt/);
 mock.clear();assert.equal(root.textContent,'');assert.equal(mock.hasPending(),false);dom.window.close();
});

test('IDs de interfaz privada únicos y elementos usados por app.js presentes',()=>{
 const html=readFileSync(new URL('./web/index.html',import.meta.url),'utf8'),js=readFileSync(new URL('./web/app.js',import.meta.url),'utf8');const dom=new JSDOM(html),ids=[...dom.window.document.querySelectorAll('[id]')].map(e=>e.id);assert.equal(ids.length,new Set(ids).size);for(const [,id]of js.matchAll(/\$\('([^']+)'\)/g))assert.ok(dom.window.document.getElementById(id),id);assert.ok(ids.includes('phase4-workspace'));dom.window.close();
});
