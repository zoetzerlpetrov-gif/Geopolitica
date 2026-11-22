// Página «Mi cuenta DOMINUS» (admin.dominusosint.com/cuenta/): mismo lenguaje visual del sitio (paleta táctica, acento
// dorado, cruz templaria, tipografías Barlow Condensed e IBM Plex del propio sitio). Sólo el script local de tema. Todo el texto variable
// pasa por esc(). El CSS se sirve aparte en /cuenta/cuenta.css para que la CSP no permita estilos en línea.
import config from "../../config/planes.json" with { type: "json" };

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const SITIO = "https://dominusosint.com";
const precio = (p) => (p.usd === 0 ? "Gratis" : `USD ${Number(p.usd).toFixed(2)} / mes`);
const CRUZ = `<svg class="cruz" viewBox="0 0 100 100" aria-hidden="true"><path fill="#C8102E" d="M44 44 30 4h40L56 44 96 30v40L56 56l14 40H30l14-40L4 70V30z"/></svg>`;
const G = `<svg class="g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

export const CSS = `@import url("${SITIO}/vendor/fonts/fuentes.css");
:root{--bg:#0a0f17;--panel:#101826;--panel2:#172234;--texto:#e3e7ee;--texto2:#9aa7bd;--linea:#243248;--acento:#c9a227;--rojo:#C8102E;--ok:#3fb27f;--barra:rgba(10,15,23,.6);--caja:rgba(0,0,0,.18)}
@media (prefers-color-scheme:light){:root{--bg:#f4f2ed;--panel:#ffffff;--panel2:#efebe3;--texto:#1b1f24;--texto2:#55606e;--linea:#d9d3c6;--acento:#8a6d12;--ok:#2e7d32;--barra:rgba(255,255,255,.75);--caja:#faf8f3}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(1200px 600px at 80% -10%,rgba(201,162,39,.16),transparent 60%),radial-gradient(900px 500px at -10% 110%,rgba(200,16,46,.14),transparent 60%),var(--bg);color:var(--texto);font:16px/1.55 "IBM Plex Sans",system-ui,sans-serif}
a{color:var(--acento)}h1,h2,.marca,.chip,.btn{font-family:"Barlow Condensed","IBM Plex Sans",sans-serif;letter-spacing:.05em}
.barra{display:flex;align-items:center;gap:10px;padding:12px 20px;border-bottom:1px solid var(--linea);background:var(--barra);backdrop-filter:blur(6px)}
.marca{display:flex;align-items:center;gap:8px;font-weight:700;font-size:18px;text-transform:uppercase;color:var(--texto);text-decoration:none;margin-right:auto}.cruz{width:22px;height:22px}
.barra a.volver{font-size:14px;text-decoration:none;border:1px solid var(--linea);padding:6px 12px;border-radius:4px;color:var(--texto)}
main{max-width:980px;margin:0 auto;padding:40px 18px 60px}
.tarjeta{background:linear-gradient(180deg,var(--panel),var(--panel2));border:1px solid var(--linea);border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.04);padding:28px;position:relative;overflow:hidden}
.tarjeta::before{content:"";position:absolute;inset:0 0 auto 0;height:3px;background:linear-gradient(90deg,var(--rojo),var(--acento))}
.kicker{color:var(--acento);text-transform:uppercase;font:700 13px/1 "Barlow Condensed",sans-serif;letter-spacing:.14em}
h1{font-size:clamp(30px,5vw,44px);text-transform:uppercase;margin:6px 0 4px;line-height:1.05}.sub{color:var(--texto2);margin:0 0 18px}
.chip{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:700;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid var(--acento);color:var(--acento)}
.chip.ok::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 8px var(--ok)}
.rejilla{display:grid;grid-template-columns:1.1fr .9fr;gap:22px;margin-top:18px}@media (max-width:760px){.rejilla{grid-template-columns:1fr}}
.plan{border:1px solid var(--linea);border-left:3px solid var(--acento);border-radius:8px;padding:16px;background:var(--caja)}.plan h2{margin:0;font-size:24px;text-transform:uppercase}.plan .precio{font-size:20px;font-weight:700;color:var(--acento)}
.plan ul{margin:10px 0 0;padding-left:18px;color:var(--texto2)}.plan li{margin:3px 0}
.acciones{display:flex;flex-direction:column;gap:10px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;font-size:17px;font-weight:700;text-transform:uppercase;padding:12px 16px;border-radius:6px;text-decoration:none;border:1px solid var(--linea);color:var(--texto);background:var(--panel2);cursor:pointer;width:100%}
.btn:hover{border-color:var(--acento)}.btn.primario{background:var(--acento);border-color:var(--acento);color:#111}.btn.google{background:#fff;color:#1f1f1f;border-color:#dadce0}.g{width:22px;height:22px}
form{margin:0}.alerta{border-left:4px solid var(--rojo);background:rgba(200,16,46,.1);padding:10px 12px;border-radius:4px;margin:0 0 14px}
.nota{font-size:13px;color:var(--texto2)}.pasos{counter-reset:p;list-style:none;padding:0;margin:0}.pasos li{counter-increment:p;padding:6px 0 6px 38px;position:relative}
.pasos li::before{content:counter(p);position:absolute;left:0;top:4px;width:26px;height:26px;border-radius:50%;border:1px solid var(--acento);color:var(--acento);display:grid;place-items:center;font:700 14px "Barlow Condensed",sans-serif}
footer{text-align:center;color:var(--texto2);font-size:13px;padding:0 18px 30px}`;

/** HTML de la cuenta. `plan`: id del plan de la sesión o null; `fallo`: el último intento no funcionó. */
export function paginaCuenta({ plan = null, fallo = false, google = true } = {}) {
  const lista = config.planes, p = lista.find((x) => x.id === plan);
  const superiores = p ? lista.slice(lista.indexOf(p) + 1) : [];
  const cuerpo = p
    ? `<span class="chip ok">Sesión activa</span><h1>Mi cuenta</h1><p class="sub">Tu cuenta está lista. Vuelve al mapa: verás todo lo que incluye tu plan.</p>
      <div class="rejilla"><div class="plan"><div class="kicker">Tu plan</div><h2>${esc(p.nombre)}</h2><div class="precio">${esc(precio(p))}</div>
        <ul>${(p.incluye || []).slice(0, 6).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="acciones"><a class="btn primario" href="${SITIO}/?revisar=1">Volver al mapa con mi plan</a>
        ${superiores.length ? `<a class="btn" href="${SITIO}/planes.html">⬆ Mejorar a ${esc(superiores.map((x) => x.nombre).join(", "))}</a>` : ""}
        <a class="btn" href="${SITIO}/tutorial.html">Tutorial</a>
        <form method="post" action="salir"><button class="btn" type="submit">Cerrar sesión</button></form>
        <p class="nota">Al pagar o renovar en Mercado Pago, usa este mismo correo para que tu plan se active solo.</p></div></div>`
    : `<div class="kicker">DOMINUS OSINT</div><h1>Mi cuenta</h1><p class="sub">Entra o regístrate gratis. El mapa se puede ver sin cuenta; la necesitas para comprar un plan y para que el sitio te reconozca.</p>
      ${fallo ? '<p class="alerta" role="alert">No se pudo iniciar sesión. Inténtalo de nuevo; si persiste, escribe a soporte.</p>' : ""}
      <div class="rejilla"><div><ol class="pasos"><li>Pulsa «Continuar con Google» y elige tu cuenta.</li><li>Sin plan de pago, tu cuenta queda en <b>Demo</b> (gratis).</li><li>Si ya pagaste, usa el mismo correo con el que pagaste y verás tu plan.</li></ol>
        <p class="nota">Solo guardamos tu correo y la fecha de alta. Al continuar aceptas los <a href="${SITIO}/terminos.html">Términos</a> y el <a href="${SITIO}/privacidad.html">Aviso de privacidad</a>.</p></div>
      <div class="acciones">${google ? `<a class="btn google" href="google">${G} Continuar con Google</a>` : ""}
        <a class="btn" href="${SITIO}/planes.html">Ver planes y precios</a><a class="btn" href="${SITIO}/">Ver el mapa sin cuenta</a>
        <p class="nota">¿Tu plan está ligado a GitHub? <a href="ingreso">Entrar con GitHub</a></p></div></div>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="dark light"><title>Mi cuenta · DOMINUS OSINT</title><link rel="stylesheet" href="cuenta.css"><script src="tema.js" defer></script></head>
<body><header class="barra"><a class="marca" href="${SITIO}/">${CRUZ} DOMINUS OSINT</a><a class="volver" href="${SITIO}/">← Regresar al Mapa</a></header>
<main><section class="tarjeta">${cuerpo}</section></main><footer>Cuenta protegida: inicio de sesión con Google, sin contraseñas guardadas en DOMINUS.</footer></body></html>`;
}
