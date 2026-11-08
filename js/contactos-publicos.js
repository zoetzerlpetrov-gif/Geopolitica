const API_GITHUB = "https://api.github.com/";

async function github(ruta, parametros, fetcher) {
  const url = new URL(ruta, API_GITHUB);
  url.search = new URLSearchParams(parametros);
  const respuesta = await fetcher(url, { referrerPolicy: "no-referrer", signal: AbortSignal.timeout(8000) });
  if (!respuesta.ok) throw new Error("Consulta pública de GitHub no disponible.");
  return respuesta.json();
}

const texto = (valor) => typeof valor === "string" ? valor.trim().slice(0, 250) : "";
const emailNormalizado = (valor) => texto(valor).toLowerCase();

async function buscarPerfiles(correo, fetcher) {
  const datos = await github("search/users", { q: `${correo} in:email`, per_page: "5" }, fetcher);
  const candidatos = datos.items.slice(0, 5).filter(({ login }) => /^[a-z0-9-]{1,39}$/i.test(login || ""));
  const comprobados = await Promise.allSettled(candidatos.map(({ login }) => github(`users/${login}`, {}, fetcher)));
  const filas = comprobados.flatMap((resultado, i) => {
    if (resultado.status !== "fulfilled" || emailNormalizado(resultado.value.email) !== emailNormalizado(correo)) return [];
    const { name, company, location, type } = resultado.value;
    const usuario = candidatos[i].login;
    return [{
      enlace: `https://github.com/${usuario}`, etiqueta: `@${usuario}`,
      datos: [type === "Organization" ? "Organización" : "Perfil público", texto(name), texto(company), texto(location)].filter(Boolean).join(" · "),
    }];
  });
  const parcial = datos.incomplete_results || datos.total_count > candidatos.length || comprobados.some(({ status }) => status === "rejected");
  return { filas, parcial };
}

async function buscarCambios(correo, fecha, fetcher) {
  const desde = new Date(fecha);
  desde.setUTCFullYear(desde.getUTCFullYear() - 5);
  const hoy = fecha.toISOString().slice(0, 10);
  const inicio = desde.toISOString().slice(0, 10);
  const datos = await github("search/commits", {
    q: `author-email:${correo} author-date:${inicio}..${hoy}`, per_page: "10", sort: "author-date", order: "desc",
  }, fetcher);
  const vistos = new Set();
  const filas = datos.items.slice(0, 10).flatMap(({ sha, repository, commit }) => {
    const repo = repository?.full_name;
    const autor = commit?.author;
    const dia = texto(autor?.date).slice(0, 10);
    if (!/^[a-f0-9]{40}$/i.test(sha || "") || !/^[\w.-]+\/[\w.-]+$/.test(repo || "")
        || repo.split("/").some((parte) => parte === "." || parte === "..")
        || emailNormalizado(autor?.email) !== emailNormalizado(correo)
        || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia < inicio || dia > hoy || vistos.has(sha)) return [];
    vistos.add(sha);
    return [{
      enlace: `https://github.com/${repo}/commit/${sha}`, etiqueta: `${repo} · ${sha.slice(0, 7)}`,
      datos: [dia, texto(autor?.name) && `Autor declarado: ${texto(autor.name)}`].filter(Boolean).join(" · "),
    }];
  });
  return { filas, parcial: datos.incomplete_results || datos.total_count > datos.items.length };
}

export async function consultarCorreoGithub(correo, fetcher = fetch, fecha = new Date()) {
  if (!correo) return { estado: "Escribe un correo completo para buscar en GitHub." };
  const [perfiles, cambios] = await Promise.allSettled([buscarPerfiles(correo, fetcher), buscarCambios(correo, fecha, fetcher)]);
  const salida = (resultado) => resultado.status === "fulfilled" ? resultado.value : { estado: "Consulta no disponible. Puede haber un límite temporal de GitHub." };
  return { perfiles: salida(perfiles), cambios: salida(cambios) };
}

export const BUSCADORES_MENCIONES = [
  ["Google", "https://www.google.com/search"],
  ["Bing", "https://www.bing.com/search"],
  ["DuckDuckGo", "https://duckduckgo.com/"],
  ["Brave Search", "https://search.brave.com/search"],
];

export const AMBITOS_MENCIONES = [
  ["Redes indexadas", [["LinkedIn", "linkedin.com"], ["Facebook", "facebook.com"], ["Instagram", "instagram.com"],
    ["X", "x.com"], ["TikTok", "tiktok.com"], ["Reddit", "reddit.com"]]],
  ["Registros y directorios en México", [["Gobierno", "gob.mx"], ["Educación", "edu.mx"], ["Organizaciones", "org.mx"]]],
];

export function urlMencion(valor, motor, dominio = "") {
  const destino = BUSCADORES_MENCIONES.find(([nombre]) => nombre === motor);
  if (!destino || (dominio && !AMBITOS_MENCIONES.some(([, opciones]) => opciones.some(([, sitio]) => sitio === dominio)))) return "";
  const url = new URL(destino[1]);
  url.searchParams.set("q", dominio ? `"${valor}" site:${dominio}` : `"${valor}"`);
  return url.href;
}

let cargarLadas;
export function buscarLadaMx(numero, tabla) {
  if (!/^\+52\d{10}$/.test(numero)) return null;
  if (numero.startsWith("+5256")) return { lada: "56", region: "Ciudad de México", fuente: "IFT" };
  const digitos = numero.slice(1);
  for (const longitud of [5, 4]) {
    const prefijo = digitos.slice(0, longitud);
    const region = tabla.get(prefijo);
    if (region) return { lada: prefijo.slice(2), region, fuente: "Google libphonenumber" };
  }
  return null;
}

export async function consultarLadaMx(numero) {
  if (!cargarLadas) {
    cargarLadas = fetch(new URL("../vendor/libphonenumber-mx/52.txt", import.meta.url), { signal: AbortSignal.timeout(5000) })
      .then((respuesta) => {
        if (!respuesta.ok) throw new Error("Tabla de ladas no disponible.");
        return respuesta.text();
      }).then((contenido) => new Map(
        Array.from(contenido.matchAll(/^(52\d{2,3})\|([^\r\n]+)/gm), ([, prefijo, region]) => [prefijo, region]),
      )).catch(() => {
        cargarLadas = null;
        return null;
      });
  }
  const tabla = await cargarLadas;
  return tabla ? buscarLadaMx(numero, tabla) : null;
}
