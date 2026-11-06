# Huella digital OSINT

La opción **Secciones → Huella digital OSINT** aparece en el mapa administrativo después de iniciar sesión. Demo, Recon, Analyst y Command siguen sin mostrarla. Cambiar la URL a `?vista=admin` no concede acceso. El ingreso se hace con GitHub y el Worker verifica el ID numérico contra la lista de administradores en cada solicitud. La sesión dura una hora. En el mapa público, **Secciones → Acceso administrativo** abre Huella en Cloudflare. La consola solicita el ingreso con GitHub si no hay sesión activa.

## Consultas

- **Alias.** Hasta 28 comprobaciones sin clave. Desarrollo y conocimiento: GitHub, GitLab.com, Codeberg, Gitea.com, Hacker News, DEV Community, Hugging Face, Drupal.org, Codewars, RubyGems.org, crates.io, Bitbucket (espacios públicos), Keybase y Wikimedia (cuenta global). Redes: X (cronología pública), Tumblr (página pública), Bluesky, mastodon.social, mastodon.online, Fosstodon y Framatube. Wikidata añade enlaces con referencia editorial para el alias exacto, entre ellos Instagram, Facebook, TikTok, LinkedIn, Pinterest, Telegram, Twitch, YouTube, Medium y Threads cuando hay una declaración pública. Juegos: Chess.com, Lichess, Roblox y Minecraft Java. Un alias idéntico puede corresponder a personas distintas.
- **Sitios conocidos.** Stack Overflow devuelve indicios cuando el nombre visible coincide exactamente. WordPress.com comprueba el subdominio público. La sección **Redes y sitios populares** ofrece enlaces manuales por alias, por ejemplo a Instagram, Facebook, LinkedIn, X, Reddit, Threads, YouTube y Telegram. Esos enlaces no se visitan automáticamente ni se cuentan como hallazgos.
- **Catálogo ampliado.** Escribe el alias y marca **Consultar catálogo ampliado por alias** para intentar 323 fuentes adicionales. Puedes elegir una categoría, como música, compras, viajes o redes sociales, o consultar todas. Cada lote consulta únicamente el alias. El catálogo permanece deshabilitado hasta escribir un alias público. La comprobación se basa en el código HTTP y una firma del sitio. Un indicio requiere revisión del perfil y puede cambiar si el proveedor modifica su página. Las redirecciones, los bloqueos, las respuestas inesperadas y los errores se muestran como no concluyentes. El catálogo no usa credenciales de los sitios ni consulta registros privados.
- **Datos del catálogo.** Selección y adaptación de [WhatsMyName, Micah Hoffman y colaboradores](https://github.com/WebBreacher/WhatsMyName/blob/aa62074cc6c7e5b6f6e196ee826c3e44822b4f67/wmn-data.json), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Se seleccionaron fuentes con comprobaciones HTTPS y se excluyeron reglas que requieren cabeceras especiales, POST o protecciones declaradas. El archivo adaptado conserva la licencia de los datos. También se adaptaron reglas públicas de [Maigret](https://github.com/soxoj/maigret/blob/21577cf7730ddaad0f17d7797e6dbf4642411b50/maigret/resources/data.json) bajo MIT. Los dos conjuntos se mantienen separados y se deduplicaron sus destinos antes de integrarlos.
- **Cruce.** Puedes consultar un correo, un alias o ambos. Para cruzarlos, introduce ambos y elige **Correo exacto y dominio**. Si Gravatar publica enlaces visibles, se muestran y se comparan con las URL de los perfiles comprobados por alias. Cuando GitLab publica la misma dirección en el perfil devuelto por alias, Huella lo señala sin mandar el correo a GitLab. Los enlaces publicados hacia servicios como Instagram, LinkedIn o TikTok se atribuyen a Gravatar. Si la búsqueda de correo devuelve un enlace público compatible, puedes usar su alias en el catálogo sin enviar el correo a esas fuentes.
- **Conectores comerciales.** [IntelBase](https://intelbase.is/docs) requiere un plan con acceso API, una clave y registrar la IP de salida. [Behind the Email](https://api.behindtheemail.com/v1/docs/) requiere una clave y un [plan compatible](https://behindtheemail.com/pricing). Las comprobaciones directas de Huella no dependen de estos proveedores.
- **Correo o dominio.** MX, SPF y DMARC vía DNS público de Google e incidentes públicos del sitio según Have I Been Pwned (HIBP). Al escribir un dominio o elegir **Solo dominio**, se envía solo el dominio. La tarjeta de incidentes indica nombre, fecha y clases de datos, con el estado de verificación del proveedor. Por ejemplo, `adobe.com` permite comprobar que el catálogo devuelve incidentes del sitio.
- **Correo exacto (opcional).** Envía la dirección a keys.openpgp.org para comprobar una clave pública publicada y a GitHub para comprobar metadatos de commits públicos. Envía el SHA-256 de la dirección normalizada a Gravatar para buscar un perfil público. También comprueba la coincidencia exacta en el correo del perfil público de GitHub cuando la API devuelve ese campo. Consulta OPENPGPKEY y SMIMEA a través del DNS público con la huella de la parte anterior a la arroba. Las consultas funcionan sin clave. Estas coincidencias requieren interpretación y pueden faltar aunque la dirección exista.
- **Avatares públicos.** GitHub, Gravatar, Bluesky y GitLab pueden proporcionar un avatar en la respuesta del perfil. Huella muestra un botón cuando hay una URL compatible. Al pulsarlo, el navegador solicita la imagen a la fuente. Un avatar puede ser un logotipo, una ilustración o una imagen compartida.
- **Exposición individual.** La búsqueda de incidentes del sitio no comprueba una dirección concreta. Para revisar una dirección propia, la consola enlaza a HIBP y deja que la persona capture su correo allí. La API automatizada para una dirección requiere un plan o clave compatible y queda fuera de esta versión.
- La consola no almacena consultas ni resultados. Usa los servicios externos solo para identificadores de investigaciones autorizadas.

## Activar desde el navegador, sin Cloudflare Access

El mapa administrativo y el Worker deben compartir un host HTTPS bajo tu control. GitHub Pages sirve archivos estáticos y no puede ejecutar la validación de sesión en `github.io`. El Worker puede convivir con la copia del mapa en un dominio personalizado. El módulo no requiere una política de Cloudflare Access.

1. En GitHub abre **Settings → Developer settings → OAuth Apps → New OAuth App**. Crea una aplicación dedicada para Huella. En **Homepage URL** indica el origen HTTPS del mapa administrativo. En **Authorization callback URL** indica ese mismo origen seguido de `/admin/huella/oauth/callback`. Guarda el Client ID y genera un Client Secret. La aplicación no solicita permisos adicionales para repositorios.
2. En Cloudflare **Workers & Pages**, abre el Worker existente `geopolitica` o conecta este repositorio si todavía no está desplegado. Selecciona `cloudflare/huella` como directorio raíz y usa `npx wrangler@4 deploy` como comando del servicio de compilación. Los comandos corren en el servicio de compilación, desde el panel web. Mantén deshabilitadas las URL de vista previa. `workers.dev` está habilitado para la dirección temporal descrita abajo. El flujo **Configurar OAuth de Huella en Cloudflare** puede sincronizar el Client ID y el Client Secret ya guardados en GitHub Actions con el Worker `geopolitica`.
3. En **Settings → Variables and Secrets** del Worker configura lo siguiente:

   | Nombre | Tipo | Valor |
   |---|---|---|
   | `OSINT_ORIGIN` | Variable | El origen HTTPS del mapa administrativo, sin barra final. |
   | `OSINT_GITHUB_CLIENT_ID` | Variable o secreto | Client ID de la OAuth App. |
   | `OSINT_GITHUB_CLIENT_SECRET` | Secreto | Client Secret de la OAuth App. |
   | `OSINT_SESSION_SECRET` | Secreto | Valor aleatorio de 32 caracteres o más, independiente del Client Secret. Usa el generador de tu gestor de contraseñas. |
   | `OSINT_ADMIN_GITHUB_IDS` | Variable o secreto | IDs numéricos de las cuentas autorizadas, separados por comas. Para consultar tu ID, abre `https://api.github.com/users/TU_USUARIO` y localiza el campo `id`. |

4. Crea una ruta **Workers Routes** para `tu-host/admin/huella/*` en el host del mapa administrativo. Publica el mapa con el último código en la raíz de ese mismo host. No compartas secretos en GitHub ni en enlaces.
5. Abre `https://tu-host/admin/huella/` en el navegador y selecciona **Continuar con GitHub**. Después del ingreso, vuelve al mapa y abre **Secciones**. Prueba el alias `github` y el dominio `adobe.com`. En una ventana privada, verifica que la consola solicite iniciar sesión y que abrir directamente la API no entregue resultados. Configura límites de peticiones en la ruta antes de dar acceso a varios administradores.

El Worker mantiene cerrado el acceso si falta configuración. El código de OAuth valida estado y PKCE, usa cookies HttpOnly con una firma del servidor, y conserva únicamente el identificador de sesión firmado en la cookie. El token de GitHub se usa para verificar la identidad durante el ingreso y no se guarda en el navegador.

## Dirección temporal sin dominio propio

El Worker está disponible en `https://geopolitica.zoetzerl-petrov.workers.dev/admin/huella/`. Para usarla, configura ese origen en `OSINT_ORIGIN` y registra `https://geopolitica.zoetzerl-petrov.workers.dev/admin/huella/oauth/callback` como URL de retorno en la OAuth App de GitHub.

En la consola, **Mapa administrativo** abre la vista autenticada de DOMINUS en el mismo host. Esta vista solicita únicamente archivos públicos a GitHub Pages y no reenvía la sesión del administrador. El menú **Secciones** comprueba la sesión del Worker antes de mostrar el enlace de Huella. La edición pública sigue en GitHub Pages.

## Piloto de Recon, Analyst y Command

La base D1 `dominusosint-planes` contiene el esquema en `cloudflare/planes/001_planes.sql` y se vincula al Worker como `OSINT_PLANS_DB`. La base empieza vacía. Demo conserva su acceso público y Admin conserva una sesión distinta.

1. Cuando agregues el dominio, crea también la ruta `tu-host/cuenta/*` al mismo Worker. El callback de GitHub es el mismo que usa Huella.
2. En la consola de D1 asigna a una cuenta piloto un registro de `dominus_memberships` con su ID numérico de GitHub y `recon`, `analyst` o `command`. `expires_at` es una fecha Unix en segundos. Puedes deshabilitar la cuenta poniendo `active` en 0.
3. Abre `/cuenta/` e inicia sesión. `/cuenta/sesion` devuelve el plan vigente y `/cuenta/permiso?grupo=investigacion` comprueba el permiso según la matriz del proyecto. Ambos comprueban la base en cada solicitud y no admiten elegir un plan con `?plan=`.
4. Prueba un cambio o una revocación desde D1. Al volver a consultar, el resultado debe reflejar el cambio sin crear una sesión nueva.

El piloto valida la identidad y el plan. Las funciones y los archivos que ya están publicados en GitHub Pages siguen accesibles desde esa publicación. Para aplicar estos permisos a datos privados del mapa, cada fuente privada debe pasar por una ruta del Worker que compruebe el permiso antes de responder. El piloto no cobra ni asigna planes por suscripción.

[OAuth de GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) · [API de Have I Been Pwned](https://haveibeenpwned.com/API/V3)
