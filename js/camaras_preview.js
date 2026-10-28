/** Vista previa de cámaras: medios del operador, ampliación local y errores visibles. */
export function urlReproductorCamara(valor, tipo) {
  if (tipo !== 'windy') return '';
  try {
    const u = new URL(String(valor || ''));
    if (u.protocol !== 'https:' || u.username || u.password || u.port ||
        !['webcams.windy.com', 'embed.windy.com'].includes(u.hostname) ||
        !/^\/(?:webcams\/public\/embed\/|embed\/)/.test(u.pathname) ||
        [...u.searchParams.keys()].some(k => /^(?:key|api_key|token|signature)$/i.test(k))) return '';
    return u.href;
  } catch { return ''; }
}

export function iniciarPreviewsCamaras(cuerpo, panel = cuerpo) {
  for (const preview of cuerpo.querySelectorAll('[data-camara-preview]:not([data-preview-listo])')) {
    preview.dataset.previewListo = '1';
    const estado = () => preview.querySelector('[data-camara-estado]');
    const indicar = texto => { if (estado()) estado().textContent = texto; };
    const actualizar = () => {
      const imgs = [...preview.querySelectorAll('img')].filter(i => !i.closest('.cam-lightbox'));
      const buenas = imgs.filter(i => i.complete && i.naturalWidth > 0).length;
      if (!imgs.length) return;
      const malas = imgs.filter(i => i.dataset.errorCamara === '1').length;
      if (malas === imgs.length && malas) indicar('La imagen no respondió. Puedes reintentar aquí o consultar al operador.');
      else if (buenas) indicar(`Vista previa disponible${imgs.length > 1 ? ` · ${buenas} de ${imgs.length} vistas` : ''}. Pulsa la imagen para ampliarla aquí.`);
      else indicar('Cargando imagen del operador…');
    };
    preview.addEventListener('load', e => { if (e.target.tagName === 'IMG') { delete e.target.dataset.errorCamara; actualizar(); } }, true);
    preview.addEventListener('error', e => { if (e.target.tagName === 'IMG') { e.target.dataset.errorCamara = '1'; actualizar(); } }, true);
    let dialogo = null;
    preview.addEventListener('click', e => {
      const boton = e.target.closest('[data-camara-ampliar], [data-camara-reintentar]');
      if (!boton || !preview.contains(boton)) return;
      if (boton.hasAttribute('data-camara-reintentar')) {
        for (const img of preview.querySelectorAll('img')) {
          delete img.dataset.errorCamara;
          const src = img.getAttribute('src');
          img.removeAttribute('src');
          if (src) img.setAttribute('src', src);
        }
        indicar('Solicitando de nuevo la imagen al operador…');
        return;
      }
      const url = boton.dataset.camaraAmpliar;
      if (!/^https:\/\//.test(url || '')) return;
      dialogo?.close();
      dialogo = document.createElement('dialog');
      dialogo.className = 'cam-lightbox';
      dialogo.setAttribute('aria-label', 'Vista ampliada de la cámara');
      const cerrar = document.createElement('button');
      cerrar.type = 'button'; cerrar.className = 'boton'; cerrar.textContent = 'Cerrar vista ampliada';
      // Mover la imagen ya cargada evita otra petición al operador al ampliarla.
      const img = boton.querySelector('img') || document.createElement('img');
      if (!img.getAttribute('src')) img.src = url;
      if (!img.alt) img.alt = 'Vista de la cámara';
      img.referrerPolicy = 'no-referrer';
      dialogo.append(cerrar, img);
      preview.append(dialogo);
      const actual = dialogo;
      cerrar.addEventListener('click', () => actual.close());
      actual.addEventListener('close', () => { if (boton.isConnected) boton.append(img); actual.remove(); if (boton.isConnected) { actualizar(); boton.focus(); } if (dialogo === actual) dialogo = null; }, { once: true });
      actual.showModal();
    });
    const observer = new MutationObserver(() => {
      if (preview.isConnected && !panel.hidden) return;
      dialogo?.close();
      observer.disconnect();
    });
    observer.observe(cuerpo, { childList: true });
    if (panel !== cuerpo) observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    actualizar();
  }
}
