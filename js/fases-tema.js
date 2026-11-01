// Misma preferencia del mapa. No modifica expedientes ni consulta servicios.
const initialized=new WeakSet();
export function iniciarTemaFases(doc,win){
 if(!doc||initialized.has(doc))return;const button=doc.getElementById('fases-tema');if(!button)return;initialized.add(doc);
 const root=doc.documentElement,media=win.matchMedia?.('(prefers-color-scheme: dark)');
 const stored=()=>{try{return win.localStorage.getItem('gp_theme');}catch{return null;}};
 const paint=()=>{const dark=root.dataset.theme==='dark'||(!root.dataset.theme&&media?.matches===true);button.setAttribute('aria-pressed',String(dark));button.textContent=dark?'☾ Oscuro':'☀ Claro';};
 const apply=value=>{if(value==='light'||value==='dark')root.dataset.theme=value;else root.removeAttribute('data-theme');paint();};
 apply(stored());
 button.addEventListener('click',()=>{const value=button.getAttribute('aria-pressed')==='true'?'light':'dark';apply(value);try{win.localStorage.setItem('gp_theme',value);}catch{}});
 win.addEventListener('storage',event=>{if(event.key==='gp_theme')apply(event.newValue);else if(event.key===null)apply(stored());});
 media?.addEventListener?.('change',paint);
}
if(typeof document!=='undefined'&&typeof window!=='undefined')iniciarTemaFases(document,window);
