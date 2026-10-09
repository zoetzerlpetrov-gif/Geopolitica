// Capas en movimiento: aeronaves, buques y satélites (Fases C3 y C4).
//
// Rendimiento:
//   - Nada se descarga hasta activar la capa; en modo LITE estas capas están apagadas.
//   - Aviones y buques: solo se dibuja lo que cae en el área visible (+20 % de margen), recalculado
//     500 ms después de terminar de mover el mapa, con un tope de MAX_OBJETOS y aviso si se recorta.
//   - Íconos: una flecha (aviones) y una silueta de barco (buques) SDF que la GPU colorea y rota según el
//     rumbo (sin imágenes por objeto).
//   - Proyección: entre instantáneas (cada 20 min) la posición se proyecta con rumbo y velocidad a 4 Hz
//     (1 Hz si hay más de 2,000 visibles; en pausa mientras se mueve el mapa), como máximo 5 min hacia
//     adelante; después se congela. Por eso estado_dato = "retrasado".
//   - Satélites: SGP4 en un Web Worker que entrega GeoJSON ya armado.
/* global maplibregl */
import { getJSON, esc, debounce, pinturaEtiqueta } from "./util.js";

export const MAX_OBJETOS = 5000;
const PROYECCION_MAX_S = 300;
const HZ = 4;            // con pocos objetos
const HZ_DENSO = 1;       // con más de 2,000 visibles: rehacer 5,000 posiciones 4 veces por segundo no compensa
const DENSO = 2000;
const FONT = ["Noto Sans Regular"];

/** Flecha blanca en un lienzo; con sdf:true MapLibre la tiñe del color de cada subtipo. */
function imagenFlecha(tam = 32) {
  const c = document.createElement("canvas");
  c.width = c.height = tam;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(tam / 2, 2); g.lineTo(tam - 6, tam - 4); g.lineTo(tam / 2, tam - 10); g.lineTo(6, tam - 4);
  g.closePath(); g.fill();
  return g.getImageData(0, 0, tam, tam);
}

/** Silueta de barco vista desde arriba (proa arriba): casco con proa en punta y popa recta. También SDF. */
function imagenBarco(tam = 32) {
  const c = document.createElement("canvas");
  c.width = c.height = tam;
  const g = c.getContext("2d");
  const m = tam / 2;
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(m, 1);                                   // proa
  g.quadraticCurveTo(m + 9, 8, m + 7, 16);          // costado de estribor
  g.lineTo(m + 6, tam - 3);
  g.lineTo(m - 6, tam - 3);                         // popa recta
  g.lineTo(m - 7, 16);
  g.quadraticCurveTo(m - 9, 8, m, 1);               // costado de babor
  g.closePath(); g.fill();
  return g.getImageData(0, 0, tam, tam);
}

/** Avanza una posición `seg` segundos según rumbo (grados) y velocidad (km/h). Aproximación plana, suficiente para minutos. */
export function proyectar(lon, lat, rumbo, kmh, seg) {
  const km = (kmh * seg) / 3600;
  const r = (rumbo * Math.PI) / 180;
  const dLat = (km * Math.cos(r)) / 111.32;
  const dLon = (km * Math.sin(r)) / (111.32 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  let x = lon + dLon;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return [x, Math.max(-85, Math.min(85, lat + dLat))];
}

/** Filtra filas compactas al rectángulo visible y a los subtipos activos; respeta el tope. */
export function recortar(filas, { iLon, iLat, iSt }, caja, subtipos, max = MAX_OBJETOS) {
  const [[o, s], [e, n]] = caja;
  const cruza = e < o; // la vista atraviesa el antimeridiano
  const dentro = [];
  let total = 0;
  for (const f of filas) {
    if (!subtipos.has(f[iSt])) continue;
    const x = f[iLon], y = f[iLat];
    if (y < s || y > n || (cruza ? x < o && x > e : x < o || x > e)) continue;
    total++;
    if (dentro.length < max) dentro.push(f);
  }
  return { filas: dentro, total, recortado: total > max };
}

export class Movimiento {
  constructor(map, { catalogo, onObjeto, onCambio, onAviso }) {
    this.map = map;
    this.onObjeto = onObjeto;
    this.onCambio = onCambio;
    this.onAviso = onAviso;
    this.cat = Object.fromEntries(catalogo.categorias.filter((c) => ["aeronaves", "buques", "satelites"].includes(c.id)).map((c) => [c.id, c]));
    this.activas = new Map();     // tipo -> Set(subtipos)
    this.datos = {};              // tipo -> {generado, filas, campos}
    this.blob = {};
    this.worker = null;
    this.reloj = null;
    this.alMover = debounce(() => this.#redibujarTodo(), 500);
    map.on("moveend", this.alMover);
  }

  async activar(tipo) {
    if (this.activas.has(tipo)) return;
    // Subtipos con inicial:false (p. ej. Starlink, ~8,000 satélites) empiezan apagados.
    const subtipos = new Set(this.cat[tipo].subtipos.filter((s) => s.inicial !== false).map((s) => (tipo === "satelites" ? s.grupo : s.id)));
    if (tipo === "satelites") {
      const d = await getJSON("data/vivos/satelites.json", { bust: true });
      this.worker ??= new Worker("js/sat-worker.js");
      this.worker.onmessage = (e) => {
        if (e.data.tipo === "orbita") { this.#esperas.get(e.data.id)?.(e.data); this.#esperas.delete(e.data.id); return; }
        this.#pintarSatelites(e.data);
      };
      this.worker.postMessage({ tipo: "tle", grupos: d.grupos });
      this.datos.satelites = { generado: d.generado_utc, aparte: new Set(d.aparte || []), cargados: new Set() };
      this.activas.set(tipo, subtipos);
      this.#instalar(tipo);
      this.worker.postMessage({ tipo: "grupos", activos: [...subtipos], intervalo: 2000 });
    } else {
      await this.#cargar(tipo);
      this.activas.set(tipo, subtipos);
      this.#instalar(tipo);
      this.#redibujar(tipo);
      this.#arrancarReloj();
    }
    this.onCambio(this.activas.size);
  }

  desactivar(tipo) {
    if (!this.activas.delete(tipo)) return;
    if (tipo === "satelites") this.worker?.postMessage({ tipo: "grupos", activos: [] });
    for (const l of [`mov-${tipo}`, `mov-${tipo}-texto`, `mov-${tipo}-toque`]) if (this.map.getLayer(l)) this.map.removeLayer(l);
    if (this.map.getSource(`mov-${tipo}`)) this.map.removeSource(`mov-${tipo}`);
    if (![...this.activas.keys()].some((t) => t !== "satelites")) { clearInterval(this.reloj); this.reloj = null; }
    this.onCambio(this.activas.size);
  }

  #esperas = new Map();

  /** Traza en tierra y elementos orbitales de un satélite (los calcula el worker). */
  orbita(id) {
    if (!this.worker) return Promise.resolve(null);
    return new Promise((ok) => {
      this.#esperas.set(id, ok);
      this.worker.postMessage({ tipo: "orbita", id });
      setTimeout(() => { if (this.#esperas.delete(id)) ok(null); }, 5000);
    });
  }

  setSubtipos(tipo, ids) {
    if (!this.activas.has(tipo)) return;
    this.activas.set(tipo, new Set(ids));
    if (tipo === "satelites") {
      // Grupos grandes en archivo propio: se descargan la primera vez que se activan.
      const d = this.datos.satelites;
      for (const g of ids.filter((x) => d.aparte.has(x) && !d.cargados.has(x))) {
        d.cargados.add(g);
        getJSON(`data/vivos/satelites-${g}.json`, { bust: true })
          .then((x) => this.worker.postMessage({ tipo: "tle", agregar: true, grupos: x.grupos, activos: [...this.activas.get("satelites")] }))
          .catch(() => d.cargados.delete(g));
      }
      this.worker.postMessage({ tipo: "grupos", activos: ids });
    } else this.#redibujar(tipo);
  }

  reinstalar() { for (const t of this.activas.keys()) { this.#instalar(t); if (t !== "satelites") this.#redibujar(t); } }

  async #cargar(tipo) {
    const n = Number(new URLSearchParams(location.search).get("aviones"));
    const d = tipo === "aeronaves" && n > 0 ? avionesSinteticos(Math.min(n, 50000)) : await getJSON(`data/vivos/${tipo}.json`, { bust: true });
    const campos = d.campos;
    this.datos[tipo] = {
      generado: d.generado_utc, campos, filas: tipo === "aeronaves" ? d.a : d.b,
      idx: { iLon: campos.indexOf("lon"), iLat: campos.indexOf("lat"), iSt: campos.indexOf("subtipo") },
    };
  }

  #instalar(tipo) {
    const src = `mov-${tipo}`;
    if (this.map.getSource(src)) return;
    if (!this.map.hasImage("flecha")) this.map.addImage("flecha", imagenFlecha(), { sdf: true });
    if (!this.map.hasImage("barco")) this.map.addImage("barco", imagenBarco(), { sdf: true });
    this.map.addSource(src, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const subtipos = this.cat[tipo].subtipos;
    const color = ["match", ["get", "st"]];
    const vistos = new Set();
    for (const s of subtipos) {
      const clave = tipo === "satelites" ? s.grupo : s.id;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      color.push(clave, s.color);
    }
    color.push("#888888");
    if (tipo === "satelites") {
      this.map.addLayer({ id: src, type: "circle", source: src,
        // Geoestacionarios y Starlink más pequeños y sin borde: son muchos y no deben tapar al resto.
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, ["match", ["get", "st"], ["geo", "starlink"], 1.3, 2], 6, ["match", ["get", "st"], ["geo", "starlink"], 2.5, 4]],
          "circle-color": color, "circle-opacity": ["match", ["get", "st"], ["geo", "starlink"], 0.7, 1],
          "circle-stroke-width": ["match", ["get", "st"], ["geo", "starlink"], 0, 0.8], "circle-stroke-color": "#ffffff" } });
    } else {
      this.map.addLayer({ id: src, type: "symbol", source: src,
        layout: { "icon-image": tipo === "buques" ? "barco" : "flecha", "icon-size": ["interpolate", ["linear"], ["zoom"], 1, 0.35, 8, tipo === "buques" ? 0.75 : 0.6], "icon-rotate": ["get", "r"],
          "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true },
        paint: { "icon-color": color, "icon-halo-color": "#ffffff", "icon-halo-width": 0.8 } });
    }
    this.map.addLayer({ id: `${src}-texto`, type: "symbol", source: src, minzoom: 7,
      layout: { "text-field": ["get", "n"], "text-font": FONT, "text-size": 10, "text-offset": [0, 1.2], "text-anchor": "top", "text-optional": true },
      paint: pinturaEtiqueta() });
    // Zona de toque invisible (8 px de radio): los Starlink miden 1.3 px y serían imposibles de elegir.
    this.map.addLayer({ id: `${src}-toque`, type: "circle", source: src, paint: { "circle-radius": 8, "circle-opacity": 0, "circle-stroke-width": 0 } });
    this.map.on("click", `${src}-toque`, (e) => {
      // El más cercano al clic (puede haber varios dentro de la zona de toque).
      const f = e.features.reduce((a, x) => { const q = this.map.project(x.geometry.coordinates), d = (q.x - e.point.x) ** 2 + (q.y - e.point.y) ** 2; return !a || d < a.d ? { x, d } : a; }, null).x;
      this.onObjeto({ tipo, props: f.properties, generado: this.datos[tipo]?.generado, campos: this.datos[tipo]?.campos, coords: f.geometry.coordinates });
    });
    this.map.on("mouseenter", `${src}-toque`, () => { this.map.getCanvas().style.cursor = "pointer"; });
    this.map.on("mouseleave", `${src}-toque`, () => { this.map.getCanvas().style.cursor = ""; });
  }

  #redibujarTodo() { for (const t of this.activas.keys()) if (t !== "satelites") this.#redibujar(t); }

  #redibujar(tipo, proyectar_ = false) {
    const d = this.datos[tipo];
    if (!d || !this.activas.has(tipo)) return;
    const b = this.map.getBounds();
    const mx = (b.getEast() - b.getWest()) * 0.2, my = (b.getNorth() - b.getSouth()) * 0.2;
    const caja = [[Math.max(-180, b.getWest() - mx), Math.max(-90, b.getSouth() - my)], [Math.min(180, b.getEast() + mx), Math.min(90, b.getNorth() + my)]];
    if (b.getEast() - b.getWest() >= 360) { caja[0][0] = -180; caja[1][0] = 180; }
    const { filas, total, recortado } = recortar(d.filas, d.idx, caja, this.activas.get(tipo));
    this.visibles = (this.visibles || {});
    this.visibles[tipo] = filas.length;
    this.onAviso(tipo, recortado ? `Mostrando ${MAX_OBJETOS.toLocaleString("es-MX")} de ${total.toLocaleString("es-MX")} ${tipo} en esta vista. Acerca el mapa o filtra subtipos.` : "");
    const c = d.campos;
    const iR = c.indexOf("rumbo"), iV = c.indexOf(tipo === "aeronaves" ? "vel_kmh" : "vel_nudos"), iE = c.indexOf("edad_s");
    const iId = 0, iN = 1;
    const edadSnap = (Date.now() - new Date(d.generado).getTime()) / 1000;
    const partes = filas.map((f) => {
      let lon = f[d.idx.iLon], lat = f[d.idx.iLat];
      if (proyectar_) {
        const seg = Math.min(PROYECCION_MAX_S, edadSnap + (f[iE] || 0));
        const kmh = tipo === "aeronaves" ? f[iV] : f[iV] * 1.852;
        if (kmh > 0) [lon, lat] = proyectar(lon, lat, f[iR] || 0, kmh, seg);
      }
      return `{"type":"Feature","geometry":{"type":"Point","coordinates":[${lon},${lat}]},"properties":{"id":${JSON.stringify(String(f[iId]))},"n":${JSON.stringify(f[iN] || "")},"st":"${f[d.idx.iSt]}","r":${f[iR] || 0},"f":${JSON.stringify(f)}}}`;
    });
    this.#publicar(tipo, `{"type":"FeatureCollection","features":[${partes.join(",")}]}`);
  }

  #publicar(tipo, texto) {
    const previo = this.blob[tipo];
    this.blob[tipo] = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
    this.map.getSource(`mov-${tipo}`)?.setData(this.blob[tipo]);
    if (previo) setTimeout(() => URL.revokeObjectURL(previo), 3000);
  }

  #pintarSatelites(m) {
    if (!this.activas.has("satelites")) return;
    this.#publicar("satelites", m.geojson);
  }

  #arrancarReloj() {
    if (this.reloj) return;
    // Proyección a 4 Hz (no a 60): suficiente para que se vea movimiento y barato para la GPU.
    let ultimo = 0;
    const paso = (t) => {
      if (!this.reloj) return;
      const visibles = Object.values(this.visibles || {}).reduce((a, b) => a + b, 0);
      const hz = visibles > DENSO ? HZ_DENSO : HZ;
      // Mientras el usuario mueve el mapa no se proyecta: el paneo y el zoom tienen prioridad.
      if (t - ultimo > 1000 / hz && !document.hidden && !this.map.isMoving()) {
        ultimo = t;
        for (const tipo of this.activas.keys()) if (tipo !== "satelites") this.#redibujar(tipo, true);
      }
      requestAnimationFrame(paso);
    };
    this.reloj = setInterval(async () => { // cada 5 min se busca una instantánea nueva
      for (const tipo of this.activas.keys()) {
        if (tipo === "satelites") continue;
        const antes = this.datos[tipo]?.generado;
        await this.#cargar(tipo).catch(() => null);
        if (this.datos[tipo]?.generado !== antes) { dispatchEvent(new Event("vivos-actualizados")); this.#redibujar(tipo); }
      }
    }, 300000);
    requestAnimationFrame(paso);
  }
}

/** Prueba de carga (?aviones=5000): aviones ficticios con rumbo y velocidad, marcados como sintéticos. */
function avionesSinteticos(n) {
  const st = ["civil_comercial", "carga", "aviacion_general", "militar", "estado"];
  const a = [];
  for (let i = 0; i < n; i++) {
    a.push([`sint${i}`, `TEST${i}`, +(Math.random() * 360 - 180).toFixed(3), +(Math.random() * 130 - 60).toFixed(3), 10000, Math.round(Math.random() * 360), 800, st[i % st.length], "Prueba", 0]);
  }
  return { generado_utc: new Date().toISOString(), campos: ["hex", "indicativo", "lon", "lat", "alt_m", "rumbo", "vel_kmh", "subtipo", "pais", "edad_s"], a };
}

/** Fila compacta + nombres de campo → objeto (las instantáneas viejas traen menos campos). */
export function vueloDeFila(f, campos) {
  const v = {};
  campos.forEach((c, i) => { v[c] = f[i]; });
  return v;
}

export const SUB = (cat, id) => cat?.subtipos.find((s) => s.id === id || s.grupo === id)?.nombre.es || id;

/** Ficha de un objeto en movimiento. Sin propietarios ni vínculos con personas. */
export function htmlFichaMovil({ tipo, props, generado }, catalogo) {
  const cat = catalogo.categorias.find((c) => c.id === tipo);
  const edad = generado ? Math.round((Date.now() - new Date(generado).getTime()) / 60000) : null;
  if (tipo === "satelites") {
    const norad = String(props.id).replace("sat:", "");
    return `<h3 id="ficha-titulo">${esc(props.n)}</h3>
      <div class="fecha">${esc(SUB(cat, props.st))} · NORAD ${esc(norad)}</div>
      <div class="chips"><span class="chip estado-estimado">Dato estimado (SGP4)</span></div>
      <dl><dt>Altitud</dt><dd>${esc(props.alt)} km</dd><dt>TLE</dt><dd>${edad != null ? `de hace ${edad} min` : "—"}</dd>
      <dt>Fuente</dt><dd><a href="https://celestrak.org/satcat/search.php?CATNR=${encodeURIComponent(norad)}" target="_blank" rel="noopener noreferrer">CelesTrak</a></dd></dl>
      <p class="meta">Posición calculada en tu navegador a partir de elementos orbitales públicos; puede desviarse varios km.</p>`;
  }
  const f = JSON.parse(props.f);
  if (tipo === "aeronaves") {
    const [hex, cs, , , alt, rumbo, vel, st, pais] = f;
    return `<h3 id="ficha-titulo">${esc(cs || hex)}</h3>
      <div class="fecha">${esc(SUB(cat, st))}${pais ? " · " + esc(pais) : ""}</div>
      <div class="chips"><span class="chip estado-retrasado">Dato retrasado${edad != null ? ` · instantánea de hace ${edad} min` : ""}</span></div>
      <dl><dt>ICAO 24 bits</dt><dd>${esc(hex)}</dd><dt>Altitud</dt><dd>${esc(alt)} m</dd><dt>Velocidad</dt><dd>${esc(vel)} km/h</dd><dt>Rumbo</dt><dd>${esc(rumbo)}°</dd>
      <dt>Ver en</dt><dd><a href="https://globe.adsb.lol/?icao=${encodeURIComponent(hex)}" target="_blank" rel="noopener noreferrer">adsb.lol</a></dd></dl>
      <p class="meta">La posición se proyecta como máximo 5 min desde la instantánea. No se muestra propietario ni se vincula con personas.</p>`;
  }
  const [mmsi, nombre, , , rumbo, vel, st, imo] = f;
  return `<h3 id="ficha-titulo">${esc(nombre || "MMSI " + mmsi)}</h3>
    <div class="fecha">${esc(SUB(cat, st))}</div>
    <div class="chips"><span class="chip estado-retrasado">Dato retrasado${edad != null ? ` · hace ${edad} min` : ""}</span>${st === "sancionados" ? `<span class="chip alerta alerta-FLASH">En lista SDN (OFAC)</span>` : ""}</div>
    <dl><dt>MMSI</dt><dd>${esc(mmsi)}</dd><dt>IMO</dt><dd>${imo ? esc(imo) : "—"}</dd><dt>Velocidad</dt><dd>${esc(vel)} nudos</dd><dt>Rumbo</dt><dd>${esc(rumbo)}°</dd></dl>`;
}
