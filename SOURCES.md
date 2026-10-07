# Fuentes, licencias y atribución

Regla del proyecto: de cada nota o publicación solo se guarda **título, fuente, fecha, enlace y un resumen propio de máximo 2 frases**. Nunca el texto completo. El mapa muestra siempre la fuente y el enlace original.

## En uso (Fase 1)

| Recurso | Para qué | Licencia / términos | Atribución mostrada |
|---|---|---|---|
| [MapLibre GL JS](https://maplibre.org/) 5.24.0 | Motor del mapa (WebGL) | BSD 3-Clause (`vendor/maplibre-gl/LICENSE.txt`) | Automática en el control del mapa |
| [OpenFreeMap](https://openfreemap.org/) estilos *positron* y *dark* | Mapa base vectorial | Servicio gratuito, sin llave ni límites publicados; se ofrece "tal cual" y puede cambiar | "OpenFreeMap © OpenMapTiles, datos © OpenStreetMap" |
| [OpenMapTiles](https://openmaptiles.org/) | Esquema y diseño de los mosaicos | Código BSD 3-Clause, diseño CC BY 4.0 | Incluida arriba |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Datos del mapa base | ODbL 1.0 | Incluida arriba |
| [Natural Earth](https://www.naturalearthdata.com/) 1:50m vía paquete [world-atlas](https://github.com/topojson/world-atlas) 2.0.2 | Polígonos de países (`data/base/countries.geojson`), mapa base de respaldo y futuro mapa de calor | Dominio público (world-atlas: ISC) | Pie de página |
| [i18n-iso-countries](https://github.com/michaelwittig/node-i18n-iso-countries) 7.14.0 | Nombres de países en español e inglés | MIT | — |
| EIA, *World Oil Transit Chokepoints* | Referencia para la lista de chokepoints | Información pública del gobierno de EUA | En `config/chokepoints.json` |
| Wikipedia (enlaces de búsqueda) | Enlace de los 28 eventos de ejemplo | Solo se enlaza; no se copia contenido | En cada ficha |

Por qué no CARTO: desde 2026 sus mapas base exigen una llave de API; sin ella los mosaicos salen con la marca de agua "API KEY REQUIRED" ([CARTO](https://www.carto.com/basemaps/apikey/)). OpenFreeMap no pide llave. Si deja de responder, el sitio cambia solo al mapa local de Natural Earth.

## Planeadas (Fase 2 en adelante): estado por verificar

La disponibilidad real de cada feed la comprobará el workflow de ingesta desde GitHub Actions y quedará registrada en `data/run-log.json`.

| Fuente | Costo | Registro / llave | Coordenadas | Estado |
|---|---|---|---|---|
| GDELT 2.0 Events (CSV cada 15 min) | Gratis | No | Sí | Fase 2 |
| GDELT DOC 2.0 API | Gratis | No | No (país de la fuente) | Fase 2 |
| ReliefWeb API (OCHA) | Gratis | `appname` preaprobado obligatorio desde el 1 nov 2025 | País | Fase 2: hay que solicitar el appname |
| RSS: BBC World, DW, France 24, El País, Al Jazeera, Crisis Group, CIDOB, Real Instituto Elcano | Gratis | No | No (gazetteer) | Fase 2 |
| Bluesky, Mastodon | Gratis | Bluesky: *app password* | No | Fase 6 |
| ACLED | Nivel Open gratis | Registro (myACLED) | Sí | Pospuesto: sus términos limitan publicar datos crudos |
| X/Twitter | De pago (~0.005 USD por post leído, según fuentes secundarias) | Sí | — | Descartado por costo |
| OFAC SDN, lista consolidada UE, Banco Mundial | Gratis | No | No | Fase 5 |
