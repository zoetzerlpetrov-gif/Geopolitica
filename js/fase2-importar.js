import {guardar,validar} from './fase2-modelo.js?v=web1';
const txt=v=>String(v??'');
const nuevo=(herramienta,activo,regla,titulo,severidad,evidencia)=>({herramienta,activo:txt(activo),regla:txt(regla),titulo:txt(titulo)||'Sin título',severidad:txt(severidad)||'no informada',evidencia:txt(evidencia)});
export function leerJSON(raw){
 if(raw?.version==='2.1.0'&&Array.isArray(raw.runs))return raw.runs.flatMap(run=>(run.results||[]).flatMap(r=>{
  const locs=r.locations?.length?r.locations:[{}];return locs.map(l=>nuevo(run.tool?.driver?.name||'SARIF',txt(l.physicalLocation?.artifactLocation?.uri)+ (l.physicalLocation?.region?.startLine?':'+l.physicalLocation.region.startLine:''),r.ruleId,r.message?.text||r.message?.markdown,r.level,JSON.stringify({message:r.message,location:l,rule:r.ruleId})));}));
 if(Array.isArray(raw?.site))return raw.site.flatMap(s=>(s.alerts||[]).flatMap(a=>(a.instances?.length?a.instances:[{uri:s['@name']}]).map(i=>nuevo('ZAP',i.uri,a.pluginid,a.alert||a.name,a.riskdesc||a.riskcode,JSON.stringify({descripcion:a.desc,instancia:i,solucion:a.solution})))));
 throw Error('JSON no reconocido. Usa SARIF 2.1.0 o ZAP tradicional.');
}
export function leerXML(texto,Parser=globalThis.DOMParser){
 texto=texto.replace(/<!DOCTYPE\s+nmaprun\s*>/i,'');
 if(/<!DOCTYPE|<!ENTITY/i.test(texto))throw Error('XML con DTD o entidades no permitido.');
 const doc=new Parser().parseFromString(texto,'application/xml');if(doc.querySelector('parsererror'))throw Error('XML inválido.');
 const t=(n,s)=>n.querySelector(s)?.textContent?.trim()||'';
 if(doc.documentElement.tagName==='nmaprun')return [...doc.querySelectorAll('host')].flatMap(h=>[...h.querySelectorAll('port')].filter(p=>p.querySelector('state')?.getAttribute('state')==='open').map(p=>{
 const host=h.querySelector('address')?.getAttribute('addr')||t(h,'hostname');const port=p.getAttribute('portid')+'/'+p.getAttribute('protocol');return nuevo('Nmap',host+':'+port,port,'Puerto abierto '+port,'informativo',new XMLSerializer().serializeToString(p));}));
 if(doc.querySelector('report'))return [...doc.querySelectorAll('results > result')].map(r=>nuevo('Greenbone',t(r,'host')+':'+t(r,'port'),r.querySelector('nvt')?.getAttribute('oid'),t(r,'name')||t(r,'nvt > name'),t(r,'severity'),t(r,'description')));
 throw Error('XML no reconocido: Nmap o Greenbone requeridos.');
}
export function importarHallazgos(datos,filas,alcance){
 if(!alcance?.trim())throw Error('Documenta el alcance y la autorización antes de importar.');
 if(!Array.isArray(filas)||filas.length>1000)throw Error('Máximo 1000 resultados por importación.');
 let d=validar(datos),agregados=0,duplicados=0;
 const clave=r=>JSON.stringify([r.herramienta,r.activo,r.regla,r.titulo]);const keys=new Set(d.hallazgos.map(clave));
 for(const r of filas){const key=clave(r);if(keys.has(key)){duplicados++;continue;}d=guardar(d,'hallazgos',{...r,alcance,estado:'abierto'});keys.add(key);agregados++;}
 return {datos:d,agregados,duplicados};
}
export function informeLocal(raw){
 if(raw?.formato!=='dominus-fase2-informe-v1'||!['servicios','multimedia'].includes(raw.tipo)||!raw.registro||typeof raw.registro!=='object')throw Error('Informe JSON no reconocido.');
 return {tipo:raw.tipo,registro:raw.registro};
}
export function candidatosGLEIF(raw,fecha=new Date().toISOString().slice(0,10)){
 if(!Array.isArray(raw?.data))throw Error('Respuesta GLEIF no reconocida.');
 return raw.data.slice(0,20).map(x=>{const a=x.attributes||{},e=a.entity||{},dir=e.legalAddress||{};return {titulo:e.legalName?.name||'',lei:a.lei||x.id||'',jurisdiccion:e.jurisdiction||dir.country||'',registro:[e.registeredAt?.id,e.registeredAs].filter(Boolean).join(' · '),domicilio:[...(dir.addressLines||[]),dir.city,dir.postalCode,dir.country].filter(Boolean).join(', '),fuente:'GLEIF · datos declarados en el registro LEI; relaciones de control no inferidas',url:'https://api.gleif.org/api/v1/lei-records/'+encodeURIComponent(a.lei||x.id||''),fecha};}).filter(x=>x.titulo&&x.lei);
}
