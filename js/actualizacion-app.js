// El service worker actualiza la caché; nunca debe reiniciar una sesión de análisis.
export function iniciarCacheAplicacion(serviceWorker, avisar = () => {}) {
  serviceWorker.addEventListener("controllerchange", () => {
    avisar("Hay una nueva versión disponible. Se aplicará al abrir o recargar el sitio manualmente; tus selecciones actuales se mantienen.");
  });
  return serviceWorker.register("sw.js").catch((e) => console.warn("service worker:", e.message));
}

/** Mantiene una selección aunque una actualización deje temporalmente cero coincidencias. */
export function mantenerSeleccion(select, valor, etiqueta = valor) {
  if (valor && !Array.from(select.options).some((o) => o.value === valor)) {
    const opcion = select.ownerDocument.createElement("option");
    opcion.value = valor;
    opcion.textContent = `${etiqueta} (0)`;
    select.add(opcion);
  }
  select.value = valor;
}
