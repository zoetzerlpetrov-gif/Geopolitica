# Análisis de impacto al negocio (ISO 22301 8.2) y restauración (8.4 · NIST RC)

| Servicio | Crítico | RTO (máximo sin servicio) | RPO (pérdida de datos aceptable) | Cómo se restaura |
|---|---|---|---|---|
| Mapa público (dominusosint.com) | Sí | 4 h | 24 h | Relanzar «Publicar el sitio» (pages.yml): arma `_site` desde `main` y las ramas `datos-*` y lo sube a Cloudflare Pages |
| Datos en vivo (vivos, capas, normativa) | Medio | 24 h | 24 h | Relanzar el workflow; los datos se regeneran desde las fuentes |
| Worker de administración y planes | Sí (con clientes) | 8 h | 24 h | Workers Builds redepliega desde `main`; D1 se recupera con Time Travel (`/restore` en la consola) |
| Cartera de proyectos (Supabase) | Sí (con clientes) | 24 h | 24 h | Respaldo de Supabase y exportación desde la página |
| Continuidad familiar | Personal | — | Último respaldo cifrado | Importar el respaldo cifrado en el navegador |
| Noticiero y redes | No | 72 h | 72 h | Relanzar el workflow |

Prueba de restauración: una vez por trimestre se relanza `pages.yml` y se comprueba el sitio; se anota la fecha en la revisión por la dirección.
