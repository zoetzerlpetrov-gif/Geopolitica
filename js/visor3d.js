// Visor de modelos 3D animados (three.js r170, vendor/three, licencia MIT). Se descarga solo al abrir el primer modelo.
// Cada constructor arma una escena procedural (sin archivos 3D de terceros) y devuelve {grupo, animar(t, dt), camara, cielo}.
// La forma y los parámetros vienen de js/modelos3d.js. Todo es ilustrativo: no es el objeto real ni está a escala.
import * as THREE from "../vendor/three/three.module.min.js";
import { OrbitControls } from "../vendor/three/OrbitControls.js";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js";

const MOVIMIENTO_REDUCIDO = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
const fondoDegradado = (arriba, abajo) => texturaCanvas(4, 256, (g, w, h) => {
  const r = g.createLinearGradient(0, 0, 0, h);
  r.addColorStop(0, arriba); r.addColorStop(1, abajo);
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});

// ---------- Partículas (fuego, humo, vapor, nubes, lluvia, agua) ----------
const VERT = `attribute float tam; attribute float alfa; attribute vec3 tinte; uniform float escala; uniform float maximo;
varying float vA; varying vec3 vC;
void main() { vA = alfa; vC = tinte; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(tam * escala / -mv.z, maximo); gl_Position = projectionMatrix * mv; }`;
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

// ---------- Piezas comunes ----------
function suelo(color, radio = 80, rugosidad = 0.95) {
  const s = new THREE.Mesh(new THREE.CircleGeometry(radio, 64), mat(color, { roughness: rugosidad }));
  s.rotation.x = -Math.PI / 2; s.receiveShadow = true;
  return s;
}
function sol(grupo, x = 30, y = 50, z = 20, intensidad = 2.4, tam = 40) {
  const l = new THREE.DirectionalLight(0xffffff, intensidad);
  l.position.set(x, y, z); l.castShadow = true;
  l.shadow.mapSize.set(1024, 1024);
  Object.assign(l.shadow.camera, { left: -tam, right: tam, top: tam, bottom: -tam, near: 1, far: 200 });
  l.shadow.bias = -0.0005;
  grupo.add(l, new THREE.HemisphereLight(0xdfefff, 0x4a4030, 0.6));
  return l;
}
function sombras(o) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }
/** Agua con oleaje (vértices animados). */
function agua(tam, color = "#1d4e7a", seg = 70) {
  const g = new THREE.PlaneGeometry(tam, tam, seg, seg);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat(color, { roughness: 0.18, metalness: 0.35 }));
  m.receiveShadow = true;
  const base = g.attributes.position.array.slice();
  m.olas = (t, alto = 0.25) => {
    const a = g.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      const x = base[i], z = base[i + 2];
      a[i + 1] = alto * (Math.sin(x * 0.35 + t * 1.4) + 0.6 * Math.sin(z * 0.5 + t * 1.1) + 0.3 * Math.sin((x + z) * 0.9 + t * 2.3));
    }
    g.attributes.position.needsUpdate = true; g.computeVertexNormals();
  };
  return m;
}
function arbol(x, z, h = 2.2, color = "#2f6b34") {
  const g = new THREE.Group();
  const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * h, 0.11 * h, 0.35 * h, 6), mat("#5b4026"));
  tronco.position.y = 0.17 * h;
  const copa = new THREE.Mesh(new THREE.ConeGeometry(0.38 * h, 0.85 * h, 7), mat(color, { roughness: 0.9 }));
  copa.position.y = 0.72 * h;
  g.add(tronco, copa); g.position.set(x, 0, z);
  return g;
}

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
  // Nubes que pasan por debajo para dar sensación de vuelo.
  const escala = { value: 900 };
  const nubes = new Particulas(160, { textura: texturaHumo(), escala,
    nacer: (p) => { p.x = azar(40, 60); p.y = azar(-9, -4); p.z = azar(-30, 30); p.vx = -azar(9, 14); p.max = 9; p.tam = azar(6, 12); p.alfa = 0.85; p.c.setRGB(1, 1, 1); },
    mover: (p, dt) => { p.x += p.vx * dt; const e = edad(p); p.alfa = Math.min(1, e * 5, (1 - e) * 5) * 0.85; } });
  const raiz = new THREE.Group(); raiz.add(g, nubes.obj);
  sol(raiz, 20, 40, 25, 2.2, 15);
  return {
    grupo: raiz, escala, camara: [11, 4, 14], objetivo: [0, 0, 0], cielo: ["#3d7fc4", "#cfe6f7"],
    animar: (t, dt) => {
      g.rotation.x = Math.sin(t * 0.5) * 0.06; g.rotation.z = Math.sin(t * 0.35) * 0.025; g.position.y = Math.sin(t * 0.8) * 0.15;
      for (const [o, eje, v] of giran) o.rotation[eje] += v * dt;
      nubes.actualizar(dt);
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
  const mar = agua(160, "#1b4f7c");
  const raiz = new THREE.Group(); raiz.add(mar, g);
  // Estela blanca detrás del barco.
  const escala = { value: 900 };
  const estela = new Particulas(220, { textura: texturaSuave(), escala,
    nacer: (p) => { p.x = -L / 2 + azar(-0.3, 0.3); p.y = 0.15; p.z = azar(-W / 3, W / 3); p.vx = -azar(2, 3); p.vz = (p.z >= 0 ? 1 : -1) * azar(0.2, 0.6); p.max = azar(2.5, 4); p.tam = azar(0.6, 1.2); p.c.setRGB(1, 1, 1); },
    mover: (p, dt) => { p.x += p.vx * dt; p.z += p.vz * dt; p.alfa = (1 - edad(p)) * 0.7; p.tam += dt * 0.8; } });
  raiz.add(estela.obj);
  sol(raiz, 30, 40, 20, 2.4, 14);
  return {
    grupo: raiz, escala, camara: [14, 6, 13], objetivo: [0, 1.4, 0], cielo: ["#5d9fd6", "#e2eef6"], niebla: ["#cfe0ec", 40, 110],
    animar: (t, dt) => {
      mar.olas(t, f === "vela" || f === "pesca" ? 0.22 : 0.16);
      g.position.y = Math.sin(t * 1.2) * 0.12; g.rotation.x = Math.sin(t * 0.9) * (L < 8 ? 0.06 : 0.025); g.rotation.z = Math.sin(t * 0.7) * 0.015;
      estela.actualizar(dt);
    },
  };
}

// ---------- Satélite ----------
function tierraLejana(radio) {
  const tex = texturaCanvas(512, 256, (g, w, h) => {
    g.fillStyle = "#123e72"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { // manchas de tierra y nubes, solo ambientación
      g.fillStyle = i < 30 ? "rgba(70,110,60,0.85)" : "rgba(255,255,255,0.55)";
      g.beginPath(); g.ellipse(azar(0, w), azar(h * 0.15, h * 0.85), azar(8, i < 30 ? 50 : 30), azar(4, 16), azar(0, 3), 0, Math.PI * 2); g.fill();
    }
  });
  const t = new THREE.Mesh(new THREE.SphereGeometry(radio, 64, 48), mat("#ffffff", { map: tex, roughness: 0.9, metalness: 0 }));
  const atm = new THREE.Mesh(new THREE.SphereGeometry(radio * 1.025, 64, 48), new THREE.MeshBasicMaterial({ color: "#5aa9ff", transparent: true, opacity: 0.18, side: THREE.BackSide, blending: THREE.AdditiveBlending }));
  const g = new THREE.Group(); g.add(t, atm);
  return g;
}
function estrellas(n = 1500, r = 400) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(azar(-1, 1), azar(-1, 1), azar(-1, 1)).normalize().multiplyScalar(r);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false }));
}
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
  const tierra = tierraLejana(60); tierra.position.set(0, -78, -20);
  const raiz = new THREE.Group(); raiz.add(tierra, estrellas(), g);
  const luz = new THREE.DirectionalLight(0xfff4e0, 3); luz.position.set(40, 30, 30);
  raiz.add(luz, new THREE.AmbientLight(0x8899aa, 0.35));
  return {
    grupo: raiz, camara: [12, 5, 15], objetivo: [0, 0, 0], cielo: ["#01030a", "#081a33"],
    animar: (t, dt) => {
      g.rotation.y = t * 0.12; g.position.y = Math.sin(t * 0.4) * 0.3;
      for (const p of paneles) p.rotation.z = Math.sin(t * 0.2) * 0.25;
      tierra.rotation.y += dt * 0.01;
    },
  };
}

// ---------- Terreno con valle (presa) ----------
function terrenoValle(tam = 140, seg = 140, ancho = 16, alto = 18) {
  const g = new THREE.PlaneGeometry(tam, tam, seg, seg);
  g.rotateX(-Math.PI / 2);
  const a = g.attributes.position.array, col = new Float32Array(a.length);
  const c = new THREE.Color();
  for (let i = 0; i < a.length; i += 3) {
    const x = a[i], z = a[i + 2];
    const d = Math.abs(z + Math.sin(x * 0.04) * 4) / ancho;
    const h = alto * Math.min(1, Math.max(0, d - 0.25) ** 1.4) + Math.sin(x * 0.2) * Math.cos(z * 0.17) * 1.2 + Math.sin(x * 0.07 + z * 0.05) * 2;
    a[i + 1] = h - 2;
    const u = Math.min(1, Math.max(0, h / alto));
    c.set(u < 0.12 ? "#6b7d3a" : u < 0.7 ? "#4f6b2f" : u < 0.93 ? "#6f6a4a" : "#8a8376");
    col.set([c.r, c.g, c.b], i);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.receiveShadow = true;
  return m;
}
function construirPresa(m) {
  const raiz = new THREE.Group();
  raiz.add(terrenoValle());
  const R = 24, esp = 2.4, alto = 17, ang = 0.62;
  const s = new THREE.Shape();
  s.absarc(0, 0, R, -ang, ang, false); s.absarc(0, 0, R - esp, ang, -ang, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: alto, bevelEnabled: false, curveSegments: 48 });
  g.rotateX(-Math.PI / 2);
  const cortina = new THREE.Mesh(g, mat("#c9c4b8", { roughness: 0.85 }));
  cortina.rotation.y = Math.PI; cortina.position.set(R - 3, -3, 0); // convexa aguas arriba (−X)
  raiz.add(sombras(cortina));
  const embalse = agua(70, "#24597a", 50); embalse.position.set(-38, alto - 4.5, 0); raiz.add(embalse);
  const rio = agua(60, "#2f6f86", 40); rio.scale.set(1, 1, 0.25); rio.position.set(36, -1.6, 0); raiz.add(rio);
  if (m.hidro) { raiz.add(sombras(caja(5, 3, 9, "#b8b2a6", 6, -2, 0))); }
  const escala = { value: 900 };
  // Agua del vertedor: cae desde la corona por la cara de la cortina y se vuelve espuma abajo.
  const caida = new Particulas(900, { textura: texturaSuave(), escala,
    nacer: (p) => { p.x = -0.5; p.y = alto - 4; p.z = azar(-2.5, 2.5); p.vx = azar(2.5, 4); p.vy = 0; p.vz = 0; p.max = 2.2; p.tam = azar(0.5, 0.9); p.c.set("#dff3ff"); p.alfa = 0.9; },
    mover: (p, dt) => {
      p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < -1.2) { p.y = -1.2; p.vy *= -0.15; p.vx *= 0.6; p.vz = azar(-3, 3); p.tam += dt * 2; p.c.set("#ffffff"); }
      p.alfa = (1 - edad(p)) * 0.85;
    } });
  raiz.add(caida.obj);
  sol(raiz, -30, 45, 30, 2.4, 50);
  return { grupo: raiz, escala, camara: [58, 30, 10], objetivo: [0, 6, 0], cielo: ["#4b8fd0", "#dceaf5"], niebla: ["#d6e5f0", 70, 170],
    animar: (t, dt) => { embalse.olas(t, 0.05); rio.olas(t * 2, 0.12); caida.actualizar(dt); } };
}

// ---------- Central nuclear ----------
function torreEnfriamiento() {
  const pts = [];
  for (let i = 0; i <= 20; i++) { const y = (i / 20) * 14; pts.push(new THREE.Vector2(3.2 * Math.sqrt(1 + ((y - 10) / 5.5) ** 2) * 0.72, y)); }
  const t = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), mat("#d5d1c8", { roughness: 0.9, side: THREE.DoubleSide }));
  return t;
}
function construirNuclear() {
  const raiz = new THREE.Group();
  raiz.add(suelo("#6f7f4a", 90));
  const torres = [[-8, -6], [-8, 7]];
  for (const [x, z] of torres) { const t = torreEnfriamiento(); t.position.set(x, 0, z); raiz.add(sombras(t)); }
  const cont = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 5, 40), mat("#e8e5dd")); cont.position.set(6, 2.5, -3);
  const domo = new THREE.Mesh(new THREE.SphereGeometry(3, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat("#e8e5dd")); domo.position.set(6, 5, -3);
  const chimenea = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 12, 16), mat("#d8d4cc")); chimenea.position.set(12, 6, 9);
  raiz.add(sombras(cont), sombras(domo), sombras(caja(9, 4, 5, "#9fb0bf", 7, 0, 5)), sombras(chimenea));
  const escala = { value: 900 };
  const vapor = new Particulas(500, { textura: texturaHumo(), escala,
    nacer: (p) => { const [x, z] = torres[(Math.random() * 2) | 0]; p.x = x + azar(-1.5, 1.5); p.y = 14; p.z = z + azar(-1.5, 1.5); p.vy = azar(2, 3.2); p.vx = azar(0.6, 1.4); p.max = azar(5, 8); p.tam = 3; p.c.setRGB(1, 1, 1); },
    mover: (p, dt) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy *= 0.995; const e = edad(p); p.tam = 3 + e * 14; p.alfa = Math.min(1, e * 6) * (1 - e) * 0.75; } });
  raiz.add(vapor.obj);
  for (let i = 0; i < 40; i++) { const a = azar(0, 6.28), r = azar(22, 60); raiz.add(arbol(Math.cos(a) * r, Math.sin(a) * r, azar(1.8, 3))); }
  sol(raiz, 30, 45, 20, 2.4, 40);
  return { grupo: raiz, escala, camara: [30, 16, 30], objetivo: [0, 6, 0], cielo: ["#5b98d1", "#e3eef6"], niebla: ["#dde9f2", 60, 160], animar: (t, dt) => vapor.actualizar(dt) };
}

// ---------- Parque eólico ----------
function construirEolica() {
  const raiz = new THREE.Group();
  raiz.add(suelo("#7c9a4e", 120));
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
  sol(raiz, 30, 50, 10, 2.4, 50);
  return { grupo: raiz, camara: [30, 14, 34], objetivo: [0, 10, 0], cielo: ["#4f93d6", "#e6f0f8"], niebla: ["#e0ebf4", 60, 180],
    animar: (t, dt) => { for (const [r, v] of rotores) r.rotation.x += v * dt; } };
}

// ---------- Planta solar ----------
function construirSolar() {
  const raiz = new THREE.Group();
  raiz.add(suelo("#b9a57c", 90));
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
  sol(raiz, 20, 50, 30, 2.6, 40);
  return { grupo: raiz, camara: [28, 16, 30], objetivo: [0, 0, 0], cielo: ["#3f8ad6", "#eaf2f8"], niebla: ["#e8eef2", 60, 170],
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
  raiz.add(sombras(cono), suelo("#5c6b40", 140));
  const lava = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), new THREE.MeshBasicMaterial({ color: nivel >= 3 ? "#ff5a1a" : "#7a2a12" }));
  lava.rotation.x = -Math.PI / 2; lava.position.y = 18.7; raiz.add(lava);
  const brillo = new THREE.PointLight(0xff6a2a, nivel >= 3 ? 60 : 8, 40); brillo.position.y = 21; raiz.add(brillo);
  const escala = { value: 900 };
  const ceniza = new Particulas(200 + nivel * 160, { textura: texturaHumo(), escala,
    nacer: (p) => { p.x = azar(-1.5, 1.5); p.y = 20; p.z = azar(-1.5, 1.5); p.vy = azar(3, 5) * (0.5 + nivel * 0.3); p.vx = azar(0.5, 1.5); p.max = azar(5, 9); const g = azar(0.25, 0.45); p.c.setRGB(g, g * 0.95, g * 0.9); },
    mover: (p, dt) => { p.x += p.vx * dt * (1 + p.y * 0.04); p.y += p.vy * dt; p.vy *= 0.993; const e = edad(p); p.tam = 3 + e * (8 + nivel * 3); p.alfa = Math.min(1, e * 6) * (1 - e) * 0.9; } });
  raiz.add(ceniza.obj);
  let bombas = null;
  if (nivel >= 4) {
    bombas = new Particulas(140, { textura: texturaSuave(), aditivo: true, escala,
      nacer: (p) => { p.x = 0; p.y = 19.5; p.z = 0; const a = azar(0, 6.28), v = azar(4, 9); p.vx = Math.cos(a) * v * 0.5; p.vz = Math.sin(a) * v * 0.5; p.vy = azar(8, 16); p.max = azar(1.5, 3); p.tam = azar(0.5, 0.9); p.c.setRGB(1, azar(0.35, 0.6), 0.1); p.alfa = 1; },
      mover: (p, dt) => { p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.alfa = 1 - edad(p); } });
    raiz.add(bombas.obj);
  }
  sol(raiz, -30, 40, 25, 2.0, 60);
  return { grupo: raiz, escala, camara: [80, 34, 80], objetivo: [0, 14, 0], cielo: nivel >= 4 ? ["#5d5a5a", "#c9b7a4"] : ["#5a93c8", "#dfe8ef"], niebla: ["#d9d6d0", 80, 220],
    animar: (t, dt) => { ceniza.actualizar(dt); bombas?.actualizar(dt); brillo.intensity = (nivel >= 3 ? 60 : 8) * (0.8 + 0.3 * Math.sin(t * 7) * Math.sin(t * 3.1)); } };
}

// ---------- Tornado ----------
function construirTornado(m) {
  const raiz = new THREE.Group();
  const base = m.agua ? agua(160, "#3d5560") : suelo("#6a7046", 120);
  raiz.add(base);
  if (!m.agua) for (let i = 0; i < 50; i++) raiz.add(arbol(azar(-60, 60), azar(-60, 60), azar(1.5, 2.5)));
  const escala = { value: 900 };
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
    nacer: (p) => { const a = azar(0, 6.28), r = Math.sqrt(Math.random()) * 70; p.x = Math.cos(a) * r; p.z = Math.sin(a) * r; p.y = H + azar(0, 5); p.a = a; p.r = r; p.max = 1e9; p.tam = azar(14, 22); const g = azar(0.22, 0.36); p.c.setRGB(g, g, g * 1.05); p.alfa = 0.9; },
    mover: (p, dt) => { p.a += dt * 0.05; p.x = Math.cos(p.a) * p.r; p.z = Math.sin(p.a) * p.r; } });
  raiz.add(nube.obj);
  raiz.add(new THREE.HemisphereLight(0x9aa59a, 0x3a3a30, 1.2));
  const l = new THREE.DirectionalLight(0xd8e0d0, 0.9); l.position.set(-20, 40, 10); raiz.add(l);
  return { grupo: raiz, escala, camara: [48, 12, 48], objetivo: [0, 14, 0], cielo: ["#3d4540", "#8a9488"], niebla: ["#6f7a70", 50, 160],
    animar: (t, dt) => { embudo.position.set(Math.sin(t * 0.15) * 10, 0, Math.cos(t * 0.11) * 8); remolino.actualizar(dt); escombros.actualizar(dt); nube.actualizar(dt); base.olas?.(t, 0.3); } };
}

// ---------- Ciclón ----------
function construirCiclon(m) {
  const raiz = new THREE.Group();
  const mar = agua(260, "#14466e", 60); raiz.add(mar);
  const cat = m.cat || 0, sentido = m.sur ? -1 : 1;
  const escala = { value: 900 };
  const nubes = new THREE.Group(); raiz.add(nubes);
  const bandas = cat >= 3 ? 3 : 2, n = 1500 + cat * 250;
  const espiral = new Particulas(n, { textura: texturaHumo(), escala,
    nacer: (p) => {
      const u = Math.random(), pared = u < 0.25, centro = u >= 0.25 && u < 0.25 + 0.05 * cat; // pared del ojo y nubosidad central
      if (pared) { p.r = azar(4.5, 6.5); p.a = azar(0, 6.28); }
      else if (centro) { p.r = azar(6.5, 13); p.a = azar(0, 6.28); }
      else { const k = (Math.random() * bandas) | 0, th = Math.random() * 4.2; p.r = 6.5 * Math.exp(0.42 * th) + azar(-1.2, 1.2) * (1 + th * 0.4); p.a = (k / bandas) * 6.28 - th * sentido + azar(-0.15, 0.15); }
      p.x = Math.cos(p.a) * p.r; p.z = Math.sin(p.a) * p.r;
      p.y = 6 + azar(-1, 1.5) + (pared ? 2.5 : 0); p.max = 1e9; p.tam = pared ? azar(2.5, 3.5) : azar(3, 5.5); const g = azar(0.85, 1); p.c.setRGB(g, g, g); p.alfa = pared ? 0.9 : azar(0.5, 0.85);
    },
    mover: () => {} });
  espiral.actualizar(0);
  nubes.add(espiral.obj); // gira todo junto: con giro diferencial las bandas se enrollarían en una mancha
  sol(raiz, 40, 60, 20, 2.2, 90);
  return { grupo: raiz, escala, camara: [0, 75, 70], objetivo: [0, 0, 0], cielo: ["#0d2a4a", "#6c93b8"], niebla: ["#5f84a6", 120, 300],
    animar: (t, dt) => { nubes.rotation.y += dt * sentido * (0.12 + cat * 0.04); mar.olas(t, 0.4); } };
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
  raiz.add(suelo("#3d4a34", 140));
  for (let i = 0; i < 60; i++) raiz.add(arbol(azar(-70, 70), azar(-70, 70), azar(1.6, 2.6), "#2b4a2c"));
  const escala = { value: 900 };
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
  return { grupo: raiz, escala, camara: [55, 14, 55], objetivo: [0, 16, 0], cielo: ["#1d2229", "#4b5560"], niebla: ["#3a424b", 60, 180],
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
function construirSismo(m) {
  const raiz = new THREE.Group();
  const mag = Math.max(2, Math.min(9.5, m.mag || 5));
  const amp = Math.min(1.4, 0.02 * 1.75 ** (mag - 2));
  const capas = ["#7a8b4c", "#8a6d4b", "#7b5e40", "#6b5038", "#5a4535"];
  const bloque = (x) => {
    const g = new THREE.Group();
    capas.forEach((c, i) => g.add(caja(30, 2.4, 40, c, 0, -2.4 * (i + 1), 0, { roughness: 0.95 })));
    for (let i = 0; i < 14; i++) { const h = azar(1.5, 6); g.add(caja(azar(1.5, 3), h, azar(1.5, 3), ["#d8d4cc", "#b9c2c9", "#e6dccd"][i % 3], azar(-11, 11), 0, azar(-16, 16))); }
    for (let i = 0; i < 12; i++) g.add(arbol(azar(-13, 13), azar(-18, 18), 1.6));
    g.position.x = x;
    return sombras(g);
  };
  const a = bloque(-15.2), b = bloque(15.2);
  raiz.add(a, b);
  const hipo = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 16), new THREE.MeshBasicMaterial({ color: "#ff3b30" })); hipo.position.set(0, -9, 0); raiz.add(hipo);
  const ondas = [];
  for (let i = 0; i < 4; i++) {
    const o = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 64), new THREE.MeshBasicMaterial({ color: "#ffb020", transparent: true, side: THREE.DoubleSide }));
    o.rotation.x = -Math.PI / 2; o.position.y = 0.05; raiz.add(o); ondas.push(o);
  }
  sol(raiz, 30, 45, 25, 2.4, 40);
  return { grupo: raiz, camara: [38, 22, 46], objetivo: [0, -3, 0], cielo: ["#6aa0cf", "#e8eef3"],
    animar: (t) => {
      const ciclo = t % 6, fuerte = ciclo < 3.5 ? Math.sin((ciclo / 3.5) * Math.PI) : 0;
      a.position.z = Math.sin(t * 23) * amp * fuerte; b.position.z = -Math.sin(t * 23) * amp * fuerte;
      a.position.y = Math.sin(t * 17) * amp * 0.3 * fuerte; b.position.y = -a.position.y;
      hipo.scale.setScalar(1 + 0.4 * Math.sin(t * 6));
      ondas.forEach((o, i) => { const u = ((ciclo / 3.5) + i / 4) % 1; o.scale.setScalar(1 + u * 26); o.material.opacity = ciclo < 3.5 ? (1 - u) * 0.8 : 0; });
    } };
}

// ---------- Incendio ----------
function construirIncendio() {
  const raiz = new THREE.Group();
  raiz.add(suelo("#4d4a2c", 120));
  for (let i = 0; i < 220; i++) { const x = azar(-50, 50), z = azar(-50, 50); raiz.add(arbol(x, z, azar(2, 3.4), x < -4 ? "#2f2a24" : "#335f30")); }
  const escala = { value: 900 };
  const frente = () => Math.sin(performance.now() / 9000) * 3; // el frente avanza y retrocede un poco
  const fuego = new Particulas(1400, { textura: texturaSuave(), aditivo: true, escala,
    nacer: (p) => { p.x = frente() + azar(-3, 3); p.z = azar(-40, 40); p.y = azar(0, 1); p.vy = azar(3, 7); p.vx = azar(0.5, 2); p.max = azar(0.5, 1.3); p.tam = azar(1.2, 2.4); p.c.setRGB(1, azar(0.45, 0.8), 0.15); },
    mover: (p, dt) => { p.x += p.vx * dt; p.y += p.vy * dt; const e = edad(p); p.alfa = (1 - e) * 0.9; p.c.g = Math.max(0.15, p.c.g - dt * 0.6); p.tam *= 1 - dt * 0.6; } });
  const humo = new Particulas(500, { textura: texturaHumo(), escala,
    nacer: (p) => { p.x = frente() + azar(-3, 3); p.z = azar(-40, 40); p.y = 4; p.vy = azar(2, 4); p.vx = azar(2, 4); p.max = azar(6, 10); const g = azar(0.25, 0.45); p.c.setRGB(g, g * 0.95, g * 0.9); },
    mover: (p, dt) => { p.x += p.vx * dt; p.y += p.vy * dt; const e = edad(p); p.tam = 5 + e * 20; p.alfa = Math.min(1, e * 5) * (1 - e) * 0.65; } });
  raiz.add(humo.obj, fuego.obj);
  const luz = new THREE.PointLight(0xff7a2a, 400, 70, 1.5); luz.position.set(0, 4, 0); raiz.add(luz);
  sol(raiz, -30, 30, 20, 1.2, 60);
  return { grupo: raiz, escala, camara: [55, 18, 48], objetivo: [0, 5, 0], cielo: ["#5b4a3e", "#d39a62"], niebla: ["#8a7563", 50, 170],
    animar: (t, dt) => { fuego.actualizar(dt); humo.actualizar(dt); luz.intensity = 400 * (0.75 + 0.35 * Math.sin(t * 13) * Math.sin(t * 5.3)); luz.position.x = frente(); } };
}

// ---------- Cohete ----------
function construirCohete() {
  const raiz = new THREE.Group();
  raiz.add(suelo("#8f8a7c", 120));
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
  const escala = { value: 900 };
  let altura = 0, empuje = 0;
  const fuego = new Particulas(900, { textura: texturaSuave(), aditivo: true, escala,
    nacer: (p) => { p.x = azar(-0.5, 0.5); p.z = azar(-0.5, 0.5); p.y = cohete.position.y - 1.2; p.vy = -azar(18, 30); p.vx = azar(-1.5, 1.5); p.vz = azar(-1.5, 1.5); p.max = azar(0.25, 0.6); p.tam = azar(1, 1.8); p.c.setRGB(1, azar(0.75, 0.95), azar(0.4, 0.7)); },
    mover: (p, dt) => { p.x += p.vx * dt; p.y = Math.max(1.4, p.y + p.vy * dt); p.z += p.vz * dt; p.alfa = empuje * (1 - edad(p)); p.c.b *= 0.96; } });
  const humo = new Particulas(600, { textura: texturaHumo(), escala,
    nacer: (p) => { const a = azar(0, 6.28); p.x = Math.cos(a) * 2; p.z = Math.sin(a) * 2; p.y = 1.5; const v = azar(4, 10); p.vx = Math.cos(a) * v; p.vz = Math.sin(a) * v; p.vy = azar(0.5, 2); p.max = azar(3, 6); const g = azar(0.8, 0.95); p.c.setRGB(g, g, g); },
    mover: (p, dt) => { p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vz *= 0.98; const e = edad(p); p.tam = 4 + e * 16; p.alfa = (altura < 40 ? empuje : 0.2 * empuje) * Math.min(1, e * 4) * (1 - e) * 0.8; } });
  raiz.add(humo.obj, fuego.obj);
  sol(raiz, 30, 50, 20, 2.4, 40);
  return { grupo: raiz, escala, camara: [36, 14, 40], objetivo: [0, 12, 0], cielo: ["#3b7cc4", "#dbe9f5"], niebla: ["#dbe7f1", 80, 400],
    animar: (t, dt, controles) => {
      const ciclo = t % 14;
      empuje = ciclo < 2 ? 0 : ciclo < 3 ? (ciclo - 2) : 1;
      altura = ciclo < 3 ? 0 : 0.9 * (ciclo - 3) ** 2.2;
      cohete.position.y = 2 + altura;
      if (controles) controles.target.y = 12 + altura * 0.85;
      fuego.actualizar(dt); humo.actualizar(dt);
    } };
}

const CONSTRUCTORES = { avion: construirAvion, barco: construirBarco, satelite: construirSatelite, presa: construirPresa, nuclear: construirNuclear,
  eolica: construirEolica, solar: construirSolar, volcan: construirVolcan, tornado: construirTornado, ciclon: construirCiclon, tormenta: construirTormenta,
  sismo: construirSismo, incendio: construirIncendio, cohete: construirCohete };
export const TIPOS = Object.keys(CONSTRUCTORES);

// ---------- Visor (ventana sobre el mapa) ----------
class Visor {
  constructor() {
    const d = document.createElement("div");
    d.className = "visor3d"; d.hidden = true;
    d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-labelledby", "visor3d-titulo");
    d.innerHTML = `<div class="visor3d-caja"><header><h3 id="visor3d-titulo"></h3><button type="button" class="icon-btn" id="visor3d-cerrar" aria-label="Cerrar modelo 3D">✕</button></header>
      <div class="visor3d-lienzo"><canvas></canvas></div><p class="meta" id="visor3d-nota"></p><p class="meta visor3d-ayuda">Arrastra para girar · rueda o pellizco para acercar · Esc para cerrar</p></div>`;
    document.body.append(d);
    this.div = d; this.canvas = d.querySelector("canvas");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.escena = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.camara = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
    this.controles = new OrbitControls(this.camara, this.canvas);
    Object.assign(this.controles, { enableDamping: true, autoRotate: !MOVIMIENTO_REDUCIDO, autoRotateSpeed: 0.7, maxPolarAngle: Math.PI * 0.495, minDistance: 3, maxDistance: 260 });
    this.reloj = new THREE.Clock();
    d.querySelector("#visor3d-cerrar").addEventListener("click", () => this.cerrar());
    d.addEventListener("click", (e) => { if (e.target === d) this.cerrar(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !d.hidden) this.cerrar(); });
    new ResizeObserver(() => this.ajustar()).observe(d.querySelector(".visor3d-lienzo"));
    this.controles.addEventListener("start", () => { this.controles.autoRotate = false; }); // el usuario toma el control
  }
  ajustar() {
    const c = this.div.querySelector(".visor3d-lienzo"), w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h; this.camara.updateProjectionMatrix();
    // Diámetro en unidades → píxeles: alto del lienzo / (2·tan(fov/2)).
    const pr = this.renderer.getPixelRatio();
    if (this.escena3d?.escala) this.escena3d.escala.value = (h * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camara.fov) / 2));
    MAXIMO_PX.value = 320 * pr;
  }
  mostrar(m) {
    this.limpiar();
    const f = CONSTRUCTORES[m.tipo];
    if (!f) return;
    this.focoPrevio = document.activeElement;
    this.div.querySelector("#visor3d-titulo").textContent = `🧊 ${m.titulo || ""}`;
    this.div.querySelector("#visor3d-nota").textContent = m.nota || "";
    this.div.hidden = false;
    const s = f(m);
    this.escena3d = s;
    this.escena.add(s.grupo);
    this.escena.background = fondoDegradado(...(s.cielo || ["#1b2a3a", "#4a6680"]));
    this.escena.fog = s.niebla ? new THREE.Fog(s.niebla[0], s.niebla[1], s.niebla[2]) : null;
    this.ajustar();
    this.controles.target.set(...(s.objetivo || [0, 0, 0]));
    // En pantallas verticales (teléfono) la cámara se aleja para que el modelo quepa a lo ancho.
    const k = this.camara.aspect < 1 ? Math.min(2.2, (1 / this.camara.aspect) ** 0.8) : 1;
    this.camara.position.set(...s.camara).sub(this.controles.target).multiplyScalar(k).add(this.controles.target);
    this.controles.autoRotate = !MOVIMIENTO_REDUCIDO;
    this.controles.update();
    this.reloj.start(); this.t = 0;
    const cuadro = () => {
      if (this.div.hidden) return;
      this.raf = requestAnimationFrame(cuadro);
      const dt = Math.min(0.05, this.reloj.getDelta());
      this.t += MOVIMIENTO_REDUCIDO ? dt * 0.4 : dt;
      s.animar?.(this.t, MOVIMIENTO_REDUCIDO ? dt * 0.4 : dt, this.controles);
      this.controles.update();
      this.renderer.render(this.escena, this.camara);
    };
    cuadro();
    this.div.querySelector("#visor3d-cerrar").focus();
  }
  limpiar() {
    cancelAnimationFrame(this.raf);
    if (!this.escena3d) return;
    this.escena.remove(this.escena3d.grupo);
    this.escena3d.grupo.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) { for (const v of Object.values(m.uniforms || {})) v.value?.dispose?.(); m.map?.dispose(); m.dispose(); }
    });
    this.escena.background?.dispose?.();
    this.escena3d = null;
  }
  cerrar() {
    this.div.hidden = true;
    this.limpiar();
    this.focoPrevio?.focus?.();
  }
}

let visor = null;
/** Abre el visor con un modelo de js/modelos3d.js. */
export function abrir(modelo) {
  visor ??= new Visor();
  visor.mostrar(modelo);
}
