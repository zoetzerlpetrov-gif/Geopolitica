# Alcance del SGSI de DOMINUS OSINT (ISO/IEC 27001, cláusula 4.3)

Versión 1 · 2026-11-19 · Revisión: anual o cuando cambie la arquitectura.

## Qué cubre
| Componente | Dónde vive | Información que maneja |
|---|---|---|
| Sitio público y mapa (`dominusosint.com`) | Cloudflare Pages | Datos de fuentes abiertas (título, enlace, medio, fecha); sin datos personales de visitantes |
| Páginas de administración (`/ops/`) | Cloudflare Pages, protegidas con Cloudflare Access | Configuración y análisis internos |
| Worker de administración (`admin.dominusosint.com`) | Cloudflare Workers + D1 | Sesiones firmadas, planes de clientes (ID de GitHub o correo), datos legales, apariencia, contador agregado de visitas |
| Repositorio y tareas automáticas | GitHub (repositorio público + GitHub Actions) | Código, configuración, datos publicados; secretos solo en GitHub Secrets |
| Cartera de proyectos | Supabase (cuenta de cada usuario) | Planes de proyecto de clientes, con acceso por usuario |
| Continuidad familiar | Navegador (localStorage) y respaldo cifrado | Datos familiares; nunca salen del navegador sin cifrar |

## Qué no cubre
- Los equipos personales de quien administra (se rigen por la política, sección «Dispositivos»).
- Los servicios de terceros en sí mismos (GitHub, Cloudflare, Google, Supabase, Mercado Pago): se controlan con sus configuraciones y con la evaluación de proveedores.

## Partes interesadas
Visitantes del sitio, clientes de planes de pago, quien administra el proyecto, proveedores de nube, autoridades de protección de datos (LFPDPPP) y titulares de las fuentes abiertas (licencias).
