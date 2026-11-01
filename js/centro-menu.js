// Navegación por etapas. No consulta fuentes ni modifica expedientes.
const initialized=new WeakSet();
export function iniciarCentro(root,hover=()=>globalThis.matchMedia?.('(hover: hover) and (pointer: fine)').matches===true){
 if(!root||initialized.has(root))return;initialized.add(root);
 const states=new Map();
 const close=d=>{d.open=false;d.querySelector('summary')?.setAttribute('aria-expanded','false');const state=states.get(d);if(state){state.pinned=false;state.over=false;}for(const child of d.querySelectorAll('[data-centro-disclosure]')){child.open=false;child.querySelector('summary')?.setAttribute('aria-expanded','false');const c=states.get(child);if(c){c.pinned=false;c.over=false;}}};
 const open=d=>{d.open=true;d.querySelector('summary')?.setAttribute('aria-expanded','true');};
 for(const d of root.querySelectorAll('[data-centro-disclosure]')){
  const s=d.querySelector(':scope > summary'),state={pinned:false,over:false};states.set(d,state);s.setAttribute('aria-expanded',String(d.open));
  d.addEventListener('mouseenter',()=>{if(!hover())return;state.over=true;open(d);});
  d.addEventListener('mouseleave',()=>{state.over=false;if(!state.pinned&&!d.contains(d.ownerDocument.activeElement))close(d);});
  d.addEventListener('focusout',()=>{queueMicrotask(()=>{if(!state.pinned&&!state.over&&!d.contains(d.ownerDocument.activeElement))close(d);});});
  s.addEventListener('click',e=>{
   e.preventDefault();
   // Un clic sobre un grupo abierto por hover lo fija; el siguiente lo cierra.
   if(e.detail>0&&state.over&&d.open&&!state.pinned){state.pinned=true;return;}
   if(d.open){close(d);}else{state.pinned=true;open(d);}
  });
  s.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowRight'].includes(e.key))return;e.preventDefault();open(d);d.querySelector('a[href]')?.focus();});
  d.addEventListener('toggle',()=>s.setAttribute('aria-expanded',String(d.open)));
 }
 root.addEventListener('keydown',e=>{if(e.key!=='Escape')return;let d=e.target.closest('[data-centro-disclosure]');while(d&&!d.open)d=d.parentElement?.closest('[data-centro-disclosure]');if(d){e.preventDefault();e.stopPropagation();close(d);d.querySelector('summary')?.focus();}});
 const outer=root.closest('#menu-secciones');
 outer?.addEventListener('toggle',()=>{if(!outer.open)for(const d of states.keys())close(d);});
 root.ownerDocument.addEventListener('click',e=>{if(!root.querySelector('.centro-menu')?.contains(e.target))for(const d of states.keys())close(d);});
}
if(typeof document!=='undefined')for(const root of document.querySelectorAll('.centro-nav, #menu-secciones .menu-lista'))iniciarCentro(root);
