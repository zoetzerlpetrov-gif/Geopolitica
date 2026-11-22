// Las geometrías y etiquetas familiares permanecen en memoria. Sólo se piden teselas al elegir una base en línea.
import { coordsValidas } from './continuidad-mapa.js';
import { estiloBase } from './map.js';

export function estiloPrivado(geo) {
  return { version: 8, sources: { paises: { type: 'geojson', data: geo } }, layers: [
    { id: 'fondo', type: 'background', paint: { 'background-color': '#152735' } },
    { id: 'tierra', type: 'fill', source: 'paises', paint: { 'fill-color': '#344c53', 'fill-outline-color': '#69818a' } },
  ] };
}

export function puntosTraslado(p, estado = {}) {
  const puntos = [], origen = p.ruta?.origen, inter = p.ruta?.intermedio;
  if (coordsValidas(origen?.coords)) puntos.push({ coords: origen.coords, nombre: origen.nombre, color: '#C8102E', extra: `Nivel ${estado.nivel || 'Verde'}` });
  if (coordsValidas(inter?.coords)) puntos.push({ coords: inter.coords, nombre: inter.nombre, color: '#e08a2e', extra: 'Resguardo nacional' });
  const colores = { Principal: '#c9a227', 'Europa A': '#4f8fd6', 'Europa B': '#4f8fd6', 'Reserva lejana': '#8d9ab0', Retorno: '#4caf50' };
  for (const d of p.destinos || []) if (d.id !== 'mexico' && coordsValidas(d.coords)) puntos.push({
    coords: d.coords, nombre: d.destino, color: colores[d.rol] || '#8d9ab0',
    extra: estado.dias?.[d.id] != null ? `día ${estado.dias[d.id]}${d.estancia_dias ? ` de ${d.estancia_dias}` : ''}` : d.rol,
  });
  return puntos;
}

export function lineasTraslado(p, estado = {}) {
  const puntos = puntosTraslado(p, estado), origen = p.ruta?.origen?.coords;
  return { type: 'FeatureCollection', features: coordsValidas(origen) ? puntos.slice(1).map(x => ({
    type: 'Feature', properties: { color: x.color }, geometry: { type: 'LineString', coordinates: [origen, x.coords] },
  })) : [] };
}

export async function baseTraslado(tipo, geo, cargar = estiloBase) {
  if (tipo === 'local') return estiloPrivado(geo);
  if (!['calles', 'satelite', 'relieve'].includes(tipo)) throw Error('Vista no disponible.');
  return (await cargar('light', { base: tipo })).style;
}

/** Se crea una vez por contenedor: repintar datos no recrea el mapa ni pierde cámara o base. */
export async function crearMapaTraslado(host, { elegirPunto = null } = {}) {
  const lib = await import('../vendor/maplibre-gl/maplibre-gl.mjs');
  const doc = host.ownerDocument, barra = doc.createElement('div'), lienzo = doc.createElement('div'), aviso = doc.createElement('p');
  barra.className = 'cf-mapa-controles'; lienzo.className = 'cf-mapa-interactivo';
  aviso.className = 'meta'; aviso.setAttribute('role', 'status');
  const label = doc.createElement('label'); label.textContent = 'Vista del mapa ';
  const selector = doc.createElement('select'); selector.setAttribute('aria-label', 'Vista del mapa del traslado');
  for (const [v, t] of [['local', 'Local · sin mapas externos'], ['calles', 'Calles'], ['satelite', 'Satélite'], ['relieve', 'Relieve']]) {
    const o = doc.createElement('option'); o.value = v; o.textContent = t; selector.append(o);
  }
  label.append(selector); barra.append(label);
  let map, actual = null, markers = [], listo = false, ajustado = false, revision = 0;
  const boton = (texto, titulo, fn) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = texto; b.title = titulo; b.setAttribute('aria-label', titulo); b.onclick = fn; barra.append(b); return b; };
  boton('+', 'Acercar mapa', () => map?.zoomIn());
  boton('−', 'Alejar mapa', () => map?.zoomOut());
  boton('Ver todos', 'Ajustar vista a todos los destinos', () => encuadrar());
  host.replaceChildren(barra, lienzo, aviso);
  map = new lib.Map({ container: lienzo, style: estiloPrivado({ type: 'FeatureCollection', features: [] }),
    center: [-45, 20], zoom: 1.5, maxZoom: 19, attributionControl: true, renderWorldCopies: false });
  map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
  // Ocultar una pestaña no reinicia la cámara; al mostrarla se ajusta sólo el tamaño del canvas.
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => map.resize()) : null;
  observer?.observe(lienzo);
  function encuadrar() {
    if (!actual) return;
    const ps = puntosTraslado(actual.p, actual.estado).map(x => x.coords);
    if (!ps.length) return;
    map.fitBounds([[Math.min(...ps.map(c => c[0])), Math.min(...ps.map(c => c[1]))],
      [Math.max(...ps.map(c => c[0])), Math.max(...ps.map(c => c[1]))]], { padding: 65, maxZoom: 10, duration: 0 });
  }
  function pintar() {
    if (!listo || !actual) return;
    const { p, geo, estado } = actual;
    if (map.getSource('paises')) map.getSource('paises').setData(geo);
    const rutas = lineasTraslado(p, estado);
    if (!map.getSource('cf-rutas')) {
      map.addSource('cf-rutas', { type: 'geojson', data: rutas });
      map.addLayer({ id: 'cf-rutas', type: 'line', source: 'cf-rutas', paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-opacity': 0.85 } });
    } else map.getSource('cf-rutas').setData(rutas);
    markers.forEach(m => m.remove()); markers = [];
    for (const x of puntosTraslado(p, estado)) {
      const texto = doc.createElement('span'); texto.className = 'cf-mapa-etiqueta'; texto.textContent = `${x.nombre}${x.extra ? ' · ' + x.extra : ''}`;
      const popup = doc.createElement('p'); popup.textContent = texto.textContent;
      markers.push(new lib.Marker({ color: x.color }).setLngLat(x.coords).setPopup(new lib.Popup().setDOMContent(popup)).addTo(map));
      markers.push(new lib.Marker({ element: texto, anchor: 'top', offset: [0, 8] }).setLngLat(x.coords).addTo(map));
    }
    if (!ajustado) { encuadrar(); ajustado = true; }
  }
  map.on('load', () => { listo = true; pintar(); });
  map.on('style.load', () => { listo = true; pintar(); host.dataset.vistaCargada = selector.value; });
  map.on('error', () => { aviso.textContent = 'No se pudo cargar parte de la cartografía. Prueba la vista Local o vuelve a elegir una base.'; });
  if (elegirPunto) map.on('click', e => elegirPunto([Number(e.lngLat.wrap().lng.toFixed(2)), Number(e.lngLat.lat.toFixed(2))]));
  selector.onchange = async () => {
    const miRevision = ++revision, tipo = selector.value;
    host.dataset.vistaCargada = '';
    aviso.textContent = tipo === 'local' ? 'Vista local: no consulta mapas externos.' : 'Mapa en línea: el proveedor recibe tu IP y las zonas consultadas; no se envían integrantes, notas, contactos ni fechas. Las líneas son conexiones ilustrativas, no rutas de navegación.';
    try {
      const style = await baseTraslado(tipo, actual?.geo || { type: 'FeatureCollection', features: [] });
      if (miRevision !== revision) return;
      listo = false; map.setStyle(style); // style.load vuelve a añadir las rutas; la cámara se conserva.
    } catch { if (miRevision === revision) { host.dataset.vistaCargada = 'error'; aviso.textContent = 'No se pudo cargar esa vista. Puedes volver a Local sin perder tus destinos.'; } }
  };
  aviso.textContent = 'Vista local: usa +/−, la rueda o el gesto de pellizcar para ampliar. Arrastra para moverte. Elige otra vista para consultar cartografía en línea.';
  return { actualizar(p, geo, estado) { actual = { p, geo, estado }; pintar(); }, resize() { map.resize(); }, destroy() { revision++; observer?.disconnect(); markers.forEach(m => m.remove()); map.remove(); } };
}
