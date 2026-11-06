# Huella digital OSINT

La opción **Secciones → Huella digital OSINT** aparece en el mapa administrativo después de iniciar sesión. Demo, Recon, Analyst y Command siguen sin mostrarla. Cambiar la URL a `?vista=admin` no concede acceso. El ingreso se hace con GitHub y el Worker verifica el ID numérico contra la lista de administradores en cada solicitud. La sesión dura una hora.

## Consultas

- **Alias.** Coincidencia exacta en GitHub, Hacker News y DEV Community. Un alias idéntico puede corresponder a personas distintas.
- **Correo o dominio.** MX, SPF y DMARC vía DNS público de Google e incidentes públicos del sitio según Have I Been Pwned (HIBP). Se envía solo el dominio. La tarjeta de incidentes indica nombre, fecha y clases de datos, con el estado de verificación del proveedor. Por ejemplo, `adobe.com` permite comprobar que el catálogo devuelve incidentes del sitio.
- **Exposición individual.** La búsqueda de incidentes del sitio no comprueba una dirección concreta. Para revisar una dirección propia, la consola enlaza a HIBP y deja que la persona capture su correo allí. La API automatizada para una dirección requiere un plan o clave compatible y queda fuera de esta versión.
- La consola no almacena consultas ni resultados. Usa los servicios externos solo para identificadores de investigaciones autorizadas.

## Activar desde el navegador, sin Cloudflare Access

El mapa administrativo y el Worker deben compartir un host HTTPS bajo tu control. GitHub Pages sirve archivos estáticos y no puede ejecutar la validación de sesión en `github.io`. El Worker puede convivir con la copia del mapa en un dominio personalizado. El módulo no requiere una política de Cloudflare Access.

1. En GitHub abre **Settings → Developer settings → OAuth Apps → New OAuth App**. Crea una aplicación dedicada para Huella. En **Homepage URL** indica el origen HTTPS del mapa administrativo. En **Authorization callback URL** indica ese mismo origen seguido de `/admin/huella/oauth/callback`. Guarda el Client ID y genera un Client Secret. La aplicación no solicita permisos adicionales para repositorios.
2. En Cloudflare **Workers & Pages**, conecta este repositorio. Selecciona `cloudflare/huella` como directorio raíz y usa `npx wrangler@4 deploy` como comando del servicio de compilación. Los comandos corren en el servicio de compilación, desde el panel web. Conserva deshabilitadas las URL de vista previa y `workers.dev`.
3. En **Settings → Variables and Secrets** del Worker configura lo siguiente:

   | Nombre | Tipo | Valor |
   |---|---|---|
   | `OSINT_ORIGIN` | Variable | El origen HTTPS del mapa administrativo, sin barra final. |
   | `OSINT_GITHUB_CLIENT_ID` | Variable | Client ID de la OAuth App. |
   | `OSINT_GITHUB_CLIENT_SECRET` | Secreto | Client Secret de la OAuth App. |
   | `OSINT_SESSION_SECRET` | Secreto | Valor aleatorio de 32 caracteres o más, independiente del Client Secret. Usa el generador de tu gestor de contraseñas. |
   | `OSINT_ADMIN_GITHUB_IDS` | Variable | IDs numéricos de las cuentas autorizadas, separados por comas. Para consultar tu ID, abre `https://api.github.com/users/TU_USUARIO` y localiza el campo `id`. |

4. Crea una ruta **Workers Routes** para `tu-host/admin/huella/*` en el host del mapa administrativo. Publica el mapa con el último código en la raíz de ese mismo host. No compartas secretos en GitHub ni en enlaces.
5. Abre `https://tu-host/admin/huella/` en el navegador y selecciona **Continuar con GitHub**. Después del ingreso, vuelve al mapa y abre **Secciones**. Prueba el alias `github` y el dominio `adobe.com`. En una ventana privada, verifica que la consola solicite iniciar sesión y que abrir directamente la API no entregue resultados. Configura límites de peticiones en la ruta antes de dar acceso a varios administradores.

El Worker mantiene cerrado el acceso si falta configuración. El código de OAuth valida estado y PKCE, usa cookies HttpOnly con una firma del servidor, y conserva únicamente el identificador de sesión firmado en la cookie. El token de GitHub se usa para verificar la identidad durante el ingreso y no se guarda en el navegador.

[OAuth de GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) · [API de Have I Been Pwned](https://haveibeenpwned.com/API/V3)
