// Datos públicos SpaceX: aceptar solo modelos dentro de su ventana validada.
export function modelosVigentes(datos, ahora = Date.now()) {
  const unicos = new Map();
  for (const x of datos?.objetos || []) {
    const n = String(x.omm?.NORAD_CAT_ID || ""), desde = Date.parse(x.desde), hasta = Date.parse(x.hasta);
    if (!/^\d{1,9}$/.test(n) || !x.omm?.OBJECT_NAME?.startsWith("STARLINK-") || !(desde <= ahora && ahora <= hasta) || !((x.tipo_modelo === "supgp" && x.error_rms_km >= 0 && x.error_rms_km <= 3) || (x.tipo_modelo !== "supgp" && x.error_max_km >= 0 && x.error_max_km <= 3))) continue;
    const anterior = unicos.get(n);
    if (!anterior || Date.parse(x.creado) > Date.parse(anterior.creado)) unicos.set(n, x);
  }
  return [...unicos.values()];
}

export function gruposSpaceX(datos, ahora = Date.now()) {
  const todos = modelosVigentes(datos, ahora);
  return { "spacex-starlink": todos, "spacex-trenes": todos.filter(x => (x.reciente && x.lote) || x.formacion) };
}

/** Candidatos del mismo lanzamiento con pasos próximos y orientación similar; nunca confirma visibilidad a ojo. */
export function formaciones(pases, separacionMin = 10) {
  const lotes = new Map();
  for (const p of pases || []) {
    const grupo = p.lote && p.reciente ? p.lote : p.formacion;
    if (!grupo) continue;
    const lista = lotes.get(grupo) || [];
    lista.push(p); lotes.set(grupo, lista);
  }
  const grupos = [];
  for (const [lote, lista] of lotes) {
    lista.sort((a,b) => a.t_max-b.t_max);
    let actual = [];
    const cerrar = () => { if (new Set(actual.map(p=>p.id)).size >= 3) grupos.push({lote,pases:actual,inicio:actual[0].vis_ini,fin:actual.at(-1).vis_fin}); };
    for (const p of lista) {
      const anterior = actual.at(-1);
      const diferencia = anterior ? Math.abs(((p.az_ini-anterior.az_ini+540)%360)-180) : 0;
      if (anterior && (p.t_max-actual[0].t_max>separacionMin*60000 || diferencia>20)) { cerrar(); actual=[]; }
      actual.push(p);
    }
    cerrar();
  }
  return grupos.sort((a,b)=>a.inicio-b.inicio);
}

/** La instantánea comprimida evita descargar varios MB de JSON repetitivo por cada usuario. */
export async function cargarOrbitasSpaceX() {
  if (typeof DecompressionStream !== "function") {
    const r=await fetch('data/starlink/omm.json',{cache:'no-store'});
    if(!r.ok)throw new Error('No se pudo cargar la instantánea de SpaceX');
    return r.json();
  }
  const r=await fetch('data/starlink/omm.json.gz?t='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw new Error('No se pudo cargar la instantánea de SpaceX');
  const bytes=new Uint8Array(await r.arrayBuffer());
  if(bytes[0]!==31 || bytes[1]!==139)return JSON.parse(new TextDecoder().decode(bytes));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
}

/** Cuenta el catálogo de ambas fuentes sin sumar dos veces un objeto presente en las dos. */
export function totalConSpaceX(grupos,indice) {
  const ids=new Set(Object.values(grupos || {}).flat().map(t=>t[2].slice(2,7).trim().replace(/^0+/,"")));
  for(const n of indice?.ids || [])ids.add(String(n));
  return ids.size;
}
