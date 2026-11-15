// Consulta web de pases y formaciones: no activa capas ni pide geolocalización sin una acción.
import {esc,getJSON} from './util.js';
import {gruposSpaceX,formaciones,cargarOrbitasSpaceX} from './spacex-orbitas.js';
import {htmlPases} from './satelites.js';

export async function pasesSpaceX(lat,lon,{soloRecientes=true,horas=24,maxObjetos=200}={}) {
  const datos=await cargarOrbitasSpaceX();
  const todos=gruposSpaceX(datos)[soloRecientes?'spacex-trenes':'spacex-starlink'];
  const lista=[...todos].sort((a,b)=>Date.parse(b.creado)-Date.parse(a.creado)).slice(0,maxObjetos);
  if (!lista.length) return {tipo:'pases',lat,lon,horas,total:0,pases:[],analizados:0,disponibles:todos.length,formaciones:[]};
  const worker=new Worker('js/sat-worker.js?v=spacex1');
  try {
    const resultado=await new Promise((ok,fallo)=>{
      const limite=setTimeout(()=>fallo(new Error('Se agotó el tiempo de cálculo')),60000);
      worker.onmessage=e=>{if(e.data.tipo==='pases'){clearTimeout(limite);ok(e.data);}};
      worker.onerror=e=>{clearTimeout(limite);fallo(new Error(e.message||'Error de cálculo orbital'));};
      worker.postMessage({tipo:'pases',lat,lon,horas,max:500,grupos:['spacex-consulta'],grupos_omm:{'spacex-consulta':lista}});
    });
    return {...resultado,analizados:lista.length,disponibles:todos.length,formaciones:formaciones(resultado.pases)};
  } finally {worker.terminate();}
}

export function panelSpaceX() {
  return `<details class="spacex-pases"><summary>Pases y posibles trenes de Starlink</summary>
  <p class="meta">Calcula desde el centro del mapa. Mueve el mapa a tu ubicación antes de consultar. Solo se usan órbitas vigentes y horas dentro de su ventana validada.</p>
  <button type="button" class="mini" data-spacex-pases="recientes">Buscar posibles trenes · 24 h</button>
  <button type="button" class="mini" data-spacex-pases="todos">Pases de Starlink disponibles · 24 h</button>
  <div data-spacex-resultados role="status"></div></details>`;
}

export function resultadosSpaceX(r,lugar) {
  const hora=t=>new Date(t).toLocaleString('es-MX',{weekday:'short',hour:'2-digit',minute:'2-digit'});
  const grupos=r.formaciones||[];
  return `<p class="meta">${r.analizados} órbitas analizadas de ${r.disponibles} disponibles. Horarios de tu dispositivo. Solo satélites iluminados con cielo local oscuro; no se consideran nubes ni brillo individual.</p>`+
    (grupos.length?`<h4>Posibles formaciones orbitales</h4><ul>${grupos.map(g=>`<li>${esc(hora(g.inicio))} · grupo ${esc(g.lote)} · ${g.pases.length} pasos próximos. <button type="button" class="mini" data-spacex-traza="${esc(g.pases[0].id)}">Ver trayectoria del primer objeto</button></li>`).join('')}</ul><p class="meta">Son candidatos por lanzamiento conocido o por proximidad orbital, y por pasos próximos desde tu ubicación. No confirma que se observe una fila continua.</p>`:
    `<p class="meta">No se encontraron formaciones con al menos tres satélites del mismo grupo y pasos próximos en el catálogo analizado.</p>`)+
    htmlPases(r,lugar)+
    (r.pases.length?`<div>${r.pases.slice(0,12).map(p=>`<button type="button" class="mini" data-spacex-traza="${esc(p.id)}">Trayectoria ${esc(p.n)}</button>`).join(' ')}</div>`:'');
}

export async function trayectoriaSpaceX(id) {
  const datos=await cargarOrbitasSpaceX();
  const lista=gruposSpaceX(datos)['spacex-starlink'];
  if (!lista.some(x=>String(x.omm.NORAD_CAT_ID)===String(id)))throw new Error('La órbita ya no está dentro de su ventana validada');
  const worker=new Worker('js/sat-worker.js?v=spacex1');
  try {
    return await new Promise((ok,fallo)=>{
      const limite=setTimeout(()=>fallo(new Error('Tiempo de trayectoria agotado')),10000);
      worker.onerror=e=>{clearTimeout(limite);fallo(new Error(e.message||'Error orbital'));};
      worker.onmessage=e=>{if(e.data.tipo==='orbita'){clearTimeout(limite);ok(e.data);}};
      worker.postMessage({tipo:'omm',grupos:{'spacex-starlink':lista}});
      worker.postMessage({tipo:'orbita',id:String(id)});
    });
  } finally {worker.terminate();}
}
