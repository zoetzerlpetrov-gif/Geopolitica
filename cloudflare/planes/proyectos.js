// DESTINOS_FIJOS: este módulo no llama a servicios externos; solo usa la base D1 (OSINT_PLANS_DB).
// Proyectos y seguimiento por cliente, en el servidor (sin Supabase). Lo usan:
//   · Mi empresa:  /cuenta/empresa/<org>/proyectos/...        (miembros; escribir desde el rol «editor»)
//   · Admin:       /cuenta/empresa/admin/proyectos/<org>/...  (sesión de administración)
// Rutas (después del prefijo):
//   GET  ""                       → lista de proyectos con avance
//   GET  "<pid>"                  → proyecto con actividades, hallazgos y notas
//   POST "crear"                  → {nombre, objetivo?, sector?, pais?, sedes?, inicio?, fin?, responsable?}
//   POST "<pid>/editar"           → mismos campos + fase + estado
//   POST "<pid>/item"             → {id?, tipo, texto, responsable?, fecha?, estado?, severidad?}
//   POST "<pid>/items"            → {items: [...], reemplazar?} actividades en lote (plantilla generada o importada)
//   POST "<pid>/item/<iid>/borrar"
//   POST "<pid>/borrar"
//   POST "<pid>/fase-datos"       → {fase, datos} datos propios de cada fase (alcance del arranque, entrega, cierre…)
//   POST "<pid>/checklist"        → {items, reemplazar?} lista de auditoría y riesgos de la plantilla (se guardan para usarlos después)
//   POST "<pid>/checklist/<cid>"  → {estado, nota} respuesta a una pregunta o estado de un riesgo
//   POST "<pid>/compartir"        → {activar} crea o quita el enlace de solo lectura (vista para directivos)
// Vista pública de solo lectura: vistaCompartida(db, token) (ruta /cuenta/empresa/vista/<token>, sin sesión).
import cfg from "../../config/proyectos.json" with { type: "json" };

export const FASES = cfg.fases.map((f) => f.id);
export const TIPOS = cfg.tipos;
export const ESTADOS_PROYECTO = ["activo", "en_pausa", "cerrado"];
const ID = /^[0-9a-f]{16}$/;
export const MAX_ITEMS = 2000;
export const MAX_LOTE = 800;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const ESTADOS_CHECK = { pregunta: ["pendiente", "cumple", "no_cumple", "no_aplica"], riesgo: ["abierto", "mitigado", "aceptado", "hallazgo"] };
const listas = new WeakSet();
const ahora = () => Math.floor(Date.now() / 1000);
const nuevoId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
class ErrorDato extends Error {}
const limpio = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);

async function asegurar(db) {
  if (listas.has(db)) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS dominus_proyectos (id TEXT PRIMARY KEY NOT NULL, org_id TEXT NOT NULL, nombre TEXT NOT NULL,
    objetivo TEXT NOT NULL DEFAULT '', sector TEXT NOT NULL DEFAULT '', pais TEXT NOT NULL DEFAULT '', sedes TEXT NOT NULL DEFAULT '',
    inicio TEXT NOT NULL DEFAULT '', fin TEXT NOT NULL DEFAULT '', responsable TEXT NOT NULL DEFAULT '', fase TEXT NOT NULL DEFAULT 'alta',
    estado TEXT NOT NULL DEFAULT 'activo', creado INTEGER NOT NULL, actualizado INTEGER NOT NULL, actualizado_por TEXT NOT NULL DEFAULT '')`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS dominus_proyecto_items (id TEXT PRIMARY KEY NOT NULL, proyecto_id TEXT NOT NULL, org_id TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('actividad', 'hallazgo', 'seguimiento')), texto TEXT NOT NULL, responsable TEXT NOT NULL DEFAULT '',
    fecha TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT '', severidad TEXT NOT NULL DEFAULT '', creado INTEGER NOT NULL,
    actualizado INTEGER NOT NULL, actualizado_por TEXT NOT NULL DEFAULT '')`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS dominus_proyecto_checklist (id TEXT PRIMARY KEY NOT NULL, proyecto_id TEXT NOT NULL, org_id TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('pregunta', 'riesgo')), grupo TEXT NOT NULL DEFAULT '', texto TEXT NOT NULL, detalle TEXT NOT NULL DEFAULT '',
    pais TEXT NOT NULL DEFAULT '', responsable TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT '', nota TEXT NOT NULL DEFAULT '',
    orden INTEGER NOT NULL DEFAULT 0, actualizado INTEGER NOT NULL, actualizado_por TEXT NOT NULL DEFAULT '')`).run();
  // Columnas agregadas después de la primera versión (si ya existen, ALTER falla y se ignora).
  for (const col of ["fases_datos TEXT NOT NULL DEFAULT '{}'", "vista_token TEXT NOT NULL DEFAULT ''"]) {
    try { await db.prepare(`ALTER TABLE dominus_proyectos ADD COLUMN ${col}`).run(); } catch { /* ya existe */ }
  }
  try { await db.prepare("ALTER TABLE dominus_proyecto_checklist ADD COLUMN descripcion TEXT NOT NULL DEFAULT ''").run(); } catch { /* ya existe */ }
  listas.add(db);
}

/** Datos del proyecto validados (lanza Error con el mensaje para la persona). */
export function validarProyecto(d = {}, editar = false) {
  const p = { nombre: limpio(d.nombre, 160), objetivo: limpio(d.objetivo, 1000), sector: limpio(d.sector, 80), pais: limpio(d.pais, 3).toUpperCase(),
    sedes: limpio(d.sedes, 500), inicio: limpio(d.inicio, 10), fin: limpio(d.fin, 10), responsable: limpio(d.responsable, 120) };
  if (p.nombre.length < 2) throw new ErrorDato("Escribe el nombre del proyecto.");
  for (const k of ["inicio", "fin"]) if (p[k] && !FECHA.test(p[k])) throw new ErrorDato("Fecha inválida (AAAA-MM-DD).");
  if (p.inicio && p.fin && p.fin < p.inicio) throw new ErrorDato("La fecha de fin es anterior al inicio.");
  if (editar) {
    p.fase = String(d.fase || "alta"); p.estado = String(d.estado || "activo");
    if (!FASES.includes(p.fase)) throw new ErrorDato("Fase inválida.");
    if (!ESTADOS_PROYECTO.includes(p.estado)) throw new ErrorDato("Estado inválido.");
  }
  return p;
}

export function validarItem(d = {}) {
  const tipo = String(d.tipo || "");
  if (!TIPOS[tipo]) throw new ErrorDato("Tipo inválido.");
  const i = { tipo, texto: limpio(d.texto, 2000), responsable: limpio(d.responsable, 120), fecha: limpio(d.fecha, 10),
    estado: String(d.estado || TIPOS[tipo].estados[0]), severidad: tipo === "hallazgo" ? String(d.severidad || "media") : "" };
  if (i.texto.length < 2) throw new ErrorDato("Escribe el texto.");
  if (i.fecha && !FECHA.test(i.fecha)) throw new ErrorDato("Fecha inválida (AAAA-MM-DD).");
  if (!TIPOS[tipo].estados.includes(i.estado)) throw new ErrorDato("Estado inválido.");
  if (tipo === "hallazgo" && !TIPOS.hallazgo.severidades.includes(i.severidad)) throw new ErrorDato("Gravedad inválida.");
  return i;
}

/** Avance: % de actividades hechas; hallazgos abiertos por gravedad. */
export function resumen(items = [], checklist = []) {
  const act = items.filter((x) => x.tipo === "actividad"), hechas = act.filter((x) => x.estado === "hecho").length;
  const abiertos = items.filter((x) => x.tipo === "hallazgo" && !["cerrado", "aceptado"].includes(x.estado));
  return { actividades: act.length, hechas, avance: act.length ? Math.round((hechas / act.length) * 100) : 0,
    hallazgos_abiertos: abiertos.length, criticos: abiertos.filter((x) => ["critica", "alta"].includes(x.severidad)).length,
    notas: items.filter((x) => x.tipo === "seguimiento").length,
    preguntas: checklist.filter((x) => x.tipo === "pregunta").length, respondidas: checklist.filter((x) => x.tipo === "pregunta" && x.estado !== "pendiente").length,
    no_cumple: checklist.filter((x) => x.tipo === "pregunta" && x.estado === "no_cumple").length,
    riesgos: checklist.filter((x) => x.tipo === "riesgo").length, riesgos_abiertos: checklist.filter((x) => x.tipo === "riesgo" && x.estado === "abierto").length };
}

const datosFases = (p) => { try { return JSON.parse(p.fases_datos || "{}"); } catch { return {}; } };

/** Datos de una fase validados: hasta 20 campos de texto (máx. 2,000 caracteres cada uno). */
export function validarDatosFase(fase, datos) {
  if (!FASES.includes(String(fase))) throw new ErrorDato("Fase inválida.");
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) throw new ErrorDato("Datos inválidos.");
  const out = {};
  for (const [k, v] of Object.entries(datos).slice(0, 20)) {
    if (!/^[a-z_]{1,30}$/.test(k)) throw new ErrorDato("Campo inválido.");
    out[k] = Array.isArray(v) ? v.slice(0, 50).map((x) => limpio(x, 200)) : limpio(v, 2000);
  }
  return out;
}

export function validarCheck(d = {}) {
  const tipo = String(d.tipo || "");
  if (!ESTADOS_CHECK[tipo]) throw new ErrorDato("Tipo inválido.");
  const c = { tipo, grupo: limpio(d.grupo, 200), texto: limpio(d.texto, 1500), detalle: limpio(d.detalle, 1500), descripcion: limpio(d.descripcion, 1500), pais: limpio(d.pais, 60), responsable: limpio(d.responsable, 120) };
  if (c.texto.length < 2) throw new ErrorDato("Texto vacío.");
  return c;
}

/** Vista pública de solo lectura de un proyecto (enlace compartido): sin correos ni notas internas de la lista. */
export async function vistaCompartida(db, token) {
  if (!/^[0-9a-f]{32}$/.test(String(token || ""))) return null;
  await asegurar(db);
  const p = await db.prepare("SELECT * FROM dominus_proyectos WHERE vista_token = ?").bind(token).first();
  if (!p) return null;
  const org = await db.prepare("SELECT nombre FROM dominus_orgs WHERE id = ?").bind(p.org_id).first().catch(() => null);
  const items = (await db.prepare("SELECT tipo, texto, responsable, fecha, estado, severidad, actualizado FROM dominus_proyecto_items WHERE proyecto_id = ? ORDER BY tipo, fecha, creado").bind(p.id).all()).results || [];
  const checklist = (await db.prepare("SELECT tipo, grupo, texto, estado, pais FROM dominus_proyecto_checklist WHERE proyecto_id = ? ORDER BY tipo, orden").bind(p.id).all().catch(() => ({ results: [] }))).results || [];
  const limpia = (x) => ({ ...x, responsable: String(x.responsable || "").includes("@") ? "" : x.responsable });
  return { empresa: org?.nombre || "", proyecto: { nombre: p.nombre, objetivo: p.objetivo, sector: p.sector, pais: p.pais, sedes: p.sedes, inicio: p.inicio, fin: p.fin,
    fase: p.fase, estado: p.estado, actualizado: p.actualizado, ...resumen(items, checklist) }, items: items.map(limpia), fases: cfg.fases,
    datos_fase: datosFasePublicos(p.fases_datos), checklist: checklist.map((c) => ({ tipo: c.tipo, grupo: c.grupo, texto: c.texto, estado: c.estado, pais: c.pais })) };
}

// Campos de fase que no salen en la vista compartida (datos de contacto y nombres de personas).
const CAMPOS_PRIVADOS = new Set(["contacto_cliente", "participantes", "aprobado_por"]);
/** Datos de cada fase para la vista de solo lectura: sin campos de contacto y sin correos ni teléfonos dentro del texto. */
export function datosFasePublicos(json) {
  let d = {}; try { d = JSON.parse(json || "{}") || {}; } catch { d = {}; }
  const tapar = (v) => String(v ?? "").replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo]").replace(/\+?\d[\d\s().-]{7,}\d/g, "[teléfono]");
  return Object.fromEntries(Object.entries(d).map(([f, campos]) => [f, Object.fromEntries(Object.entries(campos || {}).filter(([k]) => !CAMPOS_PRIVADOS.has(k)).map(([k, v]) => [k, tapar(v)]))]));
}

/** Atiende una ruta de proyectos de una organización. Devuelve [cuerpo, estado]. */
export async function rutaProyectos(db, orgId, partes, metodo, cuerpo, { quien = "", escribir = false } = {}) {
  await asegurar(db);
  const proyecto = async (pid) => (ID.test(pid || "") ? db.prepare("SELECT * FROM dominus_proyectos WHERE id = ? AND org_id = ?").bind(pid, orgId).first() : null);
  try {
    if (metodo === "GET" && partes.length === 0) {
      const ps = (await db.prepare("SELECT * FROM dominus_proyectos WHERE org_id = ? ORDER BY estado = 'cerrado', actualizado DESC").bind(orgId).all()).results || [];
      const its = (await db.prepare("SELECT proyecto_id, tipo, estado, severidad FROM dominus_proyecto_items WHERE org_id = ?").bind(orgId).all()).results || [];
      const chk = (await db.prepare("SELECT proyecto_id, tipo, estado FROM dominus_proyecto_checklist WHERE org_id = ?").bind(orgId).all()).results || [];
      return [{ proyectos: ps.map((p) => ({ ...p, fases_datos: datosFases(p), ...resumen(its.filter((i) => i.proyecto_id === p.id), chk.filter((c) => c.proyecto_id === p.id)) })), fases: cfg.fases, tipos: TIPOS }, 200];
    }
    if (metodo === "GET" && partes.length === 1) {
      const p = await proyecto(partes[0]);
      if (!p) return [{ error: "El proyecto no existe." }, 404];
      const items = (await db.prepare("SELECT * FROM dominus_proyecto_items WHERE proyecto_id = ? ORDER BY tipo, CASE WHEN fecha = '' THEN 1 ELSE 0 END, fecha, creado").bind(p.id).all()).results || [];
      const checklist = (await db.prepare("SELECT * FROM dominus_proyecto_checklist WHERE proyecto_id = ? ORDER BY tipo, orden").bind(p.id).all()).results || [];
      return [{ proyecto: { ...p, fases_datos: datosFases(p), ...resumen(items, checklist) }, items, checklist, fases: cfg.fases, tipos: TIPOS, estados_check: ESTADOS_CHECK }, 200];
    }
    if (metodo !== "POST") return [{ error: "Ruta inexistente." }, 404];
    if (!escribir) return [{ error: "Tu rol solo permite consultar los proyectos." }, 403];
    const t = ahora();
    if (partes[0] === "crear" && partes.length === 1) {
      const n = await db.prepare("SELECT count(*) AS n FROM dominus_proyectos WHERE org_id = ?").bind(orgId).first();
      if ((n?.n || 0) >= 200) return [{ error: "Límite de 200 proyectos por empresa." }, 409];
      const p = validarProyecto(cuerpo), id = nuevoId();
      await db.prepare("INSERT INTO dominus_proyectos (id, org_id, nombre, objetivo, sector, pais, sedes, inicio, fin, responsable, creado, actualizado, actualizado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, orgId, p.nombre, p.objetivo, p.sector, p.pais, p.sedes, p.inicio, p.fin, p.responsable, t, t, quien).run();
      return [{ ok: true, id }, 201];
    }
    const p = await proyecto(partes[0]);
    if (!p) return [{ error: "El proyecto no existe." }, 404];
    if (partes[1] === "editar" && partes.length === 2) {
      const d = validarProyecto(cuerpo, true);
      await db.prepare("UPDATE dominus_proyectos SET nombre = ?, objetivo = ?, sector = ?, pais = ?, sedes = ?, inicio = ?, fin = ?, responsable = ?, fase = ?, estado = ?, actualizado = ?, actualizado_por = ? WHERE id = ?")
        .bind(d.nombre, d.objetivo, d.sector, d.pais, d.sedes, d.inicio, d.fin, d.responsable, d.fase, d.estado, t, quien, p.id).run();
      return [{ ok: true }, 200];
    }
    if (partes[1] === "borrar" && partes.length === 2) {
      await db.prepare("DELETE FROM dominus_proyecto_items WHERE proyecto_id = ?").bind(p.id).run();
      await db.prepare("DELETE FROM dominus_proyecto_checklist WHERE proyecto_id = ?").bind(p.id).run();
      await db.prepare("DELETE FROM dominus_proyectos WHERE id = ?").bind(p.id).run();
      return [{ ok: true }, 200];
    }
    if (partes[1] === "item" && partes.length === 2) {
      const i = validarItem(cuerpo);
      if (cuerpo.id) {
        if (!ID.test(String(cuerpo.id))) return [{ error: "Elemento inválido." }, 400];
        const r = await db.prepare("UPDATE dominus_proyecto_items SET tipo = ?, texto = ?, responsable = ?, fecha = ?, estado = ?, severidad = ?, actualizado = ?, actualizado_por = ? WHERE id = ? AND proyecto_id = ?")
          .bind(i.tipo, i.texto, i.responsable, i.fecha, i.estado, i.severidad, t, quien, cuerpo.id, p.id).run();
        if (!(r.meta?.changes > 0)) return [{ error: "El elemento no existe." }, 404];
      } else {
        const n = await db.prepare("SELECT count(*) AS n FROM dominus_proyecto_items WHERE proyecto_id = ?").bind(p.id).first();
        if ((n?.n || 0) >= MAX_ITEMS) return [{ error: "Límite de 2,000 elementos por proyecto." }, 409];
        await db.prepare("INSERT INTO dominus_proyecto_items (id, proyecto_id, org_id, tipo, texto, responsable, fecha, estado, severidad, creado, actualizado, actualizado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(nuevoId(), p.id, orgId, i.tipo, i.texto, i.responsable, i.fecha, i.estado, i.severidad, t, t, quien).run();
      }
      await db.prepare("UPDATE dominus_proyectos SET actualizado = ?, actualizado_por = ? WHERE id = ?").bind(t, quien, p.id).run();
      return [{ ok: true }, 200];
    }
    if (partes[1] === "fase-datos" && partes.length === 2) {
      const d = validarDatosFase(cuerpo.fase, cuerpo.datos);
      const todo = { ...datosFases(p), [cuerpo.fase]: d };
      await db.prepare("UPDATE dominus_proyectos SET fases_datos = ?, actualizado = ?, actualizado_por = ? WHERE id = ?").bind(JSON.stringify(todo), t, quien, p.id).run();
      return [{ ok: true }, 200];
    }
    if (partes[1] === "compartir" && partes.length === 2) {
      const token = cuerpo.activar ? [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("") : "";
      await db.prepare("UPDATE dominus_proyectos SET vista_token = ?, actualizado = ?, actualizado_por = ? WHERE id = ?").bind(token, t, quien, p.id).run();
      return [{ ok: true, token }, 200];
    }
    if (partes[1] === "checklist" && partes.length === 2) {
      const lista = Array.isArray(cuerpo.items) ? cuerpo.items : [];
      if (!lista.length || lista.length > MAX_LOTE) return [{ error: `Envía entre 1 y ${MAX_LOTE} elementos.` }, 400];
      const cs = lista.map(validarCheck);
      if (cuerpo.reemplazar) await db.prepare("DELETE FROM dominus_proyecto_checklist WHERE proyecto_id = ?").bind(p.id).run();
      const n = await db.prepare("SELECT count(*) AS n FROM dominus_proyecto_checklist WHERE proyecto_id = ?").bind(p.id).first();
      if ((n?.n || 0) + cs.length > MAX_ITEMS) return [{ error: "Se pasaría del límite de 2,000 elementos. Usa «reemplazar»." }, 409];
      const ins = "INSERT INTO dominus_proyecto_checklist (id, proyecto_id, org_id, tipo, grupo, texto, detalle, descripcion, pais, responsable, estado, orden, actualizado, actualizado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
      for (let k = 0; k < cs.length; k += 50) {
        await db.batch(cs.slice(k, k + 50).map((c, j) => db.prepare(ins).bind(nuevoId(), p.id, orgId, c.tipo, c.grupo, c.texto, c.detalle, c.descripcion, c.pais, c.responsable, ESTADOS_CHECK[c.tipo][0], k + j, t, quien)));
      }
      return [{ ok: true, agregados: cs.length }, 200];
    }
    if (partes[1] === "checklist" && partes.length === 3 && ID.test(partes[2])) {
      const c = await db.prepare("SELECT tipo FROM dominus_proyecto_checklist WHERE id = ? AND proyecto_id = ?").bind(partes[2], p.id).first();
      if (!c) return [{ error: "El elemento no existe." }, 404];
      const estado = String(cuerpo.estado || "");
      if (!ESTADOS_CHECK[c.tipo].includes(estado)) return [{ error: "Estado inválido." }, 400];
      await db.prepare("UPDATE dominus_proyecto_checklist SET estado = ?, nota = ?, actualizado = ?, actualizado_por = ? WHERE id = ?").bind(estado, limpio(cuerpo.nota, 1000), t, quien, partes[2]).run();
      return [{ ok: true }, 200];
    }
    if (partes[1] === "items" && partes.length === 2) {
      const lista = Array.isArray(cuerpo.items) ? cuerpo.items : [];
      if (!lista.length || lista.length > MAX_LOTE) return [{ error: `Envía entre 1 y ${MAX_LOTE} actividades.` }, 400];
      const items = lista.map((x) => validarItem({ ...x, tipo: "actividad" }));
      if (cuerpo.reemplazar) await db.prepare("DELETE FROM dominus_proyecto_items WHERE proyecto_id = ? AND tipo = 'actividad'").bind(p.id).run();
      const n = await db.prepare("SELECT count(*) AS n FROM dominus_proyecto_items WHERE proyecto_id = ?").bind(p.id).first();
      if ((n?.n || 0) + items.length > MAX_ITEMS) return [{ error: "Se pasaría del límite de 2,000 elementos por proyecto. Usa «reemplazar»." }, 409];
      const ins = "INSERT INTO dominus_proyecto_items (id, proyecto_id, org_id, tipo, texto, responsable, fecha, estado, severidad, creado, actualizado, actualizado_por) VALUES (?, ?, ?, 'actividad', ?, ?, ?, ?, '', ?, ?, ?)";
      for (let k = 0; k < items.length; k += 50) {
        await db.batch(items.slice(k, k + 50).map((i) => db.prepare(ins).bind(nuevoId(), p.id, orgId, i.texto, i.responsable, i.fecha, i.estado, t, t, quien)));
      }
      await db.prepare("UPDATE dominus_proyectos SET actualizado = ?, actualizado_por = ? WHERE id = ?").bind(t, quien, p.id).run();
      return [{ ok: true, agregadas: items.length }, 200];
    }
    if (partes[1] === "item" && partes[3] === "borrar" && partes.length === 4 && ID.test(partes[2])) {
      const r = await db.prepare("DELETE FROM dominus_proyecto_items WHERE id = ? AND proyecto_id = ?").bind(partes[2], p.id).run();
      return r.meta?.changes > 0 ? [{ ok: true }, 200] : [{ error: "El elemento no existe." }, 404];
    }
    return [{ error: "Ruta inexistente." }, 404];
  } catch (e) {
    if (e instanceof ErrorDato) return [{ error: e.message }, 400];
    throw e;
  }
}
