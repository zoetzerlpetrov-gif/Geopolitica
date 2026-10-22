# Cámaras públicas: fuentes y llaves

DOMINUS solo muestra cámaras que su operador publica para verse en abierto. Las imágenes se ven desde el servidor de cada operador; el sitio no las copia.

## Sin llave (activas)

| Fuente | País | Licencia o términos |
|---|---|---|
| Lista curada (`config/camaras.json`) | Varios | Página oficial de cada operador |
| Webcams de México | México | Publicación del operador (YouTube) |
| Digitraffic (Fintraffic) | Finlandia | CC BY 4.0 |
| Caltrans | EUA (California) | Datos públicos |
| NYC DOT | EUA (Nueva York) | Información pública |
| data.gov.sg (LTA) | Singapur | Singapore Open Data Licence |
| Departamento de Transporte | Hong Kong | Términos de DATA.GOV.HK |
| NZ Transport Agency | Nueva Zelanda | Datos públicos de NZTA |
| Vegagerðin | Islandia | Datos públicos |
| YouTube en vivo (secreto `YOUTUBE_API_KEY`) | Mundo | Reproductor oficial de YouTube |

## Con llave gratuita

En uso desde el 22 de octubre de 2026: **WSDOT** y **Windy Webcams** (secretos ya agregados). Las de la plataforma 511 tienen lector listo pero no se usan; para activarlas habría que agregar su secreto y su línea `env` en `.github/workflows/capas.yml`.

Respondieron «Invalid Key» o «access code missing» en la prueba del 22 de octubre de 2026. La llave es gratuita: se pide en el sitio de cada operador y se guarda como **secreto de GitHub** (Settings → Secrets and variables → Actions → New repository secret). Sin el secreto, esa fuente se salta y el resto sigue funcionando.

| Secreto | Fuente | Dónde pedir la llave (verifica el enlace vigente) |
|---|---|---|
| `CAM_511_ON` | Ontario 511 (Canadá) | 511on.ca → sección «Developers» / API |
| `CAM_511_AB` | 511 Alberta (Canadá) | 511.alberta.ca → «Developers» |
| `CAM_511_NY` | 511NY (EUA) | 511ny.org → «Developers» |
| `CAM_511_AZ` | AZ511 (EUA) | az511.com → «Developers» |
| `CAM_511_NV` | NVRoads (EUA) | nvroads.com → «Developers» |
| `CAM_511_GA` | 511GA (EUA) | 511ga.org → «Developers» |
| `WSDOT_ACCESS_CODE` | WSDOT (EUA, Washington) | wsdot.wa.gov/traffic/api → registro con correo |
| `WINDY_WEBCAMS_KEY` | Windy Webcams (mundo) | api.windy.com/keys → plan gratuito de Webcams |

Notas:

- Windy, plan gratuito: la URL de la imagen caduca en minutos, así que DOMINUS guarda solo el punto y el enlace al reproductor de Windy. El plan gratuito tiene límites de consultas y pide atribución.
- Ninguna llave se escribe en el código ni se publica: el error de una fuente se registra sin la parte de la URL que lleva la llave.

## Descartadas

- Quebec 511: protección anti-bots (Cloudflare). No se evade.
- TII Irlanda: 403. Taiwán (freeway.gov.tw): no respondió desde GitHub.
- Cámaras «expuestas por error» (Insecam, Shodan): nunca, aunque estén abiertas.
