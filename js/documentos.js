// Buscador de documentos públicos: arma enlaces de búsqueda en archivos desclasificados y de transparencia. No se
// descarga nada desde el monitor: cada enlace abre la búsqueda en el sitio original (algunos piden pasar un control
// anti-robots de Cloudflare, que solo se ve en el navegador).
export const ARCHIVOS = [
  { id: "blackvault", nombre: "The Black Vault (documentos FOIA de EUA: militares, OVNI, inteligencia)", url: (q) => `https://www.theblackvault.com/documentarchive/?s=${encodeURIComponent(q)}` },
  { id: "nara", nombre: "Archivos Nacionales de EUA (NARA, catálogo)", url: (q) => `https://catalog.archives.gov/search?q=${encodeURIComponent(q)}` },
  { id: "nsarchive", nombre: "National Security Archive (Universidad George Washington)", url: (q) => `https://nsarchive.gwu.edu/search?search_api_fulltext=${encodeURIComponent(q)}` },
  { id: "fbi", nombre: "FBI Vault (expedientes publicados por el FBI)", url: (q) => `https://vault.fbi.gov/search?SearchableText=${encodeURIComponent(q)}` },
  { id: "wikileaks", nombre: "WikiLeaks (cables diplomáticos 2003–2010 y otras colecciones)", url: (q) => `https://search.wikileaks.org/?query=${encodeURIComponent(q)}` },
  { id: "archive", nombre: "Internet Archive (búsqueda en el texto de libros y documentos)", url: (q) => `https://archive.org/search?query=${encodeURIComponent(q)}&sin=TXT` },
  { id: "documentcloud", nombre: "DocumentCloud (documentos que publican periodistas)", url: (q) => `https://www.documentcloud.org/app?q=${encodeURIComponent(q)}` },
  { id: "cia", nombre: "Sala de lectura FOIA de la CIA (usa su buscador)", url: () => "https://www.cia.gov/readingroom/" },
  { id: "pnt", nombre: "Plataforma Nacional de Transparencia (México, solicitudes y respuestas)", url: () => "https://www.plataformadetransparencia.org.mx/" },
];

export function enlaces(q) {
  const t = String(q || "").trim().slice(0, 200);
  return t.length < 2 ? [] : ARCHIVOS.map((a) => ({ id: a.id, nombre: a.nombre, url: a.url(t) }));
}
