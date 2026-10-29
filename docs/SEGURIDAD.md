# Seguridad y privacidad de DOMINUS OSINT

Revisión del 29 de octubre de 2026 sobre el repositorio público (sitio en GitHub Pages, `backend/`, Worker `cloudflare/vuelos` y workflows). Es una revisión de código hecha por el equipo, no una auditoría externa ni una prueba de penetración. Antes de cobrar conviene contratar una prueba de penetración de la versión comercial.

## 1. Qué se revisó y qué se encontró

| Tema | Cómo se revisó | Resultado |
|---|---|---|
| Llaves y contraseñas en el código | Búsqueda de patrones de llaves (AWS, Google, GitHub, OpenAI, Slack, llaves privadas) en todo el repositorio | Ninguna. Las llaves viven en GitHub Secrets y los workflows las pasan como variables de entorno |
| Inyección SQL | Búsqueda de consultas armadas con texto (`execute(f"…")`, `%`, `.format`, `text(f"…")`) | Ninguna. `backend/` usa SQLAlchemy con consultas parametrizadas; el único `text()` es una consulta fija en una prueba |
| Inyección de HTML (XSS) | Revisión de cada `innerHTML`/`insertAdjacentHTML` con `${…}` sin `esc()` (42 casos) | Los 42 insertan números, textos propios del sitio o HTML ya escapado por funciones como `kv()`. Los datos externos (noticias, nombres de lugares, certificados) pasan por `esc()` |
| XML externo (XXE) | `backend/dominus/connectors.py` | Usa `defusedxml` con entidades y DTD externas prohibidas |
| Comandos del sistema | `subprocess`, `os.system`, `shell=True` | Solo listas de argumentos, sin shell y con tiempo límite |
| Worker de vuelos | `cloudflare/vuelos/worker.js` | Solo responde a los orígenes de la lista y solo a cajas de búsqueda predefinidas: no sirve como proxy abierto |
| Workflows de GitHub Actions | Datos de formularios o eventos pegados dentro de comandos `run:` | **1 hallazgo, corregido:** `inmuebles-geo.yml` pegaba el campo «max» dentro del comando. Ahora pasa por una variable y se valida como número |
| Backend | `backend/dominus/security.py` y `app.py` | Contraseñas con Argon2id, segundo factor TOTP, límite de intentos por IP y por usuario, cookie `HttpOnly` y `SameSite=Strict`, token CSRF, encabezados CSP, HSTS, `X-Frame-Options` y bitácora encadenada con HMAC |
| Rastreadores | Búsqueda de Google Analytics, Tag Manager, Meta Pixel, Hotjar, Clarity, Matomo y Plausible | Ninguno |
| Encabezados del sitio público | GitHub Pages no permite configurarlos | Sin CSP en el sitio público. Se resuelve en Cloudflare (sección 3) |

Pendientes recomendados (no son fallas activas):
1. Fijar las acciones de GitHub por su hash (`actions/checkout@<sha>`) en lugar de `@v4`, para que un cambio en la acción no entre sin revisión.
2. Activar Dependabot para `backend/requirements.txt` y `tools/package.json`.
3. Agregar CSP y demás encabezados en la versión comercial.
4. Hacer una prueba de penetración externa antes del lanzamiento.

## 2. ISO/IEC 27001:2022: qué cubre el código y qué falta

La certificación ISO 27001 se otorga a una organización, no a un programa. Exige un sistema de gestión (SGSI): alcance, análisis de riesgos, declaración de aplicabilidad, políticas, auditoría interna y revisión por la dirección. El código solo aporta evidencia para algunos controles del Anexo A:

| Control (Anexo A) | Evidencia en el proyecto | Falta |
|---|---|---|
| 5.15 Control de acceso | Roles en `backend/` (owner, analyst, reviewer, viewer); planes en `config/planes.json` | Que el Worker comercial aplique el plan del lado del servidor |
| 5.23 Servicios en la nube | Cloudflare, GitHub | Registro de proveedores con sus términos y la ubicación de los datos |
| 5.34 Privacidad y datos personales | Regla de no guardar datos personales más allá del enlace público | Aviso de privacidad (LFPDPPP) para la versión comercial |
| 8.4 Acceso al código fuente | Repositorio comercial privado previsto | Protección de rama y revisión obligatoria |
| 8.5 Autenticación segura | Argon2id + TOTP en `backend/` | Lo mismo en la versión comercial |
| 8.9 Gestión de la configuración | Todo en Git; secretos en GitHub Secrets | Inventario de secretos y su rotación |
| 8.15 Registro de eventos | Bitácora HMAC en `backend/` | Retención mínima de registros (ver sección 4) |
| 8.24 Criptografía | HTTPS, HMAC, Argon2id | Política de llaves |
| 8.25–8.29 Desarrollo seguro y pruebas | Pruebas automáticas en cada PR (581 de Python y 412 de JavaScript) | Análisis estático de seguridad (CodeQL) en CI y prueba de penetración |

Para la parte web, la guía práctica es OWASP ASVS 4.0 nivel 2 y el OWASP Top 10 (2021). La revisión de la sección 1 cubre A03 (inyección) y parte de A05 (configuración).

## 3. Cómo proteger los planes en Cloudflare

En el sitio actual, el bloqueo por plan ocurre en el navegador. Alguien con conocimientos puede reactivar una casilla desde las herramientas de desarrollador. En la versión comercial la protección real va en el servidor:

1. **Sesión:** al iniciar sesión, el Worker crea una cookie `HttpOnly; Secure; SameSite=Strict` con el id de sesión. El plan nunca se lee de la URL (`?plan=`) ni de `localStorage`.
2. **Plan desde la base de datos:** el Worker busca en D1 el plan vigente de esa cuenta, confirmado por el webhook de Mercado Pago.
3. **Datos detrás del Worker:** los archivos de capas, riesgos y reportes no se publican como estáticos abiertos. Se piden al Worker, que revisa `config/planes.json` y responde 403 si el plan no alcanza. Así, reactivar una casilla no sirve: el dato no llega.
4. **Lo de solo admin** queda en otra ruta protegida con Cloudflare Access (correo de quien administra + segundo factor), o directamente fuera de la versión comercial.
5. **Encabezados** desde el Worker: `Content-Security-Policy` con la lista de dominios que usa el mapa, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (cámara, micrófono y ubicación desactivados).
6. **WAF y límite de peticiones** de Cloudflare en las rutas de inicio de sesión y de datos.

## 4. Privacidad de quien usa el sitio (por ejemplo, periodistas)

### Lo que el sitio guarda hoy
- **En servidores del proyecto:** nada. No hay cuentas, formularios que se envíen ni analítica.
- **En el navegador de la persona** (`localStorage`): preferencias como tema, idioma, capas abiertas y sonido, y lo que la persona guarda en «Seguimiento» o en el cuaderno. No sale de su equipo; se borra al limpiar los datos del sitio.
- **Bitácora de errores para soporte** (`localStorage`, `js/bitacora.js`): hasta 100 errores de los últimos 14 días (página, tipo y ruta del archivo que falló, sin parámetros de la URL). No se envía sola: la persona la copia desde `soporte.html` si quiere pedir ayuda, y puede borrarla ahí mismo.
- **La ubicación del dispositivo:** el sitio no la pide. No usa `navigator.geolocation`.

### Quién puede ver la visita
- **GitHub Pages** recibe la dirección IP de cada visita, como cualquier servidor web (política de privacidad de GitHub).
- **Al abrir el mapa** se piden mosaicos a OpenFreeMap y banderas a flagcdn.com. Esos servicios ven la IP, no qué se investiga.
- **Al activar una capa o abrir una ficha**, el navegador pide datos al proveedor correspondiente: cámaras al operador, videos a YouTube (en modo `youtube-nocookie`), imágenes a NASA o Esri. Cada proveedor ve la IP y la zona pedida.
- **Los parámetros de la URL** (país, coordenadas de la ficha) quedan en el historial del navegador.

### Recomendaciones para una persona en riesgo
1. Usar **Tor Browser** en nivel «Estándar». El mapa necesita JavaScript y WebGL, así que el nivel «Más seguro» no lo muestra. Con Tor, ni GitHub ni los proveedores ven su IP real.
2. Si no puede usar Tor: una VPN de un proveedor auditado sin registros, y un perfil del navegador exclusivo para la investigación.
3. Borrar los datos del sitio al terminar (en el navegador: candado de la barra de direcciones → «Borrar datos del sitio»), sobre todo si guardó lugares en «Seguimiento».
4. No compartir enlaces con coordenadas de su ubicación ni de sus fuentes.
5. Organizaciones de apoyo en México: Artículo 19 (oficina para México y Centroamérica), Mecanismo de Protección para Personas Defensoras y Periodistas (Segob) y Access Now Digital Security Helpline (24/7, en español).

### Lo que la versión comercial debe cumplir
- Pedir solo el correo; el pago lo procesa Mercado Pago y el proyecto no ve ni guarda datos de la tarjeta.
- Aviso de privacidad conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (publicada en el DOF el 20 de marzo de 2025), con derechos ARCO.
- Registros de acceso con la IP truncada y borrado automático en 30 días o menos.
- Ninguna analítica de terceros; si se necesita medir uso, contadores agregados en el propio Worker.
- Opción de pagar y entrar sin dar el nombre real: el correo puede ser un alias.
