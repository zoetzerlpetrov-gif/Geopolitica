import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlFichaCamara } from '../../js/capas.js';

test('cámara: MP4 se describe como clip, conserva URL y no reproduce automáticamente', () => {
  const html = htmlFichaCamara({ n: 'Londres', mp4: 'https://example.com/a.mp4', x: 'https://example.com/', imgs: '[]' });
  assert.match(html, /Clip reciente/);
  assert.match(html, /preload="none"/);
  assert.match(html, /src="https:\/\/example.com\/a.mp4"/);
  assert.doesNotMatch(html, /autoplay|En vivo/);
});

test('cámara: HLS bajo petición, advertencia del catálogo y condiciones escapadas', () => {
  const html = htmlFichaCamara({ n: '<script>', hls: 'https://example.com/a.m3u8', catalogo_anterior: true, captura_utc: '<bad>', lic_url: 'javascript:alert(1)' });
  assert.match(html, /data-camara-hls=/);
  assert.match(html, /Catálogo anterior/);
  assert.match(html, /&lt;bad&gt;/);
  assert.doesNotMatch(html, /javascript:|<script>/);
});

test('cámara: medios privados y arreglos malformados no se incrustan', () => {
  for (const imgs of ['{}', 'null', 'true', '"wrong"']) assert.doesNotThrow(() => htmlFichaCamara({ imgs }));
  const html = htmlFichaCamara({ hls: 'https://127.0.0.1/a', mp4: 'javascript:alert(1)', imgs: ['https://192.168.1.1/a.jpg'] });
  assert.doesNotMatch(html, /<video|<img|data-camara-hls/);
});

test('HLS solicita la señal al pulsar y libera el reproductor al cerrar la ficha', async () => {
  const { iniciarCamarasVideo } = await import('../../js/camaras_video.js');
  const prev = { Hls: globalThis.Hls, MutationObserver: globalThis.MutationObserver };
  let callback, reproducidos = 0, destruidos = 0, source;
  class FakeHls {
    static Events = { ERROR: 'error' };
    static isSupported() { return true; }
    on() {}
    loadSource(url) { source = url; }
    attachMedia() {}
    startLoad() {}
    destroy() { destruidos++; }
  }
  globalThis.Hls = FakeHls;
  globalThis.MutationObserver = class { constructor(cb) { callback = cb; } observe() {} disconnect() {} };
  const video = { isConnected: true, canPlayType: () => '', play: async () => { reproducidos++; }, pause() {}, removeAttribute() {}, querySelectorAll: () => [], load() {} };
  let click;
  const boton = { dataset: { camaraHls: 'https://example.com/a.m3u8' }, parentElement: { querySelector: () => video }, addEventListener: (_, cb) => { click = cb; } };
  const panel = { hidden: false };
  try {
    iniciarCamarasVideo({ querySelectorAll: (selector) => selector.startsWith('button') ? [boton] : [] }, panel);
    assert.equal(source, undefined);
    await click();
    assert.equal(source, 'https://example.com/a.m3u8');
    assert.equal(reproducidos, 1);
    panel.hidden = true;
    callback();
    assert.equal(destruidos, 1);
  } finally {
    globalThis.Hls = prev.Hls;
    globalThis.MutationObserver = prev.MutationObserver;
  }
});


test('los clips nativos también se detienen al cerrar la ficha', async () => {
  const { iniciarCamarasVideo } = await import('../../js/camaras_video.js');
  const anterior = globalThis.MutationObserver;
  let callback, pausas = 0, recargas = 0;
  globalThis.MutationObserver = class { constructor(cb) { callback = cb; } observe() {} disconnect() {} };
  const video = { dataset: {}, isConnected: true, pause() { pausas++; }, removeAttribute() {}, querySelectorAll: () => [], load() { recargas++; } };
  const panel = { hidden: false };
  try {
    iniciarCamarasVideo({ querySelectorAll: (s) => s.startsWith('video') ? [video] : [] }, panel);
    assert.equal(pausas, 0);
    panel.hidden = true;
    callback();
    assert.equal(pausas, 1);
    assert.equal(recargas, 1);
  } finally { globalThis.MutationObserver = anterior; }
});

test('previews: la imagen se amplía localmente y no abre una pestaña externa', () => {
  const html = htmlFichaCamara({ n: 'DGT', imgs: ['https://etraffic.dgt.es/7.jpg'] });
  assert.match(html, /data-camara-ampliar="https:\/\/etraffic.dgt.es\/7.jpg"/);
  assert.match(html, /data-camara-reintentar/);
  assert.doesNotMatch(html, /<a[^>]*href="https:\/\/etraffic.dgt.es\/7.jpg"/);
});

test('previews: reproductor de Windy permitido sin confundir secuencia con directo', async () => {
  const { urlReproductorCamara } = await import('../../js/camaras_preview.js');
  const embed = 'https://webcams.windy.com/webcams/public/embed/player/123/day';
  const html = htmlFichaCamara({ n: 'Windy', embed, embed_tipo: 'windy' });
  assert.match(html, /<iframe data-camara-frame/);
  assert.match(html, /no es video continuo/);
  for (const url of [embed + '?key=SECRET', 'https://evil.example/embed/', 'https://webcams.windy.com/not-embed/', 'javascript:alert(1)']) assert.equal(urlReproductorCamara(url, 'windy'), '');
  assert.equal(urlReproductorCamara(embed, 'unknown'), '');
});

test('previews: cámara sin medio muestra explicación sin iframe arbitrario', () => {
  const html = htmlFichaCamara({ n: 'Operador', embed: 'https://evil.example/embed/', embed_tipo: 'windy' });
  assert.match(html, /Vista previa no disponible/);
  assert.doesNotMatch(html, /<iframe|<img|<video/);
});

test('los reproductores incorporados se descargan al cerrar la ficha', async () => {
  const { iniciarCamarasVideo } = await import('../../js/camaras_video.js');
  const anterior = globalThis.MutationObserver;
  let callback, quitado = false;
  globalThis.MutationObserver = class { constructor(cb) { callback = cb; } observe() {} disconnect() {} };
  const frame = { dataset: {}, isConnected: true, removeAttribute: k => { if (k === 'src') quitado = true; } };
  const panel = { hidden: false };
  try {
    iniciarCamarasVideo({ querySelectorAll: s => s.startsWith('iframe') ? [frame] : [] }, panel);
    assert.equal(quitado, false);
    panel.hidden = true; callback();
    assert.equal(quitado, true);
  } finally { globalThis.MutationObserver = anterior; }
});
