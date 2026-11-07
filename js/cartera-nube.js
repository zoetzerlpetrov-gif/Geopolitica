// Cartera de proyectos en la nube (Supabase del propio usuario; esquema en config/cartera.sql). Este módulo solo
// envía datos cuando la persona lo pide (subir, compartir, guardar corte). Usa únicamente la URL del proyecto y la
// clave pública (publishable o anon), que Supabase diseña para usarse en el navegador; nunca la secret ni service_role.
import { cloudConfig } from "./colaboracion-cliente.js";

const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f-]{36}$/i;
const CAMPOS_LISTA = "id,owner,empresa,sector,titulo,paises,linea_base,version,actualizado";

export { cloudConfig };

/** Envoltura sobre un cliente de supabase-js (inyectable para pruebas). */
export function clienteCartera(sb) {
  const ok = (r) => { if (r.error) throw new Error(`Servicio: ${r.error.message || "operación rechazada"}`); return r.data; };
  const usuario = async () => { const { data } = await sb.auth.getUser(); return data?.user || null; };
  const exigir = async () => { const u = await usuario(); if (!u) throw new Error("Inicia sesión con tu correo y el código."); return u; };
  const id = (x) => { if (!UUID.test(String(x))) throw new Error("Identificador de plan inválido."); return x; };
  return {
    usuario,
    async pedirCodigo(correo) {
      correo = String(correo || "").trim().toLowerCase();
      if (!CORREO.test(correo) || correo.length > 254) throw new Error("Correo inválido.");
      ok(await sb.auth.signInWithOtp({ email: correo, options: { shouldCreateUser: false } }));
    },
    async verificar(correo, codigo) {
      if (!/^\d{6,10}$/.test(String(codigo || ""))) throw new Error("El código es de 6 a 10 dígitos.");
      ok(await sb.auth.verifyOtp({ email: String(correo).trim().toLowerCase(), token: String(codigo), type: "email" }));
      try {
        const e = ok(await sb.rpc("dominus_cartera_estado"));
        if (e?.esquema !== 1) throw new Error("Falta ejecutar config/cartera.sql en el proyecto.");
      } catch (err) { await sb.auth.signOut({ scope: "local" }); throw err; }
      return usuario();
    },
    async salir() { ok(await sb.auth.signOut({ scope: "local" })); },
    async listar() { await exigir(); return ok(await sb.from("dominus_planes").select(CAMPOS_LISTA).order("empresa").order("titulo").limit(500)); },
    async versiones() { await exigir(); return ok(await sb.from("dominus_planes").select("id,version,actualizado").limit(500)); },
    async obtener(planId) { await exigir(); return ok(await sb.from("dominus_planes").select(`${CAMPOS_LISTA},datos`).eq("id", id(planId)).single()); },
    async todos() { await exigir(); return ok(await sb.from("dominus_planes").select(`${CAMPOS_LISTA},datos`).order("empresa").limit(200)); },
    /** Crea (sin `id`) o reemplaza los datos de un plan. Devuelve el registro sin «datos». */
    async subir({ id: planId, empresa, sector = "", titulo, paises = [], datos }) {
      await exigir();
      empresa = String(empresa || "").trim(); titulo = String(titulo || "").trim();
      if (!empresa || empresa.length > 120) throw new Error("Escribe el nombre de la empresa (máximo 120 caracteres).");
      if (!titulo) throw new Error("El plan no tiene título.");
      const fila = { empresa, sector: String(sector).slice(0, 120), titulo: titulo.slice(0, 200), paises: paises.slice(0, 30).map(String), datos };
      if (planId) return ok(await sb.from("dominus_planes").update(fila).eq("id", id(planId)).select(CAMPOS_LISTA).single());
      return ok(await sb.from("dominus_planes").insert(fila).select(CAMPOS_LISTA).single());
    },
    async fijarLineaBase(planId, fecha) {
      await exigir();
      if (fecha != null && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Fecha de línea base inválida.");
      return ok(await sb.from("dominus_planes").update({ linea_base: fecha }).eq("id", id(planId)).select(CAMPOS_LISTA).single());
    },
    async borrar(planId) { await exigir(); ok(await sb.from("dominus_planes").delete().eq("id", id(planId))); },
    async miembros(planId) { await exigir(); return ok(await sb.from("dominus_planes_miembros").select("correo,rol,agregado").eq("plan_id", id(planId)).order("correo")); },
    async compartir(planId, correo, rol) {
      await exigir();
      correo = String(correo || "").trim().toLowerCase();
      if (!CORREO.test(correo)) throw new Error("Correo inválido.");
      if (!["lector", "editor"].includes(rol)) throw new Error("Rol inválido.");
      ok(await sb.from("dominus_planes_miembros").upsert({ plan_id: id(planId), correo, rol }, { onConflict: "plan_id,correo" }));
    },
    async quitar(planId, correo) { await exigir(); ok(await sb.from("dominus_planes_miembros").delete().eq("plan_id", id(planId)).eq("correo", String(correo).toLowerCase())); },
    async cortes(planId) { await exigir(); return ok(await sb.from("dominus_planes_cortes").select("fecha,resumen").eq("plan_id", id(planId)).order("fecha", { ascending: true }).limit(200)); },
    async guardarCorte(planId, resumen) { await exigir(); ok(await sb.from("dominus_planes_cortes").insert({ plan_id: id(planId), resumen })); },
  };
}

/** Conecta con el proyecto (la sesión se recuerda en este navegador para no pedir código cada vez). */
export async function conectarCartera(url, key, { cargar = () => import(SUPABASE_JS) } = {}) {
  const c = cloudConfig(url, key);
  const { createClient } = await cargar();
  return clienteCartera(createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "dominus-cartera-sesion" } }));
}

/** Enlace para compartir: lleva la URL del proyecto y la clave pública (públicas por diseño) y el plan, después del «#». */
export function enlaceDirectivo(base, { url, key }, planId = "") {
  const p = new URLSearchParams({ u: url, k: key, ...(planId ? { p: planId } : {}) });
  return `${base.split("#")[0]}#${p.toString()}`;
}

export function leerEnlace(hash) {
  const p = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  return { url: p.get("u") || "", key: p.get("k") || "", plan: p.get("p") || "" };
}
