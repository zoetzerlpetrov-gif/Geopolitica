# Plan de respuesta a incidentes de seguridad · DOMINUS OSINT

Versión 1 · 11 de noviembre de 2026 · Responsable: la persona que administra el proyecto (en adelante, «responsable»).
Se revisa una vez al año o después de cada incidente.

## 1. Qué es un incidente

Cualquier hecho que afecte la confidencialidad, integridad o disponibilidad del servicio o de los datos. Ejemplos:

| Tipo | Ejemplo | Gravedad inicial |
|---|---|---|
| Fuga de llaves | Una llave de API aparece en un commit, en un log o en un chat | Alta |
| Acceso indebido | Inicio de sesión desconocido en GitHub, Cloudflare, Mercado Pago o el correo de administración | Alta |
| Vulneración de datos personales | Alguien obtiene correos o datos de cuentas de la versión de pago | Crítica |
| Sitio alterado | Página con contenido que no publicamos, redirecciones extrañas | Alta |
| Caída del servicio | El sitio o los procesos automáticos dejan de publicar por más de 24 h | Media |
| Dependencia vulnerable | Dependabot o CodeQL marcan una vulnerabilidad alta o crítica | Media |
| Fuente comprometida | Una fuente de datos empieza a entregar contenido malicioso | Media |

## 2. Pasos (en este orden)

1. **Detectar y registrar.** Anota en `docs/incidentes/AAAA-MM-DD-tema.md` (sin llaves ni datos personales): qué pasó, cuándo se detectó, cómo y quién.
2. **Contener (en la primera hora).**
   - Llave filtrada: revócala en el panel del proveedor y crea otra; guárdala solo en GitHub Secrets o en los secretos del Worker de Cloudflare.
   - Cuenta comprometida: cambia la contraseña, cierra todas las sesiones y revisa que el segundo factor siga activo.
   - Sitio alterado: revierte el commit con un PR y vuelve a publicar; si hace falta, pausa los workflows en GitHub → Actions.
   - Versión de pago: en Cloudflare se puede desactivar la ruta del Worker para cerrar el acceso mientras se investiga.
3. **Evaluar.** ¿Hubo datos personales involucrados? ¿Cuántas personas? ¿Desde cuándo? Usa los registros de GitHub (Settings → Security log) y de Cloudflare (Audit logs).
4. **Avisar.**
   - Si se vulneraron datos personales de forma que afecte significativamente derechos patrimoniales o morales de las personas, la ley mexicana de protección de datos pide informarles **sin demora** para que puedan protegerse. El aviso dice: qué pasó, qué datos se afectaron, qué recomendamos hacer y qué medidas tomamos. Se envía por correo a cada persona afectada.
   - A los proveedores que correspondan (Cloudflare, GitHub, Mercado Pago) por sus canales de seguridad.
   - Si hay un delito (por ejemplo, acceso ilícito a sistemas), evaluar denuncia ante la autoridad.
5. **Erradicar y recuperar.** Corregir la causa con un PR revisado y pruebas; restaurar datos desde las fuentes (los datos públicos se regeneran con los workflows) y la base de cuentas desde su respaldo.
6. **Aprender.** En la nota del incidente: causa raíz, qué funcionó, qué cambiar. Actualizar este plan y la autoauditoría.

## 3. Contactos y accesos de emergencia

| Qué | Dónde |
|---|---|
| Registro de seguridad de GitHub | github.com → Settings → Security log |
| Registros de auditoría de Cloudflare | dash.cloudflare.com → Manage account → Audit logs |
| Revocar llaves | Panel de cada proveedor (ver SOURCES.md para la lista de fuentes con llave) |
| Secretos del proyecto | GitHub → Settings → Secrets and variables → Actions; Cloudflare → Workers → Settings → Variables and Secrets |

Los códigos de recuperación del segundo factor se guardan fuera de línea (en papel o en un gestor de contraseñas), nunca en el repositorio.

## 4. Tiempos objetivo

| Gravedad | Contener | Avisar a afectados | Cerrar |
|---|---|---|---|
| Crítica | 1 h | Sin demora, en cuanto se confirme | 7 días |
| Alta | 4 h | Si aplica, en 72 h | 14 días |
| Media | 24 h | No suele aplicar | 30 días |

## 5. Simulacro

Una vez al año, simular la fuga de una llave de prueba y cronometrar los pasos 1 a 6. Anotar el resultado en `docs/incidentes/`.
