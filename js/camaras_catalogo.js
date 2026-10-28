import { htmlFichaCamara, rellenarCamaraSingapur } from './capas.js';
import { iniciarPreviewsCamaras } from './camaras_preview.js';
import { iniciarCamarasVideo } from './camaras_video.js';

export function tienePreviewCamara(p) {
  return Boolean((Array.isArray(p.imgs) && p.imgs.length) || p.hls || p.mp4 || p.embed || p.yt || p.sg);
}

export function filtrarCamaras(camaras, consulta = '', medio = 'preview') {
  const normal = s => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const palabras = normal(consulta).split(/\s+/).filter(Boolean);
  return camaras.filter(p => {
    if (medio === 'preview' && !tienePreviewCamara(p)) return false;
    if (medio === 'video' && !(p.hls || p.mp4 || p.embed || p.yt)) return false;
    if (medio === 'imagen' && !((Array.isArray(p.imgs) && p.imgs.length) || p.sg)) return false;
    const texto = normal([p.n, p.o, p.p, p.lugar, p.fuente, p.id].join(' '));
    return palabras.every(palabra => texto.includes(palabra));
  });
}

async function iniciar() {
  const $ = id => document.getElementById(id);
  let camaras = [], coincidencias = [], limite = 40, seleccion = '';
  const lista = $('cam-resultados'), visor = $('cam-visor');
  const seleccionar = (p, enfocar = true) => {
    seleccion = p.id;
    visor.innerHTML = htmlFichaCamara(p);
    iniciarPreviewsCamaras(visor);
    iniciarCamarasVideo(visor);
    const sg = visor.querySelector('figure.cam-sg[data-sg]');
    if (sg) rellenarCamaraSingapur(sg);
    const url = new URL(location.href); url.searchParams.set('id', p.id); history.replaceState(null, '', url);
    for (const boton of lista.querySelectorAll('button')) boton.setAttribute('aria-pressed', String(boton.dataset.id === p.id));
    if (enfocar) { const titulo = visor.querySelector('h3'); titulo.tabIndex = -1; titulo.focus(); }
  };
  const dibujar = () => {
    lista.replaceChildren();
    $('cam-cuenta').textContent = `${coincidencias.length.toLocaleString('es')} cámaras encontradas · mostrando ${Math.min(limite, coincidencias.length)}`;
    for (const p of coincidencias.slice(0, limite)) {
      const li = document.createElement('li'), boton = document.createElement('button'), nombre = document.createElement('strong'), detalle = document.createElement('small');
      boton.type = 'button'; boton.dataset.id = p.id; boton.setAttribute('aria-pressed', String(seleccion === p.id));
      nombre.textContent = p.n || 'Cámara pública'; detalle.textContent = [p.p, p.o].filter(Boolean).join(' · ');
      boton.append(nombre, detalle); boton.addEventListener('click', () => seleccionar(p)); li.append(boton); lista.append(li);
    }
    $('cam-mas').hidden = limite >= coincidencias.length;
  };
  const buscar = () => { limite = 40; coincidencias = filtrarCamaras(camaras, $('cam-buscar').value, $('cam-medio').value); dibujar(); };
  try {
    const r = await fetch('data/capas/camaras.geojson');
    if (!r.ok) throw new Error('catálogo no disponible');
    const data = await r.json();
    camaras = (data.features || []).map(f => f.properties).filter(p => p && p.id);
    $('cam-carga').textContent = `${camaras.length.toLocaleString('es')} cámaras en el catálogo. Las vistas previas se solicitan solo al seleccionarlas.`;
    buscar();
    const id = new URL(location.href).searchParams.get('id');
    const elegida = camaras.find(p => p.id === id);
    if (elegida) seleccionar(elegida, false);
    else if (id) visor.textContent = 'Esta cámara ya no está en el catálogo. Puedes buscar otra.';
    $('cam-buscar').addEventListener('input', buscar);
    $('cam-medio').addEventListener('change', buscar);
    $('cam-mas').addEventListener('click', () => { limite += 40; dibujar(); });
  } catch {
    $('cam-carga').textContent = 'No se pudo cargar el catálogo. Recarga la página para reintentar.';
  }
}
if (typeof document !== 'undefined' && document.getElementById('cam-resultados')) iniciar();
