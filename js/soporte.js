// soporte.html: muestra el informe de errores que este navegador guardó (js/bitacora.js) para que la persona lo copie
// o descargue y lo envíe a soporte si quiere. Nada sale del equipo sin esa acción.
import { leerBitacora, informe, borrarBitacora } from "./bitacora.js";

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const texto = () => informe(leerBitacora(), { vista: q.get("vista") || "", plan: q.get("plan") || "" });
const pintar = () => { $("sop-texto").textContent = texto(); $("sop-n").textContent = String(leerBitacora().length); };

$("sop-copiar").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(texto()); $("sop-aviso").textContent = "Copiado. Pégalo en tu correo o mensaje a soporte."; }
  catch { $("sop-aviso").textContent = "No se pudo copiar: selecciona el texto y cópialo a mano."; }
});
$("sop-bajar").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto()], { type: "text/plain;charset=utf-8" }));
  a.download = `informe-soporte-dominus-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("sop-borrar").addEventListener("click", () => { borrarBitacora(); pintar(); $("sop-aviso").textContent = "Registro borrado de este navegador."; });
pintar();
