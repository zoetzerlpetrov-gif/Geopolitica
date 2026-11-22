// Matemática de color compartida; sin DOM ni dependencias externas. Cocientes sin redondeo (WCAG 2.2).
export function rgb(color) {
  if (Array.isArray(color)) return color;
  const s = String(color || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return [1,3,5].map(i=>parseInt(s.slice(i,i+2),16)).concat(1);
  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (!m) return null;
  const p = m[1].replace('/', ' ').split(/[,\s]+/).filter(Boolean).map(Number);
  return p.length >= 3 && p.every(Number.isFinite) ? [p[0],p[1],p[2],p[3] ?? 1] : null;
}
export const hex = c => '#' + c.slice(0,3).map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('');
export const mezclar = (a,b,p) => a.slice(0,3).map((x,i)=>x*(1-p)+b[i]*p).concat(1);
export const componer = (frente,fondo) => mezclar(fondo,frente,frente[3] ?? 1);
export function contraste(a,b) {
  const lum = c => { const v=rgb(c).slice(0,3).map(x=>x/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return v[0]*0.2126+v[1]*0.7152+v[2]*0.0722; };
  const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}
export function legible(color, fondos, minimo=4.5, opacidad=1) {
  const c=rgb(color), bs=fondos.map(rgb);
  const suficiente=x=>bs.every(b=>contraste(componer([...x.slice(0,3),(c[3] ?? 1)*opacidad],b),b)>=minimo);
  if(suficiente(c))return hex(c);
  let mejor=null, distancia=Infinity;
  for(const extremo of [[0,0,0,1],[255,255,255,1]]) {
    if(!suficiente(extremo))continue;
    let bajo=0,alto=1;
    for(let i=0;i<18;i++){const medio=(bajo+alto)/2;if(suficiente(rgb(hex(mezclar(c,extremo,medio)))))alto=medio;else bajo=medio;}
    const salida=rgb(hex(mezclar(c,extremo,alto))), d=salida.slice(0,3).reduce((n,x,i)=>n+(x-c[i])**2,0);
    if(suficiente(salida)&&d<distancia){mejor=hex(salida);distancia=d;}
  }
  return mejor;
}
export function tokensLectura(t) {
  const fondos=[t.bg,t.surface,t['surface-2']], seguro=(c,n=4.6)=>legible(c,fondos,n)||legible(c,[t.surface],n);
  const ac=rgb(t.accent), on=contraste(ac,'#000000')>=contraste(ac,'#ffffff')?'#000000':'#ffffff';
  const warnBg=hex(mezclar(rgb(t.surface),rgb('#d99e20'),0.13));
  return { 'link':seguro(t.accent),'on-accent':on,'focus-safe':seguro(t.focus,3.1),
    'danger':seguro('#b3261e'),'success':seguro('#24733b'),'warning':seguro('#8a5c00'),'info':seguro('#23628c'),
    'warn-bg':warnBg,'warn-text':legible('#8a5c00',[warnBg],4.6),
    'icon-filter':contraste(t.surface,'#000000')>=contraste(t.surface,'#ffffff')?'none':'invert(1)' };
}
export function revisarPaleta(c) {
  const out=[];
  for(const m of ['claro','oscuro']) {
    const t=c?.[m]; if(!t)return [`Falta la paleta ${m}.`];
    for(const f of ['bg','surface','surface-2']) {
      for(const k of ['text','text-2','accent']) if(contraste(t[k],t[f])<4.5)out.push(`${m}: ${k} sobre ${f}: ${contraste(t[k],t[f]).toFixed(2)} (mínimo 4.5).`);
      if(contraste(t.focus,t[f])<3)out.push(`${m}: foco sobre ${f}: ${contraste(t.focus,t[f]).toFixed(2)} (mínimo 3).`);
    }
  }
  return out;
}
