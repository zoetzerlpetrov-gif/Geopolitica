# Declaración de aplicabilidad (SoA) · ISO/IEC 27001:2022 Anexo A

Versión 1 · 2026-11-19 · 93 controles: 73 aplican, 3 parciales, 17 no aplican (con justificación).

| Control | Nombre | ¿Aplica? | Implementación o justificación |
|---|---|---|---|
| 5.1 | Políticas de seguridad de la información | Sí | docs/sgsi/POLITICA_SEGURIDAD.md |
| 5.2 | Roles y responsabilidades | Sí | Tabla de roles en la política |
| 5.3 | Segregación de funciones | Sí | Separación por registro: PR, CI y actas (proyecto de una persona) |
| 5.4 | Responsabilidades de la dirección | Sí | Revisión trimestral (REVISION_DIRECCION.md) |
| 5.5 | Contacto con autoridades | Sí | INAI/autoridad de datos y policía cibernética en el plan de incidentes |
| 5.6 | Contacto con grupos de interés especial | Sí | Fuentes de inteligencia de amenazas (abuse.ch, CISA KEV) en el mapa |
| 5.7 | Inteligencia de amenazas | Sí | Capas de ciberamenazas y vigía |
| 5.8 | Seguridad en la gestión de proyectos | Sí | PR con pruebas y CodeQL |
| 5.9 | Inventario de información y activos | Sí | ALCANCE.md y config/apis_cuotas.json |
| 5.10 | Uso aceptable de la información | Sí | Política: reglas de datos y fuentes |
| 5.11 | Devolución de activos | No | Sin personal ni equipos asignados a terceros |
| 5.12 | Clasificación de la información | Sí | Público / Admin (/ops/) / cliente / familiar |
| 5.13 | Etiquetado de la información | Sí | noindex y rutas /ops/ para Admin |
| 5.14 | Transferencia de información | Sí | Solo HTTPS (HSTS); respaldos cifrados |
| 5.15 | Control de acceso | Sí | Cloudflare Access en /ops/; sesiones del Worker |
| 5.16 | Gestión de identidades | Sí | Cuentas de GitHub/Google por persona; sin cuentas compartidas |
| 5.17 | Información de autenticación | Sí | OAuth (sin contraseñas propias); 2FA en proveedores |
| 5.18 | Derechos de acceso | Sí | Planes en D1 con vencimiento; OSINT_ADMIN_GITHUB_IDS |
| 5.19 | Seguridad con proveedores | Sí | Proveedores de nube evaluados en ALCANCE.md |
| 5.20 | Seguridad en acuerdos con proveedores | Sí | Términos de servicio de cada proveedor y fuente |
| 5.21 | Cadena de suministro TIC | Sí | Acciones fijadas por hash; Dependabot |
| 5.22 | Seguimiento de servicios de proveedores | Sí | Cuotas de APIs y vigía |
| 5.23 | Uso de servicios en la nube | Sí | Cloudflare, GitHub, Supabase con 2FA y mínimo privilegio |
| 5.24 | Planificación de gestión de incidentes | Sí | docs/SEGURIDAD.md |
| 5.25 | Evaluación de eventos | Sí | Vigía cada 10 min con umbrales |
| 5.26 | Respuesta a incidentes | Sí | Modo Under Attack automático y aviso |
| 5.27 | Aprendizaje de incidentes | Sí | Revisión por la dirección |
| 5.28 | Recolección de evidencias | Sí | Historial de Git, registros de Actions y de Cloudflare |
| 5.29 | Seguridad durante una interrupción | Sí | BIA.md |
| 5.30 | Preparación TIC para la continuidad | Sí | BIA.md: restauración por workflow y D1 Time Travel |
| 5.31 | Requisitos legales y contractuales | Sí | Monitor normativo; LFPDPPP; licencias de fuentes |
| 5.32 | Propiedad intelectual | Sí | SOURCES.md y fuentes.html; licencias por fuente |
| 5.33 | Protección de registros | Sí | Historial de Git y ramas de datos |
| 5.34 | Privacidad y datos personales | Sí | Aviso de privacidad y ARCO.md |
| 5.35 | Revisión independiente | Parcial | Autoauditoría automática; falta auditoría externa |
| 5.36 | Cumplimiento de políticas y normas | Sí | Autoauditoría semanal |
| 5.37 | Procedimientos operativos documentados | Sí | docs/ y tutorial |
| 6.1 | Investigación de antecedentes | No | Sin personal contratado |
| 6.2 | Términos y condiciones del empleo | No | Sin personal contratado |
| 6.3 | Concienciación y formación | Sí | CAPACITACION.md |
| 6.4 | Proceso disciplinario | No | Sin personal contratado |
| 6.5 | Responsabilidades tras la terminación | No | Sin personal contratado |
| 6.6 | Acuerdos de confidencialidad | Sí | Con clientes y patrocinadores (contrato de patrocinio) |
| 6.7 | Trabajo remoto | Sí | Política: dispositivos |
| 6.8 | Reporte de eventos de seguridad | Sí | SECURITY.md y security.txt |
| 7.1 | Perímetros de seguridad física | No | Sin instalaciones propias (nube) |
| 7.2 | Entrada física | No | Sin instalaciones propias |
| 7.3 | Seguridad de oficinas | No | Sin instalaciones propias |
| 7.4 | Monitoreo de seguridad física | No | Sin instalaciones propias |
| 7.5 | Amenazas físicas y ambientales | No | A cargo de los proveedores de nube |
| 7.6 | Trabajo en áreas seguras | No | Sin instalaciones propias |
| 7.7 | Escritorio y pantalla limpios | Sí | Política: bloqueo automático del equipo |
| 7.8 | Ubicación y protección de equipos | Sí | Equipo personal con cifrado |
| 7.9 | Activos fuera de las instalaciones | Sí | Equipo portátil con cifrado y bloqueo |
| 7.10 | Medios de almacenamiento | Sí | Respaldos cifrados |
| 7.11 | Servicios de suministro | No | A cargo de los proveedores de nube |
| 7.12 | Seguridad del cableado | No | Sin instalaciones propias |
| 7.13 | Mantenimiento de equipos | Sí | Actualizaciones del equipo personal |
| 7.14 | Eliminación o reutilización de equipos | Sí | Borrado seguro antes de desechar |
| 8.1 | Dispositivos de usuario final | Sí | Política: dispositivos |
| 8.2 | Derechos de acceso privilegiado | Sí | Tokens de mínimo privilegio por uso |
| 8.3 | Restricción de acceso a la información | Sí | /ops/ con Access; vista de pago |
| 8.4 | Acceso al código fuente | Sí | Repositorio público sin secretos; escritura solo del titular |
| 8.5 | Autenticación segura | Sí | OAuth con PKCE; cookies firmadas HttpOnly |
| 8.6 | Gestión de la capacidad | Sí | Cuotas de APIs |
| 8.7 | Protección contra malware | Sí | Análisis de archivos en el navegador; antivirus del equipo |
| 8.8 | Gestión de vulnerabilidades técnicas | Sí | Dependabot y CodeQL |
| 8.9 | Gestión de la configuración | Sí | Configuración versionada en config/ |
| 8.10 | Eliminación de información | Sí | ARCO: cancelación en D1/Supabase |
| 8.11 | Enmascaramiento de datos | Sí | Solo totales en registros; sin llaves en logs |
| 8.12 | Prevención de fuga de datos | Sí | Autoauditoría de secretos y datos personales públicos |
| 8.13 | Respaldo de la información | Sí | Ramas de datos, D1 Time Travel, respaldos cifrados |
| 8.14 | Redundancia | Parcial | CDN de Cloudflare; sin réplica fuera de Cloudflare |
| 8.15 | Registro (logging) | Parcial | Registros de Actions y Cloudflare; falta bitácora con integridad propia |
| 8.16 | Actividades de monitoreo | Sí | Vigía y estado de procesos |
| 8.17 | Sincronización de relojes | Sí | Proveedores con NTP; marcas en UTC |
| 8.18 | Programas utilitarios privilegiados | No | Sin servidores propios |
| 8.19 | Instalación de software en sistemas | Sí | Dependencias fijadas en los workflows |
| 8.20 | Seguridad de redes | Sí | Cloudflare (WAF, DDoS) |
| 8.21 | Seguridad de servicios de red | Sí | HTTPS, HSTS, DNS en Cloudflare |
| 8.22 | Segregación de redes | No | Sin red propia |
| 8.23 | Filtrado web | No | Sin red corporativa |
| 8.24 | Uso de criptografía | Sí | Web Crypto (AES-GCM) en respaldos; HMAC en sesiones |
| 8.25 | Ciclo de vida de desarrollo seguro | Sí | PR, pruebas, CodeQL |
| 8.26 | Requisitos de seguridad de aplicaciones | Sí | Escape de HTML, CSP, cookies seguras |
| 8.27 | Arquitectura segura | Sí | Sitio estático + Worker mínimo |
| 8.28 | Codificación segura | Sí | esc(), sin eval; CodeQL |
| 8.29 | Pruebas de seguridad | Sí | Pruebas automáticas y CodeQL en cada PR |
| 8.30 | Desarrollo subcontratado | No | Sin desarrollo subcontratado |
| 8.31 | Separación de entornos | Sí | Rama de trabajo + PR; producción solo desde main |
| 8.32 | Gestión de cambios | Sí | Ruleset de main y PR |
| 8.33 | Información de prueba | Sí | Pruebas con datos ficticios |
| 8.34 | Protección durante auditorías | Sí | Autoauditoría solo de lectura |
