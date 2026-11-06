# Huella digital OSINT

La consola está en **Secciones → Huella digital OSINT** dentro de la edición administrativa. El menú consulta la sesión del Worker al abrirse. GitHub Pages no ejecuta el Worker y su compilación excluye la consola. El enlace no se muestra en Demo, Recon, Analyst ni Command. Cambiar parámetros como `?vista=admin` no autentica una cuenta.

## Alcance

- Alias público exacto en GitHub, Hacker News y DEV Community. Cada resultado indica la fuente y, si existe, enlaza al perfil. Coincidir en un alias no demuestra que dos cuentas pertenezcan a la misma persona.
- Correo o dominio con comprobaciones MX, SPF y DMARC vía DNS público de Google. Se envía solo el dominio. La interfaz no prueba si un buzón acepta mensajes y no usa recuperación de contraseñas.
- Resultados separados en verificado, sin resultado y no concluyente. El estado de límite del proveedor también es no concluyente. Las fuentes son independientes y se consultan en paralelo.
- La consola no conserva consultas ni resultados. La aplicación no integra catálogos de filtraciones, registros de infostealers ni búsquedas de titular por correo. Ofrece un enlace a Have I Been Pwned para una comprobación propia y separada.

## Activar en el alojamiento administrativo desde la web

1. Despliega `cloudflare/huella` como Worker `dominus-huella`. En Workers & Pages puedes conectar este repositorio, seleccionar `cloudflare/huella` como directorio raíz y usar `npx wrangler@4 deploy` como comando de despliegue del servicio de compilación. El navegador del administrador no necesita instalar nada.
2. En el Worker agrega el secreto `OSINT_ADMIN_EMAILS` con los correos administrativos separados por comas. Mantén deshabilitados `workers.dev` y las URL de vista previa.
3. En el mismo host donde vive el mapa administrativo, enruta `/admin/huella/*` al Worker. La edición administrativa debe publicar el mapa en la raíz de ese host. En Cloudflare Access protege el mapa administrativo y la ruta del Worker con la aplicación y política de administradores, con autenticación multifactor. La solicitud debe invocar al Worker directamente desde esa ruta protegida. Sirve sus recursos mediante el Worker para que todas las solicitudes pasen por autenticación.
4. Abre el mapa administrativo, inicia sesión y abre **Secciones**. Prueba `github` como alias público o `example.org` como dominio. Ese dominio anuncia Null MX y la consola muestra que declara no recibir correo.
5. Repite en una ventana sin sesión y con una cuenta ajena a la lista. La ruta directa y la API deben quedar bloqueadas. Configura un límite de peticiones en la ruta de consulta antes de habilitarla para varios administradores.

Si la ruta, Cloudflare Access o la lista de administradores no están configurados, el sistema queda cerrado.

[Cloudflare Access para Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) · [API de DNS de Google](https://developers.google.com/speed/public-dns/docs/doh/json) · [API pública de Hacker News](https://github.com/HackerNews/API)
