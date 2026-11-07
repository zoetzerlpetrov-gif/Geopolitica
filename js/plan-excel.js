// Libro de Excel del plan de proyecto (Caja del analista → Normativa por país). Usa js/plan-proyecto.js para el contenido
// y js/xlsx-escritor.js para el archivo. Las fechas, el avance, el Gantt, los vencimientos y el tablero son fórmulas: se
// recalculan al cambiar la fecha de inicio, una duración, una predecesora, un estado o al marcar «No» en «¿Aplica?».
// Las hojas Gantt y Vencimientos leen la hoja Plan por número de fila (INDEX): si agregas o borras filas en el Plan, se ajustan.
import { libroXLSX, libroXLSXComprimido, serialFecha, col } from "./xlsx-escritor.js";
import { COLUMNAS_PLAN, feriadosMexico } from "./plan-proyecto.js";

const SEMANAS = 104;          // dos años de Gantt
const FILA_ENC = 5;           // encabezados del plan
const C = Object.fromEntries(COLUMNAS_PLAN.map(([k], i) => [k, col(i)]));  // clave → letra de columna
const G0 = COLUMNAS_PLAN.length;                                           // columnas de la hoja Plan
const EXTRA = 300;                                                         // filas de holgura para tareas que agregues

const t = (v, s = "texto") => ({ v, s });

export function hojasPlan(plan, { cfg, titulo, inicio, sectorNombre = "", paises = [], extranjera = false, revisado = "" }) {
  const ini = serialFecha(inicio);
  const roles = cfg.roles.map(([, n]) => n), rolN = Object.fromEntries(cfg.roles);
  const ultima = FILA_ENC + plan.tareas.length + cfg.fases.length * 2 + 5;
  const rango = (k) => `${C[k]}${FILA_ENC + 1}:${C[k]}${ultima}`;
  const abs = (k) => `Plan!$${C[k]}$${FILA_ENC + 1}:$${C[k]}$${ultima}`;
  const feriados = `'Días inhábiles'!$A$2:$A$200`;

  // ------------------------------------------------------------ Plan
  const filas = [
    [{ v: titulo, s: "titulo" }],
    [t("Inicio del proyecto (cámbialo y todo se recalcula):", "seccion"), "", { v: ini, s: "fecha" }, "", t("Hoy:", "seccion"), { f: "TODAY()", s: "fecha" }, "", t("Sector:", "seccion"), t(sectorNombre || "Solo generales (toda empresa)"),
      "", t("Países:", "seccion"), t(paises.join(", "))],
    [{ v: `Duraciones en días hábiles: en los trámites salen del plazo legal o de la regla de la ley indicada en «Base de la duración»; en lo demás son estimaciones. Catálogo de normativa revisado ${revisado}. Para quitar una sección: marca «No» en «¿Aplica?» o borra sus filas. Para agregar una actividad: copia una fila completa (lleva las fórmulas de fechas). No es asesoría legal: confirma cada norma en su fuente oficial.`, s: "nota" }],
    [],
    COLUMNAS_PLAN.map(([, n]) => ({ v: n, s: "encabezado" })),
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
          case "notas": case "escalar": return t("");
          case "presupuesto": case "costo": return { v: "", s: "numero" };
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
  const filaD = `${FILA_ENC + 1}`;
  condG.push(
    { rango: `A${filaD}:${col(G0 - 1)}${ultimaReal}`, formula: `$${C.aplica}${filaD}="No"`, estilo: "noAplica", parar: true },
    { rango: `A${filaD}:${col(G0 - 1)}${ultimaReal}`, formula: `$${C.estado}${filaD}="Hecho"`, estilo: "hecho" },
    { rango: `${C.fin}${filaD}:${C.fin}${ultimaReal}`, formula: `AND($${C.fin}${filaD}<TODAY(),$${C.estado}${filaD}<>"Hecho",$${C.aplica}${filaD}<>"No",$${C.id}${filaD}<>"")`, estilo: "vencido" },
    { rango: `${C.estado}${filaD}:${C.estado}${ultimaReal}`, formula: `$${C.estado}${filaD}="Bloqueado"`, estilo: "vencido" },
  );
  const anchos = { id: 22, fase: 18, seccion: 18, tarea: 48, entregable: 46, pais: 12, ambito: 13, base: 20, referencia: 30, autoridad: 22, plazo: 22, frecuencia: 12, rol: 18,
    prioridad: 9, pred: 18, dias: 9, base_dias: 30, inicio: 11, fin: 11, aplica: 8, estado: 11, avance: 8, evidencia: 30, riesgo: 34, url: 12, notas: 24, escalar: 28, presupuesto: 13, costo: 13 };
  const hojaPlan = { nombre: "Plan", color: "1F2A44", filas, zoom: 90, congelar: { fila: FILA_ENC, col: 4 }, filtro: `A${FILA_ENC}:${col(G0 - 1)}${ultimaReal}`,
    cols: COLUMNAS_PLAN.map(([k]) => anchos[k] || 14), combinar: ["A1:L1", `A3:${col(G0 - 1)}3`, "A2:B2"], altos: { 3: 30, [FILA_ENC]: 32 },
    validaciones: [{ rango: rango("aplica"), lista: ["Sí", "No"] }, { rango: rango("estado"), lista: cfg.estados }, { rango: rango("prioridad"), lista: cfg.prioridades },
      { rango: rango("rol"), formula: `RACI!$A$6:$A$${5 + roles.length}` }],
    condicionales: condG };

  // ------------------------------------------------------------ Gantt (lee la hoja Plan fila por fila)
  const finG = ultimaReal + EXTRA;
  const P = (k, fila = "ROW()") => `INDEX(Plan!$${C[k]}:$${C[k]},${fila})`;
  const espejo = (k, fila) => `IF(${P(k, fila)}="","",${P(k, fila)})`;
  const GC = { id: "A", tarea: "B", pais: "C", rol: "D", inicio: "E", fin: "F", estado: "G", avance: "H", aplica: "I" }, W0 = 9;
  const gw = (i) => col(W0 + i), gUlt = gw(SEMANAS - 1);
  const filasG = [
    [{ v: "Diagrama de Gantt", s: "titulo" }],
    [{ v: "Se dibuja solo con las fechas y el estado de la hoja Plan (cada fila de aquí es la misma fila del Plan). Barras: azul = pendiente, azul oscuro = en curso, verde = hecho, rojo = vencido (la fecha de fin ya pasó y no está hecho), naranja = bloqueado, dorado = hito de fin de fase. Columna amarilla = semana actual. Cada columna es una semana que empieza en lunes.", s: "nota" }],
    [],
    [...Array(W0).fill(""), ...Array.from({ length: SEMANAS }, (_, i) => ({ f: i === 0 ? `${gw(0)}5` : `IF(DAY(${gw(i)}5)<=7,${gw(i)}5,"")`, s: "mes" }))],
    [...["ID", "Tarea", "País", "Responsable", "Inicio", "Fin", "Estado", "Avance", "¿Aplica?"].map((v) => ({ v, s: "encabezado" })),
      ...Array.from({ length: SEMANAS }, (_, i) => ({ f: i === 0 ? "Plan!$C$2-WEEKDAY(Plan!$C$2,3)" : `${gw(i - 1)}5+7`, s: "dia" }))],
  ];
  for (let fila = FILA_ENC + 1; fila <= finG; fila++) {
    filasG.push([{ f: espejo("id"), s: "texto" }, { f: `IF(${P("inicio")}="",IF(${P("fase")}="",${espejo("id")},${P("fase")}),${espejo("tarea")})`, s: "texto" }, { f: espejo("pais"), s: "texto" },
      { f: espejo("rol"), s: "texto" }, { f: espejo("inicio"), s: "fecha" }, { f: espejo("fin"), s: "fecha" }, { f: espejo("estado"), s: "numero" }, { f: `IF(${P("avance")}="","",${P("avance")})`, s: "porcentaje" },
      { f: espejo("aplica"), s: "numero" }]);
  }
  const rg = `${gw(0)}6:${gUlt}${finG}`, base = `$E6<>"",$I6<>"No",${gw(0)}$5+6>=$E6,${gw(0)}$5<=$F6`;
  const hojaGantt = { nombre: "Gantt", color: "4A7FB5", filas: filasG, zoom: 85, congelar: { fila: 5, col: 2 }, filtro: `A5:I${finG}`,
    cols: [16, 46, 11, 18, 10, 10, 10, 7, 7, ...Array(SEMANAS).fill(3.6)], altos: { 2: 42, 4: 14, 5: 14 }, combinar: ["A1:I1", "A2:I2"],
    condicionales: [
      { rango: `A6:${gUlt}${finG}`, formula: `AND($A6<>"",$E6="")`, estilo: "faseFila", parar: true },
      { rango: rg, formula: `AND(LEFT($A6,5)="HITO-",${gw(0)}$5<=$F6,${gw(0)}$5+6>=$F6)`, estilo: "ganttHito", parar: true },
      { rango: rg, formula: `AND(${base},$G6="Hecho")`, estilo: "ganttHecho", parar: true },
      { rango: rg, formula: `AND(${base},$G6="Bloqueado")`, estilo: "ganttBloqueado", parar: true },
      { rango: rg, formula: `AND(${base},$F6<TODAY())`, estilo: "ganttVencido", parar: true },
      { rango: rg, formula: `AND(${base},$G6="En curso")`, estilo: "ganttCurso", parar: true },
      { rango: rg, formula: `AND(${base})`, estilo: "gantt", parar: true },
      { rango: `${gw(0)}4:${gUlt}${finG}`, formula: `AND(${gw(0)}$5<=TODAY(),${gw(0)}$5+6>=TODAY())`, estilo: "hoy" },
      { rango: `A6:I${finG}`, formula: `$I6="No"`, estilo: "noAplica", parar: true },
      { rango: `G6:G${finG}`, formula: `$G6="Hecho"`, estilo: "hecho" },
      { rango: `F6:G${finG}`, formula: `AND($F6<>"",$F6<TODAY(),$G6<>"Hecho")`, estilo: "vencido" },
    ] };

  // ------------------------------------------------------------ Vencimientos (semáforo)
  const CAT = ["🔴 Vencido", "🟠 Vence en 7 días o menos", "🟡 Vence en 8 a 30 días", "🔵 Vence en 31 a 60 días", "⏳ En proceso (vence en más de 60 días)", "⚪ Pendiente (vence en más de 60 días)", "✅ Cumplido"];
  const semaforo = (fecha, estado, aplica) => `IF(OR(${fecha}="",LEFT(A{r},5)="HITO-"),"",IF(${aplica}="No","No aplica",IF(${estado}="Hecho","${CAT[6]}",IF(${fecha}<TODAY(),"${CAT[0]}",`
    + `IF(${fecha}-TODAY()<=7,"${CAT[1]}",IF(${fecha}-TODAY()<=30,"${CAT[2]}",IF(${fecha}-TODAY()<=60,"${CAT[3]}",IF(${estado}="En curso","${CAT[4]}","${CAT[5]}"))))))))`;
  const V0 = 16;                                   // primera fila de la tabla de tareas
  const off = V0 - (FILA_ENC + 1);                 // fila del Vencimientos − fila del Plan
  const nV = finG - FILA_ENC;
  const finV = V0 + nV - 1;
  const R0 = finV + 4;                             // tabla de obligaciones recurrentes (lee Calendario)
  const nR = plan.recurrentes.length + 100, finR = R0 + nR - 1;
  const cuenta = (c) => `COUNTIF($H$${V0}:$H$${finV},"${c}")+COUNTIF($H$${R0}:$H$${finR},"${c}")`;
  const filasV = [
    [{ v: "Vencimientos y estatus", s: "titulo" }],
    [{ v: "Todo lo que vence en los próximos 2 meses, lo vencido, lo que está en proceso y lo cumplido. Se calcula solo con las fechas y estados de las hojas Plan (fecha de fin) y Calendario (próxima fecha). Filtra la columna «Semáforo» para ver un grupo.", s: "nota" }],
    [],
    [{ v: "Semáforo", s: "encabezado" }, { v: "Cuántos", s: "encabezado" }],
    ...CAT.map((c) => [t(c, "seccion"), { f: cuenta(c), s: "numeroGrande" }]),
    [t("No aplica", "seccion"), { f: cuenta("No aplica"), s: "numero" }],
    [],
    [{ v: "Tareas del plan (fecha límite = fin de la tarea)", s: "subtitulo" }],
    ["ID", "Tarea", "País", "Responsable", "Fecha límite", "Días para vencer", "Estado", "Semáforo", "Plazo legal", "Base normativa"].map((v) => ({ v, s: "encabezado" })),
  ];
  for (let i = 0; i < nV; i++) {
    const r = V0 + i, pf = `ROW()-${off}`;
    filasV.push([{ f: espejo("id", pf), s: "texto" }, { f: espejo("tarea", pf), s: "texto" }, { f: espejo("pais", pf), s: "texto" }, { f: espejo("rol", pf), s: "texto" },
      { f: `IF(LEFT(A${r},5)="HITO-","",${espejo("fin", pf)})`, s: "fecha" }, { f: `IF(E${r}="","",E${r}-TODAY())`, s: "numero" }, { f: espejo("estado", pf), s: "numero" },
      { f: semaforo(`E${r}`, `G${r}`, P("aplica", pf)).replace(/\{r\}/g, r), s: "texto" }, { f: espejo("plazo", pf), s: "texto" }, { f: espejo("base", pf), s: "texto" }]);
  }
  filasV.push([], [{ v: "Obligaciones recurrentes y por evento (próxima fecha de la hoja Calendario)", s: "subtitulo" }],
    ["ID", "Obligación", "País", "Responsable", "Próxima fecha", "Días para vencer", "Estado", "Semáforo", "Plazo legal", "Ley"].map((v) => ({ v, s: "encabezado" })));
  for (let i = 0; i < nR; i++) {
    const r = R0 + i, cf = 5 + i, K = (c) => `IF(Calendario!${c}${cf}="","",Calendario!${c}${cf})`;
    filasV.push([{ f: K("A"), s: "texto" }, { f: K("D"), s: "texto" }, { f: K("B"), s: "texto" }, { f: K("H"), s: "texto" }, { f: K("I"), s: "fecha" },
      { f: `IF(E${r}="","",E${r}-TODAY())`, s: "numero" }, { f: K("J"), s: "numero" }, { f: semaforo(`E${r}`, `G${r}`, '""').replace(/\{r\}/g, r), s: "texto" }, { f: K("E"), s: "texto" }, { f: K("C"), s: "texto" }]);
  }
  const colores = [[CAT[0], "vencido"], [CAT[1], "vencido"], [CAT[2], "proximo"], [CAT[3], "alerta"], [CAT[4], "enProceso"], [CAT[6], "hecho"], ["No aplica", "noAplica"]];
  const hojaVen = { nombre: "Vencimientos", color: "D32F2F", filas: filasV, congelar: { fila: V0 - 1 }, filtro: `A${V0 - 1}:J${finV}`,
    cols: [16, 50, 11, 18, 12, 10, 11, 32, 30, 22], altos: { 2: 30 }, combinar: ["A1:J1", "A2:J2"],
    condicionales: [
      ...colores.map(([c, e]) => ({ rango: `A${V0}:J${finR}`, formula: `$H${V0}="${c}"`, estilo: e, parar: true })),
      ...colores.map(([c, e]) => ({ rango: "A5:B12", formula: `AND($A5="${c}",$B5>0)`, estilo: e })),
    ] };

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
  const cal = [[{ v: "Calendario de obligaciones recurrentes y por evento", s: "titulo" }], [{ v: "Cada obligación periódica o que se activa por un evento (accidente, incidente, cambio). «Próxima fecha» se calcula sola cuando el plazo legal dice el día (p. ej. «día 17 del mes siguiente», «31 de marzo»); en las demás escríbela tú y alimentará la hoja Vencimientos. Confirma fechas exactas en la norma vigente.", s: "nota" }], [],
    ["ID tarea", "País", "Ley", "Obligación o trámite", "Plazo legal", "Ante", "Frecuencia", "Responsable", "Próxima fecha", "Estado"].map((v) => ({ v, s: "encabezado" })),
    ...plan.recurrentes.map((x) => [t(x.id), t(x.pais), t(x.ley), t(x.tramite), t(x.plazo), t(x.ante), t(x.frecuencia), t(rolN[x.rol] || x.rol),
      x.proxima ? { f: formulaProxima(x.proxima), s: "fecha" } : { v: "", s: "fecha" }, { v: "Pendiente", s: "numero" }])];
  const hojaCal = { nombre: "Calendario", color: "4A7FB5", filas: cal, cols: [24, 12, 18, 46, 30, 26, 14, 22, 13, 12], congelar: { fila: 4 }, filtro: `A4:J${cal.length}`,
    validaciones: [{ rango: `J5:J${cal.length + 100}`, lista: cfg.estados }] };

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
    "1. Escribe la fecha de inicio en Plan!C2. Todas las fechas, el Gantt, los Vencimientos y el Tablero se recalculan.",
    "2. Recorre la hoja Plan de arriba abajo: está ordenada por fase (0 a 10), de la idea al cierre.",
    "3. Lo que no aplique a tu proyecto: marca «No» en «¿Aplica?» (queda tachado y sale de fechas y avance) o borra las filas. Para quitar una fase completa, filtra la columna «Fase».",
    "4. Asigna una persona a cada rol en la hoja RACI y, si quieres, reemplaza el rol por el nombre en la columna «Responsable».",
    "5. Duraciones (días hábiles): en los trámites salen del plazo legal o de la regla citada en «Base de la duración» (por ejemplo LFPA art. 17 o LGEEPA art. 35 Bis); en lo demás son estimaciones. Ajústalas a tu caso.",
    "6. Actualiza «Estado» y «Avance %» cada semana. La hoja Gantt dibuja las barras con colores por estado; la hoja Vencimientos agrupa lo vencido, lo que vence en 7, 30 y 60 días, lo que está en proceso y lo cumplido; el Tablero resume por fase y país.",
    "7. Agrega en «Días inhábiles» los feriados locales y los días inhábiles de cada autoridad (vacaciones de oficinas de gobierno).",
    "8. Antes de abrir operaciones usa la hoja Auditoría (fase 7). Repite la auditoría cada año (fase 9).",
    "9. Revisa la Bitácora normativa de DOMINUS (Caja del analista) cada día hábil: si una ley de la hoja «Base normativa» cambia, actualiza las tareas.",
    "10. Para importar: conserva los encabezados y las claves de la hoja Diccionario; la columna ID es única y estable.",
    "Glosario: Predecesora = tarea que debe terminar antes. Hito = punto de control sin duración. Gantt = barras por semana (hoja Gantt). Para agregar una actividad copia una fila completa del Plan: así lleva las fórmulas y aparece sola en el Gantt y en Vencimientos.",
    "Aviso: resumen operativo construido con el catálogo de normativa de DOMINUS. No es asesoría legal ni fiscal. Confirma cada obligación en el texto oficial vigente y con asesoría local.",
  ];
  const ins = { nombre: "Instrucciones", color: "C8A13A", cols: [130],
    filas: [[{ v: titulo, s: "titulo" }], [t(`Sector: ${sectorNombre || "Solo generales"} · Países: ${paises.join(", ")}${extranjera ? " · Incluye la ruta de empresa extranjera que opera en México" : ""} · Catálogo revisado ${revisado}`, "nota")], [],
      [{ v: "Cómo usar esta plantilla (paso a paso)", s: "subtitulo" }], ...pasos.map((p) => [t(p)]), [],
      [{ v: `Contenido: ${plan.tareas.length} tareas, ${plan.base.length} leyes y normas, ${plan.auditoria.length} preguntas de auditoría, ${plan.riesgos.length} riesgos y ${plan.recurrentes.length} obligaciones recurrentes.`, s: "seccion" }]] };
  return [ins, hojaPlan, hojaGantt, hojaVen, hojaTab, hojaCal, hojaBase, hojaAud, hojaRi, hojaRaci, hojaFer, dic];
}

/** Fórmula de Excel de la próxima fecha de una obligación recurrente (ver proximaFecha en plan-proyecto.js). */
export function formulaProxima(p) {
  if (p.tipo === "mensual") return `IF(DAY(TODAY())<=${p.dia},DATE(YEAR(TODAY()),MONTH(TODAY()),${p.dia}),DATE(YEAR(TODAY()),MONTH(TODAY())+1,${p.dia}))`;
  if (p.tipo === "fin_mes") return "EOMONTH(TODAY(),0)";
  const f = (y) => (p.dia ? `DATE(${y},${p.mes},${p.dia})` : `EOMONTH(DATE(${y},${p.mes},1),0)`);
  return `IF(TODAY()<=${f("YEAR(TODAY())")},${f("YEAR(TODAY())")},${f("YEAR(TODAY())+1")})`;
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
