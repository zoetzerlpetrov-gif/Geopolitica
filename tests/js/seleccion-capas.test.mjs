import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Movimiento} from '../../js/movimiento.js';
import {GestorCapas} from '../../js/capas.js';
import {Riesgos, CAPAS} from '../../js/riesgos.js';
import {Clima} from '../../js/clima.js';
import {CapaIndice} from '../../js/indice.js';
import {Altura3D} from '../../js/altura3d.js';

const vacio = () => ({type:'FeatureCollection',features:[]});
const diferido=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const respuesta=x=>({ok:true,json:async()=>x});
function mapa(){
 const fuentes=new Map(), capas=new Map();
 return {fuentes,capas,on(){},off(){},getLayer:id=>capas.get(id),getSource:id=>fuentes.get(id),
  addSource(id,s){fuentes.set(id,{...s,setData(d){this.data=d;}});},removeSource:id=>fuentes.delete(id),
  addLayer(l){capas.set(l.id,l);},removeLayer:id=>capas.delete(id),setFilter(id,f){capas.get(id).filter=f;},
  hasImage:()=>true,getBounds:()=>({getWest:()=>-180,getEast:()=>180,getNorth:()=>90,getSouth:()=>-90}),
  getZoom:()=>2,querySourceFeatures:id=>fuentes.get(id)?.data?.features||[], getCanvas:()=>({style:{}})};
}
const catalogo={categorias:[{id:'satelites',subtipos:[{id:'iss',grupo:'iss',color:'#fff'},{id:'sx',grupo:'spacex-starlink',inicial:false,color:'#fff'}]},
 {id:'aeronaves',subtipos:[{id:'civil',color:'#fff'}]},{id:'buques',subtipos:[{id:'carga',color:'#fff'}]}]};
function entorno(t){
 const fetch0=globalThis.fetch, worker0=globalThis.Worker, location0=globalThis.location, raf0=globalThis.requestAnimationFrame;
 globalThis.location={search:''};globalThis.requestAnimationFrame=()=>0;
 const doc0=globalThis.document;
 globalThis.document={documentElement:{dataset:{theme:"dark"}}};
 t.after(()=>{globalThis.document=doc0;});
 const mensajes=[];
 globalThis.Worker=class{postMessage(x){mensajes.push(x);}};
 t.after(()=>{globalThis.fetch=fetch0;globalThis.Worker=worker0;globalThis.location=location0;globalThis.requestAnimationFrame=raf0;});
 return mensajes;
}
const movimiento=m=>new Movimiento(m,{catalogo,onCambio(){},onAviso(){},onObjeto(){}});

test('satélites: desmarcar limpia sin otra interacción e ignora posiciones de una selección anterior',async t=>{
 const mensajes=entorno(t);globalThis.fetch=async()=>respuesta({grupos:{}});
 const m=mapa(),mov=movimiento(m);await mov.activar('satelites');
 // No descarga: simula que la constelación ya se cargó antes de esta interacción.
 mov.datos.satelites.spacexCargado=true;
 mov.setSubtipos('satelites',['spacex-starlink']);
 const revision=mensajes.at(-1).revision;
 const geojson=JSON.stringify({type:'FeatureCollection',features:[{properties:{st:'spacex-starlink'}}]});
 mov.worker.onmessage({data:{tipo:'posiciones',revision,geojson}});
 const src=m.getSource('mov-satelites'); assert.equal(typeof src.data,'string');
 mov.setSubtipos('satelites',[]);
 assert.deepEqual(m.getLayer('mov-satelites').filter.at(-1),['literal',[]]);
 const vacia=src.data;
 assert.deepEqual(await (await fetch0Blob(vacia)).json(),vacio());
 mov.worker.onmessage({data:{tipo:'posiciones',revision,geojson}});
 assert.equal(src.data,vacia,'un mensaje tardío no restaura Starlink');
 mov.desactivar('satelites');assert.equal(m.getSource('mov-satelites'),undefined);
});
// fetch nativo conserva la lectura de blob aunque las descargas estén simuladas.
const fetch0Blob=globalThis.fetch;

test('satélites: al quitar un subtipo conserva los otros y aplica el mismo filtro a etiquetas y clics',async t=>{
 entorno(t);globalThis.fetch=async()=>respuesta({grupos:{}});
 const m=mapa(),mov=movimiento(m);await mov.activar('satelites');mov.datos.satelites.spacexCargado=true;
 mov.setSubtipos('satelites',['iss','spacex-starlink']);mov.setSubtipos('satelites',['iss']);
 for(const id of ['mov-satelites','mov-satelites-texto','mov-satelites-toque']) assert.deepEqual(m.getLayer(id).filter.at(-1),['literal',['iss']]);
 mov.desactivar('satelites');
});

for(const tipo of ['satelites','aeronaves','buques']) test(`${tipo}: una descarga pendiente no reactiva una capa desmarcada`,async t=>{
 entorno(t);const d=diferido();globalThis.fetch=()=>d.promise;
 const m=mapa(),mov=movimiento(m),p=mov.activar(tipo);mov.desactivar(tipo);
 d.resolve(respuesta({grupos:{},campos:[],a:[],b:[]}));await p;
 assert.equal(mov.activas.has(tipo),false);assert.equal(m.fuentes.size,0);assert.equal(mov.reloj,null);
});

test('capas estáticas: cancelar mientras se descargan agrupaciones no instala objetos',async t=>{
 entorno(t);const d=diferido();globalThis.fetch=()=>d.promise;
 const m=mapa(),g=new GestorCapas(m,{onEntidad(){},onCambio(){},chokepointsActivos:()=>false});
 g.registrar([{id:'cam',disponible:true,geometria:'punto',subtipos:[],manifest:{formato:'geojson',grupos:'grupos'}}]);
 const p=g.activar('cam');g.desactivar('cam');d.resolve(respuesta(vacio()));await p;
 assert.equal(g.activas.size,0);assert.equal(m.fuentes.size,0);
});

test('riesgos/trenes: una consulta tardía no repone una capa desmarcada',async t=>{
 entorno(t);const d=diferido();globalThis.fetch=()=>d.promise;
 const capa=CAPAS.find(c=>c.url && !c.generar);assert.ok(capa);
 const m=mapa(),r=new Riesgos(m,{onObjeto(){}}),p=r.activar(capa.id);r.desactivar(capa.id);
 d.resolve(respuesta(vacio()));await p;
 assert.equal(r.activas.size,0);assert.equal(m.fuentes.size,0);assert.equal(r.relojes.size,0);
});

test('clima: cancelar durante la descarga de metadatos no instala la temperatura',async t=>{
 entorno(t);const d=diferido();globalThis.fetch=()=>d.promise;
 const m=mapa(),c=new Clima(m),p=c.activar('temp');c.desactivar('temp');
 d.resolve(respuesta({pasos:[{temp:'t.png'}]}));await p;
 assert.equal(c.activas.size,0);assert.equal(m.fuentes.size,0);
});

test('índice: cancelar mientras se descargan países no vuelve a dibujar la coropleta',async t=>{
 entorno(t);const d=diferido();globalThis.fetch=()=>d.promise;
 const m=mapa(),c=new CapaIndice(m),p=c.activar();c.desactivar();
 d.resolve(respuesta({...vacio(),paises:{}}));assert.equal(await p,null);
 assert.equal(c.activa,false);assert.equal(m.fuentes.size,0);
});

test('altura 3D: no conserva columnas de subtipos ocultos aunque la fuente aún tenga datos',()=>{
 const m=mapa();m.addSource('mov-satelites',{data:{...vacio(),features:[{properties:{id:'sat:1',st:'spacex-starlink',alt:550},geometry:{coordinates:[0,0]}}]}});
 const activos=new Set(['spacex-starlink']);const a=new Altura3D(m,{visible:(_,p)=>activos.has(p.st)});
 assert.equal(a.objetos().length,1);activos.clear();assert.equal(a.objetos().length,0);
});

test('activar → desactivar → activar: la respuesta antigua no sustituye la selección nueva',async t=>{
 entorno(t);const viejo=diferido(),nuevo=diferido();let n=0;globalThis.fetch=()=>++n===1?viejo.promise:nuevo.promise;
 const m=mapa(),mov=movimiento(m),p1=mov.activar('satelites');mov.desactivar('satelites');const p2=mov.activar('satelites');
 nuevo.resolve(respuesta({grupos:{},generado_utc:'nuevo'}));await p2;mov.setSubtipos('satelites',[]);
 viejo.resolve(respuesta({grupos:{},generado_utc:'viejo'}));await p1;
 assert.equal(mov.datos.satelites.generado,'nuevo');assert.equal(mov.activas.get('satelites').size,0);
 mov.desactivar('satelites');
});

test('riesgos/trenes: una actualización periódica en curso no resucita la capa',async t=>{
 entorno(t);const d=diferido();let n=0;globalThis.fetch=async()=>++n===1?respuesta(vacio()):d.promise;
 const interval0=globalThis.setInterval,clear0=globalThis.clearInterval;let refrescar;
 globalThis.setInterval=f=>{refrescar=f;return 1;};globalThis.clearInterval=()=>{};
 t.after(()=>{globalThis.setInterval=interval0;globalThis.clearInterval=clear0;});
 const capa=CAPAS.find(c=>c.url && c.refresco_s && !c.generar && !c.complementar && !c.derivar);assert.ok(capa);
 const m=mapa(),r=new Riesgos(m,{onObjeto(){}});await r.activar(capa.id);
 assert.equal(typeof refrescar,'function');const pendiente=refrescar();r.desactivar(capa.id);d.resolve(respuesta(vacio()));await pendiente;
 assert.equal(r.activas.size,0);assert.equal(m.fuentes.size,0);assert.equal(r.relojes.size,0);
});

test('un error de una descarga cancelada no desmarca ni falla la activación nueva',async t=>{
 entorno(t);let fallar;const pendiente=new Promise((_,r)=>fallar=r);let n=0;
 globalThis.fetch=()=>++n===1?pendiente:Promise.resolve(respuesta({grupos:{}}));
 const mov=movimiento(mapa()),viejo=mov.activar('satelites');mov.desactivar('satelites');await mov.activar('satelites');
 fallar(new Error('descarga antigua falló'));await assert.doesNotReject(viejo);assert.equal(mov.activas.has('satelites'),true);mov.desactivar('satelites');
});

test('actualizar una capa activa conserva sus filtros y conserva datos anteriores si falla la red', async t => {
 entorno(t);
 const interval0=globalThis.setInterval,clear0=globalThis.clearInterval;let refrescar;
 globalThis.setInterval=f=>{refrescar=f;return 1;};globalThis.clearInterval=()=>{};
 t.after(()=>{globalThis.setInterval=interval0;globalThis.clearInterval=clear0;});
 let modo='inicial';
 const nuevo={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[-99,19]},properties:{iso3:'MEX',pais:'México',n:2}}]};
 globalThis.fetch=async()=>{if(modo==='error')throw new Error('sin red');return respuesta(modo==='inicial'?vacio():nuevo);};
 const m=mapa(),r=new Riesgos(m,{onObjeto(){}});
 const filtro={pais:'MEX',tipo:'Corte de internet',sevMin:1};
 r.setFiltro(filtro);await r.activar('cortes_internet');const actualizar=refrescar;
 modo='nuevo';await actualizar();
 assert.deepEqual(r.filtro,filtro);assert.equal(r.activas.has('cortes_internet'),true);
 assert.equal(r.datos('cortes_internet').features[0].properties.n,2);
 assert.ok(JSON.stringify(m.capas.get('rg-cortes_internet-punto').filter).includes('MEX'));
 const anterior=r.datos('cortes_internet');modo='error';await actualizar();
 assert.equal(r.datos('cortes_internet'),anterior);assert.deepEqual(r.filtro,filtro);
 r.desactivar('cortes_internet');assert.equal(m.fuentes.has('rg-cortes_internet'),false);
});
