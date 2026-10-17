// Modelos 3D animados dibujados DENTRO del mapa, anclados a la coordenada del elemento (three.js r170, vendor/three, MIT).
// Se usa una capa «custom» de MapLibre que comparte el WebGL del mapa: el modelo queda en su lugar real, en el globo o en el
// plano, y se mueve con el mapa. Cada constructor arma una escena procedural (sin archivos 3D de terceros) en unidades de
// escena y devuelve {grupo, animar(t, dt), metros (m por unidad), zoom, pitch} y, para vehículos, `pantalla` (tamaño
// constante en pantalla). La forma y los parámetros vienen de js/modelos3d.js. Todo es ilustrativo.
import * as THREE from "../vendor/three/three.module.min.js";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js";

const MOVIMIENTO_REDUCIDO = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const azar = (a, b) => a + Math.random() * (b - a);

// ---------- Utilidades de materiales y texturas ----------
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...o });

function texturaCanvas(w, h, dibujar) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  dibujar(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const texturaSuave = () => texturaCanvas(64, 64, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.4, "rgba(255,255,255,0.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
const texturaHumo = () => texturaCanvas(128, 128, (g, w) => {
  for (let i = 0; i < 9; i++) {
    const x = azar(0.3, 0.7) * w, y = azar(0.3, 0.7) * w, rr = azar(0.18, 0.32) * w;
    const r = g.createRadialGradient(x, y, 0, x, y, rr);
    r.addColorStop(0, "rgba(255,255,255,0.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  }
});
const texturaPanelSolar = (base = "#16264a", linea = "#5d7bb8") => texturaCanvas(256, 128, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  g.strokeStyle = linea; g.lineWidth = 2;
  for (let x = 0; x <= w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
});

// ---------- Partículas (fuego, humo, vapor, nubes, lluvia, agua) ----------
const VERT = `attribute float tam; attribute float alfa; attribute vec3 tinte; uniform float escala; uniform float maximo;
varying float vA; varying vec3 vC;
void main() { vA = alfa; vC = tinte; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(tam * escala / max(gl_Position.w, 1e-6), maximo); }`;
const FRAG = `uniform sampler2D mapa; varying float vA; varying vec3 vC;
void main() { vec4 t = texture2D(mapa, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); }`;

/**
 * Sistema de n partículas; p.tam es el diámetro en unidades de la escena. nacer(p) fija posición (p.x, p.y, p.z), velocidad, vida, tamaño, alfa y color (p.c = THREE.Color);
 * mover(p, dt) la actualiza. Las que se quedan sin vida vuelven a nacer.
 */
class Particulas {
  constructor(n, { textura, aditivo = false, nacer, mover, escala }) {
    this.n = n; this.nacer = nacer; this.mover = mover;
    this.p = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, vida: 0, max: 1, tam: 1, alfa: 1, c: new THREE.Color(1, 1, 1) }));
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.tam = new Float32Array(n); this.alfa = new Float32Array(n); this.tinte = new Float32Array(n * 3);
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("tam", new THREE.BufferAttribute(this.tam, 1));
    g.setAttribute("alfa", new THREE.BufferAttribute(this.alfa, 1));
    g.setAttribute("tinte", new THREE.BufferAttribute(this.tinte, 3));
    this.uniformes = { mapa: { value: textura }, escala: escala || { value: 900 }, maximo: MAXIMO_PX };
    const m = new THREE.ShaderMaterial({ uniforms: this.uniformes, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.obj = new THREE.Points(g, m);
    this.obj.frustumCulled = false;
    // Escalonadas y ya avanzadas, para que la escena no arranque vacía.
    for (const p of this.p) {
      this.nacer(p);
      if (p.max > 1e6) continue; // permanentes (nubes fijas)
      const pasado = Math.random() * p.max;
      p.vida = p.max - pasado;
      for (let k = 0, n = Math.min(60, Math.ceil(pasado / 0.1)); k < n; k++) this.mover(p, pasado / n);
    }
  }
  actualizar(dt) {
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i];
      p.vida -= dt;
      if (p.vida <= 0) { this.nacer(p); p.vida = p.max; }
      this.mover(p, dt);
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.tam[i] = p.tam; this.alfa[i] = p.alfa;
      this.tinte[i * 3] = p.c.r; this.tinte[i * 3 + 1] = p.c.g; this.tinte[i * 3 + 2] = p.c.b;
    }
    const a = this.obj.geometry.attributes;
    a.position.needsUpdate = a.tam.needsUpdate = a.alfa.needsUpdate = a.tinte.needsUpdate = true;
  }
}
/** Fracción de vida transcurrida (0 al nacer, 1 al morir). */
const edad = (p) => 1 - p.vida / p.max;
// Tope del tamaño en pantalla: partículas enormes llenan la GPU de trabajo (sobre todo en teléfonos).
const MAXIMO_PX = { value: 320 };
// Diámetro (unidades) → píxeles: lo recalcula la capa en cada cuadro según el zoom; lo comparten todas las partículas.
const ESCALA = { value: 900 };

// ---------- Piezas comunes ----------
function sol(grupo, x = 30, y = 50, z = 20, intensidad = 2.4) {
  const l = new THREE.DirectionalLight(0xffffff, intensidad);
  l.position.set(x, y, z);
  grupo.add(l, new THREE.HemisphereLight(0xdfefff, 0x4a4030, 0.6));
  return l;
}
function sombras(o) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }

// ---------- Avión ----------
function fuselaje(L, r, colorCuerpo) {
  const pts = [];
  for (let i = 0; i <= 24; i++) { // perfil de cola (fino) a nariz (redondeada), eje Y = largo
    const y = (i / 24) * L, u = y / L;
    const rad = u < 0.22 ? r * (0.18 + 0.82 * Math.sin((u / 0.22) * Math.PI / 2)) : u < 0.86 ? r : r * Math.sqrt(Math.max(0, 1 - ((u - 0.86) / 0.14) ** 2));
    pts.push(new THREE.Vector2(Math.max(rad, 0.001), y));
  }
  const g = new THREE.LatheGeometry(pts, 32);
  g.rotateZ(-Math.PI / 2); // largo sobre +X (nariz hacia +X)
  g.translate(-L / 2, 0, 0);
  return new THREE.Mesh(g, mat(colorCuerpo, { metalness: 0.35, roughness: 0.32 }));
}
/** Ala (o estabilizador) en planta: raíz en z=0, punta en z=±env; flecha hacia atrás. */
function ala(raiz, punta, env, flecha, grosor, lado, material) {
  const s = new THREE.Shape();
  const dx = Math.tan(flecha) * env;
  s.moveTo(0, 0); s.lineTo(-dx, env * lado); s.lineTo(-dx - punta, env * lado); s.lineTo(-raiz, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: grosor, bevelEnabled: true, bevelThickness: grosor * 0.3, bevelSize: grosor * 0.3, bevelSegments: 2 });
  g.rotateX(Math.PI / 2); // planta en el plano XZ; el grosor queda hacia −Y
  g.translate(0, grosor / 2, 0);
  return new THREE.Mesh(g, material);
}
function deriva(raiz, punta, alto, flecha, grosor, material) {
  const s = new THREE.Shape();
  const dx = Math.tan(flecha) * alto;
  s.moveTo(0, 0); s.lineTo(-dx, alto); s.lineTo(-dx - punta, alto); s.lineTo(-raiz, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: grosor, bevelEnabled: false });
  g.translate(0, 0, -grosor / 2);
  return new THREE.Mesh(g, material);
}
function helice(radio, palas = 4, color = "#20242a") {
  const g = new THREE.Group();
  for (let i = 0; i < palas; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, radio * 2, 0.16), mat(color, { metalness: 0.6 }));
    p.rotation.x = (i / palas) * Math.PI; g.add(p);
  }
  return g;
}

function construirAvion(m) {
  const g = new THREE.Group();
  const forma = m.forma;
  const militar = forma === "caza" || m.cola === "#4B5560";
  const cuerpo = militar ? "#7d868f" : "#f4f6f8";
  const cola = mat(m.cola || "#2B4C7E", { metalness: 0.3, roughness: 0.35 });
  const gris = mat("#b7bec6", { metalness: 0.5, roughness: 0.35 });
  const giran = [];
  if (forma === "helicoptero") {
    const cab = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 20), mat(militar ? "#56605a" : m.cola, { metalness: 0.3, roughness: 0.4 }));
    cab.scale.set(1.6, 1, 1);
    const vidrio = new THREE.Mesh(new THREE.SphereGeometry(1.2, 24, 16, 0, Math.PI, 0, Math.PI / 2), mat("#16222c", { metalness: 0.9, roughness: 0.08 }));
    vidrio.position.set(1.1, 0.25, 0); vidrio.rotation.z = -Math.PI / 2.4; vidrio.rotation.y = Math.PI / 2;
    const viga = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 5.5, 12), mat(cab.material.color.getStyle()));
    viga.rotation.z = Math.PI / 2; viga.position.set(-4.2, 0.35, 0);
    const der = deriva(1.2, 0.6, 1.4, 0.6, 0.12, cola); der.position.set(-6.2, 0.4, 0);
    const mastil = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.7, 10), gris); mastil.position.y = 1.7;
    const rotor = new THREE.Group(); rotor.position.y = 2.05;
    for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.38), mat("#23272c")); p.rotation.y = (i / 4) * Math.PI; rotor.add(p); }
    const colaRotor = helice(0.8, 2); colaRotor.rotation.y = Math.PI / 2; colaRotor.position.set(-6.6, 1.2, 0.25);
    const patines = new THREE.Group();
    for (const z of [-0.9, 0.9]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.6, 8), gris); s.rotation.z = Math.PI / 2; s.position.set(0, -1.6, z); patines.add(s); }
    g.add(cab, vidrio, viga, der, mastil, rotor, colaRotor, patines);
    giran.push([rotor, "y", 14], [colaRotor, "x", 40]);
  } else {
    const dims = { ancho4: [17, 1.15, 0.62], ancho: [16, 1.1, 0.58], angosto: [12, 0.78, 0.52], regional: [9.5, 0.62, 0.5], turbohelice: [8.5, 0.6, 0.55], caza: [9, 0.5, 0.5] }[forma] || [12, 0.78, 0.52];
    const [L, r, envFrac] = dims;
    const fus = fuselaje(L, r, cuerpo);
    g.add(fus);
    if (forma === "caza") {
      const s = new THREE.Shape(); s.moveTo(1.2, 0); s.lineTo(-2.6, 3.4); s.lineTo(-3.4, 3.4); s.lineTo(-3.6, 0); s.closePath();
      for (const lado of [1, -1]) {
        const sh = new THREE.Shape(); sh.moveTo(1.2, 0); sh.lineTo(-2.6, 3.4 * lado); sh.lineTo(-3.4, 3.4 * lado); sh.lineTo(-3.6, 0); sh.closePath();
        const gg = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false }); gg.rotateX(Math.PI / 2);
        const w = new THREE.Mesh(gg, mat(cuerpo, { metalness: 0.45, roughness: 0.4 })); g.add(w);
        const fin = deriva(1.6, 0.6, 1.9, 0.75, 0.08, mat(cuerpo, { metalness: 0.45 })); fin.position.set(-2.6, 0.2, 0.55 * lado); fin.rotation.x = -0.25 * lado; g.add(fin);
      }
      const cabina = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat("#1b2733", { metalness: 0.9, roughness: 0.05 }));
      cabina.scale.set(2.4, 1, 1); cabina.position.set(2.3, 0.35, 0); g.add(cabina);
      const tobera = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.7, 16, 1, true), mat("#2b2b2b", { metalness: 0.8, side: THREE.DoubleSide }));
      tobera.rotation.z = Math.PI / 2; tobera.position.x = -4.7; g.add(tobera);
    } else {
      const env = L * envFrac;
      const altoAla = forma === "turbohelice" ? r * 0.75 : -r * 0.45;
      const alaMat = mat(militar ? "#848d96" : "#d9dee3", { metalness: 0.45, roughness: 0.35 });
      for (const lado of [1, -1]) {
        const w = ala(L * 0.2, L * 0.07, env, forma === "turbohelice" ? 0.05 : 0.5, 0.12, lado, alaMat);
        w.position.set(L * 0.1, altoAla, 0); w.rotation.x = 0.06 * lado * (forma === "turbohelice" ? 0 : 1); g.add(w);
        const est = ala(L * 0.09, L * 0.04, env * 0.36, 0.55, 0.07, lado, alaMat);
        est.position.set(-L * 0.38, r * 0.15, 0); g.add(est);
        // Aletas en la punta (winglets) para jets.
        if (forma !== "turbohelice") { const wl = deriva(L * 0.05, L * 0.025, r * 1.1, 0.6, 0.05, cola); wl.position.set(L * 0.1 - Math.tan(0.5) * env, altoAla, env * lado); wl.rotation.x = -0.2 * lado; g.add(wl); }
        const motores = forma === "ancho4" ? [0.33, 0.62] : [0.33];
        for (const f of motores) {
          const z = env * f * lado, x = L * 0.1 - Math.tan(forma === "turbohelice" ? 0.05 : 0.5) * env * f;
          if (forma === "turbohelice") {
            const nac = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.3, L * 0.22, 16), mat(cuerpo, { metalness: 0.4 }));
            nac.rotation.z = Math.PI / 2; nac.position.set(x + L * 0.05, altoAla, z); g.add(nac);
            const h = helice(r * 1.5, 6); h.position.set(x + L * 0.17, altoAla, z); g.add(h); giran.push([h, "x", 30]);
          } else {
            const rm = forma.startsWith("ancho") ? r * 0.5 : r * 0.42, lm = L * 0.17;
            const nac = new THREE.Mesh(new THREE.CylinderGeometry(rm, rm * 0.8, lm, 24, 1, true), mat(cuerpo, { metalness: 0.4, roughness: 0.3, side: THREE.DoubleSide }));
            nac.rotation.z = Math.PI / 2; nac.position.set(x + lm * 0.35, altoAla - rm * 1.15, z); g.add(nac);
            const labio = new THREE.Mesh(new THREE.TorusGeometry(rm * 0.95, rm * 0.09, 10, 28), gris); labio.rotation.y = Math.PI / 2; labio.position.set(x + lm * 0.85, altoAla - rm * 1.15, z); g.add(labio);
            const fan = helice(rm * 0.85, 18, "#3a3f46"); fan.position.set(x + lm * 0.78, altoAla - rm * 1.15, z); g.add(fan); giran.push([fan, "x", 22]);
            const cono = new THREE.Mesh(new THREE.ConeGeometry(rm * 0.22, rm * 0.5, 16), gris); cono.rotation.z = -Math.PI / 2; cono.position.set(x + lm * 0.85, altoAla - rm * 1.15, z); g.add(cono);
            const pilon = new THREE.Mesh(new THREE.BoxGeometry(lm * 0.6, rm * 0.7, 0.08), alaMat); pilon.position.set(x + lm * 0.2, altoAla - rm * 0.45, z); g.add(pilon);
          }
        }
      }
      const fin = deriva(L * 0.2, L * 0.08, r * 2.6, 0.7, 0.12, cola);
      fin.position.set(-L * 0.3, r * 0.5, 0); g.add(fin);
      // Franja de ventanas y parabrisas.
      for (const lado of [1, -1]) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(L * 0.6, r * 0.13, 0.02), mat("#1d2733", { metalness: 0.6, roughness: 0.2 }));
        v.position.set(L * 0.03, r * 0.28, (r + 0.005) * lado); g.add(v);
        const linea = new THREE.Mesh(new THREE.BoxGeometry(L * 0.7, r * 0.09, 0.02), cola);
        linea.position.set(0, -r * 0.05, (r * 0.995) * lado); g.add(linea);
      }
      const para = new THREE.Mesh(new THREE.SphereGeometry(r * 0.62, 20, 10, -Math.PI / 2, Math.PI, 0.9, 0.55), mat("#16212b", { metalness: 0.9, roughness: 0.05 }));
      para.position.set(L * 0.38, r * 0.05, 0); para.rotation.z = -0.35; g.add(para);
    }
  }
  sombras(g);
  const raiz = new THREE.Group(); raiz.add(g);
  raiz.rotation.y = rumboAGiro(m.rumbo); // la nariz (+X) apunta al rumbo de la última señal
  sol(raiz, 20, 40, 25, 2.2);
  return {
    grupo: raiz, pantalla: { px: 110, unidades: 14 },
    animar: (t, dt) => {
      g.rotation.x = Math.sin(t * 0.5) * 0.06; g.rotation.z = Math.sin(t * 0.35) * 0.025; g.position.y = Math.sin(t * 0.8) * 0.15;
      for (const [o, eje, v] of giran) o.rotation[eje] += v * dt;
    },
  };
}

// ---------- Barco ----------
function casco(L, W, alto, color, proa = 0.25) {
  const s = new THREE.Shape();
  s.moveTo(-L / 2, -W / 2); s.lineTo(L / 2 - L * proa, -W / 2);
  s.quadraticCurveTo(L / 2, -W * 0.35, L / 2, 0); s.quadraticCurveTo(L / 2, W * 0.35, L / 2 - L * proa, W / 2);
  s.lineTo(-L / 2, W / 2); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: alto, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2);
  return new THREE.Mesh(g, mat(color, { roughness: 0.5, metalness: 0.2 }));
}
function caja(w, h, d, color, x, y, z, o = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o));
  m.position.set(x, y + h / 2, z);
  return m;
}
function puente(g, x, y, ancho, pisos, color = "#f2f2ee") {
  for (let i = 0; i < pisos; i++) {
    g.add(caja(1.6 - i * 0.1, 0.55, ancho - i * 0.15, color, x, y + i * 0.55, 0));
    g.add(caja(0.02, 0.18, ancho - i * 0.15 - 0.1, "#1d2733", x + 0.8 - i * 0.05 + 0.01, y + i * 0.55 + 0.25, 0, { metalness: 0.7, roughness: 0.15 }));
  }
  return y + pisos * 0.55;
}
function construirBarco(m) {
  const g = new THREE.Group();
  const f = m.forma;
  const [L, W, colorCasco] = { carga: [16, 2.6, "#1f3b5c"], tanquero: [16, 2.8, "#3a2a2a"], pasaje: [15, 2.4, "#f4f4f2"], pesca: [7, 1.8, "#b2302c"],
    militar: [14, 1.9, "#7d868f"], vela: [6.5, 1.5, "#f5f5f2"], remolcador: [5.5, 2, "#c0392b"] }[f] || [16, 2.6, "#1f3b5c"];
  const obra = casco(L, W, 0.55, "#8e2a22"); obra.position.y = -0.35; g.add(obra);
  const c = casco(L, W, 1.0, colorCasco); c.position.y = 0.2; g.add(c);
  const cubierta = 1.25;
  if (f === "carga") {
    const colores = ["#c0392b", "#2c6e9e", "#e2a33b", "#2e8b57", "#7a4b9c", "#d35400", "#95a5a6", "#16a085"];
    for (let x = -L / 2 + 3; x < L / 2 - 3.2; x += 0.9) for (let z = -W / 2 + 0.35; z < W / 2 - 0.3; z += 0.42) {
      const pisos = 1 + Math.floor(Math.random() * 4);
      for (let k = 0; k < pisos; k++) g.add(caja(0.85, 0.38, 0.4, colores[(Math.random() * colores.length) | 0], x, cubierta + k * 0.39, z, { roughness: 0.7 }));
    }
    const y = puente(g, -L / 2 + 1.3, cubierta, W * 0.9, 4);
    g.add(caja(0.5, 0.9, 0.5, "#222", -L / 2 + 0.6, cubierta, 0));
    g.add(caja(0.08, 0.8, 0.08, "#ddd", -L / 2 + 1.3, y, 0));
  } else if (f === "tanquero") {
    g.add(caja(L * 0.72, 0.08, W * 0.9, "#6b2a22", 0.6, cubierta, 0));
    for (const z of [-0.4, 0, 0.4]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, L * 0.7, 10), mat("#d8d8d0", { metalness: 0.6 })); t.rotation.z = Math.PI / 2; t.position.set(0.6, cubierta + 0.2, z); g.add(t); }
    g.add(caja(0.6, 0.6, 1.6, "#d8d8d0", 0.8, cubierta, 0));
    puente(g, -L / 2 + 1.4, cubierta, W * 0.85, 4);
    g.add(caja(0.6, 1.0, 0.6, "#c0392b", -L / 2 + 0.5, cubierta, 0));
  } else if (f === "pasaje") {
    for (let i = 0; i < 6; i++) {
      const largo = L * (0.8 - i * 0.07);
      g.add(caja(largo, 0.48, W * 0.94 - i * 0.08, "#fafafa", -0.6 + i * 0.15, cubierta + i * 0.5, 0));
      for (const lado of [1, -1]) g.add(caja(largo * 0.94, 0.14, 0.02, "#1f4e79", -0.6 + i * 0.15, cubierta + i * 0.5 + 0.2, (W * 0.47 - i * 0.04 + 0.011) * lado, { metalness: 0.6, roughness: 0.15 }));
    }
    g.add(caja(1.1, 0.9, 0.8, "#1f4e79", -L * 0.25, cubierta + 3, 0));
  } else if (f === "pesca") {
    puente(g, 1.2, cubierta, W * 0.8, 2);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 8), mat("#e3e3e3")); mast.position.set(-0.6, cubierta + 1.5, 0); g.add(mast);
    const pluma = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 8), mat("#e3e3e3")); pluma.rotation.z = 1; pluma.position.set(-1.8, cubierta + 1.6, 0); g.add(pluma);
  } else if (f === "militar") {
    g.add(caja(L * 0.3, 1.2, W * 0.75, "#7d868f", -0.5, cubierta, 0));
    g.add(caja(L * 0.15, 0.8, W * 0.6, "#737c85", -0.4, cubierta + 1.2, 0));
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.6, 8), mat("#6b737b")); mast.position.set(-0.6, cubierta + 3.2, 0); g.add(mast);
    const torreta = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.45, 16), mat("#737c85")); torreta.position.set(L * 0.28, cubierta + 0.22, 0); g.add(torreta);
    const canon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 10), mat("#5c636a")); canon.rotation.z = Math.PI / 2; canon.position.set(L * 0.28 + 0.9, cubierta + 0.3, 0); g.add(canon);
  } else if (f === "vela") {
    g.add(caja(1.6, 0.4, 0.9, "#f0ebe0", -0.4, cubierta, 0));
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 7.5, 8), mat("#cfcfcf", { metalness: 0.7 })); mast.position.set(0.6, cubierta + 3.75, 0); g.add(mast);
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0, 7); s.lineTo(-3.2, 0.2); s.closePath();
    const vela = new THREE.Mesh(new THREE.ShapeGeometry(s), mat("#fbfbf7", { side: THREE.DoubleSide, roughness: 0.8 })); vela.position.set(0.55, cubierta + 0.3, 0); g.add(vela);
    const s2 = new THREE.Shape(); s2.moveTo(0, 0); s2.lineTo(0, 6.4); s2.lineTo(2.6, 0); s2.closePath();
    const foque = new THREE.Mesh(new THREE.ShapeGeometry(s2), vela.material); foque.position.set(0.65, cubierta + 0.4, 0); g.add(foque);
  } else {
    const y = puente(g, 0.4, cubierta, W * 0.8, 3, "#f4f4f2");
    g.add(caja(0.4, 0.8, 0.4, "#222", -0.6, cubierta, 0));
    g.add(caja(0.06, 1, 0.06, "#ddd", 0.4, y, 0));
  }
  sombras(g);
  const raiz = new THREE.Group(); raiz.add(g);
  raiz.rotation.y = rumboAGiro(m.rumbo);
  // Estela blanca detrás del barco.
  const escala = ESCALA;
  const estela = new Particulas(220, { textura: texturaSuave(), escala,
    nacer: (p) => { p.x = -L / 2 + azar(-0.3, 0.3); p.y = 0.15; p.z = azar(-W / 3, W / 3); p.vx = -azar(2, 3); p.vz = (p.z >= 0 ? 1 : -1) * azar(0.2, 0.6); p.max = azar(2.5, 4); p.tam = azar(0.6, 1.2); p.c.setRGB(1, 1, 1); },
    mover: (p, dt) => { p.x += p.vx * dt; p.z += p.vz * dt; p.alfa = (1 - edad(p)) * 0.7; p.tam += dt * 0.8; } });
  raiz.add(estela.obj);
  sol(raiz, 30, 40, 20, 2.4);
  return {
    grupo: raiz, pantalla: { px: 120, unidades: 16 },
    animar: (t, dt) => {
      g.position.y = Math.sin(t * 1.2) * 0.12; g.rotation.x = Math.sin(t * 0.9) * (L < 8 ? 0.06 : 0.025); g.rotation.z = Math.sin(t * 0.7) * 0.015;
      estela.actualizar(dt);
    },
  };
}

// ---------- Satélite ----------
function panelSolar(largo, ancho, tex) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(largo, 0.05, ancho), [mat("#888"), mat("#888"), mat("#ffffff", { map: tex, metalness: 0.6, roughness: 0.3 }), mat("#3a3a3a"), mat("#888"), mat("#888")]);
  return m;
}
function construirSatelite(m) {
  const g = new THREE.Group();
  const oro = mat("#c9a227", { metalness: 1, roughness: 0.32 });
  const blanco = mat("#e9ecef", { metalness: 0.2, roughness: 0.5 });
  const tex = texturaPanelSolar();
  const paneles = [];
  if (m.forma === "estacion") {
    const viga = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 0.35), mat("#bfc4c9", { metalness: 0.6 })); g.add(viga);
    for (const x of [-7.5, -5.5, 5.5, 7.5]) for (const z of [1, -1]) {
      const p = panelSolar(1.4, 6, texturaPanelSolar("#5a3b12", "#c08a3a")); p.position.set(x, 0, z * 3.3); g.add(p); paneles.push(p);
    }
    for (const [x, z, largo] of [[0, 0, 6], [0, 2.2, 3], [0, -2.2, 3], [1.8, 0, 3]]) {
      const mod = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, largo, 24), blanco);
      if (z === 0 && x === 0) mod.rotation.z = Math.PI / 2; else if (x) mod.rotation.z = Math.PI / 2; else mod.rotation.x = Math.PI / 2;
      mod.position.set(x === 0 && z === 0 ? 0 : x, -0.9, z); g.add(mod);
    }
    for (const x of [-3, 3]) { const rad = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 3.5), blanco); rad.position.set(x, -0.2, 1.8); g.add(rad); }
  } else if (m.forma === "plano") {
    g.add(caja(2.8, 0.25, 1.4, "#9aa1a8", 0, -0.12, 0, { metalness: 0.7, roughness: 0.3 }));
    const p = panelSolar(8, 2, tex); p.position.set(-5.3, 0.3, 0); p.rotation.z = 0.15; g.add(p); paneles.push(p);
  } else if (m.forma === "telescopio") {
    const tubo = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 6, 32, 1, true), mat("#d9dde1", { metalness: 0.8, roughness: 0.25, side: THREE.DoubleSide }));
    tubo.rotation.z = Math.PI / 2; g.add(tubo);
    const tapa = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), mat("#0b0f14")); tapa.rotation.y = Math.PI / 2; tapa.position.x = 2.4; g.add(tapa);
    g.add(Object.assign(caja(2, 1.8, 1.8, "#c9a227", -4, -0.9, 0), { material: oro }));
    for (const z of [1, -1]) { const p = panelSolar(3.6, 2.2, tex); p.position.set(-0.5, 0, z * 2.5); p.rotation.x = Math.PI / 2; g.add(p); }
  } else {
    const bus = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 2.2), oro); g.add(bus);
    for (const lado of [1, -1]) {
      const brazo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8), mat("#bbb", { metalness: 0.8 }));
      brazo.rotation.x = Math.PI / 2; brazo.position.z = lado * 1.8; g.add(brazo);
      const p = panelSolar(2.4, 5.5, tex); p.position.z = lado * 5.2; g.add(p); paneles.push(p);
    }
    const plato = new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.32), mat("#f2f2f2", { side: THREE.DoubleSide, roughness: 0.4 }));
    plato.rotation.x = Math.PI; plato.position.y = -0.55; g.add(plato);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), mat("#ddd")); ant.position.set(0.6, 1.4, 0.6); g.add(ant);
  }
  const raiz = new THREE.Group(); raiz.add(g);
  const luz = new THREE.DirectionalLight(0xfff4e0, 3); luz.position.set(40, 30, 30);
  raiz.add(luz, new THREE.AmbientLight(0x8899aa, 0.35));
  return {
    grupo: raiz, pantalla: { px: 120, unidades: 14 },
    animar: (t) => {
      g.rotation.y = t * 0.12;
      for (const p of paneles) p.rotation.z = Math.sin(t * 0.2) * 0.25;
    },
  };
}

// ---------- Presa ----------
function construirPresa(m) {
  const raiz = new THREE.Group();
  const R = 24, esp = 2.4, alto = 17, ang = 0.62;
  const s = new THREE.Shape();
  s.absarc(0, 0, R, -ang, ang, false); s.absarc(0, 0, R - esp, ang, -ang, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: alto, bevelEnabled: false, curveSegments: 48 });
  g.rotateX(-Math.PI / 2);
  const cortina = new THREE.Mesh(g, mat("#c9c4b8", { roughness: 0.85 }));
  cortina.rotation.y = Math.PI; cortina.position.set(R - 3, 0, 0); // convexa aguas arriba (−X)
  raiz.add(sombras(cortina));
  // Agua del embalse aguas arriba, casi al ras de la corona (el embalse real se ve en el mapa).
  const embalse = new THREE.Mesh(new THREE.RingGeometry(R, R + 16, 48, 1, Math.PI - ang, 2 * ang), mat("#2c6a8f", { roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  embalse.rotation.x = -Math.PI / 2; embalse.position.set(R - 3, alto - 0.6, 0); raiz.add(embalse);
  if (m.hidro) { raiz.add(sombras(caja(5, 3, 9, "#b8b2a6", 6, 0, 0))); }
  const escala = ESCALA;
  // Agua del vertedor: cae desde la corona por la cara de la cortina y se vuelve espuma abajo.
  const caida = new Particulas(900, { textura: texturaSuave(), escala,
    nacer: (p) => { p.x = -0.5; p.y = alto - 0.8; p.z = azar(-2.5, 2.5); p.vx = azar(2.5, 4); p.vy = 0; p.vz = 0; p.max = 2.2; p.tam = azar(0.5, 0.9); p.c.set("#dff3ff"); p.alfa = 0.9; },
    mover: (p, dt) => {
      p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.2) { p.y = 0.2; p.vy *= -0.15; p.vx *= 0.6; p.vz = azar(-3, 3); p.tam += dt * 2; p.c.set("#ffffff"); }
      p.alfa = (1 - edad(p)) * 0.85;
    } });
  raiz.add(caida.obj);
  sol(raiz, -30, 45, 30, 2.4);
  return { grupo: raiz, metros: 12, zoom: 15.6, pitch: 60, animar: (t, dt) => caida.actualizar(dt) };
}

// ---------- Central nuclear ----------
function torreEnfriamiento() {
  const pts = [];
  for (let i = 0; i <= 20; i++) { const y = (i / 20) * 14; pts.push(new THREE.Vector2(3.2 * Math.sqrt(1 + ((y - 10) / 5.5) ** 2) * 0.72, y)); }
  const t = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), mat("#d5d1c8", { roughness: 0.9, side: THREE.DoubleSide }));
  return t;
}
function construirNuclear(m) {
  const raiz = new THREE.Group();
  const v = m.variante || "";
  const torres = v === "investigacion" ? [] : [[-8, -6], [-8, 7]];
  for (const [x, z] of torres) { const t = torreEnfriamiento(); t.position.set(x, 0, z); raiz.add(sombras(t)); }
  const cont = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 5, 40), mat("#e8e5dd")); cont.position.set(6, 2.5, -3);
  const domo = new THREE.Mesh(new THREE.SphereGeometry(3, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat("#e8e5dd")); domo.position.set(6, 5, -3);
  const chimenea = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 12, 16), mat("#d8d4cc")); chimenea.position.set(12, 6, 9);
  raiz.add(sombras(cont), sombras(domo), sombras(caja(9, 4, 5, "#9fb0bf", 7, 0, 5)), sombras(chimenea));
  const escala = ESCALA;
  const vapor = new Particulas(500, { textura: texturaHumo(), escala,
    nacer: (p) => { const [x, z] = torres[(Math.random() * torres.length) | 0] || [0, 0]; p.x = x + azar(-1.5, 1.5); p.y = 14; p.z = z + azar(-1.5, 1.5); p.vy = azar(2, 3.2); p.vx = azar(0.6, 1.4); p.max = azar(5, 8); p.tam = 3; p.c.setRGB(1, 1, 1); },
    mover: (p, dt) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy *= 0.995; const e = edad(p); p.tam = 3 + e * 14; p.alfa = Math.min(1, e * 6) * (1 - e) * 0.75; } });
  raiz.add(vapor.obj);
  if (v === "construccion") raiz.add(sombras(grua(12, 2, 14)));
  sol(raiz, 30, 45, 20, 2.4);
  // Cerrada o en construcción: sin vapor.
  const activa = v === "" ;
  vapor.obj.visible = activa;
  return { grupo: raiz, metros: v === "investigacion" ? 5 : 9, zoom: v === "investigacion" ? 16.6 : 15.9, pitch: 60, animar: (t, dt) => { if (activa) vapor.actualizar(dt); } };
}

// ---------- Parque eólico ----------
function construirEolica() {
  const raiz = new THREE.Group();
  const rotores = [];
  const blanco = mat("#f3f4f5", { roughness: 0.4 });
  for (const [x, z] of [[0, 0], [-14, -10], [14, -12], [-12, 14], [15, 12], [0, -26], [-28, 2]]) {
    const t = new THREE.Group();
    const torre = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 16, 20), blanco); torre.position.y = 8; t.add(torre);
    const gond = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.9), blanco); gond.position.set(-0.4, 16.2, 0); t.add(gond);
    const rotor = new THREE.Group(); rotor.position.set(0.85, 16.2, 0);
    const buje = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 12), blanco); buje.scale.x = 1.4; rotor.add(buje);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Shape(); s.moveTo(-0.2, 0); s.lineTo(0.35, 0.6); s.lineTo(0.1, 8.5); s.lineTo(-0.05, 8.5); s.lineTo(-0.25, 0.6); s.closePath();
      const pala = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false }), blanco);
      pala.rotation.y = Math.PI / 2; const piv = new THREE.Group(); piv.add(pala); piv.rotation.x = (i / 3) * Math.PI * 2; rotor.add(piv);
    }
    t.add(rotor); t.position.set(x, 0, z); t.rotation.y = 0.6;
    raiz.add(sombras(t)); rotores.push([rotor, azar(0.9, 1.2)]);
  }
  sol(raiz, 30, 50, 10, 2.4);
  return { grupo: raiz, metros: 7, zoom: 14.6, pitch: 60,
    animar: (t, dt) => { for (const [r, v] of rotores) r.rotation.x += v * dt; } };
}

// ---------- Planta solar ----------
function construirSolar() {
  const raiz = new THREE.Group();
  const tex = texturaPanelSolar();
  const filas = [];
  for (let f = -6; f <= 6; f++) {
    const fila = new THREE.Group();
    for (let c = -8; c <= 8; c++) {
      const p = panelSolar(1.9, 3.2, tex); p.position.set(c * 2.05, 0, 0); fila.add(p);
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 6), mat("#999")); poste.position.set(c * 2.05, -0.65, 0); fila.add(poste);
    }
    fila.position.set(0, 1.4, f * 4.6); raiz.add(sombras(fila)); filas.push(fila);
  }
  sol(raiz, 20, 50, 30, 2.6);
  return { grupo: raiz, metros: 4, zoom: 15.6, pitch: 55,
    animar: (t) => { for (const f of filas) f.rotation.x = -0.35 + Math.sin(t * 0.15) * 0.25; } }; // seguidores que siguen al sol
}

// ---------- Volcán ----------
function construirVolcan(m) {
  const raiz = new THREE.Group();
  const nivel = Math.max(1, Math.min(5, m.nivel || 1));
  const pts = [];
  for (let i = 0; i <= 30; i++) { const u = i / 30; const r = 40 * (1 - u) ** 1.6 + 3.2; pts.push(new THREE.Vector2(r, u * 22)); }
  pts.push(new THREE.Vector2(2.2, 19), new THREE.Vector2(0.01, 18.5)); // cráter
  const cono = new THREE.Mesh(new THREE.LatheGeometry(pts, 128), mat("#5a4a3e", { roughness: 0.95 }));
  const pos = cono.geometry.attributes.position.array;
  for (let i = 0; i < pos.length; i += 3) { const k = 1 + 0.035 * Math.sin(Math.atan2(pos[i + 2], pos[i]) * 7 + pos[i + 1] * 0.3); pos[i] *= k; pos[i + 2] *= k; } // barrancas
  cono.geometry.computeVertexNormals();
  raiz.add(sombras(cono));
  const lava = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), new THREE.MeshBasicMaterial({ color: nivel >= 3 ? "#ff5a1a" : "#7a2a12" }));
  lava.rotation.x = -Math.PI / 2; lava.position.y = 18.7; raiz.add(lava);
  const brillo = new THREE.PointLight(0xff6a2a, nivel >= 3 ? 60 : 8, 40); brillo.position.y = 21; raiz.add(brillo);
  const escala = ESCALA;
  // Alerta baja (1–2): solo vapor blanco tenue (fumarola). Desde 3: columna de ceniza gris que crece con el nivel.
  const fumarola = nivel <= 2;
  const ceniza = new Particulas(fumarola ? 90 : 200 + nivel * 160, { textura: texturaHumo(), escala,
    nacer: (p) => { p.x = azar(-1.5, 1.5); p.y = 20; p.z = azar(-1.5, 1.5); p.vy = azar(3, 5) * (fumarola ? 0.35 : 0.5 + nivel * 0.3); p.vx = azar(0.5, 1.5); p.max = azar(5, 9);
      const g = fumarola ? azar(0.92, 1) : azar(0.25, 0.45); p.c.setRGB(g, g * 0.97, g * 0.94); },
    mover: (p, dt) => { p.x += p.vx * dt * (1 + p.y * 0.04); p.y += p.vy * dt; p.vy *= 0.993; const e = edad(p); p.tam = 3 + e * (fumarola ? 6 : 8 + nivel * 3); p.alfa = Math.min(1, e * 6) * (1 - e) * (fumarola ? 0.45 : 0.9); } });
  raiz.add(ceniza.obj);
  let bombas = null;
  if (nivel >= 4) {
    bombas = new Particulas(140, { textura: texturaSuave(), aditivo: true, escala,
      nacer: (p) => { p.x = 0; p.y = 19.5; p.z = 0; const a = azar(0, 6.28), v = azar(4, 9); p.vx = Math.cos(a) * v * 0.5; p.vz = Math.sin(a) * v * 0.5; p.vy = azar(8, 16); p.max = azar(1.5, 3); p.tam = azar(0.5, 0.9); p.c.setRGB(1, azar(0.35, 0.6), 0.1); p.alfa = 1; },
      mover: (p, dt) => { p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.alfa = 1 - edad(p); } });
    raiz.add(bombas.obj);
  }
  sol(raiz, -30, 40, 25, 2.0);
  return { grupo: raiz, metros: 150, zoom: 11.2, pitch: 60,
    animar: (t, dt) => { ceniza.actualizar(dt); bombas?.actualizar(dt); brillo.intensity = (nivel >= 3 ? 60 : 8) * (0.8 + 0.3 * Math.sin(t * 7) * Math.sin(t * 3.1)); } };
}

// ---------- Tornado ----------
function construirTornado(m) {
  const raiz = new THREE.Group();
  const escala = ESCALA;
  const H = 30;
  const embudo = new THREE.Group(); raiz.add(embudo);
  const radio = (y) => 0.8 + (y / H) ** 1.8 * 9;
  const remolino = new Particulas(2600, { textura: texturaHumo(), escala,
    nacer: (p) => { p.y = Math.random() ** 0.8 * H; p.a = azar(0, 6.28); p.r = radio(p.y) * azar(0.75, 1.1); p.max = azar(3, 6); const g = azar(0.35, 0.55); p.c.setRGB(g, g * 0.97, g * 0.92); p.tam = 1.2 + p.y * 0.12; },
    mover: (p, dt) => { p.a += dt * (9 / (p.r + 0.6)) * 2.2; p.y += dt * 1.6; p.r = radio(p.y) * 0.95; p.x = Math.cos(p.a) * p.r; p.z = Math.sin(p.a) * p.r; const e = edad(p); p.alfa = Math.min(1, e * 5, (1 - e) * 5) * 0.55; } });
  const escombros = new Particulas(500, { textura: texturaSuave(), escala,
    nacer: (p) => { p.a = azar(0, 6.28); p.r = azar(1, 3); p.y = 0.2; p.vy = azar(1, 4); p.vr = azar(1.5, 4); p.max = azar(1.5, 3); p.tam = azar(0.25, 0.6); if (m.agua) p.c.setRGB(0.85, 0.9, 0.95); else p.c.setRGB(0.4, 0.32, 0.22); },
    mover: (p, dt) => { p.a += dt * 3; p.r += p.vr * dt; p.vy -= 3 * dt; p.y = Math.max(0, p.y + p.vy * dt); p.x = Math.cos(p.a) * p.r; p.z = Math.sin(p.a) * p.r; p.alfa = (1 - edad(p)) * 0.8; } });
  embudo.add(remolino.obj, escombros.obj);
  const nube = new Particulas(420, { textura: texturaHumo(), escala,
    nacer: (p) => { const a = azar(0, 6.28), r = Math.sqrt(Math.random()) * 38; p.x = Math.cos(a) * r; p.z = Math.sin(a) * r; p.y = H + azar(0, 5); p.a = a; p.r = r; p.max = 1e9; p.tam = azar(12, 18); const g = azar(0.22, 0.36); p.c.setRGB(g, g, g * 1.05); p.alfa = 0.7; },
    mover: (p, dt) => { p.a += dt * 0.05; p.x = Math.cos(p.a) * p.r; p.z = Math.sin(p.a) * p.r; } });
  raiz.add(nube.obj);
  raiz.add(new THREE.HemisphereLight(0x9aa59a, 0x3a3a30, 1.2));
  const l = new THREE.DirectionalLight(0xd8e0d0, 0.9); l.position.set(-20, 40, 10); raiz.add(l);
  return { grupo: raiz, metros: 40, zoom: 13.2, pitch: 65,
    animar: (t, dt) => { embudo.position.set(Math.sin(t * 0.15) * 10, 0, Math.cos(t * 0.11) * 8); remolino.actualizar(dt); escombros.actualizar(dt); nube.actualizar(dt); } };
}

// ---------- Ciclón ----------
function construirCiclon(m) {
  const raiz = new THREE.Group();
  const cat = m.cat || 0, sentido = m.sur ? -1 : 1;
  const escala = ESCALA;
  const nubes = new THREE.Group(); raiz.add(nubes);
  const bandas = cat >= 3 ? 3 : 2, n = 1500 + cat * 250;
  const espiral = new Particulas(n, { textura: texturaHumo(), escala,
    nacer: (p) => {
      const u = Math.random(), pared = u < 0.25, centro = u >= 0.25 && u < 0.25 + 0.05 * cat; // pared del ojo y nubosidad central
      if (pared) { p.r = azar(4.5, 6.5); p.a = azar(0, 6.28); }
      else if (centro) { p.r = azar(6.5, 13); p.a = azar(0, 6.28); }
      else { const k = (Math.random() * bandas) | 0, th = Math.random() * 4.2; p.r = 6.5 * Math.exp(0.42 * th) + azar(-1.2, 1.2) * (1 + th * 0.4); p.a = (k / bandas) * 6.28 - th * sentido + azar(-0.15, 0.15); }
      p.x = Math.cos(p.a) * p.r; p.z = Math.sin(p.a) * p.r;
      p.y = 1.2 + azar(-0.3, 0.5) + (pared ? 0.8 : 0); p.max = 1e9; p.tam = pared ? azar(3, 4.2) : azar(3.5, 6.5); const g = azar(0.88, 1); p.c.setRGB(g, g, g); p.alfa = pared ? 0.95 : azar(0.7, 0.95);
    },
    mover: () => {} });
  espiral.actualizar(0);
  nubes.add(espiral.obj); // gira todo junto: con giro diferencial las bandas se enrollarían en una mancha
  sol(raiz, 40, 60, 20, 2.2);
  return { grupo: raiz, metros: 9000, zoom: 5.4, pitch: 45,
    animar: (t, dt) => { nubes.rotation.y += dt * sentido * (0.12 + cat * 0.04); } };
}

// ---------- Tormenta eléctrica ----------
/** Rayo ramificado (desplazamiento del punto medio). */
function trazoRayo(desde, hasta, ramas = 3) {
  const seg = [];
  const dividir = (a, b, d, prof) => {
    if (prof === 0) { seg.push(a, b); return; }
    const m = a.clone().lerp(b, 0.5).add(new THREE.Vector3(azar(-d, d), azar(-d * 0.3, d * 0.3), azar(-d, d)));
    dividir(a, m, d / 2, prof - 1); dividir(m, b, d / 2, prof - 1);
    if (ramas > 0 && prof === 4 && Math.random() < 0.5) {
      ramas--;
      const fin = m.clone().add(new THREE.Vector3(azar(-8, 8), -azar(5, 10), azar(-8, 8)));
      dividir(m, fin, d / 2, prof - 2);
    }
  };
  dividir(desde, hasta, 6, 7);
  const g = new THREE.BufferGeometry().setFromPoints(seg);
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xeaf2ff, transparent: true }));
}
function construirTormenta() {
  const raiz = new THREE.Group();
  const escala = ESCALA;
  const nube = new Particulas(700, { textura: texturaHumo(), escala,
    nacer: (p) => { const y = azar(18, 42), ancho = y > 36 ? 40 : 18 + (y - 18) * 0.2; const a = azar(0, 6.28), r = Math.sqrt(Math.random()) * ancho; p.x = Math.cos(a) * r; p.z = Math.sin(a) * r; p.y = y; p.max = 1e9; p.tam = azar(10, 16); p.g = azar(0.28, 0.5); p.c.setRGB(p.g, p.g, p.g * 1.08); p.alfa = 0.85; },
    mover: () => {} });
  const lluvia = new THREE.Group();
  const gl = new THREE.BufferGeometry(), nl = 1500, pl = new Float32Array(nl * 6);
  for (let i = 0; i < nl; i++) { const x = azar(-25, 25), z = azar(-25, 25), y = azar(0, 18); pl.set([x, y, z, x - 0.1, y - 0.9, z], i * 6); }
  gl.setAttribute("position", new THREE.BufferAttribute(pl, 3));
  lluvia.add(new THREE.LineSegments(gl, new THREE.LineBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.45 })));
  raiz.add(nube.obj, lluvia);
  const hemi = new THREE.HemisphereLight(0x8090a0, 0x2a2a24, 0.7); raiz.add(hemi);
  const destello = new THREE.PointLight(0xdfe8ff, 0, 160, 1.2); destello.position.set(0, 25, 0); raiz.add(destello);
  let rayo = null, proximo = 0.6, vida = 0;
  return { grupo: raiz, metros: 200, zoom: 11.2, pitch: 65,
    animar: (t, dt) => {
      const a = pl;
      for (let i = 0; i < nl; i++) { let y = a[i * 6 + 1] - dt * 22; if (y < 0) y += 18; a[i * 6 + 1] = y; a[i * 6 + 4] = y - 0.9; }
      gl.attributes.position.needsUpdate = true;
      proximo -= dt;
      if (proximo <= 0) {
        if (rayo) { raiz.remove(rayo); rayo.geometry.dispose(); rayo.material.dispose(); }
        const x = azar(-15, 15), z = azar(-15, 15);
        rayo = trazoRayo(new THREE.Vector3(x, 20, z), new THREE.Vector3(x + azar(-6, 6), 0, z + azar(-6, 6)));
        raiz.add(rayo); destello.position.set(x, 12, z); vida = 0.35; proximo = azar(0.8, 2.8);
      }
      vida = Math.max(0, vida - dt);
      const parpadeo = vida > 0 ? (Math.sin(vida * 70) > -0.2 ? 1 : 0.15) * (vida / 0.35) : 0;
      destello.intensity = parpadeo * 9000; hemi.intensity = 0.7 + parpadeo * 1.6;
      if (rayo) rayo.material.opacity = parpadeo;
      for (const p of nube.p) p.c.setRGB(p.g + parpadeo * 0.5, p.g + parpadeo * 0.5, p.g * 1.08 + parpadeo * 0.55);
      nube.actualizar(dt);
    } };
}

// ---------- Sismo ----------
/** Ondas que se abren desde el epicentro (más grandes y rápidas con más magnitud) y un pulso en el epicentro. */
function construirSismo(m) {
  const raiz = new THREE.Group();
  const mag = Math.max(2, Math.min(9.5, m.mag || 5));
  const alcance = 3 * 1.7 ** (mag - 4); // radio máximo de las ondas, en unidades (1 unidad = 1 km)
  const ondas = [];
  for (let i = 0; i < 5; i++) {
    const o = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96), new THREE.MeshBasicMaterial({ color: i % 2 ? "#FFB020" : "#FF5A36", transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    o.rotation.x = -Math.PI / 2; o.position.y = 0.02; raiz.add(o); ondas.push(o);
  }
  const pulso = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: "#FF3B30", transparent: true, opacity: 0.55, depthWrite: false }));
  pulso.rotation.x = -Math.PI / 2; pulso.position.y = 0.03; raiz.add(pulso);
  // Columna de luz que marca el epicentro desde lejos.
  const haz = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.6, alcance * 0.6, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: "#FF6A3D", transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  haz.position.y = alcance * 0.3; raiz.add(haz);
  const zoom = Math.max(6.5, Math.min(11, 13.6 - Math.log2(alcance * 2)));
  return { grupo: raiz, metros: 1000, zoom, pitch: 50,
    animar: (t) => {
      const ciclo = (t % 4) / 4;
      ondas.forEach((o, i) => { const u = (ciclo + i / ondas.length) % 1; o.scale.setScalar(0.2 + u * alcance); o.material.opacity = (1 - u) * 0.85; });
      pulso.scale.setScalar(alcance * 0.06 * (1 + 0.5 * Math.sin(t * 8)));
    } };
}

// ---------- Incendio ----------
function construirIncendio() {
  const raiz = new THREE.Group();
  const escala = ESCALA;
  const frente = () => Math.sin(performance.now() / 9000) * 3; // el frente avanza y retrocede un poco
  const fuego = new Particulas(1400, { textura: texturaSuave(), aditivo: true, escala,
    nacer: (p) => { p.x = frente() + azar(-3, 3); p.z = azar(-40, 40); p.y = azar(0, 1); p.vy = azar(3, 7); p.vx = azar(0.5, 2); p.max = azar(0.5, 1.3); p.tam = azar(2, 3.8); p.c.setRGB(1, azar(0.45, 0.8), 0.15); },
    mover: (p, dt) => { p.x += p.vx * dt; p.y += p.vy * dt; const e = edad(p); p.alfa = (1 - e) * 0.9; p.c.g = Math.max(0.15, p.c.g - dt * 0.6); p.tam *= 1 - dt * 0.6; } });
  const humo = new Particulas(300, { textura: texturaHumo(), escala,
    nacer: (p) => { p.x = frente() + azar(-3, 3); p.z = azar(-40, 40); p.y = 4; p.vy = azar(2, 4); p.vx = azar(2, 4); p.max = azar(6, 10); const g = azar(0.25, 0.45); p.c.setRGB(g, g * 0.95, g * 0.9); },
    mover: (p, dt) => { p.x += p.vx * dt; p.y += p.vy * dt; const e = edad(p); p.tam = 5 + e * 20; p.alfa = Math.min(1, e * 5) * (1 - e) * 0.4; } });
  raiz.add(humo.obj, fuego.obj);
  const luz = new THREE.PointLight(0xff7a2a, 400, 70, 1.5); luz.position.set(0, 4, 0); raiz.add(luz);
  sol(raiz, -30, 30, 20, 1.2);
  return { grupo: raiz, metros: 10, zoom: 14.2, pitch: 60,
    animar: (t, dt) => { fuego.actualizar(dt); humo.actualizar(dt); luz.intensity = 400 * (0.75 + 0.35 * Math.sin(t * 13) * Math.sin(t * 5.3)); luz.position.x = frente(); } };
}

// ---------- Cohete ----------
function construirCohete() {
  const raiz = new THREE.Group();
  raiz.add(sombras(caja(12, 1.2, 12, "#9b9b9b", 0, 0, 0)));
  const torre = new THREE.Group();
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 26, 0.2), mat("#c0392b", { metalness: 0.6 })); c.position.set(x, 13, z); torre.add(c); }
  for (let y = 2; y < 26; y += 2) torre.add(caja(2.2, 0.15, 2.2, "#a93226", 0, y, 0));
  torre.position.set(-4.2, 1.2, 0); raiz.add(sombras(torre));
  const cohete = new THREE.Group();
  const blanco = mat("#f4f4f4", { roughness: 0.35 });
  const c1 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 16, 40), blanco); c1.position.y = 8; cohete.add(c1);
  const etapa = new THREE.Mesh(new THREE.CylinderGeometry(1.21, 1.21, 1, 40), mat("#1c1c1c")); etapa.position.y = 16; cohete.add(etapa);
  const c2 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 6, 40), blanco); c2.position.y = 19.5; cohete.add(c2);
  const nariz = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4, 40), blanco); nariz.position.y = 24.5; cohete.add(nariz);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(1.6, -0.5); s.lineTo(1.6, 1.2); s.lineTo(0, 3.5); s.closePath();
    const aleta = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false }), mat("#2a2a2a"));
    const piv = new THREE.Group(); aleta.position.set(1.1, 0.4, -0.05); piv.add(aleta); piv.rotation.y = (i / 4) * Math.PI * 2; cohete.add(piv);
  }
  const tobera = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.95, 1.4, 24, 1, true), mat("#3b3b3b", { metalness: 0.8, side: THREE.DoubleSide })); tobera.position.y = -0.6; cohete.add(tobera);
  cohete.position.y = 2;
  raiz.add(sombras(cohete));
  const escala = ESCALA;
  let altura = 0, empuje = 0;
  const fuego = new Particulas(900, { textura: texturaSuave(), aditivo: true, escala,
    nacer: (p) => { p.x = azar(-0.5, 0.5); p.z = azar(-0.5, 0.5); p.y = cohete.position.y - 1.2; p.vy = -azar(18, 30); p.vx = azar(-1.5, 1.5); p.vz = azar(-1.5, 1.5); p.max = azar(0.25, 0.6); p.tam = azar(1, 1.8); p.c.setRGB(1, azar(0.75, 0.95), azar(0.4, 0.7)); },
    mover: (p, dt) => { p.x += p.vx * dt; p.y = Math.max(1.4, p.y + p.vy * dt); p.z += p.vz * dt; p.alfa = empuje * (1 - edad(p)); p.c.b *= 0.96; } });
  const humo = new Particulas(600, { textura: texturaHumo(), escala,
    nacer: (p) => { const a = azar(0, 6.28); p.x = Math.cos(a) * 2; p.z = Math.sin(a) * 2; p.y = 1.5; const v = azar(4, 10); p.vx = Math.cos(a) * v; p.vz = Math.sin(a) * v; p.vy = azar(0.5, 2); p.max = azar(3, 6); const g = azar(0.8, 0.95); p.c.setRGB(g, g, g); },
    mover: (p, dt) => { p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vz *= 0.98; const e = edad(p); p.tam = 4 + e * 16; p.alfa = (altura < 40 ? empuje : 0.2 * empuje) * Math.min(1, e * 4) * (1 - e) * 0.8; } });
  raiz.add(humo.obj, fuego.obj);
  sol(raiz, 30, 50, 20, 2.4);
  return { grupo: raiz, metros: 2.5, zoom: 17, pitch: 65,
    animar: (t, dt) => {
      const ciclo = t % 14;
      empuje = ciclo < 2 ? 0 : ciclo < 3 ? (ciclo - 2) : 1;
      altura = ciclo < 3 ? 0 : 0.9 * (ciclo - 3) ** 2.2;
      cohete.position.y = 2 + altura;
      fuego.actualizar(dt); humo.actualizar(dt);
    } };
}

// ---------- Piezas para instalaciones ----------
/** Rumbo (grados desde el norte, en sentido horario) → giro sobre el eje vertical: en la escena +X es el este y +Z el sur. */
export function rumboAGiro(rumbo) { return ((90 - (Number(rumbo) || 0)) * Math.PI) / 180; }
function cil(rt, rb, h, color, x, y, z, o = {}, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, o));
  m.position.set(x, y + h / 2, z);
  return m;
}
/** Grúa torre: mástil, pluma y contrapluma. */
function grua(x, z, alto) {
  const g = new THREE.Group();
  const amarillo = mat("#E8B004", { metalness: 0.3 });
  const mastil = new THREE.Mesh(new THREE.BoxGeometry(0.6, alto, 0.6), amarillo); mastil.position.y = alto / 2; g.add(mastil);
  const pluma = new THREE.Mesh(new THREE.BoxGeometry(alto * 0.9, 0.4, 0.4), amarillo); pluma.position.set(alto * 0.3, alto, 0); g.add(pluma);
  g.add(caja(1.2, 0.8, 1, "#666", -alto * 0.12, alto - 0.2, 0));
  g.position.set(x, 0, z);
  return g;
}
/** Humo o vapor que sale de (x, y, z): color, cantidad, subida y crecimiento en unidades de la escena. */
function humo(puntos, { n = 300, color = [0.9, 0.9, 0.9], sube = 3, tam = [2, 12], vida = [5, 8], viento = 1, alfa = 0.7, aditivo = false, textura } = {}) {
  return new Particulas(n, { textura: textura || texturaHumo(), aditivo, escala: ESCALA,
    nacer: (p) => { const [x, y, z] = puntos[(Math.random() * puntos.length) | 0]; p.x = x + azar(-0.5, 0.5); p.y = y; p.z = z + azar(-0.5, 0.5);
      p.vy = sube * azar(0.7, 1.2); p.vx = viento * azar(0.5, 1.3); p.max = azar(vida[0], vida[1]); const k = azar(0.85, 1.05); p.c.setRGB(color[0] * k, color[1] * k, color[2] * k); },
    mover: (p, dt) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy *= 0.995; const e = edad(p); p.tam = tam[0] + e * (tam[1] - tam[0]); p.alfa = Math.min(1, e * 6) * (1 - e) * alfa; } });
}
/** Fuego de antorcha (quemador) en (x, y, z). */
function llama(x, y, z, tam = 2, n = 220) {
  return new Particulas(n, { textura: texturaSuave(), aditivo: true, escala: ESCALA,
    nacer: (p) => { p.x = x + azar(-0.3, 0.3) * tam; p.y = y; p.z = z + azar(-0.3, 0.3) * tam; p.vy = azar(2, 4) * tam; p.vx = azar(0.2, 0.8) * tam; p.max = azar(0.3, 0.7); p.tam = tam * azar(0.8, 1.4); p.c.setRGB(1, azar(0.5, 0.8), 0.15); },
    mover: (p, dt) => { p.x += p.vx * dt; p.y += p.vy * dt; p.alfa = (1 - edad(p)) * 0.95; p.c.g = Math.max(0.2, p.c.g - dt); } });
}

// ---------- Centrales térmicas, industria y almacenamiento ----------
function construirTermica(m) {
  const raiz = new THREE.Group(), v = m.variante || "gas";
  const extras = [];
  raiz.add(caja(30, 12, 12, "#AEB6BF", 0, 0, 0), caja(12, 20, 12, "#8E9AA6", -20, 0, 0));
  let chimeneas = [];
  if (v === "baterias") {
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) raiz.add(caja(6, 2.6, 2.4, "#E9ECEF", -22 + i * 8, 0, 10 + j * 4));
    raiz.add(caja(6, 5, 5, "#6C7A89", 25, 0, 0));
  } else if (v === "geotermica") {
    for (let i = 0; i < 3; i++) raiz.add(cil(5, 6, 10, "#D5D1C8", 25 + i * 12, 0, -12, { roughness: 0.9 }));
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 80, 12), mat("#B0B7BE", { metalness: 0.5 })); t.rotation.z = Math.PI / 2; t.position.set(-10, 2 + i * 0.01, 18 + i * 3); raiz.add(t); }
    chimeneas = [[25, 10, -12], [37, 10, -12], [49, 10, -12]];
    extras.push(humo(chimeneas, { n: 260, color: [1, 1, 1], sube: 4, tam: [3, 14], alfa: 0.65 }));
  } else {
    const alto = v === "carbon" ? 50 : v === "industria" ? 28 : 22;
    chimeneas = v === "carbon" ? [[-28, alto, -10], [-28, alto, 10]] : [[-28, alto, 0]];
    for (const [x, , z] of chimeneas) {
      raiz.add(cil(1.6, 2.4, alto, "#C9C4B8", x, 0, z, { roughness: 0.85 }));
      for (const y of [alto - 4, alto - 7]) raiz.add(cil(1.65, 1.65, 1, "#B33A2E", x, y, z)); // franjas de señalización
    }
    if (v === "carbon") for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(9, 6, 20), mat("#2B2B2B", { roughness: 1 })); c.position.set(25 + i * 16, 3, 22); raiz.add(c); }
    if (v === "biomasa") for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(8, 5, 20), mat("#7A5A33", { roughness: 1 })); c.position.set(25 + i * 15, 2.5, 22); raiz.add(c); }
    if (v === "industria") {
      for (let i = 0; i < 3; i++) raiz.add(cil(4, 5, 16, "#5D6D7E", 22 + i * 12, 0, -14));
      const brillo = new THREE.PointLight(0xff7a2a, 900, 60, 1.5); brillo.position.set(30, 6, -14); raiz.add(brillo); extras.push({ brillo });
    }
    const gris = v === "carbon" || v === "industria";
    extras.push(humo(chimeneas.map(([x, y, z]) => [x, y + 0.5, z]), { n: 320, color: gris ? [0.55, 0.55, 0.55] : [0.97, 0.97, 0.97], sube: 5, tam: [3, 22], alfa: gris ? 0.75 : 0.5 }));
    for (let i = 0; i < 2; i++) raiz.add(cil(3.5, 3.5, 6, "#9AA5B1", 18 + i * 9, 0, 14)); // transformadores
  }
  sombras(raiz);
  for (const e of extras) if (e.obj) raiz.add(e.obj);
  sol(raiz, 30, 50, 20, 2.4);
  return { grupo: raiz, metros: 4, zoom: 16, pitch: 60, edificios: true,
    animar: (t, dt) => { for (const e of extras) { e.actualizar?.(dt); if (e.brillo) e.brillo.intensity = 900 * (0.8 + 0.3 * Math.sin(t * 9) * Math.sin(t * 3.7)); } } };
}

// ---------- Centro de datos ----------
function construirDatacenter() {
  const raiz = new THREE.Group();
  const ventiladores = [], luces = [];
  for (let k = 0; k < 3; k++) {
    const z = -14 + k * 14;
    raiz.add(caja(60, 8, 11, "#D7DBDF", 0, 0, z, { roughness: 0.6 }));
    raiz.add(caja(60, 0.6, 0.15, "#2B6CB0", 0, 6.5, z + 5.55, { emissive: "#2B6CB0", emissiveIntensity: 0.6 }));
    for (let i = 0; i < 10; i++) {
      const base = caja(4, 1.2, 4, "#9AA5B1", -27 + i * 6, 8, z);
      const aspa = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.15, 16), mat("#3A3F46", { metalness: 0.6 }));
      aspa.position.set(-27 + i * 6, 9.35, z); raiz.add(base, aspa); ventiladores.push(aspa);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.1), new THREE.MeshBasicMaterial({ color: "#39FF88" }));
      led.position.set(-27 + i * 6, 3, z + 5.56); raiz.add(led); luces.push(led);
    }
  }
  for (let i = 0; i < 8; i++) raiz.add(caja(5, 3, 2.5, "#5D6D7E", -25 + i * 7, 0, 26)); // generadores de respaldo
  sombras(raiz);
  sol(raiz, 30, 50, 20, 2.4);
  return { grupo: raiz, metros: 3, zoom: 16, pitch: 60, edificios: true,
    animar: (t, dt) => { for (const a of ventiladores) a.rotation.y += dt * 9; luces.forEach((l, i) => { l.visible = Math.sin(t * 6 + i * 1.7) > -0.3; }); } };
}

// ---------- Aeropuerto ----------
/**
 * Pista real (si OpenStreetMap la tiene en el mapa base) o una genérica, y un avión que rueda, despega y se aleja en bucle.
 * m.pistas: [{x1, z1, x2, z2}] en metros respecto al punto del aeropuerto (se calculan en Modelos3D.#alinearPistas).
 */
function construirAeropuerto(m) {
  const raiz = new THREE.Group();
  const v = m.variante || "grande";
  if (v === "helipuerto") {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(15, 48), mat("#3A3F46")); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.2; raiz.add(pad);
    const h = construirAvion({ forma: "helicoptero", cola: "#C0392B" });
    const heli = h.grupo; heli.scale.setScalar(2.2); raiz.add(heli);
    return { grupo: raiz, metros: 1, zoom: 17.6, pitch: 60, edificios: true,
      animar: (t, dt) => { h.animar(t, dt); heli.position.y = 6 + Math.max(0, Math.sin(t * 0.3)) * 30; } };
  }
  let pista = m.pistas?.length ? m.pistas.reduce((a, b) => (Math.hypot(b.x2 - b.x1, b.z2 - b.z1) > Math.hypot(a.x2 - a.x1, a.z2 - a.z1) ? b : a)) : null;
  if (!pista) {
    const largo = v === "grande" ? 3000 : 1600, ancho = v === "grande" ? 45 : 30;
    const asfalto = caja(largo, 0.3, ancho, "#3A3F46", 0, 0, 0, { roughness: 0.95 });
    raiz.add(asfalto);
    for (let x = -largo / 2 + 60; x < largo / 2 - 60; x += 60) raiz.add(caja(30, 0.32, 1.2, "#FFFFFF", x, 0, 0));
    pista = { x1: -largo / 2, z1: 0, x2: largo / 2, z2: 0 };
  }
  // Avión (forma de ruedas fuera) que va de un extremo de la pista al otro y despega.
  const a = construirAvion({ forma: v === "grande" ? "angosto" : "regional", cola: ["#0B2343", "#A12B8F", "#00A04A", "#1B3A6B"][(Math.random() * 4) | 0] });
  const avion = a.grupo; avion.scale.setScalar(v === "grande" ? 20 : 14); // ~5× el tamaño real para que se distinga
  const dx = pista.x2 - pista.x1, dz = pista.z2 - pista.z1, L = Math.hypot(dx, dz);
  avion.rotation.y = Math.atan2(-dz, dx);
  raiz.add(avion);
  sol(raiz, 30, 50, 20, 2.4);
  const ciclo = 30;
  return { grupo: raiz, metros: 1, zoom: v === "grande" ? 14.3 : 15.2, pitch: 60, edificios: true,
    animar: (t, dt) => {
      a.animar(t, dt);
      const u = (t % ciclo) / ciclo;
      // 0–0.15 espera en cabecera; 0.15–0.55 carrera de despegue (acelera); 0.55–1 ascenso.
      const carrera = u < 0.15 ? 0 : u < 0.55 ? ((u - 0.15) / 0.4) ** 2 * 0.85 : 0.85 + (u - 0.55) * 1.6;
      avion.position.set(pista.x1 + dx * carrera, 4 + (u > 0.55 ? (u - 0.55) ** 1.6 * 900 : 0), pista.z1 + dz * carrera);
      avion.children[0].rotation.z = u > 0.5 ? Math.min(0.18, (u - 0.5) * 2) : 0; // nariz arriba al despegar
      avion.visible = u < 0.97 && L > 0;
    } };
}

// ---------- Puerto de contenedores ----------
function construirPuerto() {
  const raiz = new THREE.Group();
  raiz.add(caja(520, 2, 90, "#B8BCC0", 0, 0, 30, { roughness: 0.95 }));
  const colores = ["#C0392B", "#2C6E9E", "#E2A33B", "#2E8B57", "#7A4B9C", "#D35400", "#95A5A6"];
  for (let x = -230; x < 230; x += 14) for (let z = 40; z < 70; z += 3) {
    const pisos = 1 + ((Math.random() * 4) | 0);
    for (let k = 0; k < pisos; k++) raiz.add(caja(12, 2.5, 2.4, colores[(Math.random() * colores.length) | 0], x, 2 + k * 2.6, z, { roughness: 0.75 }));
  }
  const carros = [];
  for (const x of [-150, -50, 50, 150]) {
    const g = new THREE.Group(), azul = mat("#1F5FA8", { metalness: 0.3 });
    for (const [lx, lz] of [[-9, 0], [9, 0], [-9, 18], [9, 18]]) { const pata = new THREE.Mesh(new THREE.BoxGeometry(1.5, 45, 1.5), azul); pata.position.set(lx, 24.5, lz + 4); g.add(pata); }
    const pluma = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 110), azul); pluma.position.set(0, 48, -20); g.add(pluma);
    const carro = caja(4, 2, 4, "#E8B004", 0, 45, -20); g.add(carro); carros.push([carro, Math.random() * 6]);
    g.position.set(x, 2, 6); raiz.add(g);
  }
  const b = construirBarco({ forma: "carga" });
  const barco = b.grupo; barco.scale.setScalar(18); barco.rotation.y = 0; barco.position.set(0, 0, -45); raiz.add(barco);
  sombras(raiz);
  sol(raiz, 30, 60, 20, 2.4);
  return { grupo: raiz, metros: 1, zoom: 15.8, pitch: 60, edificios: true,
    animar: (t, dt) => { b.animar(t, dt); for (const [c, f] of carros) c.position.z = -20 + Math.sin(t * 0.6 + f) * 45; } };
}

// ---------- Planta farmacéutica ----------
function construirFarma() {
  const raiz = new THREE.Group();
  for (const [x, z, w, h] of [[0, 0, 80, 15], [-60, 30, 50, 12], [40, 40, 40, 18]]) {
    raiz.add(caja(w, h, 30, "#F4F6F7", x, 0, z, { roughness: 0.5 }));
    raiz.add(caja(w, 1.5, 0.3, "#1F6FB2", x, h - 3, z + 15.2));
    for (let i = 0; i < w / 12; i++) raiz.add(caja(5, 2, 5, "#BFC5CB", x - w / 2 + 6 + i * 12, h, z)); // aire limpio (HVAC)
  }
  for (let i = 0; i < 5; i++) raiz.add(cil(3.5, 3.5, 14, "#D9DDE1", 60 + (i % 3) * 9, 0, -20 + Math.floor(i / 3) * 9, { metalness: 0.6, roughness: 0.3 }));
  const salida = [[0, 17, -5], [40, 20, 40]];
  for (const [x, y, z] of salida) raiz.add(cil(0.8, 0.8, 4, "#9AA5B1", x, y - 3, z));
  const vapor = humo(salida, { n: 120, color: [1, 1, 1], sube: 3, tam: [1.5, 8], alfa: 0.4 });
  sombras(raiz); raiz.add(vapor.obj);
  sol(raiz, 30, 50, 20, 2.4);
  return { grupo: raiz, metros: 1, zoom: 16.4, pitch: 60, edificios: true, animar: (t, dt) => vapor.actualizar(dt) };
}

// ---------- Petróleo y gas en tierra ----------
function balancin() {
  const g = new THREE.Group(), gris = mat("#4A4F55", { metalness: 0.5 });
  g.add(caja(8, 0.6, 2, "#5D6D7E", 0, 0, 0));
  for (const z of [-0.6, 0.6]) { const pata = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), gris); pata.position.set(0, 3, z); pata.rotation.z = 0.15; g.add(pata); }
  const viga = new THREE.Group(); viga.position.set(0, 6, 0);
  viga.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 0.6), mat("#D35400")), {}));
  const cabeza = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.8, 16, 1, false, 0, Math.PI), mat("#D35400")); cabeza.rotation.x = Math.PI / 2; cabeza.position.x = 4.6; viga.add(cabeza);
  g.add(viga);
  return { g, viga };
}
function construirPetroleo(m) {
  const raiz = new THREE.Group(), gas = m.variante === "gas";
  const vigas = [], extras = [];
  if (!gas) for (let i = 0; i < 7; i++) { const b = balancin(); b.g.position.set(-60 + (i % 4) * 40 + azar(-6, 6), 0, -30 + Math.floor(i / 4) * 50 + azar(-6, 6)); b.g.rotation.y = azar(0, 3); raiz.add(b.g); vigas.push([b.viga, azar(0, 6)]); }
  else for (let i = 0; i < 6; i++) { const x = -50 + (i % 3) * 40, z = -25 + Math.floor(i / 3) * 45; raiz.add(cil(0.8, 0.8, 3, "#C0392B", x, 0, z), caja(2, 0.6, 2, "#7F8C8D", x, 3, z)); }
  for (let i = 0; i < 3; i++) raiz.add(cil(7, 7, gas ? 5 : 9, "#D0D3D4", 60 + i * 17, 0, 30, { metalness: 0.4 }));
  const antorcha = [70, 30, -30];
  raiz.add(cil(0.7, 1, 30, "#7F8C8D", antorcha[0], 0, antorcha[2]));
  extras.push(llama(antorcha[0], 30.5, antorcha[2], 3.2), humo([[antorcha[0], 34, antorcha[2]]], { n: 120, color: [0.35, 0.35, 0.35], sube: 4, tam: [3, 14], alfa: 0.5 }));
  sombras(raiz); for (const e of extras) raiz.add(e.obj);
  sol(raiz, 30, 50, 20, 2.4);
  return { grupo: raiz, metros: 2, zoom: 16.4, pitch: 60,
    animar: (t, dt) => { for (const [v, f] of vigas) v.rotation.z = Math.sin(t * 1.6 + f) * 0.28; for (const e of extras) e.actualizar(dt); } };
}

// ---------- Plataforma marina ----------
function construirPlataforma() {
  const raiz = new THREE.Group(), acero = mat("#7F8C8D", { metalness: 0.6 });
  for (const [x, z] of [[-16, -12], [16, -12], [-16, 12], [16, 12]]) raiz.add(cil(2, 2.4, 24, "#E8B004", x, 0, z));
  raiz.add(caja(46, 6, 36, "#95A5A6", 0, 24, 0), caja(30, 8, 20, "#ECF0F1", -4, 30, -6), caja(14, 1, 14, "#2E4053", 14, 38, 8));
  const torre = new THREE.Group();
  for (const [x, z] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 34, 0.5), acero); b.position.set(x * (1 - 0.3), 17, z * (1 - 0.3)); b.rotation.set(z * 0.02, 0, -x * 0.02); torre.add(b); }
  torre.position.set(10, 30, -8); raiz.add(torre);
  const brazo = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 1), acero); brazo.position.set(-36, 34, 10); brazo.rotation.z = -0.5; raiz.add(brazo);
  const fuego = llama(-53, 44, 10, 3.5);
  sombras(raiz); raiz.add(fuego.obj);
  sol(raiz, 30, 50, 20, 2.4);
  return { grupo: raiz, metros: 1.5, zoom: 16.8, pitch: 60, animar: (t, dt) => fuego.actualizar(dt) };
}

// ---------- Cruce fronterizo ----------
function construirFrontera() {
  const raiz = new THREE.Group(), carriles = 6;
  raiz.add(caja(100, 1, 34, "#ECF0F1", 0, 7, 0));
  for (let i = 0; i < carriles; i++) {
    const z = -14 + i * 5.6;
    for (const x of [-48, 48]) raiz.add(cil(0.5, 0.5, 7, "#BDC3C7", x, 0, z));
    raiz.add(caja(3, 3, 2, "#5D6D7E", 0, 0, z + 2.4));
    raiz.add(caja(0.2, 0.2, 2.8, "#C0392B", 1.8, 1.2, z));
  }
  const colores = ["#C0392B", "#2C3E50", "#ECF0F1", "#2980B9", "#7F8C8D", "#F1C40F"];
  const autos = [];
  for (let i = 0; i < carriles * 6; i++) {
    const c = caja(4.5, 1.5, 1.9, colores[i % colores.length], 0, 0, 0, { metalness: 0.5, roughness: 0.3 });
    const carril = i % carriles;
    autos.push({ c, z: -14 + carril * 5.6, fase: Math.floor(i / carriles) * 7 + carril * 2.3 });
    raiz.add(c);
  }
  sombras(raiz);
  sol(raiz, 30, 50, 20, 2.4);
  return { grupo: raiz, metros: 1, zoom: 17.2, pitch: 60, edificios: true,
    animar: (t) => {
      for (const a of autos) {
        // Fila que avanza a vuelta de rueda hasta la caseta, se detiene ~4 s y cruza.
        const u = ((t * 6 + a.fase * 6) % 160) - 120;
        const x = u < -6 ? Math.max(u, -6 - (a.fase % 7) * 7) : u < 0 ? -6 : u * 2.2;
        a.c.position.set(x, 0.75, a.z);
      }
    } };
}

// ---------- Desaladora ----------
function construirDesaladora() {
  const raiz = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    raiz.add(caja(40, 4, 18, "#AEB6BF", -50 + i * 45, 0, 25));
    const agua = new THREE.Mesh(new THREE.PlaneGeometry(38, 16), mat("#3C8DBC", { roughness: 0.2, metalness: 0.3 })); agua.rotation.x = -Math.PI / 2; agua.position.set(-50 + i * 45, 4.05, 25); raiz.add(agua);
  }
  raiz.add(caja(90, 12, 28, "#F2F3F4", -5, 0, -12), caja(90, 1.2, 0.3, "#1F6FB2", -5, 9, 2.2));
  for (let i = 0; i < 4; i++) raiz.add(cil(6, 6, 12, "#D0D3D4", 70, 0, -25 + i * 14, { metalness: 0.5 }));
  const tubo = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 260, 16), mat("#5D6D7E", { metalness: 0.6 })); tubo.rotation.x = Math.PI / 2; tubo.position.set(-5, 1.4, -150); raiz.add(tubo);
  // Salmuera que se dispersa al final del emisor.
  const salmuera = new Particulas(260, { textura: texturaSuave(), escala: ESCALA,
    nacer: (p) => { p.x = -5 + azar(-2, 2); p.y = 0.5; p.z = -280; const a = azar(0, 6.28), v = azar(2, 6); p.vx = Math.cos(a) * v; p.vz = Math.sin(a) * v; p.max = azar(4, 7); p.c.setRGB(0.85, 0.95, 1); },
    mover: (p, dt) => { p.x += p.vx * dt; p.z += p.vz * dt; const e = edad(p); p.tam = 3 + e * 14; p.alfa = (1 - e) * 0.55; } });
  sombras(raiz); raiz.add(salmuera.obj);
  sol(raiz, 30, 50, 20, 2.4);
  return { grupo: raiz, metros: 1, zoom: 15.8, pitch: 60, edificios: true, animar: (t, dt) => salmuera.actualizar(dt) };
}

// ---------- Mina a cielo abierto ----------
function construirMina() {
  const raiz = new THREE.Group();
  const pts = [];
  for (let k = 0; k <= 8; k++) { const r = 300 - k * 30, y = -k * 14; pts.push(new THREE.Vector2(r, y), new THREE.Vector2(r - 12, y)); }
  const tajo = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), mat("#9C7A54", { roughness: 1, side: THREE.DoubleSide, flatShading: true }));
  raiz.add(tajo);
  const camiones = [];
  for (let i = 0; i < 6; i++) { const c = caja(22, 10, 12, "#F1C40F", 0, 0, 0, { metalness: 0.3 }); raiz.add(c); camiones.push([c, i / 6]); }
  sol(raiz, 30, 60, 20, 2.4);
  return { grupo: raiz, metros: 1, zoom: 15, pitch: 55,
    animar: (t) => {
      for (const [c, f] of camiones) {
        // Rampa en espiral: baja vacío y sube cargado.
        const u = ((t / 60 + f) % 1), ida = u < 0.5 ? u * 2 : 2 - u * 2;
        const ang = ida * Math.PI * 5, r = 290 - ida * 230;
        c.position.set(Math.cos(ang) * r, -ida * 112 + 3.5, Math.sin(ang) * r);
        c.rotation.y = -ang + (u < 0.5 ? 0 : Math.PI);
      }
    } };
}

const CONSTRUCTORES = { avion: construirAvion, barco: construirBarco, satelite: construirSatelite, presa: construirPresa, nuclear: construirNuclear,
  eolica: construirEolica, solar: construirSolar, volcan: construirVolcan, tornado: construirTornado, ciclon: construirCiclon, tormenta: construirTormenta,
  sismo: construirSismo, incendio: construirIncendio, cohete: construirCohete, termica: construirTermica, datacenter: construirDatacenter,
  aeropuerto: construirAeropuerto, puerto: construirPuerto, farma: construirFarma, petroleo: construirPetroleo, plataforma: construirPlataforma,
  frontera: construirFrontera, desaladora: construirDesaladora, mina: construirMina };
export const TIPOS = Object.keys(CONSTRUCTORES);

// ---------- Capa del mapa ----------
/** Metros por píxel de pantalla a una latitud y zoom (mosaicos de 512 px de MapLibre). */
export function metrosPorPixel(lat, zoom) { return (2 * Math.PI * 6378137 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom); }
/** Desplazamiento en metros (este, sur) de `p` respecto a `origen` ([lon, lat]); aproximación local, válida a pocos km. */
export function metrosLocales(origen, p) {
  const k = Math.cos((origen[1] * Math.PI) / 180);
  return [(p[0] - origen[0]) * 111320 * k, -(p[1] - origen[1]) * 110540];
}

/** Capa «custom» de MapLibre que dibuja con three.js un modelo anclado a [lon, lat] y altitud (m). */
class CapaModelo {
  constructor(map) { this.id = "modelo-3d"; this.type = "custom"; this.renderingMode = "3d"; this.map = map; this.escena3d = null; }
  onAdd(map, gl) {
    // Un solo renderizador para todos los modelos: la capa se quita y se vuelve a poner, el contexto WebGL es el mismo.
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.escena = new THREE.Scene();
    this.camara = new THREE.Camera();
    this.reloj = new THREE.Clock(); this.t = 0;
  }
  poner(s, lngLat, altitud) {
    this.escena ??= new THREE.Scene();
    if (this.escena3d) { this.escena.remove(this.escena3d.grupo); if (this.escena3d !== s) liberar(this.escena3d.grupo); }
    this.escena3d = s; this.lngLat = lngLat; this.altitud = altitud || 0;
    this.escena.add(s.grupo);
    this.map.triggerRepaint();
  }
  #visible() {
    // En el globo, el punto puede quedar del otro lado: se comprueba con la ida y vuelta pantalla ↔ coordenada.
    try {
      const p = this.map.project(this.lngLat), c = this.map.unproject(p);
      return Math.abs(c.lat - this.lngLat[1]) < 0.5 && Math.abs((((c.lng - this.lngLat[0]) + 540) % 360) - 180) < 0.5;
    } catch (e) { return true; }
  }
  render(gl, args) {
    const s = this.escena3d;
    if (!s || !this.#visible()) return;
    if (!this.entorno) {
      this.entorno = true;
      try { this.escena.environment = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture; } catch (e) { /* sin reflejos */ }
    }
    const dt = Math.min(0.05, this.reloj.getDelta()) * (MOVIMIENTO_REDUCIDO ? 0.4 : 1);
    this.t += dt;
    s.animar?.(this.t, dt);
    let metros = s.metros || 1;
    if (s.pantalla) metros = Math.max(1, (s.pantalla.px * metrosPorPixel(this.lngLat[1], this.map.getZoom())) / s.pantalla.unidades);
    const mm = this.map.transform.getMatrixForModel(this.lngLat, this.altitud);
    const mvp = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix).multiply(new THREE.Matrix4().fromArray(mm).scale(new THREE.Vector3(metros, metros, metros)));
    this.camara.projectionMatrix.copy(mvp);
    this.camara.projectionMatrixInverse.copy(mvp).invert();
    // Partículas: cuántos píxeles mide una unidad de la escena en el punto del modelo.
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const enPantalla = (x, y, z) => { const v = new THREE.Vector4(x, y, z, 1).applyMatrix4(mvp); return [(v.x / v.w) * W / 2, (v.y / v.w) * H / 2, v.w]; };
    const [ax, ay, aw] = enPantalla(0, 0, 0), [bx, by] = enPantalla(1, 0, 0), [cx, cy] = enPantalla(0, 0, 1);
    ESCALA.value = Math.max(Math.hypot(bx - ax, by - ay), Math.hypot(cx - ax, cy - ay)) * aw;
    MAXIMO_PX.value = 320 * (window.devicePixelRatio || 1);
    this.renderer.resetState();
    this.renderer.setViewport(0, 0, W, H);
    this.renderer.render(this.escena, this.camara);
    this.map.triggerRepaint();
  }
  vaciar() {
    if (this.escena3d) { this.escena.remove(this.escena3d.grupo); liberar(this.escena3d.grupo); }
    this.escena3d = null;
  }
}

function liberar(grupo) {
  grupo.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) { for (const v of Object.values(m.uniforms || {})) if (v.value?.isTexture) v.value.dispose(); m.map?.dispose(); m.dispose(); }
  });
}

// ---------- Flujo animado sobre líneas reales (ductos, vías férreas, carreteras) ----------
const ESTILO_FLUJO = {
  petroleo: { base: "#3B2A1A", flujo: "#FF9F1C", ancho: 4 },
  gas: { base: "#5C4A00", flujo: "#FFE14D", ancho: 4 },
  tren: { base: "#2C3E50", flujo: "#FFFFFF", ancho: 5 },
  autos: { base: "#7F8C8D", flujo: "#FF4D4D", ancho: 5 },
};
// Secuencia de trazos que, mostrada en orden, hace avanzar las rayas a lo largo de la línea.
const PASOS_RAYA = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5],
  [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];

/** Dibuja y anima modelos sobre el mapa; uno a la vez (el del último clic). */
export class Modelos3D {
  constructor(map) {
    this.map = map;
    this.capa = null; this.modelo = null; this.flujo = null;
    map.on("style.load", () => { if (this.modelo) this.mostrar(this.modelo, this.lngLat, this.geom, { mover: false }); });
  }

  /** Construye el modelo, lo ancla en lngLat ([lon, lat]) y, para instalaciones y fenómenos, acerca e inclina la vista. */
  mostrar(modelo, lngLat, geom = null, { mover = true } = {}) {
    this.quitar({ restaurar: false });
    this.modelo = modelo; this.lngLat = lngLat; this.geom = geom;
    if (modelo.tipo === "flujo") { this.#flujo(geom, modelo.variante); return; }
    const f = CONSTRUCTORES[modelo.tipo];
    if (!f) return;
    const s = f(modelo);
    this.capa ??= new CapaModelo(this.map);
    if (!this.map.getLayer(this.capa.id)) this.map.addLayer(this.capa);
    this.capa.poner(s, lngLat, modelo.alt_m || 0);
    if (s.edificios) this.#edificios();
    if (mover && !s.pantalla) {
      this.pitchPrevio ??= this.map.getPitch();
      this.map.easeTo({ center: lngLat, zoom: s.zoom ?? this.map.getZoom(), pitch: s.pitch ?? 55, duration: 1400, essential: true });
    }
    if (modelo.tipo === "aeropuerto" && modelo.variante !== "helipuerto") this.map.once("idle", () => this.#alinearPistas());
  }

  /** Quita el modelo; con `restaurar`, regresa la vista a la inclinación que tenía antes del primer modelo. */
  quitar({ restaurar = true } = {}) {
    if (this.capa) { if (this.map.getLayer(this.capa.id)) this.map.removeLayer(this.capa.id); this.capa.vaciar(); }
    for (const id of ["edificios-3d"]) if (this.map.getLayer(id)) this.map.removeLayer(id);
    this.#quitarFlujo();
    if (restaurar) {
      this.modelo = null;
      if (this.pitchPrevio != null) this.map.easeTo({ pitch: this.pitchPrevio, duration: 800 });
      this.pitchPrevio = null;
    }
  }

  /** Edificios reales de OpenStreetMap (mapa base de OpenFreeMap) levantados con su altura registrada. */
  #edificios() {
    if (this.map.getLayer("edificios-3d")) return;
    const estilo = this.map.getStyle();
    if (estilo.layers.some((l) => l.type === "fill-extrusion")) return; // el estilo ya los trae en 3D
    const fuente = Object.entries(estilo.sources).find(([, v]) => v.type === "vector" && /openfreemap/.test(v.url || ""))?.[0];
    if (!fuente) return;
    this.map.addLayer({ id: "edificios-3d", type: "fill-extrusion", source: fuente, "source-layer": "building", minzoom: 14,
      paint: { "fill-extrusion-color": "#CFC9BE", "fill-extrusion-opacity": 0.92,
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0] } },
    this.map.getLayer("modelo-3d") ? "modelo-3d" : undefined);
  }

  /** Pistas del aeropuerto según OpenStreetMap (capa «aeroway» del mapa base) a menos de 6 km: el avión despega sobre la real. */
  #alinearPistas() {
    if (this.modelo?.tipo !== "aeropuerto" || !this.capa?.escena3d) return;
    const fuente = Object.entries(this.map.getStyle().sources).find(([, v]) => v.type === "vector" && /openfreemap/.test(v.url || ""))?.[0];
    if (!fuente) return;
    let feats = [];
    try { feats = this.map.querySourceFeatures(fuente, { sourceLayer: "aeroway", filter: ["==", ["get", "class"], "runway"] }); } catch (e) { return; }
    const pistas = pistasDe(feats, this.lngLat);
    if (!pistas.length) return;
    this.modelo = { ...this.modelo, pistas };
    this.capa.poner(construirAeropuerto(this.modelo), this.lngLat, 0);
  }

  #flujo(geom, variante) {
    if (!geom || !/LineString/.test(geom.type)) return;
    const e = ESTILO_FLUJO[variante] || ESTILO_FLUJO.petroleo;
    this.map.addSource("flujo-sel", { type: "geojson", data: { type: "Feature", properties: {}, geometry: geom } });
    this.map.addLayer({ id: "flujo-sel-base", type: "line", source: "flujo-sel", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": e.base, "line-width": e.ancho + 3, "line-opacity": 0.85 } });
    this.map.addLayer({ id: "flujo-sel", type: "line", source: "flujo-sel", layout: { "line-cap": "butt", "line-join": "round" },
      paint: { "line-color": e.flujo, "line-width": e.ancho, "line-dasharray": PASOS_RAYA[0] } });
    let k = 0;
    this.flujo = setInterval(() => {
      if (!this.map.getLayer("flujo-sel")) return;
      k = (k + 1) % PASOS_RAYA.length;
      this.map.setPaintProperty("flujo-sel", "line-dasharray", PASOS_RAYA[k]);
    }, 70);
  }

  #quitarFlujo() {
    clearInterval(this.flujo); this.flujo = null;
    for (const id of ["flujo-sel", "flujo-sel-base"]) if (this.map.getLayer(id)) this.map.removeLayer(id);
    if (this.map.getSource("flujo-sel")) this.map.removeSource("flujo-sel");
  }
}

/** Rasgos «runway» del mapa base → segmentos en metros respecto al aeropuerto (los de más de 600 m y a menos de 6 km). */
export function pistasDe(feats, origen) {
  const out = [];
  for (const f of feats || []) {
    const g = f.geometry || {};
    const lineas = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates
      : g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0]) : [];
    for (const l of lineas) {
      if (!l || l.length < 2) continue;
      // Los dos puntos más alejados entre sí: los extremos de la pista (sirve para línea o rectángulo).
      let a = l[0], b = l[1], d = -1;
      for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
        const [x1, z1] = metrosLocales(origen, l[i]), [x2, z2] = metrosLocales(origen, l[j]);
        const dd = Math.hypot(x2 - x1, z2 - z1);
        if (dd > d) { d = dd; a = l[i]; b = l[j]; }
      }
      const [x1, z1] = metrosLocales(origen, a), [x2, z2] = metrosLocales(origen, b);
      if (d >= 600 && Math.hypot((x1 + x2) / 2, (z1 + z2) / 2) < 6000) out.push({ x1, z1, x2, z2 });
    }
  }
  return out;
}
