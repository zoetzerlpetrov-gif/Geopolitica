// Libro de Excel del plan de proyecto (Caja del analista → Normativa por país). Usa js/plan-proyecto.js para el contenido
// y js/xlsx-escritor.js para el archivo. Las fechas, el avance, el Gantt y el tablero son fórmulas: se recalculan al cambiar
// la fecha de inicio, una duración, una predecesora o al marcar «No» en «¿Aplica?».
import { libroXLSX, libroXLSXComprimido, serialFecha, col } from "./xlsx-escritor.js";
import { COLUMNAS_PLAN, feriadosMexico } from "./plan-proyecto.js";

const SEMANAS = 104;          // dos años de Gantt
const FILA_ENC = 5;           // encabezados del plan
const C = Object.fromEntries(COLUMNAS_PLAN.map(([k], i) => [k, col(i)]));  // clave → letra de columna
const G0 = COLUMNAS_PLAN.length;                                           // primera columna del Gantt

const t = (v, s = "texto") => ({ v, s });

export function hojasPlan(plan, { cfg, titulo, inicio, sectorNombre = "", paises = [], extranjera = false, revisado = "" }) {
  const ini = serialFecha(inicio);
  const roles = cfg.roles.map(([, n]) => n), rolN = Object.fromEntries(cfg.roles);
  const ultima = FILA_ENC + plan.tareas.length + cfg.fases.length * 2 + 5;
  const rango = (k) => `${C[k]}${FILA_ENC + 1}:${C[k]}${ultima}`;
  const abs = (k) => `Plan!$${C[k]}$${FILA_ENC + 1}:$${C[k]}$${ultima}`;
  const feriados = `'Días inhábiles'!$A$2:$A$200`;

  // ------------------------------------------------------------ Plan + Gantt
  const filas = [
    [{ v: titulo, s: "titulo" }],
    [t("Inicio del proyecto (cámbialo y todo se recalcula):", "seccion"), "", { v: ini, s: "fecha" }, "", t("Hoy:", "seccion"), { f: "TODAY()", s: "fecha" }, "", t("Sector:", "seccion"), t(sectorNombre || "Solo generales (toda empresa)"),
      "", t("Países:", "seccion"), t(paises.join(", "))],
    [{ v: `Duraciones en días hábiles (estimaciones de referencia, no plazos legales). Los plazos legales están en la columna «Plazo legal» y vienen del catálogo de normativa revisado ${revisado}. Para quitar una sección: marca «No» en «¿Aplica?» o borra sus filas (las fórmulas se ajustan). No es asesoría legal: confirma cada norma en su fuente oficial.`, s: "nota" }],
    [],
    [...COLUMNAS_PLAN.map(([, n]) => ({ v: n, s: "encabezado" })), ...Array.from({ length: SEMANAS }, (_, i) => ({ f: `$C$2-WEEKDAY($C$2,3)+${7 * i}`, s: "fecha" }))],
  ];
  const condG = [], hitos = [];
  let r = FILA_ENC;
  for (const [fid, fnombre, fobj] of cfg.fases) {
    const delaFase = plan.tareas.filter((x) => x.fase === fid);
    if (!delaFase.length) continue;
    r += 1;
    filas.push([{ v: fnombre, s: "fase" }, { v: fobj, s: "fase" }, ...Array(G0 - 2).fill({ v: "", s: "fase" })]);
    const desde = r + 1;
    for (const x of delaFase) {
      r += 1;
      const fila = COLUMNAS_PLAN.map(([k]) => {
        switch (k) {
          case "fase": return t(x.faseNombre);
          case "rol": return t(rolN[x.rol] || x.rol);
          case "dias": return { v: x.dias, s: "numero" };
          case "inicio": return { f: `IF(${C.pred}${r}="",$C$2,IFERROR(WORKDAY(INDEX($${C.fin}:$${C.fin},MATCH(${C.pred}${r},$${C.id}:$${C.id},0)),1,${feriados}),$C$2))`, s: "fecha" };
          case "fin": return { f: `IF(${C.aplica}${r}="No",${C.inicio}${r},WORKDAY(${C.inicio}${r},MAX(${C.dias}${r}-1,0),${feriados}))`, s: "fecha" };
          case "aplica": return { v: "Sí", s: "numero" };
          case "estado": return { v: "Pendiente", s: "numero" };
          case "avance": return { v: 0, s: "porcentaje" };
          case "prioridad": return { v: x.prioridad, s: x.prioridad === "Crítica" ? "critica" : "numero" };
          case "url": return x.url ? { f: `HYPERLINK("${String(x.url).replace(/"/g, "")}","Texto oficial")`, s: "enlace" } : t("");
          case "notas": return t("");
          default: return t(x[k] ?? "");
        }
      });
      filas.push(fila);
    }
    // Hito de fin de fase: termina cuando termina la última tarea de la fase.
    r += 1;
    const hito = `HITO-${fid}`;
    hitos.push(r);
    filas.push(COLUMNAS_PLAN.map(([k]) => {
      switch (k) {
        case "id": return { v: hito, s: "hito" };
        case "fase": return { v: fnombre, s: "hito" };
        case "tarea": return { v: `Hito: ${fnombre} terminada`, s: "hito" };
        case "inicio": return { f: `MAX(${C.fin}${desde}:${C.fin}${r - 1})`, s: "fechaHito" };
        case "fin": return { f: `${C.inicio}${r}`, s: "fechaHito" };
        case "dias": return { v: 0, s: "numeroHito" };
        case "aplica": return { v: "Sí", s: "numeroHito" };
        case "estado": return { f: `IF(COUNTIFS(${C.estado}${desde}:${C.estado}${r - 1},"<>Hecho",${C.aplica}${desde}:${C.aplica}${r - 1},"<>No")=0,"Hecho","Pendiente")`, s: "numeroHito" };
        case "avance": return { f: `IFERROR(AVERAGEIFS(${C.avance}${desde}:${C.avance}${r - 1},${C.aplica}${desde}:${C.aplica}${r - 1},"<>No"),0)`, s: "porcentaje" };
        default: return { v: "", s: "hito" };
      }
    }));
  }
  const ultimaReal = r;
  const gIni = col(G0), gFin = col(G0 + SEMANAS - 1);
  const filaD = `${FILA_ENC + 1}`;
  condG.push(
    { rango: `${gIni}${filaD}:${gFin}${ultimaReal}`, formula: `AND(LEFT($${C.id}${filaD},5)="HITO-",${gIni}$${FILA_ENC}<=$${C.fin}${filaD},${gIni}$${FILA_ENC}+6>=$${C.fin}${filaD})`, estilo: "ganttHito", parar: true },
    { rango: `${gIni}${filaD}:${gFin}${ultimaReal}`, formula: `AND($${C.id}${filaD}<>"",LEFT($${C.id}${filaD},5)<>"HITO-",$${C.aplica}${filaD}<>"No",${gIni}$${FILA_ENC}+6>=$${C.inicio}${filaD},${gIni}$${FILA_ENC}<=$${C.fin}${filaD})`, estilo: "gantt" },
    { rango: `${gIni}${FILA_ENC}:${gFin}${ultimaReal}`, formula: `AND(${gIni}$${FILA_ENC}<=TODAY(),${gIni}$${FILA_ENC}+6>=TODAY())`, estilo: "hoy" },
    { rango: `A${filaD}:${col(G0 - 1)}${ultimaReal}`, formula: `$${C.aplica}${filaD}="No"`, estilo: "noAplica", parar: true },
    { rango: `A${filaD}:${col(G0 - 1)}${ultimaReal}`, formula: `$${C.estado}${filaD}="Hecho"`, estilo: "hecho" },
    { rango: `${C.fin}${filaD}:${C.fin}${ultimaReal}`, formula: `AND($${C.fin}${filaD}<TODAY(),$${C.estado}${filaD}<>"Hecho",$${C.aplica}${filaD}<>"No",$${C.id}${filaD}<>"")`, estilo: "vencido" },
    { rango: `${C.estado}${filaD}:${C.estado}${ultimaReal}`, formula: `$${C.estado}${filaD}="Bloqueado"`, estilo: "vencido" },
  );
  const anchos = { id: 22, fase: 18, seccion: 18, tarea: 48, entregable: 46, pais: 12, ambito: 13, base: 20, referencia: 30, autoridad: 22, plazo: 22, frecuencia: 12, rol: 18,
    prioridad: 9, pred: 18, dias: 9, inicio: 11, fin: 11, aplica: 8, estado: 11, avance: 8, evidencia: 30, riesgo: 34, url: 12, notas: 24 };
  const hojaPlan = { nombre: "Plan", color: "1F2A44", filas, zoom: 90, congelar: { fila: FILA_ENC, col: 4 }, filtro: `A${FILA_ENC}:${col(G0 - 1)}${ultimaReal}`,
    cols: [...COLUMNAS_PLAN.map(([k]) => anchos[k] || 14), ...Array(SEMANAS).fill(3.2)], combinar: ["A1:L1", "A3:Y3", "A2:B2"], altos: { 3: 30, [FILA_ENC]: 32 },
    validaciones: [{ rango: rango("aplica"), lista: ["Sí", "No"] }, { rango: rango("estado"), lista: cfg.estados }, { rango: rango("prioridad"), lista: cfg.prioridades },
      { rango: rango("rol"), formula: `RACI!$A$6:$A$${5 + roles.length}` }],
    condicionales: condG };

  // ------------------------------------------------------------ Tablero
  const vivas = (extra = "") => `COUNTIFS(${abs("fase")},$A{r},${abs("aplica")},"<>No",${abs("id")},"<>HITO-*"${extra})`;
  const tab = [[{ v: "Tablero del proyecto", s: "titulo" }], [{ v: "Se recalcula solo. «Vencidas»: fecha de fin anterior a hoy y estado distinto de «Hecho». Las tareas con «¿Aplica? = No» no cuentan.", s: "nota" }], [],
    ["Fase", "Tareas", "Hechas", "En curso", "Bloqueadas", "Vencidas", "Avance %", "Inicio", "Fin"].map((v) => ({ v, s: "encabezado" }))];
  cfg.fases.forEach(([, fn], i) => {
    const rr = 5 + i, v = (x) => vivas(x).replace(/\{r\}/g, rr);
    tab.push([t(fn), { f: v(""), s: "numero" }, { f: v(`,${abs("estado")},"Hecho"`), s: "numero" }, { f: v(`,${abs("estado")},"En curso"`), s: "numero" },
      { f: v(`,${abs("estado")},"Bloqueado"`), s: "numero" }, { f: v(`,${abs("fin")},"<"&TODAY(),${abs("estado")},"<>Hecho"`), s: "numero" },
      { f: `IFERROR(AVERAGEIFS(${abs("avance")},${abs("fase")},$A${rr},${abs("aplica")},"<>No",${abs("id")},"<>HITO-*"),0)`, s: "porcentaje" },
      { f: `IFERROR(1/(1/_xlfn.MINIFS(${abs("inicio")},${abs("fase")},$A${rr},${abs("aplica")},"<>No")),"")`, s: "fecha" }, { f: `IFERROR(1/(1/_xlfn.MAXIFS(${abs("fin")},${abs("fase")},$A${rr},${abs("aplica")},"<>No")),"")`, s: "fecha" }]);
  });
  const fT = 5 + cfg.fases.length;
  tab.push([{ v: "Total", s: "seccion" }, ...["B", "C", "D", "E", "F"].map((c) => ({ f: `SUM(${c}5:${c}${fT - 1})`, s: "numeroHito" })), { f: `IFERROR(AVERAGEIFS(${abs("avance")},${abs("aplica")},"<>No",${abs("id")},"<>HITO-*"),0)`, s: "porcentaje" },
    { f: `MIN(H5:H${fT - 1})`, s: "fechaHito" }, { f: `MAX(I5:I${fT - 1})`, s: "fechaHito" }]);
  tab.push([], [{ v: "Próximos 30 días", s: "subtitulo" }],
    [t("Tareas que terminan en los próximos 30 días (sin hacer)", "seccion"), { f: `COUNTIFS(${abs("fin")},">="&TODAY(),${abs("fin")},"<="&TODAY()+30,${abs("estado")},"<>Hecho",${abs("aplica")},"<>No",${abs("id")},"<>HITO-*")`, s: "numero" }],
    [t("Tareas críticas pendientes", "seccion"), { f: `COUNTIFS(${abs("prioridad")},"Crítica",${abs("estado")},"<>Hecho",${abs("aplica")},"<>No")`, s: "numero" }],
    [], [{ v: "Por país", s: "subtitulo" }], ["País", "Tareas", "Hechas", "Vencidas"].map((v) => ({ v, s: "encabezado" })));
  for (const p of ["Todos", ...paises]) {
    const rr = tab.length + 1;
    tab.push([t(p), { f: `COUNTIFS(${abs("pais")},$A${rr},${abs("aplica")},"<>No",${abs("id")},"<>HITO-*")`, s: "numero" }, { f: `COUNTIFS(${abs("pais")},$A${rr},${abs("estado")},"Hecho",${abs("aplica")},"<>No")`, s: "numero" },
      { f: `COUNTIFS(${abs("pais")},$A${rr},${abs("fin")},"<"&TODAY(),${abs("estado")},"<>Hecho",${abs("aplica")},"<>No",${abs("id")},"<>HITO-*")`, s: "numero" }]);
  }
  const hojaTab = { nombre: "Tablero", color: "C8A13A", filas: tab, cols: [46, 10, 10, 10, 11, 10, 10, 12, 12], congelar: { fila: 4 },
    condicionales: [{ rango: `F5:F${fT}`, formula: "F5>0", estilo: "vencido" }, { rango: `E5:E${fT}`, formula: "E5>0", estilo: "alerta" }] };

  // ------------------------------------------------------------ Calendario recurrente
  const cal = [[{ v: "Calendario de obligaciones recurrentes y por evento", s: "titulo" }], [{ v: "Cada obligación periódica o que se activa por un evento (accidente, incidente, cambio). Programa recordatorios con el plazo legal; confirma fechas exactas en la norma vigente.", s: "nota" }], [],
    ["ID tarea", "País", "Ley", "Obligación o trámite", "Plazo legal", "Ante", "Frecuencia", "Responsable", "Próxima fecha", "Estado"].map((v) => ({ v, s: "encabezado" })),
    ...plan.recurrentes.map((x) => [t(x.id), t(x.pais), t(x.ley), t(x.tramite), t(x.plazo), t(x.ante), t(x.frecuencia), t(rolN[x.rol] || x.rol), { v: "", s: "fecha" }, { v: "Pendiente", s: "numero" }])];
  const hojaCal = { nombre: "Calendario", color: "4A7FB5", filas: cal, cols: [24, 12, 18, 46, 30, 26, 14, 22, 13, 12], congelar: { fila: 4 }, filtro: `A4:J${cal.length}`,
    validaciones: [{ rango: `J5:J${cal.length + 50}`, lista: cfg.estados }] };

  // ------------------------------------------------------------ Base normativa
  const bn = [[{ v: "Base normativa del proyecto", s: "titulo" }], [{ v: "Resumen propio de cada ley del catálogo (no es el texto legal). «Tareas» lista los ID del plan que se apoyan en ella. Lo marcado «verificar» no se pudo confirmar en la fuente oficial.", s: "nota" }], [],
    ["ID", "País", "Área", "Ámbito", "Sigla", "Ley o norma", "Tipo", "Autoridad", "A quién aplica", "Obligaciones", "Trámites (plazo; ante)", "Sanciones", "Evidencia", "Última reforma", "Texto oficial", "Tareas del plan"].map((v) => ({ v, s: "encabezado" })),
    ...plan.base.map((x) => [t(x.id), t(x.pais), t(x.area), t(x.ambito), t(x.sigla), t(x.nombre), t(x.tipo), t(x.autoridad), t(x.aplica), t(x.obligaciones), t(x.tramites), t(x.sanciones), t(x.evidencia),
      t(x.ultima_reforma), x.url ? { f: `HYPERLINK("${String(x.url).replace(/"/g, "")}","Abrir")`, s: "enlace" } : t(""), t(x.tareas)])];
  const hojaBase = { nombre: "Base normativa", color: "8E6C1F", filas: bn, cols: [20, 12, 22, 10, 14, 40, 14, 24, 34, 60, 50, 40, 30, 16, 10, 30], congelar: { fila: 4, col: 1 }, filtro: `A4:P${bn.length}` };

  // ------------------------------------------------------------ Auditoría
  const au = [[{ v: "Lista de verificación (auditoría de cumplimiento)", s: "titulo" }], [{ v: "Una pregunta por fila, tomada del catálogo. Úsala en la auditoría de preapertura (fase 7) y en la anual (fase 9). Método: ISO 19011:2018.", s: "nota" }], [],
    ["ID", "País", "Área", "Ley", "Pregunta", "Evidencia a pedir", "Resultado", "Hallazgo", "Responsable", "Fecha de revisión"].map((v) => ({ v, s: "encabezado" })),
    ...plan.auditoria.map((x) => [t(x.id), t(x.pais), t(x.area), t(x.ley), t(x.pregunta), t(x.evidencia), { v: "", s: "numero" }, t(""), t(rolN[x.rol] || x.rol), { v: "", s: "fecha" }])];
  const hojaAud = { nombre: "Auditoría", color: "2E7D32", filas: au, cols: [22, 12, 22, 16, 60, 34, 16, 40, 20, 13], congelar: { fila: 4 }, filtro: `A4:J${au.length}`,
    validaciones: [{ rango: `G5:G${au.length + 50}`, lista: ["Cumple", "Cumple parcialmente", "No cumple", "No aplica"] }],
    condicionales: [{ rango: `G5:G${au.length + 50}`, formula: 'G5="No cumple"', estilo: "vencido" }, { rango: `G5:G${au.length + 50}`, formula: 'G5="Cumple"', estilo: "hecho" }, { rango: `G5:G${au.length + 50}`, formula: 'G5="Cumple parcialmente"', estilo: "alerta" }] };

  // ------------------------------------------------------------ Riesgos
  const ri = [[{ v: "Registro de riesgos de cumplimiento", s: "titulo" }], [{ v: "Probabilidad e impacto de 1 (muy bajo) a 5 (muy alto). Nivel = probabilidad × impacto: 15 o más alto, 8 a 14 medio. Método: ISO 31000:2018. Los valores iniciales son supuestos: ajústalos.", s: "nota" }], [],
    ["ID", "País", "Área", "Riesgo", "Consecuencia (sanción)", "Probabilidad (1-5)", "Impacto (1-5)", "Nivel", "Clasificación", "Respuesta / control", "Dueño", "Estado"].map((v) => ({ v, s: "encabezado" })),
    ...plan.riesgos.map((x, i) => { const rr = 5 + i; return [t(x.id), t(x.pais), t(x.area), t(x.riesgo), t(x.consecuencia), { v: x.prob, s: "numero" }, { v: x.impacto, s: "numero" }, { f: `F${rr}*G${rr}`, s: "numero" },
      { f: `IF(H${rr}>=15,"Alto",IF(H${rr}>=8,"Medio","Bajo"))`, s: "numero" }, t(x.respuesta), t(rolN[x.rol] || x.rol), { v: "Abierto", s: "numero" }]; })];
  const hojaRi = { nombre: "Riesgos", color: "B71C1C", filas: ri, cols: [22, 12, 22, 30, 50, 12, 11, 8, 13, 50, 20, 11], congelar: { fila: 4 }, filtro: `A4:L${ri.length}`,
    validaciones: [{ rango: `F5:G${ri.length + 50}`, lista: ["1", "2", "3", "4", "5"] }, { rango: `L5:L${ri.length + 50}`, lista: ["Abierto", "Mitigado", "Aceptado", "Cerrado"] }],
    condicionales: [{ rango: `I5:I${ri.length + 50}`, formula: 'I5="Alto"', estilo: "vencido" }, { rango: `I5:I${ri.length + 50}`, formula: 'I5="Medio"', estilo: "alerta" }] };

  // ------------------------------------------------------------ RACI
  const raci = [[{ v: "Matriz RACI por fase", s: "titulo" }], [{ v: "R = responsable (hace el trabajo) · A = aprueba (rinde cuentas, solo uno) · C = consultado · I = informado. Escribe en la columna «Persona» quién ocupa cada rol.", s: "nota" }], [], [],
    [{ v: "Rol", s: "encabezado" }, { v: "Persona", s: "encabezado" }, ...cfg.fases.map(([id]) => ({ v: id, s: "encabezado" }))],
    ...cfg.roles.map(([k, n]) => [t(n), t(""), ...cfg.fases.map(([id]) => ({ v: cfg.raci[id]?.[k] || "", s: "numero" }))]),
    [], ...cfg.fases.map(([id, n]) => [t(id, "seccion"), t(n)])];
  const hojaRaci = { nombre: "RACI", color: "5F6B7A", filas: raci, cols: [34, 24, ...cfg.fases.map(() => 7)], congelar: { fila: 5, col: 1 },
    validaciones: [{ rango: `C6:${col(1 + cfg.fases.length)}${5 + roles.length}`, lista: ["R", "A", "C", "I"] }] };

  // ------------------------------------------------------------ Días inhábiles
  const y = inicio.getUTCFullYear();
  const fer = paises.some((p) => /méxico/i.test(p)) ? feriadosMexico([y, y + 1, y + 2, y + 3]) : [];
  const hojaFer = { nombre: "Días inhábiles", color: "9AA3AD", cols: [13, 60],
    filas: [[{ v: "Fecha", s: "encabezado" }, { v: "Motivo (agrega los feriados locales y los días inhábiles de cada autoridad)", s: "encabezado" }],
      ...fer.map((f) => [{ v: serialFecha(new Date(`${f}T00:00:00Z`)), s: "fecha" }, t("Descanso obligatorio en México (LFT art. 74)")])] };

  // ------------------------------------------------------------ Diccionario e instrucciones
  const dic = { nombre: "Diccionario", color: "9AA3AD", cols: [8, 26, 18, 70],
    filas: [[{ v: "Diccionario de columnas (para importar en DOMINUS OPS / OSINT)", s: "titulo" }], [{ v: "La columna «Clave» es estable: no cambies los encabezados de la hoja Plan si vas a importar el archivo. Agrega columnas nuevas al final.", s: "nota" }], [],
      ["Columna", "Encabezado en Plan", "Clave", "Qué contiene"].map((v) => ({ v, s: "encabezado" })), ...COLUMNAS_PLAN.map(([k, n, d], i) => [t(col(i)), t(n), t(k), t(d)])] };
  const pasos = [
    "1. Escribe la fecha de inicio en Plan!C2. Todas las fechas, el Gantt y el tablero se recalculan.",
    "2. Recorre la hoja Plan de arriba abajo: está ordenada por fase (0 a 10), de la idea al cierre.",
    "3. Lo que no aplique a tu proyecto: marca «No» en «¿Aplica?» (queda tachado y sale de fechas y avance) o borra las filas. Para quitar una fase completa, filtra la columna «Fase».",
    "4. Asigna una persona a cada rol en la hoja RACI y, si quieres, reemplaza el rol por el nombre en la columna «Responsable».",
    "5. Ajusta las duraciones (días hábiles). Son estimaciones; los plazos que fija la ley están en «Plazo legal» y deben respetarse.",
    "6. Actualiza «Estado» y «Avance %» cada semana. El Tablero muestra avance, vencidas y bloqueadas por fase y país.",
    "7. Agrega en «Días inhábiles» los feriados locales y los días inhábiles de cada autoridad (vacaciones de oficinas de gobierno).",
    "8. Antes de abrir operaciones usa la hoja Auditoría (fase 7). Repite la auditoría cada año (fase 9).",
    "9. Revisa la Bitácora normativa de DOMINUS (Caja del analista) cada día hábil: si una ley de la hoja «Base normativa» cambia, actualiza las tareas.",
    "10. Para importar: conserva los encabezados y las claves de la hoja Diccionario; la columna ID es única y estable.",
    "Glosario: Predecesora = tarea que debe terminar antes. Hito = punto de control sin duración. Gantt = barras en semanas (columnas a la derecha del Plan; dorado = hito, amarillo = semana actual).",
    "Aviso: resumen operativo construido con el catálogo de normativa de DOMINUS. No es asesoría legal ni fiscal. Confirma cada obligación en el texto oficial vigente y con asesoría local.",
  ];
  const ins = { nombre: "Instrucciones", color: "C8A13A", cols: [130],
    filas: [[{ v: titulo, s: "titulo" }], [t(`Sector: ${sectorNombre || "Solo generales"} · Países: ${paises.join(", ")}${extranjera ? " · Incluye la ruta de empresa extranjera que opera en México" : ""} · Catálogo revisado ${revisado}`, "nota")], [],
      [{ v: "Cómo usar esta plantilla (paso a paso)", s: "subtitulo" }], ...pasos.map((p) => [t(p)]), [],
      [{ v: `Contenido: ${plan.tareas.length} tareas, ${plan.base.length} leyes y normas, ${plan.auditoria.length} preguntas de auditoría, ${plan.riesgos.length} riesgos y ${plan.recurrentes.length} obligaciones recurrentes.`, s: "seccion" }]] };
  return [ins, hojaPlan, hojaTab, hojaCal, hojaBase, hojaAud, hojaRi, hojaRaci, hojaFer, dic];
}

/** Bytes del .xlsx listo para descargar (sin comprimir). */
export function excelPlan(plan, op) {
  return libroXLSX(hojasPlan(plan, op), { titulo: op.titulo });
}

/** Bytes del .xlsx comprimido (lo que descarga la página). */
export function excelPlanComprimido(plan, op) {
  return libroXLSXComprimido(hojasPlan(plan, op), { titulo: op.titulo });
}

/** Mismo plan en JSON con las claves de COLUMNAS_PLAN (para importar en DOMINUS OPS u otra herramienta). */
export function jsonPlan(plan, { titulo, inicio, sector, paises, extranjera }) {
  return { formato: "dominus-plan-proyecto", version: 1, titulo, inicio: inicio.toISOString().slice(0, 10), sector, paises, extranjera,
    columnas: COLUMNAS_PLAN.map(([k, n]) => ({ clave: k, encabezado: n })), tareas: plan.tareas, base_normativa: plan.base, auditoria: plan.auditoria, riesgos: plan.riesgos, recurrentes: plan.recurrentes };
}
