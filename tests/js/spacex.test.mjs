import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {modelosVigentes,gruposSpaceX,formaciones} from '../../js/spacex-orbitas.js';
import {panelSpaceX,resultadosSpaceX} from '../../js/spacex-ui.js';
import {restricciones,subtiposPago} from '../../js/licencias.js';
const leer=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const modelo=leer('../fixtures/spacex-modelo.json');
const t=Date.parse(modelo.desde)+600000;

test('ventanas, precisión, ids de seis y nueve cifras y duplicados',()=>{
  const base={...modelo,formacion:'orbital-1'};
  const viejo={...base,hasta:new Date(t-1).toISOString()};
  const falso={...base,omm:{...base.omm,NORAD_CAT_ID:799501807},error_max_km:4};
  const g=gruposSpaceX({objetos:[base,viejo,base,falso]},t);
  assert.equal(g['spacex-starlink'].length,1);
  assert.equal(g['spacex-trenes'].length,1);
  assert.equal(modelosVigentes({objetos:[{...base,error_max_km:-1}]},t).length,0);
});

test('formaciones: tres objetos distintos, mismo grupo y pasos próximos; no agrupa por nombre',()=>{
  const pase=(id,min,extra={})=>({id,n:'STARLINK-'+id,lote:'2026-123',reciente:true,t_max:min*60000,vis_ini:min*60000,vis_fin:(min+1)*60000,az_ini:20,...extra});
  assert.equal(formaciones([pase('1',0),pase('2',2),pase('3',4)]).length,1);
  assert.equal(formaciones([pase('1',0),pase('1',2),pase('1',4)]).length,0);
  assert.equal(formaciones([pase('1',0),pase('2',2),pase('3',40)]).length,0);
  assert.equal(formaciones([pase('1',0,{lote:null}),pase('2',1,{lote:null}),pase('3',2,{lote:null})]).length,0);
  assert.ok(panelSpaceX().includes('data-spacex-pases'));
  assert.ok(!panelSpaceX().includes('type="checkbox"'));
  assert.ok(resultadosSpaceX({analizados:0,disponibles:0,pases:[],horas:24},'<script>').includes('&lt;script&gt;'));
});

test('los cinco roles reciben SpaceX dentro de los subtipos sin alterar el resto de fuentes',()=>{
  const cat=leer('../../config/entities.json'),planes=leer('../../config/planes.json'),lic=leer('../../config/comercial_licencias.json');
  const todos=cat.categorias.find(c=>c.id==='satelites').subtipos;
  for(const rol of ['demo','recon','analyst','command','admin']){
    const subs=rol==='admin'?todos:subtiposPago(todos,restricciones(lic,cat,planes));
    for(const grupo of ['spacex-starlink','spacex-trenes'])assert.equal(subs.filter(s=>s.grupo===grupo).length,1,rol+grupo);
    if(rol!=='admin')assert.ok(!subs.some(s=>s.fuente==='celestrak'));
  }
  assert.equal(cat.fuentes.spacex_public.licencia_verificada,false,'no inventa una licencia verificada');
});

function worker(){
 const mensajes=[];const RDate=Date;
 class Fecha extends RDate{constructor(...args){super(...(args.length?args:[t]));}static now(){return t;}}
 const c={Date:Fecha,Math,JSON,Set,Map,Number,String,Array,console,postMessage:m=>mensajes.push(m),setInterval:()=>1,clearInterval:()=>{}};
 vm.createContext(c);
 c.importScripts=(...rutas)=>{for(const ruta of rutas){const url=ruta.startsWith('../vendor')?'../../'+ruta.slice(3):'../../js/'+ruta;vm.runInContext(fs.readFileSync(new URL(url,import.meta.url),'utf8'),c);}};
 vm.runInContext(fs.readFileSync(new URL('../../js/sat-worker.js',import.meta.url),'utf8'),c);
 return {c,mensajes};
}

test('worker real: OMM → posiciones, trayectoria y pases sin salir de la ventana validada',()=>{
 const {c,mensajes}=worker();
 c.onmessage({data:{tipo:'omm',grupos:{'spacex-starlink':[modelo]},activos:['spacex-starlink']}});
 const pos=mensajes.find(m=>m.tipo==='posiciones');
 const f=JSON.parse(pos.geojson).features;
 assert.equal(f.length,1);
 assert.ok(f[0].properties.alt>100&&f[0].properties.alt<2000);
 const id=String(modelo.omm.NORAD_CAT_ID);
 c.onmessage({data:{tipo:'orbita',id}});
 const orb=mensajes.find(m=>m.tipo==='orbita');
 assert.ok(orb.muestras.length>30);
 assert.equal(orb.elementos.fuente,'SpaceX');
 c.onmessage({data:{tipo:'pases',lat:19.43,lon:-99.13,horas:24,grupos:['spacex-starlink']}});
 const pases=mensajes.find(m=>m.tipo==='pases');
 assert.ok(Array.isArray(pases.pases));
 for(const p of pases.pases)assert.ok(p.fin<=Date.parse(modelo.hasta));
 const nine={...modelo,omm:{...modelo.omm,NORAD_CAT_ID:799501807},tipo_id:'SpaceX provisional'};
 c.onmessage({data:{tipo:'omm',grupos:{'spacex-nueve':[nine]},activos:['spacex-nueve']}});
 assert.equal(JSON.parse(mensajes.at(-1).geojson).features[0].properties.id,'sat:799501807');
});

test('SupGP acepta el RMS del proveedor sin inventar un error máximo',()=>{
  const x={...modelo,tipo_modelo:'supgp',error_rms_km:.314};delete x.error_max_km;
  assert.equal(modelosVigentes({objetos:[x]},t).length,1);
  assert.equal(modelosVigentes({objetos:[{...x,error_rms_km:99}]},t).length,0);
});

test('el contador incorpora SpaceX sin duplicar los objetos comunes a SatNOGS',async()=>{
 const {totalConSpaceX}=await import('../../js/spacex-orbitas.js');
 assert.equal(totalConSpaceX({satnogs:[['ISS','1 linea','2 25544 linea']]},{ids:['25544','100001','799501807']}),3);
});


test('la ficha reconoce el designador internacional completo del OMM',async()=>{
 const {lanzamiento}=await import('../../js/satelites.js');
 assert.deepEqual(lanzamiento('2026-160A'),{anio:2026,numero:160,pieza:'A'});
});
