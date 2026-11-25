# Productos por suscripción: empresas y creadores de contenido

Este documento ordena lo que se puede vender por mensualidad con lo que DOMINUS ya tiene y fija el orden en que se construye. Cada fase termina en algo que se puede cobrar.

## Lo que comparten todos los productos (fase 0)

Cada cliente opera su propio espacio sin que intervengamos. Para eso faltan cuatro piezas comunes:

| Pieza | Qué hace | Base técnica |
|---|---|---|
| Espacio por organización | Los datos de una empresa no se mezclan con los de otra | Tabla `organizaciones` y columna `org_id` en la base D1 del Worker; cada consulta filtra por la organización de la sesión |
| Usuarios y roles | Dueño, administrador, editor y lector, con invitación por correo | La misma sesión de Google/GitHub del Worker; la invitación es un enlace firmado con vencimiento |
| Cobro recurrente por asiento | Licencia individual, equipo (5) o a la medida | Suscripciones de Mercado Pago (ya conectadas para los planes) con cantidad de asientos |
| Bitácora y respaldo | Quién cambió qué y exportación de todo en Excel o JSON | Tabla `bitacora` en D1 y exportación desde la página |

Antes de cobrar a empresas:

- contrato de servicio con nivel de disponibilidad;
- aviso de privacidad para datos de terceros (LFPDPPP);
- cifrado en reposo;
- respaldo diario de D1.

## Para empresas (en este orden)

| # | Producto | Qué ya existe | Qué falta | Precio de referencia (USD/mes) |
|---|---|---|---|---|
| 1 | Cumplimiento normativo | Fichas por país y sector, preguntas de auditoría, monitor diario del DOF, agenda regulatoria | Guardar respuestas y evidencias por organización, responsables, vencimientos y aviso por correo cuando cambia una ley que les aplica | 49 individual · 199 equipo |
| 2 | Seguimiento de proyectos (OPS + Cartera) | Plantilla por sector y país, Gantt, vencimientos, vista de directivos | Proyectos por organización, asignación de tareas a usuarios, comentarios y archivos | 29 por usuario |
| 3 | Monitoreo de instalaciones | Sedes y proveedores contra los eventos del mapa, matriz de riesgo | Sedes guardadas por organización y alertas por correo o WhatsApp cuando pasa algo cerca | 99 hasta 20 sedes |
| 4 | Revisión técnica de vulnerabilidades | Diagnóstico de dominio, inventario y versiones | Registro del dominio con verificación DNS (prueba de que es suyo) y revisión semanal automática | 79 por dominio |

Los precios son una propuesta para validar con los primeros 10 clientes; no son el resultado de un estudio de mercado.

## Para creadores de contenido (producto aparte, precio bajo)

La idea: una suscripción accesible que ayude a cualquier creador, de cualquier tema, a planear, producir, publicar y medir.

| Módulo | Qué hace | Qué se reutiliza de DOMINUS |
|---|---|---|
| Temas del día | Qué está creciendo en su tema (noticias, búsquedas, conversación) y por qué | Noticiero (31 secciones), GDELT, clasificador de temas |
| Guion y textos | Guion de video, título, descripción, etiquetas y textos por red con el límite de cada una | Redactor de Brújula Diaria (IA local abierta), límites por red de Marketing |
| Video automático | Video horizontal o vertical con voz sintética, escenas animadas y subtítulos | Motor de Brújula Diaria (Kokoro, Playwright, ffmpeg) y piezas de campaña |
| Imágenes | Miniaturas, publicaciones e historias con su marca | Plantillas de `tools/marketing/piezas.html` con colores y logo del creador |
| Calendario y publicación | Calendario por red, recordatorios y publicación directa donde la red lo permite (YouTube y Bluesky primero) | Calendario y semana tipo de Marketing, subida a YouTube |
| Estadísticas | Vistas, retención, me gusta, comentarios y crecimiento por red en un solo tablero | Tablero de Marketing y métricas de YouTube |
| Comentarios | Respuestas propuestas y filtro de ofensivos o spam | Comentarios de YouTube con IA local |

### Planes propuestos

| Plan | Precio de referencia | Incluye |
|---|---|---|
| Inicial | 5 USD/mes | Temas del día, guiones y textos, imágenes, calendario, 1 red conectada |
| Creador | 12 USD/mes | Lo anterior, 10 videos automáticos al mes, 3 redes y estadísticas |
| Pro / agencia | 29 USD/mes | Videos ilimitados con cuota justa, 10 redes, 3 marcas y equipo de 3 |

Para que el precio bajo sea sostenible:

- **Costo por suscriptor bajo.** La IA y la voz son modelos abiertos que corren en GitHub Actions o en un servidor propio; no se paga por cada uso a un proveedor externo.
- **Límites de uso.** Los videos usan una cola con tope por plan.

### Fases del producto para creadores

1. **Página pública «Herramientas para creadores» (sin cuenta).** Generador de títulos, descripciones y textos por red, y plantillas de imagen. Sirve también como gancho de marketing.
2. **Cuenta y plan Inicial.** Temas del día de su tema, calendario e imágenes con su marca.
3. **Video automático.** Cola de render con tope mensual y descarga del video.
4. **Conexión de redes y estadísticas.** Primero YouTube; luego las demás, según lo que permita la API de cada red y su revisión de aplicación.

## Requisitos legales y de plataformas

- Cada red pide revisar la aplicación antes de publicar en nombre de terceros (YouTube Data API, API de Instagram/Meta, TikTok Content Posting API). Hay que contar con semanas de revisión.
- Los videos con voz sintética se declaran como contenido sintético en YouTube (ya se hace en Brújula Diaria).
- La música debe ser con licencia; se recomienda agregarla desde la biblioteca de cada red.
- Facturación: CFDI para clientes en México (Mercado Pago no lo emite por ti; se necesita un PAC o tu contador).
