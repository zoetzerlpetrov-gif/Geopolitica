// Compatibilidad para textos de componentes antiguos/dinámicos con colores fijos.
// Lee primero y escribe después; ignora animación de mapas y nunca cambia sus datos o colores de capas.
import {rgb,componer,contraste,legible} from './contraste.js';
const instancias=new WeakMap();
export function iniciarLectura(doc) {
  if(!doc?.defaultView || !doc.body)return null;
  if(instancias.has(doc)){instancias.get(doc).revisar();return instancias.get(doc);}
  const win=doc.defaultView,parchados=new Set();let timer=null,detenido=false;
  const observer=new win.MutationObserver(ms=>{
    if(ms.some(m=>!m.target.closest?.('.maplibregl-map,svg,canvas') && !(m.target.id||'').startsWith('apariencia-')))programar();
  });
  const observar=()=>observer.observe(doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','class','hidden','data-theme','aria-selected','aria-expanded']});
  function programar(){if(detenido||timer!=null)return;timer=win.setTimeout(evaluar,180);}
  function evaluar(){
    timer=null;if(detenido)return;observer.disconnect();
    for(const e of parchados){e.removeAttribute('data-lectura-color');e.style.removeProperty('--lectura-color');}parchados.clear();
    const cache=new Map(),estilo=e=>{if(!cache.has(e))cache.set(e,win.getComputedStyle(e));return cache.get(e);};
    const fondosCache=new Map();
    function fondos(e){
      if(fondosCache.has(e))return fondosCache.get(e);
      const st=estilo(e),padre=e.parentElement;
      let bs=padre?fondos(padre):[rgb('#ffffff')];
      if(!bs)return null;
      const c=rgb(st.backgroundColor);if(c?.[3])bs=bs.map(b=>componer(c,b));
      if(st.backgroundImage!=='none') {
        if(!/gradient\(/.test(st.backgroundImage))return null; // imagen real: requiere revisión, no se adivina su fondo.
        const stops=(st.backgroundImage.match(/rgba?\([^)]+\)/g)||[]).map(rgb).filter(Boolean);
        if(stops.length)bs=stops.flatMap(c=>bs.map(b=>componer(c,b))).slice(0,12);
      }
      fondosCache.set(e,bs);return bs;
    }
    const cambios=[];
    for(const e of doc.body.querySelectorAll('*')) {
      if(e.closest('script,style,canvas,.maplibregl-map,[aria-hidden="true"]') || e.namespaceURI?.includes('svg') && e.tagName!=='text')continue;
      const texto=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
      if(!texto&&!e.matches('input:not([type=color]),select,textarea'))continue;
      if(!e.getClientRects().length)continue;
      const st=estilo(e);if(st.visibility==='hidden'||st.display==='none')continue;
      const c=rgb(e.tagName==='text'?st.fill:st.color),bs=fondos(e);if(!c||c[3]===0||!bs)continue;
      let op=1;for(let p=e;p;p=p.parentElement)op*=Number(estilo(p).opacity)||0;
      if(!op)continue;
      const minimo=parseFloat(st.fontSize)>=24||parseFloat(st.fontSize)>=18.6667&&Number(st.fontWeight)>=700?3:4.5;
      if(bs.every(b=>contraste(componer([...c.slice(0,3),c[3]*op],b),b)>=minimo))continue;
      const seguro=legible(c,bs,minimo+0.1,op);if(seguro)cambios.push([e,seguro]);
    }
    for(const [e,c] of cambios){e.style.setProperty('--lectura-color',c);e.setAttribute('data-lectura-color','');parchados.add(e);}
    doc.documentElement.dataset.lecturaRevisada='true';observar();
  }
  const api={revisar:programar,detener(){detenido=true;observer.disconnect();win.clearTimeout(timer);}};
  instancias.set(doc,api);observar();programar();
  return api;
}
