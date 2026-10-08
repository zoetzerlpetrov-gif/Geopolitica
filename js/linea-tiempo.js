// Línea de tiempo (Fase 4): ventana de horas + desplazamiento hacia el pasado + histograma de actividad.
// Solo calcula y pinta; el filtro lo aplica app.js con los valores { desde, hasta } que recibe.
import { rangoTiempo, histograma, ventana } from "./analisis-logica.js";
import { fechaHora } from "./util.js";

const CUBETAS = 48;

export class LineaTiempo {
  /**
   * @param {HTMLElement} cont   contenedor vacío en el panel
   * @param {(v:{desde:number,hasta:number}) => void} onCambio
   * @param {object} [o]
   * @param {(horas:number, avisar:(t:string)=>void) => Promise<void>} [o.cargarHistorial]  pide días anteriores
   * @param {boolean} [o.permitir90]  la ventana de 90 días (pesada) se ofrece fuera del modo LITE
   */
  constructor(cont, onCambio, { cargarHistorial, permitir90 = true } = {}) {
    this.cont = cont;
    this.onCambio = onCambio;
    this.cargarHistorial = cargarHistorial;
    this.rango = null;
    this.timer = null;
    cont.innerHTML = `
      <div class="lt-controles">
        <label>Ventana
          <select id="lt-ventana">
            <option value="0">Todo</option><option value="6">6 h</option><option value="24">24 h</option>
            <option value="72">72 h</option><option value="168">7 días</option>
            ${cargarHistorial ? `<option value="720">30 días (historial)</option>${permitir90 ? `<option value="2160">90 días (historial, sev. ≥ 3)</option>` : ""}` : ""}
          </select>
        </label>
        <button type="button" id="lt-play" class="txt-btn" aria-pressed="false" title="Recorre el periodo de lo más antiguo a lo más reciente">▶ Reproducir</button>
      </div>
      <svg id="lt-hist" class="lt-hist" viewBox="0 0 ${CUBETAS * 6} 40" preserveAspectRatio="none" role="img" aria-label="Eventos por periodo"></svg>
      <input type="range" id="lt-atras" min="0" max="0" step="1" value="0" aria-label="Mover el fin de la ventana hacia el pasado (horas)">
      <div class="meta" id="lt-texto" aria-live="polite"></div>`;
    this.sel = cont.querySelector("#lt-ventana");
    this.rng = cont.querySelector("#lt-atras");
    this.svg = cont.querySelector("#lt-hist");
    this.texto = cont.querySelector("#lt-texto");
    this.btn = cont.querySelector("#lt-play");
    this.sel.onchange = async () => {
      const horas = Number(this.sel.value);
      if (horas > 168 && this.cargarHistorial) {
        this.sel.disabled = true;
        try {
          await this.cargarHistorial(horas, (t) => { this.texto.textContent = t; });
        } finally {
          this.sel.disabled = false;
        }
      }
      this.#emitir();
    };
    // La posición del deslizador es «horas antes del evento más nuevo»; a la derecha = ahora.
    this.rng.oninput = () => this.#emitir();
    this.btn.onclick = () => (this.timer ? this.detener() : this.reproducir());
  }

  /** Recalcula rango e histograma cuando cambian los datos. */
  setEventos(eventos) {
    this.eventos = eventos;
    this.rango = rangoTiempo(eventos);
    const horas = this.rango ? Math.ceil((this.rango.max - this.rango.min) / 3600000) : 0;
    // Si el usuario estaba en «ahora» (extremo derecho), sigue en «ahora» al llegar datos nuevos.
    const enAhora = !this.iniciado || this.rng.value === this.rng.max;
    this.iniciado = true;
    this.rng.max = String(horas);
    this.rng.value = String(enAhora ? horas : Math.min(Number(this.rng.value), horas));
    this.#emitir();
  }

  get horasAtras() { return Number(this.rng.max) - Number(this.rng.value); }

  reproducir() {
    if (this.sel.value === "0") this.sel.value = "24";
    this.rng.value = "0";
    this.btn.textContent = "■ Detener";
    this.btn.setAttribute("aria-pressed", "true");
    const paso = Math.max(1, Math.round(Number(this.rng.max) / 40));
    this.timer = setInterval(() => {
      const v = Number(this.rng.value) + paso;
      this.rng.value = String(Math.min(v, Number(this.rng.max)));
      this.#emitir();
      if (v >= Number(this.rng.max)) this.detener();
    }, 600);
    this.#emitir();
  }

  detener() {
    clearInterval(this.timer);
    this.timer = null;
    this.btn.textContent = "▶ Reproducir";
    this.btn.setAttribute("aria-pressed", "false");
  }

  #emitir() {
    const v = ventana(this.rango, Number(this.sel.value), this.horasAtras);
    this.#pintar(v);
    this.onCambio(v);
  }

  #pintar(v) {
    if (!this.rango) { this.svg.innerHTML = ""; this.texto.textContent = "Sin eventos."; return; }
    const h = histograma(this.eventos, this.rango.min, this.rango.max, CUBETAS);
    const max = Math.max(1, ...h);
    const ancho = (this.rango.max - this.rango.min) / CUBETAS || 1;
    this.svg.innerHTML = h.map((n, i) => {
      const ini = this.rango.min + i * ancho, fin = ini + ancho;
      const dentro = fin >= v.desde && ini <= v.hasta;
      const alto = n ? Math.max(2, (n / max) * 38) : 0;
      return `<rect x="${i * 6}" y="${40 - alto}" width="5" height="${alto}" class="${dentro ? "on" : ""}"><title>${n} eventos</title></rect>`;
    }).join("");
    const desde = Number.isFinite(v.desde) ? Math.max(v.desde, this.rango.min) : this.rango.min;
    this.texto.textContent = `Del ${fechaHora(new Date(desde).toISOString())} al ${fechaHora(new Date(v.hasta).toISOString())}`;
  }
}
