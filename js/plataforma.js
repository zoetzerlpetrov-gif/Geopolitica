const node=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
try{
 const r=await fetch('data/fase23/estado.json',{cache:'no-store'});if(!r.ok)throw Error('No hay estado publicado todavía.');const data=await r.json();if(data.version!==1||!Array.isArray(data.fuentes))throw Error('Estado de monitor incompatible.');document.getElementById('monitor-status').textContent='Generado: '+data.generado_utc+'. '+data.alcance;
 const box=document.getElementById('monitor');for(const s of data.fuentes){const a=node('article','');a.append(node('h3',s.name),node('p','Estado: '+s.estado+' · receptor '+s.recipient),node('p','Último intento: '+s.intentado_utc),node('p','Último éxito: '+(s.ultimo_exito_utc||'Sin consulta exitosa registrada')),node('p',s.alcance||s.error||'Cobertura pendiente de verificar'),node('p',s.license));if(s.generado_utc_copia)a.append(node('p','Fecha de la copia SAT: '+s.generado_utc_copia));const u=new URL(s.docs);if(['https:','http:'].includes(u.protocol)){const link=node('a','Fuente y condiciones');link.href=u.href;link.target='_blank';link.rel='noopener noreferrer';a.append(link);}box.append(a);}
}catch(e){document.getElementById('monitor-status').textContent='Monitor pendiente o no disponible: '+e.message;}

// El tutorial sigue siendo legible sin JS. Solo se copian comandos por acción explícita.
for(const pre of document.querySelectorAll('#tutorial-f3 pre')){const button=node('button','Copiar comandos');button.type='button';button.onclick=async()=>{try{await navigator.clipboard.writeText(pre.textContent);button.textContent='Copiado · ejecutar en tu terminal';}catch{button.textContent='Selecciona y copia el bloque manualmente';}};pre.after(button);}
function openTutorialAnchor(){const id=location.hash.slice(1),target=document.getElementById(id);if(target?.matches('#tutorial-f3 details')){target.open=true;target.scrollIntoView({block:'start'});}}
window.addEventListener('hashchange',openTutorialAnchor);openTutorialAnchor();
