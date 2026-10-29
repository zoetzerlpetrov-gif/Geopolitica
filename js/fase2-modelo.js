// Fase 2: colecciones aisladas; no escribe los datos de Fase 1.
export const CLAVE='dominus_fase2_v1', MAX_BYTES=4*1024*1024;
const f=(nombre,tipo='texto',opciones=[])=>({nombre,tipo,opciones});
export const SECCIONES={
 hipotesis:{nombre:'Hipótesis y ACH',ayuda:'Registra alternativas sobre una misma pregunta. Valora cada evidencia y documenta qué podría refutar tu juicio. La inconsistencia ACH no es una probabilidad.',campos:{titulo:f('Hipótesis'),requerimiento:f('Requerimiento de Fase 1','fase1'),supuestos:f('Supuestos'),refutacion:f('Indicadores de refutación'),faltantes:f('Señales faltantes'),escenario:f('Escenario e implicaciones'),conclusion:f('Conclusión actual'),revisor:f('Revisor'),estado:f('Estado','select',['abierta','en revisión','revisada']),motivo:f('Motivo de esta revisión')}},
 evidencias:{nombre:'Evidencias ACH',ayuda:'Una evidencia se vincula a una hipótesis. Para compararla entre alternativas, repite su identificador de evidencia en cada hipótesis. Registra también evidencia contradictoria.',campos:{titulo:f('Descripción de la evidencia'),hipotesis:f('Hipótesis','ref:hipotesis'),codigo:f('Identificador compartido de evidencia'),fuente:f('Fuente'),url:f('URL de evidencia','url'),fecha:f('Fecha de observación','date'),juicio:f('Relación','select',['consistente','inconsistente','neutral']),peso:f('Peso analítico','select',['1','2','3']),independencia:f('Independencia y límites'),motivo:f('Motivo de esta revisión')}},
 empresas:{nombre:'Fichas empresariales',ayuda:'Identifica la jurisdicción y el registro. Un nombre coincidente no acredita que sea la misma entidad; matriz y filiales son relaciones documentales.',campos:{titulo:f('Razón social'),jurisdiccion:f('Jurisdicción / país'),rfc:f('RFC'),lei:f('LEI'),registro:f('Identificador y autoridad registral'),matriz:f('Matriz / filiales y fuente'),domicilio:f('Domicilio empresarial publicado'),fuente:f('Fuente'),url:f('URL de registro','url'),fecha:f('Fecha de consulta','date'),motivo:f('Motivo de esta revisión')}},
 contratos:{nombre:'Contratos y sanciones',ayuda:'Vincula documentos con una empresa. Los importes se comparan por moneda; concentración y coincidencias requieren revisión, no prueban irregularidades.',campos:{titulo:f('Contrato, licitación o sanción'),empresa:f('Empresa','ref:empresas'),tipo:f('Tipo','select',['contrato','licitación','sanción']),identificador:f('Identificador documental'),contratante:f('Contratante / autoridad'),objeto:f('Objeto o alcance'),importe:f('Importe decimal sin separadores'),moneda:f('Moneda ISO 4217, por ejemplo MXN'),fecha:f('Fecha del documento','date'),estado:f('Estado documental'),fuente:f('Fuente'),url:f('URL del documento','url'),motivo:f('Motivo de esta revisión')}},
 patentes:{nombre:'Patentes y tecnología',ayuda:'Agrupa por familia para evitar contar la misma invención varias veces. El estado se registra con fuente y fecha; no se infiere vigencia jurídica.',campos:{titulo:f('Título de patente'),empresa:f('Titular vinculado','ref:empresas'),titular:f('Titular publicado'),publicacion:f('Número de publicación'),familia:f('Familia'),cpc:f('Clasificación CPC'),jurisdiccion:f('Jurisdicción'),estado:f('Estado documentado','select',['solicitud','concedida','caducada','retirada','desconocido']),fecha:f('Fecha de consulta','date'),fuente:f('Fuente'),url:f('URL del registro','url'),motivo:f('Motivo de esta revisión')}},
 diligencia:{nombre:'Debida diligencia',ayuda:'Expediente de revisión de proveedor. Los estados SAT 69-B se conservan por separado. Un registro local no certifica cumplimiento.',campos:{titulo:f('Evaluación del proveedor'),empresa:f('Empresa','ref:empresas'),criticidad:f('Criticidad de suministro','select',['baja','media','alta']),sat:f('Estado SAT 69-B documentado','select',['no consultado','sin coincidencia en fuente consultada','presunto','definitivo','desvirtuado','sentencia favorable']),sanciones:f('Sanciones: autoridad, fecha y alcance'),financiera:f('Evidencia financiera autorizada'),pendientes:f('Vacíos y acciones pendientes'),dictamen:f('Evaluación razonada'),responsable:f('Responsable'),revisor:f('Revisor'),fecha:f('Fecha de revisión','date'),fuente:f('Fuentes y fechas'),url:f('URL de evidencia','url'),estado:f('Estado','select',['pendiente','en revisión','revisada']),motivo:f('Motivo de esta revisión')}},
 telefonos:{nombre:'Teléfonos empresariales',ayuda:'Normaliza formato internacional; no comprueba existencia, titularidad ni ubicación. El operador puede cambiar por portabilidad; solo se registra con fuente.',campos:{titulo:f('Empresa / referencia pública'),empresa:f('Empresa','ref:empresas'),numero:f('Número con prefijo internacional +'),pais:f('País documentado'),operador:f('Operador documentado y fecha'),fuente:f('Fuente empresarial publicada'),url:f('URL de publicación','url'),fecha:f('Fecha de consulta','date'),motivo:f('Motivo de esta revisión')}},
 hallazgos:{nombre:'Hallazgos técnicos',ayuda:'Importa Nmap XML, Greenbone XML, ZAP JSON tradicional o SARIF 2.1.0. Nmap registra exposición, no una vulnerabilidad confirmada. Solo informes de alcance autorizado.',campos:{titulo:f('Hallazgo'),herramienta:f('Herramienta'),activo:f('Activo / ubicación'),regla:f('Regla o identificador'),severidad:f('Severidad reportada'),evidencia:f('Evidencia'),alcance:f('Alcance y autorización'),responsable:f('Responsable de remediación'),plazo:f('Plazo','date'),remediacion:f('Remediación'),revalidacion:f('Evidencia de revalidación'),estado:f('Estado','select',['abierto','en remediación','resuelto','falso positivo']),motivo:f('Motivo de esta revisión')}},
 multimedia:{nombre:'Procedencia multimedia',ayuda:'Calcula SHA-256 localmente y registra cronología y procedencia. Importa informes del verificador local c2patool. Ausencia de firma o metadatos no prueba falsedad; una firma válida no acredita que la escena sea cierta.',campos:{titulo:f('Archivo / pieza'),sha256:f('SHA-256'),origen:f('Origen y cadena de custodia'),cronologia:f('Cronología documentada'),metadatos:f('Metadatos y límites'),c2pa:f('Resultado C2PA reportado'),confianza:f('Confianza del firmante y límites'),fuente:f('Fuente del archivo'),fecha:f('Fecha de revisión','date'),motivo:f('Motivo de esta revisión')}},
 servicios:{nombre:'TLS y cabeceras',ayuda:'Importa la observación JSON de tools/fase2/inspeccionar.py. La herramienta local consulta un único servicio HTTPS autorizado, sin seguir redirecciones. Las tecnologías son indicios de cabecera.',campos:{titulo:f('Servicio HTTPS'),url:f('URL observada','url'),fecha:f('Fecha de observación','date'),tls:f('TLS, emisor y expiración'),cabeceras:f('Cabeceras observadas'),tecnologias:f('Tecnologías declaradas / no verificadas'),evidencia:f('Evidencia y límites'),alcance:f('Alcance y autorización'),motivo:f('Motivo de esta revisión')}}
};
const idOk=s=>typeof s==='string'&&/^[\w-]{1,100}$/.test(s);
export const vacio=()=>({version:2,...Object.fromEntries(Object.keys(SECCIONES).map(k=>[k,[]]))});
export function normalizarTelefono(n){const s=String(n).replace(/[\s().-]/g,'');if(!/^\+[1-9]\d{6,14}$/.test(s))throw Error('Usa + y entre 7 y 15 dígitos; incluye el código de país.');return s;}
function contenido(k,r){
 if(!r.titulo.trim())throw Error('Falta el título.');
 for(const [c,def] of Object.entries(SECCIONES[k].campos)){
  const v=r[c];if(def.tipo==='select'&&!def.opciones.includes(v))throw Error('Opción inválida: '+def.nombre);
  if(def.tipo==='date'&&v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))throw Error('Fecha inválida: '+def.nombre);
  if(def.tipo==='url'&&v){let u;try{u=new URL(v);}catch{throw Error('URL inválida.');}if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Usa una URL HTTP(S) sin credenciales.');}
 }
 if(k==='empresas'){
  if(!r.jurisdiccion||!r.fuente||!r.fecha)throw Error('Empresa: jurisdicción, fuente y fecha son obligatorias.');
  if(r.lei&&!/^[A-Z0-9]{18}\d{2}$/.test(r.lei))throw Error('Formato LEI inválido (20 caracteres).');
  if(r.rfc&&!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(r.rfc))throw Error('Formato RFC inválido.');
 }
 if(k==='evidencias'&&(!r.codigo||!r.fuente||!r.fecha))throw Error('Evidencia: identificador, fuente y fecha son obligatorios.');
 if(k==='hipotesis'&&r.estado==='revisada'&&(!r.conclusion||!r.revisor||!r.refutacion))throw Error('Para revisar: conclusión, revisor e indicadores de refutación.');
 if(k==='diligencia'&&r.estado==='revisada'&&(!r.dictamen||!r.revisor||!r.fuente||!r.fecha||!r.responsable))throw Error('Para revisar: dictamen, revisor, responsable, fuentes y fecha.');
 if(k==='telefonos'){r.numero=normalizarTelefono(r.numero);if(!r.fuente||!r.url)throw Error('Documenta la fuente publicada del teléfono.');}
 if(k==='contratos'&&r.importe&&(!/^\d+(\.\d{1,2})?$/.test(r.importe)||!Number.isFinite(Number(r.importe))||!/^[A-Z]{3}$/.test(r.moneda)))throw Error('Importe decimal y moneda de tres letras requeridos.');
 if(k==='hallazgos'&&['resuelto','falso positivo'].includes(r.estado)&&!r.revalidacion)throw Error('Documenta la revalidación o justificación antes de cerrar.');
 if(k==='multimedia'&&r.sha256&&!/^[a-f0-9]{64}$/i.test(r.sha256))throw Error('SHA-256 inválido.');
}
export function validar(raw){
 if(!raw||raw.version!==2||new TextEncoder().encode(JSON.stringify(raw)).length>MAX_BYTES)throw Error('Respaldo incompatible o mayor de 4 MB.');
 const d=vacio(),ids=new Set();
 for(const [k,s] of Object.entries(SECCIONES)){
  if(!Array.isArray(raw[k])||raw[k].length>1000)throw Error('Colección inválida o mayor de 1000: '+k);
  d[k]=raw[k].map(r=>{
   if(!r||!idOk(r.id)||ids.has(r.id))throw Error('ID inválido o duplicado.');ids.add(r.id);
   const n={id:r.id};for(const c of [...Object.keys(s.campos),'creado','actualizado']){if(r[c]!=null&&(typeof r[c]!=='string'||r[c].length>12000))throw Error('Campo inválido o mayor de 12000 caracteres.');n[c]=r[c]||'';}
   if(!Array.isArray(r.historial)||r.historial.length>100)throw Error('Historial inválido (máximo 100 revisiones).');
   n.historial=r.historial.map(h=>{if(!h||typeof h.fecha!=='string'||typeof h.motivo!=='string'||!h.campos||typeof h.campos!=='object'||Array.isArray(h.campos))throw Error('Revisión inválida.');const campos={};for(const c of Object.keys(s.campos)){if(typeof h.campos[c]!=='string'||h.campos[c].length>12000)throw Error('Historial inválido.');campos[c]=h.campos[c];}return {fecha:h.fecha.slice(0,50),motivo:h.motivo.slice(0,12000),campos};});
   contenido(k,n);return n;
  });
 }
 for(const [k,s]of Object.entries(SECCIONES))for(const r of d[k])for(const [c,def]of Object.entries(s.campos))if(def.tipo.startsWith('ref:')&&(!r[c]||!d[def.tipo.slice(4)].some(x=>x.id===r[c])))throw Error('Vínculo inexistente: '+def.nombre);
 const claves=new Set();for(const r of d.empresas)for(const c of ['rfc','lei','registro'])if(r[c]){const key=[c,r.jurisdiccion.toUpperCase(),r[c].toUpperCase()].join('|');if(claves.has(key))throw Error('Identificador empresarial duplicado en la misma jurisdicción.');claves.add(key);}
 const pares=new Set();for(const r of d.evidencias){const p=r.hipotesis+'|'+r.codigo;if(pares.has(p))throw Error('Esta evidencia ya fue valorada para esa hipótesis.');pares.add(p);}
 return d;
}
export function guardar(datos,k,campos,id=null,ahora=new Date().toISOString()){
 const d=validar(datos);if(!SECCIONES[k])throw Error('Sección desconocida.');
 const old=d[k].find(r=>r.id===id);if(id&&!old)throw Error('Registro inexistente.');
 if(old&&!campos.motivo?.trim())throw Error('Explica el motivo de la revisión.');
 const r={id:id||crypto.randomUUID(),creado:old?.creado||ahora,actualizado:ahora,historial:[...(old?.historial||[])]};
 for(const [c,def]of Object.entries(SECCIONES[k].campos))r[c]=campos[c]??(def.tipo==='select'?def.opciones[0]:'');
 if(old)r.historial.push({fecha:ahora,motivo:r.motivo,campos:Object.fromEntries(Object.keys(SECCIONES[k].campos).map(c=>[c,old[c]]))});
 d[k]=old?d[k].map(x=>x.id===id?r:x):[...d[k],r];return validar(d);
}
export function eliminar(d,k,id){const n=validar(d);if(!SECCIONES[k])throw Error('Sección desconocida.');n[k]=n[k].filter(r=>r.id!==id);return validar(n);}
export function ach(datos,requerimiento=''){
 const hs=datos.hipotesis.filter(h=>h.requerimiento===requerimiento), es=datos.evidencias.filter(e=>hs.some(h=>h.id===e.hipotesis)), codigos=[...new Set(es.map(e=>e.codigo))];
 return hs.map(h=>{const filas=es.filter(e=>e.hipotesis===h.id);return {id:h.id,titulo:h.titulo,inconsistencia:filas.reduce((s,e)=>s+(e.juicio==='inconsistente'?Number(e.peso):0),0),faltantes:codigos.filter(c=>!filas.some(e=>e.codigo===c)).length,celdas:codigos.map(c=>({codigo:c,evidencia:filas.find(e=>e.codigo===c)||null}))};});
}
export function concentracion(datos){
 const grupos=new Map();for(const r of datos.contratos.filter(x=>x.tipo==='contrato'&&x.importe&&x.moneda)){
 const key=r.contratante+'|'+r.moneda;const g=grupos.get(key)||{contratante:r.contratante,moneda:r.moneda,total:0,empresas:Object.create(null),ids:new Set(),repetidos:[]};const n=Number(r.importe);g.total+=n;g.empresas[r.empresa]=(g.empresas[r.empresa]||0)+n;if(r.identificador&&g.ids.has(r.identificador))g.repetidos.push(r.identificador);g.ids.add(r.identificador);grupos.set(key,g);
 }return [...grupos.values()].map(g=>({...g,ids:undefined,participaciones:Object.entries(g.empresas).map(([id,n])=>({id,porcentaje:g.total?100*n/g.total:0}))}));
}
export function exportarMarkdown(d,k,r){return '# '+r.titulo+'\n\n'+Object.entries(SECCIONES[k].campos).map(([c,f])=>'## '+f.nombre+'\n\n'+(f.tipo.startsWith('ref:')?d[f.tipo.slice(4)].find(x=>x.id===r[c])?.titulo||r[c]:r[c]||'Sin registrar')).join('\n\n')+'\n\n## Historial local\n\n'+JSON.stringify(r.historial,null,2)+'\n\nAnotaciones locales; no equivalen a certificación ni aprobación institucional.\n';}
