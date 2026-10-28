/** HLS solo bajo petición y dentro de una ficha de cámara. Sin proxy ni retransmisión. */
let cargarBiblioteca;
const activos = new Map();

function biblioteca() {
  if (globalThis.Hls) return Promise.resolve(globalThis.Hls);
  if (!cargarBiblioteca) cargarBiblioteca = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../vendor/hls/hls.light.min.js', import.meta.url).href;
    script.onload = () => resolve(globalThis.Hls);
    script.onerror = () => { script.remove(); cargarBiblioteca = null; reject(new Error('biblioteca no disponible')); };
    document.head.append(script);
  });
  return cargarBiblioteca;
}

export function iniciarCamarasVideo(cuerpo, panel = cuerpo) {
  for (const video of cuerpo.querySelectorAll('video[data-camara-native]:not([data-listo])')) {
    video.dataset.listo = '1';
    const observer = new MutationObserver(() => {
      if (video.isConnected && !panel.hidden) return;
      video.pause();
      video.removeAttribute('src');
      for (const source of video.querySelectorAll('source')) source.removeAttribute('src');
      video.load();
      observer.disconnect();
    });
    observer.observe(cuerpo, { childList: true, subtree: true });
    if (panel !== cuerpo) observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  }
  for (const boton of cuerpo.querySelectorAll('button[data-camara-hls]:not([data-listo])')) {
    boton.dataset.listo = '1';
    boton.addEventListener('click', async () => {
      const video = boton.parentElement.querySelector('video');
      const url = boton.dataset.camaraHls;
      if (!video || !/^https:\/\//.test(url)) return;
      boton.disabled = true;
      boton.textContent = 'Cargando video del operador…';
      const limpiar = () => {
        activos.get(video)?.destroy();
        activos.delete(video);
        video.pause();
        video.removeAttribute('src');
        for (const source of video.querySelectorAll('source')) source.removeAttribute('src');
        video.load();
        observer.disconnect();
      };
      const observer = new MutationObserver(() => {
        if (!video.isConnected || panel.hidden) limpiar();
      });
      observer.observe(cuerpo, { childList: true, subtree: true });
      if (panel !== cuerpo) observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
      try {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
        } else {
          const Hls = await biblioteca();
          if (!video.isConnected || panel.hidden) { limpiar(); return; }
          if (!Hls?.isSupported()) throw new Error('HLS no compatible');
          const hls = new Hls({ maxBufferLength: 15, maxMaxBufferLength: 30, autoStartLoad: false });
          activos.set(video, hls);
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              limpiar();
              boton.disabled = false;
              boton.textContent = 'Señal no disponible. Reintentar';
            }
          });
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.startLoad();
        }
        await video.play();
        boton.textContent = 'Video del operador cargado';
      } catch {
        limpiar();
        boton.disabled = false;
        boton.textContent = 'No se pudo reproducir. Reintentar o abrir el original';
      }
    });
  }
}
