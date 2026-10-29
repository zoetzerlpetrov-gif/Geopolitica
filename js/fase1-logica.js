// Fase 1: lógica local, sin servicios privados ni efectos sobre otras funciones.
import { esc, safeUrl } from './util.js';
export const CLAVE = 'dominus_fase1_v1';
export const TIPOS = {
  requerimientos: { nombre: 'Requerimientos PIR / IR / EEI', campos: ['titulo','tipo','pregunta','responsable','plazo','criterio','estado'] },
  cobertura: { nombre: 'Plan y cobertura de recolección', campos: ['titulo','requerimiento','fuente','url','territorio','idioma','periodo','frecuencia','vacio','responsable','plazo','estado'] },
  productos: { nombre: 'Productos de inteligencia', campos: ['titulo','tipo','requerimiento','juicio','hechos','fuentes','confianza','alternativas','implicaciones','acciones','responsable','revisor','plazo','estado'] },
  lecciones: { nombre: 'Lecciones y eficacia', campos: ['titulo','requerimiento','esperado','resultado','evidencia','mejora','responsable','plazo','estado'] },
  relevos: { nombre: 'Briefing y relevo de turno', campos: ['titulo','turno','novedades','pendientes','decisiones','faltantes','acciones','responsable','receptor','recepcion','plazo','estado'] }
};
export const ESTADOS = ['borrador','en curso','en revisión','aprobado','cerrado'];
export function vacio() { return { version: 1, actualizado: null, ...Object.fromEntries(Object.keys(TIPOS).map(k=>[k,[]])) }; }
const texto = (v,max=12000) => String(v ?? '').trim().slice(0,max);
export function validarPaquete(raw) {
  if (!raw || raw.version !== 1 || typeof raw !== 'object') throw Error('Formato de respaldo incompatible.');
  const d=vacio(), ids=new Set();
  for (const [k,t] of Object.entries(TIPOS)) {
    if (!Array.isArray(raw[k]) || raw[k].length>1000) throw Error('Colección inválida o demasiado grande: '+k);
    d[k]=raw[k].map(r=>{
      if (!r || typeof r!=='object' || !/^[\w-]{1,100}$/.test(r.id||'') || ids.has(r.id)) throw Error('Identificador inválido o duplicado.');
      ids.add(r.id);
      const n={ id:r.id, creado:texto(r.creado,40), actualizado:texto(r.actualizado,40) };
      for(const f of t.campos){if(r[f]!=null && (typeof r[f]!=='string'||r[f].length>12000))throw Error('Campo de respaldo inválido o demasiado largo.');n[f]=texto(r[f]);}
      if (!n.titulo)throw Error('Falta el título de un registro.');
      if (!ESTADOS.includes(n.estado))throw Error('Estado inválido.');
      if (n.plazo && (!/^\d{4}-\d{2}-\d{2}$/.test(n.plazo) || !Number.isFinite(Date.parse(n.plazo)) || new Date(n.plazo).toISOString().slice(0,10)!==n.plazo))throw Error('Plazo inválido.');
      validarContenido(k,n);
      return n;
    });
  }
  d.actualizado=texto(raw.actualizado,40)||null;
  const refs=new Set(d.requerimientos.map(r=>r.id));
  for(const k of ['cobertura','productos','lecciones']) for(const r of d[k])if(r.requerimiento && !refs.has(r.requerimiento))throw Error('Un registro apunta a un requerimiento inexistente.');
  return d;
}
function validarContenido(tipo,r) {
  if(tipo==='requerimientos' && r.estado!=='borrador' && (!r.pregunta||!r.responsable||!r.plazo||!r.criterio))throw Error('Para activar un requerimiento: pregunta, responsable, plazo y criterio son obligatorios.');
  if(tipo==='requerimientos' && !['PIR','IR','EEI'].includes(r.tipo))throw Error('Selecciona PIR, IR o EEI.');
  if(tipo==='productos' && r.estado==='aprobado' && (!r.juicio||!r.fuentes||!r.revisor||!r.confianza))throw Error('Para aprobar: juicio, fuentes, confianza y revisor son obligatorios.');
  if(tipo==='relevos' && r.estado==='cerrado' && (!r.receptor||!r.recepcion))throw Error('Para cerrar el relevo, registra receptor y confirmación de recepción.');
}
export function guardarRegistro(datos,tipo,campos,id=null,ahora=new Date().toISOString()) {
  if(!TIPOS[tipo])throw Error('Sección desconocida.');
  const d=validarPaquete(datos), existente=d[tipo].find(r=>r.id===id);
  if(id && !existente)throw Error('El registro ya no existe.');
  const r={id:id||crypto.randomUUID(),creado:existente?.creado||ahora,actualizado:ahora};
  for(const f of TIPOS[tipo].campos)r[f]=texto(campos[f]);
  if(!r.titulo)throw Error('Escribe un título.');
  r.estado ||= 'borrador';
  validarContenido(tipo,r);
  d[tipo]=existente?d[tipo].map(x=>x.id===id?r:x):[...d[tipo],r];d.actualizado=ahora;
  return validarPaquete(d);
}
export function eliminarRegistro(datos,tipo,id) {
  const d=validarPaquete(datos);
  if(!TIPOS[tipo])throw Error('Sección desconocida.');
  if(tipo==='requerimientos' && ['cobertura','productos','lecciones'].some(k=>d[k].some(r=>r.requerimiento===id)))throw Error('Hay registros vinculados: reasigna sus requerimientos antes de eliminar.');
  d[tipo]=d[tipo].filter(r=>r.id!==id);d.actualizado=new Date().toISOString();return d;
}
export function markdown(tipo,r,datos) {
  const ref=datos?.requerimientos.find(x=>x.id===r.requerimiento);
  return `# ${r.titulo}\n\n${TIPOS[tipo].nombre}\n\n`+TIPOS[tipo].campos.filter(f=>f!=='titulo').map(f=>`## ${f}\n\n${f==='requerimiento'?(ref?.titulo||'Sin vincular'):(r[f]||'No registrado')}\n`).join('\n')+`\nID: ${r.id}\nActualizado: ${r.actualizado}\n\nDocumento de trabajo local. Su estado no acredita veracidad ni aprobación institucional.\n`;
}
export function procedencia(ev={}) {
  const fuentes=[...new Set((ev.fuentes||[]).map(f=>String(f.fuente||'').trim()).filter(Boolean))];
  return { corroboracion:fuentes.length>=2?`${fuentes.length} medios registrados; independencia no evaluada`:'Sin corroboración independiente registrada', revision:'Revisión humana no registrada', licencia:'Derechos de uso: consultar la fuente; no se deducen de la corroboración' };
}
export function precisionEspacial(p={}) {
  const approx=p.aprox===true||p.aprox===1||p.aprox==='1'||p.aprox==='true';
  if(p.precision && p.precision!=='proyecto')return `Ubicación aproximada: ${p.precision}`;
  if(approx)return 'Ubicación aproximada; consulta la nota del operador para conocer el alcance';
  return 'Precisión de coordenadas no documentada; no asumir posición exacta';
}
export function edadPosicion(p={},ahora=Date.now()) {
  const observada=p.observado_utc || (p.hora_tipo==='recepcion'||p.red==='filadelfia'?null:p.hora);
  const t=observada?Date.parse(observada):NaN;
  if(!Number.isFinite(t))return {estado:'desconocida',texto:'Hora de observación desconocida; la descarga no prueba actualidad'};
  const edad=(ahora-t)/60000;
  if(edad < -2)return {estado:'futura',texto:'Fecha de posición futura: revisar el reloj de la fuente'};
  return {estado:edad>30?'antigua':'reciente',texto:`Observación: ${observada} · antigüedad ${Math.max(0,Math.floor(edad))} min${edad>30?' · posición antigua':''}`};
}
export function htmlCalidad(ev) {
  const q=procedencia(ev);
  return `<aside aria-label="Procedencia y certeza"><p class="meta">${esc(q.corroboracion)}. Dos medios pueden repetir el mismo origen.</p><p class="meta">${esc(q.revision)}. ${esc(q.licencia)}.</p></aside>`;
}
export function inventarioLicencias(registro,camaras,fuentes) {
  const conocidos=registro.fuentes.map(r=>({...r}));
  for(const s of camaras?.fuentes||[])if(!conocidos.some(r=>r.id===s.id))conocidos.push({id:s.id,nombre:s.operador||s.id,licencia:s.licencia||'No documentada',url:s.terminos||s.pagina,publico:'revisar',comercial:'revisar',privado:'revisar',nota:s.nota||'Acceso público no equivale a permiso de reutilización. Revisar condiciones del operador.'});
  // Registrar también las fuentes de ingesta sin inferir derechos del hecho de que sean RSS.
  for(const s of fuentes?.rss||[])if(!conocidos.some(r=>r.nombre===s.nombre))conocidos.push({id:'rss-'+s.nombre,nombre:s.nombre||s.url,licencia:'Consultar condiciones originales',url:s.url,publico:'revisar',comercial:'revisar',privado:'revisar',nota:'Revisar resumen, atribución y redistribución; no copiar artículos completos.'});
  return conocidos;
}
export function htmlLicencias(rows,modo='comercial',q='') {
  if(!['publico','comercial','privado'].includes(modo))throw Error('Modalidad inválida.');
  const consulta=q.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return rows.filter(r=>JSON.stringify(r).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(consulta)).map(r=>`<tr><td>${esc(r.nombre)}</td><td>${esc(r.licencia)}</td><td>${esc(r[modo]||'revisar')}</td><td>${esc(r.nota)} <a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">Condiciones</a></td></tr>`).join('');
}
