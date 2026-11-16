// Fenómenos anómalos: van en su propio menú y nunca cuentan como amenaza.  Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {};
const R = await import("../../js/riesgos.js");
const { clasificar } = await import("../../js/amenazas.js");

test("las capas de anomalías están en su menú, sin amenaza y con aviso de que son reportes", () => {
  assert.ok(R.ANOMALIAS.length >= 8);
  for (const c of R.ANOMALIAS) {
    assert.equal(c.menu, "anomalias", c.id);
    assert.equal(c.noAmenaza, true, c.id);
    assert.match(c.pie, /no hechos confirmados/);
    assert.ok(R.CAPAS.includes(c), c.id);
  }
});

test("severidad fija 1 e ícono solo en noticias y casos históricos", () => {
  assert.deepEqual(clasificar("anom_recientes", { tipo: "ufo" }), { sev: 1, tipo: "Fenómeno anómalo (reporte)", ic: "🛸" });
  assert.equal(clasificar("anom_historicos", { tipo: "crop" }).ic, "🌾");
  assert.equal(clasificar("anom_lugar", { nivel: "oficial" }).ic, "");
});

test("cada capa filtra su clase y colorea por nivel de respaldo", () => {
  const fc = { features: [{ properties: { capa: "anom_lugar", nivel: "oficial", titulo: "A" } }, { properties: { capa: "anom_triangulo", nivel: "explicado", titulo: "B" } },
    { properties: { capa: "anom_orbe", nivel: "cientifico", titulo: "C" } }] };
  const lugar = R.ANOMALIAS.find((c) => c.id === "anom_lugar");
  assert.deepEqual(lugar.derivar(fc).features.map((f) => f.properties.titulo), ["A", "B"]);
  assert.equal(lugar.estilo({ nivel: "oficial" }).c, R.NIVELES_ANOM.oficial[0]);
  const f = lugar.ficha({ titulo: "A", nivel: "local", url: "https://x", fuente: "W" });
  assert.ok(f.filas.some(([k, v]) => k === "Nivel de respaldo" && /no verificado/.test(v)));
});

test("capas por tipo de fenómeno: noticias, históricos y catálogo que corresponde", async () => {
  const { ANOMALIAS_POR_TIPO, TIPOS_ANOM } = await import("../../js/riesgos.js");
  assert.equal(ANOMALIAS_POR_TIPO.length, 12);
  assert.equal(TIPOS_ANOM.length, 12);
  const f = (capa, tipo, tipos) => ({ properties: { capa, tipo, ...(tipos ? { tipos } : {}) } });
  const fc = { type: "FeatureCollection", features: [f("anom_recientes", "lights_sky"), f("anom_historicos", "ufo"), f("anom_recientes", "ufo", ["ufo", "lights_sky"]),
    f("anom_orbe", "orbe"), f("anom_cultivo", "cultivo"), f("anom_nuforc", "densidad"), f("anom_lugar", "lugar")] };
  const n = (t) => ANOMALIAS_POR_TIPO.find((c) => c.id === `anom_t_${t}`).derivar(fc).features.length;
  assert.equal(n("lights_sky"), 2); // la nota + el grupo por país que la contiene
  assert.equal(n("ufo"), 2);
  assert.equal(n("lights_ground"), 1); // orbes del catálogo
  assert.equal(n("crop"), 1);
  assert.equal(n("sound"), 0);
  assert.ok(ANOMALIAS_POR_TIPO.every((c) => c.noAmenaza && c.menu === "anomalias" && c.subgrupo.startsWith("Por tipo")));
});

test('fauna: tres subtipos del grupo existente, sin nueva capa general ni alertas de amenaza',()=>{
  for(const t of ['prehistoric','mythical','cryptid']){
    const c=R.ANOMALIAS_POR_TIPO.find(x=>x.id===`anom_t_${t}`);
    assert.ok(c);assert.equal(c.menu,'anomalias');assert.equal(c.subgrupo,'Por tipo de fenómeno');assert.equal(c.noAmenaza,true);
    assert.ok(!R.ANOMALIAS.some(x=>x.id===c.id));
    const fc={features:[{properties:{capa:'anom_recientes',tipo:t}},{properties:{capa:'anom_recientes',tipo:'ufo'}}]};
    assert.equal(c.derivar(fc).features.length,1);
  }
  assert.equal(clasificar('anom_t_prehistoric',{tipo:'prehistoric'}).ic,'🦖');
  assert.equal(clasificar('anom_recientes',{tipo:'cryptid'}).ic,'🐾');
  assert.equal(clasificar('anom_recientes',{tipo:'ufo'}).ic,'🛸');
});

test('respaldo de Juárez se combina una sola vez y conserva contraste/fechas en la ficha',async()=>{
 const fs=await import('node:fs');const fc=JSON.parse(fs.readFileSync(new URL('../../data/anomalias-fauna.geojson',import.meta.url)));
 const previo=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>fc});
 try{
   const c=R.ANOMALIAS_POR_TIPO.find(x=>x.id==='anom_t_prehistoric');
   const combinado=await c.complementar(fc);assert.equal(combinado.features.length,1);
   const datos=c.derivar(combinado);assert.equal(datos.features.length,1);
   const p=datos.features[0].properties,ficha=c.ficha(p);
   assert.ok(ficha.filas.some(([k,v])=>k==='Publicación de la fuente'&&v==='2026-11-09'));
   assert.ok(ficha.filas.some(([k])=>k==='Estado del reporte'));
   assert.match(c.extra(p),/aztecaciudadjuarez\.com/);assert.match(c.extra({...p,contraste_nota:'<script>x</script>'}),/&lt;script&gt;/);
   assert.equal(R.ANOMALIAS_POR_TIPO.find(x=>x.id==='anom_t_mythical').derivar(combinado).features.length,0);
 }finally{globalThis.fetch=previo;}
});

test('desmarcar fauna mientras se descarga el respaldo no deja una capa dibujada',async()=>{
 const previo=globalThis.fetch;let resolver, avisar;
 const solicitado=new Promise(r=>avisar=r), respaldo=new Promise(r=>resolver=r);
 globalThis.fetch=async url=>String(url).includes('anomalias-fauna')?(avisar(),respaldo):{ok:true,json:async()=>({type:'FeatureCollection',features:[]})};
 const m={on(){},getLayer(){return null;},getSource(){return null;}};
 try{
  const gestor=new R.Riesgos(m,{onObjeto(){}}), carga=gestor.activar('anom_t_prehistoric');
  await solicitado;gestor.desactivar('anom_t_prehistoric');resolver({ok:true,json:async()=>({type:'FeatureCollection',features:[]})});await carga;
  assert.equal(gestor.activas.size,0);assert.equal(gestor.relojes.size,0);
 }finally{globalThis.fetch=previo;}
});
