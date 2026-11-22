// Revisión independiente WCAG 1.4.3 con axe-core. No inicia sesiones ni escribe en servicios externos.
import {createRequire} from 'node:module';
import {readdirSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {css,DEFECTO} from '../../js/apariencia.js';
import {CSS as CUENTA,paginaCuenta} from '../../cloudflare/planes/cuenta-ui.js';
import {TEMA_JS} from '../../cloudflare/apariencia/tema-publico.js';
const require=createRequire(`${process.env.PW_ROOT||'/tmp/pw'}/package.json`),{chromium}=require('playwright');
const axe=require.resolve('axe-core/axe.min.js'),out='e2e/contraste';mkdirSync(out,{recursive:true});
const lectura=readFileSync('css/lectura.css','utf8'),huella=readFileSync('cloudflare/huella/assets/huella.css','utf8');
writeFileSync(`${out}/tema.js`,TEMA_JS);
for(const [file,html,style] of [
  ['cuenta',paginaCuenta({plan:'analyst'}),CUENTA],
  ['ingreso',readFileSync('cloudflare/huella/assets/ingreso.html','utf8'),huella],
  ['huella',readFileSync('cloudflare/huella/assets/index.html','utf8'),huella],
]){
  writeFileSync(`${out}/${file}.css`,style+'\n'+lectura+'\n'+css(DEFECTO));
  writeFileSync(`${out}/${file}.html`,html.replace(/href="(?:huella|cuenta)\.css"/,`href="${file}.css"`).replace('<script type="module" src="huella.js"></script>',''));
}
const files=readdirSync('.').filter(f=>f.endsWith('.html')).sort().concat(['cuenta','ingreso','huella'].map(f=>`${out}/${f}.html`));
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']}),resultados=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/admin/huella/vulnerabilidades')return route.fulfill({json:{corridas:[{fecha:'2026-11-22T13:00:00Z',revisiones:[],hallazgos:['critica','alta','media','baja','info'].map((s,i)=>({id:'prueba-'+i,severidad:s,titulo:'Hallazgo de prueba '+s,detalle:'Detalle de prueba para lectura',accion:'Acción de prueba',quien:'tu',categoria:'contraste'}))}]}});
  if(u.hostname==='admin.dominusosint.com'&&u.pathname==='/apariencia/datos.json')return route.fulfill({json:DEFECTO});
  if(u.hostname!=='127.0.0.1'&&!['data:','blob:'].includes(u.protocol))return route.fulfill({status:404,body:''});
  return route.continue();
 });
 for(const file of files){
  const page=await context.newPage();
  try{
   await page.goto(`http://127.0.0.1:8765/${file}`,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForTimeout(900);
   await page.addScriptTag({path:axe});
   for(const theme of ['light','dark']){
    await page.evaluate(t=>{localStorage.setItem('gp_theme',t);document.documentElement.dataset.theme=t;},theme);
    await page.waitForTimeout(450);
    // También se inspecciona contenido ya renderizado de pestañas/acordeones, sin enviar formularios.
    await page.evaluate(()=>{for(const d of document.querySelectorAll('main details'))d.open=true;for(const p of document.querySelectorAll('main [role=tabpanel],main section.panel[hidden]'))p.hidden=false;});
    await page.waitForTimeout(300);
    const r=await page.evaluate(async()=>{
     const a=await axe.run(document,{runOnly:{type:'rule',values:['color-contrast']},resultTypes:['violations','incomplete']});
     const resumir=xs=>xs.flatMap(x=>x.nodes.map(n=>({regla:x.id,selector:n.target,html:n.html.slice(0,220),detalle:n.failureSummary})));
     return {fallos:resumir(a.violations),revision_manual:resumir(a.incomplete)};
    });
    resultados.push({pagina:file,tema:theme,...r});
    if(r.fallos.length){console.log(JSON.stringify({pagina:file,tema:theme,fallos:r.fallos.slice(0,8)}));await page.screenshot({path:`${out}/${file.split('/').pop()}-${theme}.png`});}
   }
  }catch(e){resultados.push({pagina:file,error:String(e.message||e)});console.log(file,String(e.message||e));}
  finally{await page.close();}
 }
 await context.close();
}finally{await browser.close();}
writeFileSync(`${out}/informe.json`,JSON.stringify({fecha:new Date().toISOString(),paginas:files.length,resultados},null,1));
const fallos=resultados.reduce((n,r)=>n+(r.fallos?.length||0)+(r.error?1:0),0);
console.log(`Contraste: ${files.length} páginas, temas claro/oscuro, ${fallos} fallos detectados. Los casos sin fondo determinable quedan como revisión manual.`);
if(fallos)process.exitCode=1;
