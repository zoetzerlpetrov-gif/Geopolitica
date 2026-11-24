# Ambientes: desarrollo, pruebas, UAT, producción y respaldo

Un cambio de código pasa por cuatro ambientes. Cada uno tiene su dirección y su propósito.

| Ambiente | Dónde vive | Para qué | Quién lo usa |
|---|---|---|---|
| Desarrollo | Ramas de trabajo (`claude/…`) y su PR | Escribir el cambio; en el PR corren «pruebas» (Python y JavaScript) y CodeQL | Quien programa |
| Pruebas | Rama `pruebas` → https://pruebas.dominus-osint.pages.dev | Copia completa del sitio con el cambio y pruebas integrales por rol: capas, menús, páginas, datos, solo-admin, candados y contraste en tema claro y oscuro | Automático |
| UAT (aceptación) | Rama `uat` → https://uat.dominus-osint.pages.dev | La persona revisa el cambio como cliente antes de aprobarlo | La persona |
| Producción | Rama `main` → https://dominusosint.com | El sitio real | Clientes |
| Respaldo | https://zoetzerlpetrov-gif.github.io/Geopolitica y el archivo «respaldo-produccion-N» de cada corrida | Ver el sitio si Cloudflare falla | Todos (solo lectura) |

## Cómo se usa, paso a paso

1. **Desarrollo.** El cambio se hace en una rama de trabajo y se abre un PR hacia `main`. Las verificaciones «pruebas» y CodeQL deben pasar.
2. **Pruebas.** Antes de integrar, la rama se sube también a `pruebas` (en Actions → «Ambientes (pruebas y UAT)» → *Run workflow*, o con `git push origin HEAD:pruebas`).
   - El flujo publica la copia y corre «Pruebas integrales por rol».
   - El informe queda en el resumen de la corrida, en el artefacto `informe-e2e-N` y en Admin → Sistema → Tablero de pruebas.
3. **UAT.** Si las pruebas pasan, la misma rama se sube a `uat`. La persona abre https://uat.dominus-osint.pages.dev, revisa lo que pidió y responde «aprobado» o lo que haya que cambiar.
4. **Producción.** Con la aprobación, el PR se integra a `main` y el sitio se publica en dominusosint.com.
5. **Respaldo.** Cada publicación de producción deja la copia pública y limpia en GitHub Pages:
   - con cada cambio de código y cada 6 h;
   - además, como archivo descargable durante 14 días, con cada cambio de código y a las 00 h UTC.

## Qué protege cada ambiente

- Las copias de pruebas y UAT **leen** los datos de producción, pero **nunca escriben** en los buckets R2 (`dominus-grandes`, `dominus-datos-plan`) ni en las bases del Worker. Lo hace `tools/cloudflare/publicar_pages.sh` cuando `CF_RAMA` no es `main`.
- Las copias de pruebas, de UAT y de respaldo se comportan como el sitio público:
  - muestran la vista Demo o el plan de la cuenta;
  - no aceptan `?plan=`;
  - no contienen los archivos de datos por plan;
  - Admin solo existe en admin.dominusosint.com.
- Los datos en vivo (cada 20 min) y las ingestas siguen publicándose directo en producción. No pasan por UAT porque no cambian el código.

## Si Cloudflare se cae

| Qué falla | Qué sigue funcionando | Qué hacer |
|---|---|---|
| Cloudflare Pages (dominusosint.com no carga) | El respaldo en GitHub Pages | Compartir https://zoetzerlpetrov-gif.github.io/Geopolitica |
| DNS de Cloudflare (el dominio no resuelve) | El respaldo en GitHub Pages (otro proveedor) | Igual que arriba; el dominio vuelve cuando Cloudflare se recupera |
| El Worker (Admin, cuentas, pagos, datos por plan) | El mapa público y el respaldo, sin datos por plan ni inicio de sesión | Esperar a Cloudflare; los pagos de Mercado Pago se reintentan solos por webhook |
| Se publicó algo con error | El respaldo anterior | Cloudflare → Workers & Pages → dominus-osint → Deployments → «Rollback» a la versión anterior, o descargar el artefacto `respaldo-produccion-N` |

Lo que el respaldo **no** incluye, por diseño:

- las capas de más de 25 MiB que viven en R2;
- los datos por plan;
- Admin.

## Ajustes que hace la persona una sola vez (GitHub → Settings)

1. **Pages → Build and deployment → Source: «GitHub Actions»** (activa el respaldo en GitHub Pages).
2. Opcional: **Environments → New environment → `produccion`** con «Required reviewers» si se quiere aprobar cada publicación de código con un clic. Las publicaciones de datos se seguirían haciendo solas; para eso habría que separarlas del flujo de código, cosa que aún no está hecha.
