// Smoke del mapa real en Chromium/WebGL. Sólo plantilla y datos ficticios; no abre sesiones ni cambia nube.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(`${process.env.PW_ROOT || '/tmp/pw'}/package.json`);
const { chromium } = require('playwright');
const browser = await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage({viewport:{width:1400,height:1000}}), errores = [], externas = [];
  page.on('pageerror',e=>errores.push(e.message));
  page.on('request',r=>{if(/tiles\.openfreemap\.org|tiles\.maps\.eox\.at|ibasemaps-api\.arcgis\.com|elevation-tiles-prod|fonts\.openmaptiles\.org/.test(r.url())) externas.push(r.url());});
  await page.goto('http://127.0.0.1:8765/continuidad-familiar.html');
  const mapa = page.locator('#cf-mapa-lienzo');
  await mapa.locator('canvas').waitFor({timeout:45000});
  await page.waitForFunction(()=>document.querySelectorAll('#cf-mapa-lienzo .cf-mapa-etiqueta').length>1);
  // Los estilos Local carecen de glyphs y fuentes remotas; sin analytics en esta prueba.
  assert.equal(externas.length,0,`Solicitudes externas antes de elegir una base: ${externas.join(', ')}`);
  const label = mapa.locator('.cf-mapa-etiqueta').first();
  const relativa = async () => { const a = await label.boundingBox(), b = await mapa.locator('canvas').boundingBox(); return {x:a.x-b.x,y:a.y-b.y}; };
  const antes = await label.boundingBox();
  await mapa.getByRole('button',{name:'Acercar mapa',exact:true}).click();
  await page.waitForTimeout(600);
  const despues = await label.boundingBox();
  assert.ok(Math.abs(antes.x-despues.x)>1 || Math.abs(antes.y-despues.y)>1,'Acercar debe cambiar el encuadre');
  await mapa.getByRole('button',{name:'Alejar mapa',exact:true}).click();
  await mapa.getByRole('button',{name:'Ajustar vista a todos los destinos',exact:true}).click();
  const selector = mapa.getByRole('combobox');
  for(const tipo of ['calles','satelite','relieve','local']) {
    await selector.selectOption(tipo);
    await page.waitForFunction(t=>document.querySelector('#cf-mapa-lienzo').dataset.vistaCargada===t,tipo,{timeout:45000});
    await page.waitForFunction(()=>document.querySelectorAll('#cf-mapa-lienzo .cf-mapa-etiqueta').length>1);
    await page.waitForTimeout(1800);
    assert.equal(await selector.inputValue(),tipo);
    assert.ok(await mapa.locator('.cf-mapa-etiqueta').count()>1,'Conserva destinos después de cambiar base');
  }
  // Repintar todo al registrar una fase conserva la base/cámara de las instancias existentes.
  await mapa.getByRole('button',{name:'Acercar mapa',exact:true}).click(); await page.waitForTimeout(500);
  const posicion = await relativa();
  await page.getByRole('tab',{name:'Fases',exact:true}).click();
  await page.locator('#cf-fases input[type=checkbox]').first().check();
  await page.getByRole('tab',{name:'Tablero',exact:true}).click(); await page.waitForTimeout(500);
  const persistida = await relativa();
  assert.ok(Math.abs(posicion.x-persistida.x)<3 && Math.abs(posicion.y-persistida.y)<3,'Repintar datos no reinicia la cámara');
  await page.getByRole('tab',{name:'Destinos',exact:true}).click();
  const mini=page.locator('#cf-fd-mapa'); await mini.locator('canvas').click({position:{x:150,y:150}});
  assert.ok(await page.locator('#cf-fd-lon').inputValue());
  assert.ok(await page.locator('#cf-fd-lat').inputValue());
  assert.deepEqual(errores,[]);
  console.log('Mapa real: zoom +/−, cuatro bases, rutas conservadas, cámara persistente y coordenadas: OK.');
  console.log(`Solicitudes de cartografía tras selección explícita: ${externas.length}. La disponibilidad final de cada proveedor depende de su servicio.`);
} finally { await browser.close(); }
