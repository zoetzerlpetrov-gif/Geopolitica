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
//   POST "<pid>/item/<iid>/borrar"
//   POST "<pid>/borrar"
import cfg from "../../config/proyectos.json" with { type: "json" };

export const FASES = cfg.fases.map((f) => f.id);
export const TIPOS = cfg.tipos;
export const ESTADOS_PROYECTO = ["activo", "en_pausa", "cerrado"];
const ID = /^[0-9a-f]{16}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
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
export function resumen(items = []) {
  const act = items.filter((x) => x.tipo === "actividad"), hechas = act.filter((x) => x.estado === "hecho").length;
  const abiertos = items.filter((x) => x.tipo === "hallazgo" && !["cerrado", "aceptado"].includes(x.estado));
  return { actividades: act.length, hechas, avance: act.length ? Math.round((hechas / act.length) * 100) : 0,
    hallazgos_abiertos: abiertos.length, criticos: abiertos.filter((x) => ["critica", "alta"].includes(x.severidad)).length,
    notas: items.filter((x) => x.tipo === "seguimiento").length };
}

/** Atiende una ruta de proyectos de una organización. Devuelve [cuerpo, estado]. */
export async function rutaProyectos(db, orgId, partes, metodo, cuerpo, { quien = "", escribir = false } = {}) {
  await asegurar(db);
  const proyecto = async (pid) => (ID.test(pid || "") ? db.prepare("SELECT * FROM dominus_proyectos WHERE id = ? AND org_id = ?").bind(pid, orgId).first() : null);
  try {
    if (metodo === "GET" && partes.length === 0) {
      const ps = (await db.prepare("SELECT * FROM dominus_proyectos WHERE org_id = ? ORDER BY estado = 'cerrado', actualizado DESC").bind(orgId).all()).results || [];
      const its = (await db.prepare("SELECT proyecto_id, tipo, estado, severidad FROM dominus_proyecto_items WHERE org_id = ?").bind(orgId).all()).results || [];
      return [{ proyectos: ps.map((p) => ({ ...p, ...resumen(its.filter((i) => i.proyecto_id === p.id)) })), fases: cfg.fases, tipos: TIPOS }, 200];
    }
    if (metodo === "GET" && partes.length === 1) {
      const p = await proyecto(partes[0]);
      if (!p) return [{ error: "El proyecto no existe." }, 404];
      const items = (await db.prepare("SELECT * FROM dominus_proyecto_items WHERE proyecto_id = ? ORDER BY tipo, CASE WHEN fecha = '' THEN 1 ELSE 0 END, fecha, creado").bind(p.id).all()).results || [];
      return [{ proyecto: { ...p, ...resumen(items) }, items, fases: cfg.fases, tipos: TIPOS }, 200];
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
        if ((n?.n || 0) >= 1000) return [{ error: "Límite de 1,000 elementos por proyecto." }, 409];
        await db.prepare("INSERT INTO dominus_proyecto_items (id, proyecto_id, org_id, tipo, texto, responsable, fecha, estado, severidad, creado, actualizado, actualizado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(nuevoId(), p.id, orgId, i.tipo, i.texto, i.responsable, i.fecha, i.estado, i.severidad, t, t, quien).run();
      }
      await db.prepare("UPDATE dominus_proyectos SET actualizado = ?, actualizado_por = ? WHERE id = ?").bind(t, quien, p.id).run();
      return [{ ok: true }, 200];
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
