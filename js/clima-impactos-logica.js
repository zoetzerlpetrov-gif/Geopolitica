// Funciones puras: no confundir observación, pronóstico, perspectiva y simulación.
export function fechaValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}(?:-\d{2})?(?:T.*)?$/.test(valor)) return null;
  const t = Date.parse(valor.length === 7 ? `${valor}-01T00:00:00Z` : valor.length === 10 ? `${valor}T00:00:00Z` : valor);
  return Number.isFinite(t) ? t : null;
}
export function frescura(fecha, dias, ahora = Date.now()) {
  const t = fechaValida(fecha);
  if (t === null) return {estado:'sin fecha', vigente:false};
  const edad = (ahora-t)/86400000;
  if (edad < -1) return {estado:'fecha futura', vigente:false};
  return {estado:edad > dias ? 'desactualizado' : 'en plazo de revisión', vigente:edad <= dias, dias:Math.max(0, Math.floor(edad))};
}
const finito = x => typeof x === 'number' && Number.isFinite(x);
export function umbralesValidos(x = {}) {
  const regla = (k, d, min, max) => {const v=Number(x[k]);return x[k] !== '' && x[k] != null && Number.isFinite(v) && v>=min && v<=max ? v : d;};
  return {calor:regla('calor',35,20,55),frio:regla('frio',0,-40,15),lluvia:regla('lluvia',30,1,300),viento:regla('viento',60,10,250)};
}
export function analizarLugar(registro, umbrales = {}, ahora = Date.now()) {
  const d=registro?.dato, u=umbralesValidos(umbrales), f=frescura(d?.emitido_utc,2,ahora);
  const filas=(d?.horas||[]).filter(x=>{const t=fechaValida(x.t);return t!==null&&t>=ahora&&t<=ahora+10*86400000;});
  const vigente=f.vigente&&filas.length>0;
  const señales=[];
  if(vigente) for(const [tipo, campo, cumple, texto] of [
    ['calor','temp_c',v=>v>=u.calor,`temperatura ≥ ${u.calor} °C`],
    ['helada','temp_c',v=>v<=u.frio,`temperatura ≤ ${u.frio} °C`],
    ['lluvia','lluvia_6h_mm',v=>v>=u.lluvia,`precipitación ≥ ${u.lluvia} mm en las 6 h siguientes`],
    ['viento','viento_kmh',v=>v>=u.viento,`viento sostenido ≥ ${u.viento} km/h`],
  ]){
    const halladas=filas.filter(x=>finito(x[campo])&&cumple(x[campo]));
    if(halladas.length)señales.push({tipo,texto,primera:halladas[0].t,muestras:halladas.length,valor:halladas.reduce((a,b)=>tipo==='helada'?Math.min(a,b[campo]):Math.max(a,b[campo]),halladas[0][campo]),campo});
  }
  const resumen=[24,72,240].map(h=>{
    const xs=filas.filter(x=>fechaValida(x.t)<=ahora+h*3600000), temps=xs.map(x=>x.temp_c).filter(finito), v=xs.map(x=>x.viento_kmh).filter(finito), lluvia=xs.map(x=>x.lluvia_6h_mm).filter(finito);
    return {horas:h,muestras:xs.length,min:temps.length?Math.min(...temps):null,max:temps.length?Math.max(...temps):null,viento:v.length?Math.max(...v):null,lluvia6h:lluvia.length?Math.max(...lluvia):null,hasta:xs.at(-1)?.t||null};
  });
  return {vigente,frescura:f,filas,señales,resumen,umbrales:u,hasta:filas.at(-1)?.t||null};
}
export function tendenciaPrecio(serie, ahora = Date.now()) {
  const p=(serie?.puntos||[]).filter(x=>Array.isArray(x)&&fechaValida(x[0])!==null&&fechaValida(x[0])<=ahora&&finito(x[1])&&x[1]>=0).sort((a,b)=>a[0].localeCompare(b[0]));
  if(!p.length)return null;
  const ultimo=p.at(-1), anterior=p.at(-2), cambio=anterior?.[1]>0 ? (ultimo[1]/anterior[1]-1)*100 : null;
  return {fecha:ultimo[0],valor:ultimo[1],anterior:anterior?.[0]||null,cambio,vigente:frescura(ultimo[0],70,ahora).vigente};
}
export function simularCosto(base, cambio, merma = 0, extra = 0) {
  if ([base,cambio,merma,extra].some(x=>x==null||x==='')) return null;
  const xs=[base,cambio,merma,extra].map(Number);
  if(xs.some(x=>!Number.isFinite(x))||xs[0]<0||xs[0]>1e12||xs[1]<-100||xs[1]>1000||xs[2]<0||xs[2]>=100||xs[3]<0||xs[3]>1e12)return null;
  const [b,c,m,e]=xs, total=b*(1+c/100)/(1-m/100)+e;
  return {base:b,total,diferencia:total-b,cambio:c,merma:m,extra:e};
}
export const normalizar = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function filtrarAmenazas(lista,{texto='',horizonte='',sector=''}={}) {
  const q=normalizar(texto);
  return lista.filter(a=>(!horizonte||a.horizonte===horizonte)&&(!sector||a.sectores.includes(sector))&&(!q||normalizar([a.nombre,a.mecanismo,a.efectos,...a.acciones].join(' ')).includes(q)));
}
export function celdasCSV(filas) {
  const celda = x => {let s=String(x??'');if(typeof x==='string'&&/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return '\ufeff'+filas.map(f=>f.map(celda).join(',')).join('\r\n');
}
export function validarBitacora(x) {
  return x && typeof x === 'object' && Array.isArray(x.tareas) ? {version:1,tareas:x.tareas.slice(0,300).filter(t=>t&&typeof t.texto==='string').map(t=>({id:String(t.id||'' ).slice(0,80),texto:t.texto.slice(0,800),responsable:String(t.responsable||'').slice(0,120),fecha:/^\d{4}-\d{2}-\d{2}$/.test(t.fecha||'')?t.fecha:'',hecho:t.hecho===true})),notas:String(x.notas||'').slice(0,12000)} : {version:1,tareas:[],notas:''};
}
