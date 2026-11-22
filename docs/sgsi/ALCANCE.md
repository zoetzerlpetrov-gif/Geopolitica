# Alcance del SGSI de DOMINUS OSINT

SGSI-01 · Versión 2 · Fecha: 2026-11-22. Dueño: titular del proyecto. Próxima revisión: 2027-11-22 o por cambio relevante. Referencia: ISO/IEC 27001:2022, 4.3.

Cubre el diseño, desarrollo, publicación, operación y mantenimiento del servicio web: sitio público, versión comercial, herramientas administrativas, backend, procesos automáticos y manejo de información bajo control del proyecto. Se aplica a quien administra, desarrolla, atiende soporte o accede a información del servicio.

| Activo o servicio | Límites y datos | Dueño y criticidad inicial |
|---|---|---|
| dominusosint.com y dominus-osint.pages.dev | Sitio público/comercial, noticias, mapas, preferencias en navegador, mediciones y registros técnicos de nube | Operación, Tier 1 |
| /ops/ y admin.dominusosint.com | Administración, decisiones y configuración; acceso bajo controles de servidor y nube | Titular, Tier 1 |
| Workers, D1 y R2 | Autenticación, sesiones, cuentas, planes, configuración legal y datos por rol | Administración técnica, Tier 1 |
| zoetzerlpetrov-gif/Geopolitica y GitHub Actions | Código, dependencias, CI/CD, ingesta, ramas de datos, alertas y secretos de ejecución | Administración técnica, Tier 1 |
| Supabase opcional y navegador | Carteras, expedientes y respaldos según configuración del usuario | Usuario y operación según responsabilidad, Tier 1 si hay datos de clientes |
| Fuentes, cámaras y YouTube | Licencias, títulos, enlaces, guiones y publicaciones | Operación, Tier 2 |
| Dispositivos y cuentas administrativas | Correo, accesos a proveedores, recuperación, tokens y copias | Titular, Tier 1 |

Tier 1: impacto alto; requiere control de cambios, pruebas, evidencia y recuperación. Tier 2: impacto medio recuperable; requiere controles proporcionales y regresión focalizada. Es clasificación preliminar, no declaración de controles verificados.

Proveedores relevantes: GitHub, Cloudflare, Google/YouTube, Mercado Pago, Supabase cuando se use y proveedores de noticias, mapas y APIs. Se cubren su selección, contratos/licencias, configuración, accesos y supervisión. No se administra ni audita la infraestructura interna de esos proveedores ni las redes u operaciones propias de clientes fuera del servicio contratado. Los dispositivos personales usados para administrar sí se incluyen como dependencia.

Partes interesadas: titular, colaboradores autorizados, visitantes, clientes, titulares de datos personales, proveedores, propietarios de contenidos y autoridades competentes. Obligaciones a evaluar: LFPDPPP, contratos, licencias, términos de servicio y continuidad. Un sitio público también tiene registros técnicos de proveedores; no se presume ausencia de datos personales.

Evidencia: workflows, código cloudflare/, config/paginas_admin.json, config/datos_por_plan.json y aviso de privacidad. Las cuentas, nombres de responsables, contratos privados y datos de clientes se conservan fuera del repositorio público. Aprobación de política y aceptación del riesgo residual se registran por separado.
