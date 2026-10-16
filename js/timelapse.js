// Cambio en el tiempo: la misma zona vista año por año.
// Dos fuentes, la segunda es el respaldo de la primera:
//  - EOX «Sentinel-2 cloudless» (2018–2025): un mosaico anual de todo el planeta sin nubes, 10 m por píxel. Sirve para
//    ver manchas urbanas, minas, presas, deforestación, costas. Uso no comercial con atribución (CC BY-NC-SA 4.0;
//    años comprobados el 2026-10-16).
//  - NASA GIBS, MODIS Terra color verdadero (2001 a hoy): una imagen DIARIA (el mismo día de cada año), 250 m por píxel.
//    Datos abiertos de la NASA, sin llave. Es más gruesa y puede salir con nubes, pero cubre 25 años y no depende de
//    EOX. Si los mosaicos de EOX fallan varias veces seguidas, la herramienta cambia sola a NASA y lo avisa.
// Cada año es una capa: la del año elegido se ve y la siguiente se precarga con opacidad 0 (el «play» no parpadea);
// nunca hay más de dos capas a la vez.

const anioActual = new Date().getUTCFullYear();
export const FUENTES = {
  eox: { nombre: "Sentinel-2 sin nubes (EOX, 10 m, 2018–2025)", anios: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025], maxzoom: 14,
    url: (a) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${a}_3857/default/g/{z}/{y}/{x}.jpg`,
    atribucion: (a) => `Sentinel-2 cloudless ${a} – <a href="https://s2maps.eu" target="_blank" rel="noopener">s2maps.eu</a> by EOX IT Services GmbH (contiene datos modificados de Copernicus Sentinel ${a})` },
  nasa: { nombre: "NASA MODIS (250 m, un día de cada año, 2001–hoy)", anios: Array.from({ length: anioActual - 2001 }, (_, i) => 2001 + i), maxzoom: 9,
    url: (a, dia = "04-15") => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${a}-${dia}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
    atribucion: (a, dia = "04-15") => `NASA GIBS / EOSDIS, MODIS Terra ${a}-${dia}` },
};
export const ANIOS = FUENTES.eox.anios;
export const urlAnio = (a) => FUENTES.eox.url(a);
export const atribucion = (a) => FUENTES.eox.atribucion(a);
export const MS_PASO = 1500;
const ERRORES_PARA_RESPALDO = 6;

/** Índice siguiente en el ciclo (vuelve al primero al terminar). */
export const siguiente = (i, n = ANIOS.length) => (i + 1) % n;

/** «MM-DD» válido para la fecha de NASA (si no, 04-15). */
export const diaValido = (d) => (/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d || "") ? d : "04-15");

export class Timelapse {
  constructor(map, { onCambio = () => {}, onAviso = () => {} } = {}) {
    this.map = map; this.onCambio = onCambio; this.onAviso = onAviso;
    this.fuente = "eox"; this.dia = "04-15";
    this.activo = false; this.i = ANIOS.length - 1; this.reloj = null; this.instaladas = new Set(); this.errores = 0;
    // Respaldo automático: muchos mosaicos de EOX con error y ninguno bueno → se cambia a NASA.
    map.on?.("error", (e) => {
      if (!this.activo || this.fuente !== "eox" || !String(e?.sourceId || "").startsWith("tl-eox")) return;
      if (++this.errores >= ERRORES_PARA_RESPALDO) {
        this.setFuente("nasa");
        this.onAviso("EOX no respondió: se cambió a las imágenes de la NASA (MODIS, 250 m). Puedes volver a EOX en la barra.");
      }
    });
    map.on?.("data", (e) => { if (e?.tile && String(e.sourceId || "").startsWith("tl-eox")) this.errores = 0; });
  }

  get anios() { return FUENTES[this.fuente].anios; }

  activar() { this.activo = true; this.i = Math.min(this.i, this.anios.length - 1); this.#mostrar(this.i); }

  desactivar() { this.pausar(); this.activo = false; this.#quitarTodas(); }

  /** Tras cambiar el mapa base (setStyle) las capas se pierden: se vuelven a poner. */
  reinstalar() { if (this.activo) { this.instaladas.clear(); this.#mostrar(this.i); } }

  setIndice(i) { if (this.activo) this.#mostrar(Math.max(0, Math.min(this.anios.length - 1, i))); }

  /** Cambia de fuente conservando el año si existe en la nueva (si no, el más cercano). */
  setFuente(f) {
    if (!FUENTES[f] || f === this.fuente) return;
    const anio = this.anios[this.i];
    this.#quitarTodas();
    this.fuente = f; this.errores = 0;
    const j = this.anios.indexOf(anio);
    this.i = j >= 0 ? j : this.anios.reduce((m, a, k) => (Math.abs(a - anio) < Math.abs(this.anios[m] - anio) ? k : m), 0);
    if (this.activo) this.#mostrar(this.i); else this.onCambio(this.estado());
  }

  setDia(d) {
    this.dia = diaValido(d);
    if (this.fuente === "nasa" && this.activo) { this.#quitarTodas(); this.#mostrar(this.i); }
  }

  reproducir() {
    if (this.reloj || !this.activo) return;
    this.reloj = setInterval(() => this.#mostrar(siguiente(this.i, this.anios.length)), MS_PASO);
    this.onCambio(this.estado());
  }

  pausar() { clearInterval(this.reloj); this.reloj = null; this.onCambio(this.estado()); }

  estado() { return { i: this.i, anio: this.anios[this.i], n: this.anios.length, fuente: this.fuente, dia: this.dia, reproduciendo: Boolean(this.reloj), activo: this.activo }; }

  #id(a) { return `tl-${this.fuente}-${a}`; }

  #quitarTodas() {
    for (const id of this.instaladas) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
      if (this.map.getSource(id)) this.map.removeSource(id);
    }
    this.instaladas.clear();
  }

  #instalar(a) {
    const id = this.#id(a), F = FUENTES[this.fuente];
    if (this.map.getSource(id)) { this.instaladas.add(id); return; }
    this.map.addSource(id, { type: "raster", tiles: [F.url(a, this.dia)], tileSize: 256, maxzoom: F.maxzoom, attribution: F.atribucion(a, this.dia) });
    // Debajo de chokepoints, capas y eventos (igual que las demás imágenes satelitales).
    const antes = ["choke-anillo", "clusters"].find((l) => this.map.getLayer(l));
    this.map.addLayer({ id, type: "raster", source: id,
      paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 250 }, "raster-fade-duration": 0 } }, antes);
    this.instaladas.add(id);
  }

  #mostrar(i) {
    this.i = i;
    const a = this.anios[i], sig = this.anios[siguiente(i, this.anios.length)];
    this.#instalar(a);
    this.#instalar(sig);  // precarga del siguiente año
    const visible = this.#id(a), previa = this.#id(sig);
    for (const id of this.instaladas) if (this.map.getLayer(id)) this.map.setPaintProperty(id, "raster-opacity", id === visible ? 1 : 0);
    // Para no acumular capas: se quitan las que no son el año actual ni el siguiente.
    for (const id of [...this.instaladas]) {
      if (id === visible || id === previa) continue;
      if (this.map.getLayer(id)) this.map.removeLayer(id);
      if (this.map.getSource(id)) this.map.removeSource(id);
      this.instaladas.delete(id);
    }
    this.onCambio(this.estado());
  }
}

/** Barra flotante sobre el mapa: ▶/⏸, deslizador de años, año actual, fuente y (con NASA) el día del año. */
export function htmlBarra() {
  return `<button type="button" class="tl-play" aria-label="Reproducir" title="Reproducir año por año">▶</button>
    <input type="range" class="tl-rango" min="0" max="${ANIOS.length - 1}" step="1" value="${ANIOS.length - 1}" aria-label="Año de la imagen">
    <span class="tl-anio" aria-live="polite">${ANIOS[ANIOS.length - 1]}</span>
    <button type="button" class="tl-cerrar" aria-label="Cerrar cambio en el tiempo" title="Cerrar">✕</button>
    <div class="tl-marcas" aria-hidden="true"><span>${ANIOS[0]}</span><span>${ANIOS[ANIOS.length - 1]}</span></div>
    <div class="tl-opciones"><select class="tl-fuente" aria-label="Fuente de las imágenes">${Object.entries(FUENTES).map(([k, f]) => `<option value="${k}">${f.nombre}</option>`).join("")}</select>
      <label class="tl-dia" hidden>Día <input type="text" class="tl-dia-in" value="04-15" size="5" maxlength="5" pattern="\\d{2}-\\d{2}" aria-label="Día del año (MM-DD)"></label></div>
    <p class="tl-aviso" role="status" hidden></p>`;
}
