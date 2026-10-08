# Fuentes, licencias y atribución

Regla del proyecto: de cada nota o publicación solo se guarda **título, fuente, fecha, enlace y un resumen propio de máximo 2 frases**. Nunca el texto completo. El mapa muestra siempre la fuente y el enlace original.

"Verificada" = la licencia se confirmó contra la página de la fuente. "Por verificar" = se tomó de documentación secundaria o de memoria y hay que confirmarla antes de depender de ella.

## Bibliotecas y mapa base (en uso)

| Recurso | Uso | Licencia |
|---|---|---|
| MapLibre GL JS 5.24.0 | Motor del mapa (WebGL) | BSD 3-Clause |
| pmtiles 4.5.0 (Protomaps) | Lectura de archivos .pmtiles por rangos HTTP | BSD 3-Clause |
| satellite.js 6.0.2 | Propagación orbital SGP4 en el navegador | MIT |
| OpenFreeMap (estilos *positron* y *dark*) | Mapa base vectorial, sin llave | Servicio gratuito "tal cual"; mosaicos © OpenMapTiles (CC BY 4.0 diseño), datos © OpenStreetMap (ODbL) |
| Natural Earth vía world-atlas 2.0.2 | Países (respaldo y relación con eventos) | Dominio público |
| i18n-iso-countries 7.14.0 | Nombres de países ES/EN, códigos ISO | MIT |

Por qué no CARTO: desde 2026 exige llave de API; sin ella los mosaicos salen con la marca "API KEY REQUIRED" ([CARTO](https://www.carto.com/basemaps/apikey/)).

## Capas de entidades

| Fuente | Capa | Costo | Registro / llave | Límites | Licencia | ¿Uso comercial? | Cobertura | Frecuencia en el proyecto | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Natural Earth (GitHub nvkelso) | Zonas: océanos, mares, golfos, estrechos, lagos, ríos, desiertos, cordilleras, penínsulas | Gratis | No | — | Dominio público (verificada) | Sí | Mundial, escala 1:10m/1:50m | Mensual | **Activa** |
| OurAirports | Aeropuertos y helipuertos | Gratis | No | — | Dominio público (verificada) | Sí | Mundial, ~71,000 sitios | Mensual | **Activa** |
| World Port Index (NGA Pub. 150) | Puertos | Gratis | No | — | Dominio público, gobierno de EUA (verificada) | Sí | Mundial, ~3,800 puertos | Mensual | **Activa** |
| Global Power Plant Database (WRI) v1.3.0 | Centrales por combustible | Gratis | No | — | CC BY 4.0 (verificada) | Sí, con atribución | Mundial, ~35,000 centrales; **última versión 2021** | Mensual (no cambia) | **Activa** |
| OpenStreetMap vía Overpass API | Centros de datos, embajadas, recursos estratégicos, instalaciones militares públicas | Gratis | No | Uso razonable; consultas pesadas devuelven error 500/504 y 429 por límite; se divide el mundo en 8 cajas (una caja que falla se parte en 4, hasta 2 veces), se esperan 15 s entre cajas y se usan 3 instancias públicas (overpass-api.de, private.coffee, kumi.systems) con un plazo de 70 min por corrida | ODbL 1.0 (verificada) | Sí, con atribución y "compartir igual" para bases derivadas | Variable: depende de lo que la comunidad haya mapeado | Mensual | **Activa** (cobertura parcial) |
| Wikidata (SPARQL) | Jefes de Estado y de gobierno, organismos internacionales, bolsas, empresas y sus líderes | Gratis | No | 60 s por consulta | CC0 (verificada) | Sí | Mundial | Semanal | **Activa** |
| GLEIF (LEI) | Identificador legal de empresas | Gratis | No | — | CC0 (verificada) | Sí | Mundial | — | Preparada en el esquema; sin conector aún |
| Epoch AI | Centros de datos de IA de frontera | Gratis | No | — | CC BY 4.0 (por verificar) | Sí, con atribución | Selección de grandes clústeres | — | Pendiente: falta URL estable de descarga |
| GRanD / GOODD (Global Dam Watch) | Presas por uso | Gratis | Registro para descargar | — | CC BY 4.0 (por verificar) | Por verificar | Mundial, ~7,000 grandes presas | — | **Deshabilitada** |
| TeleGeography Submarine Cable Map | Cables submarinos y aterrizajes | Gratis | No | — | CC BY-NC-SA 3.0 | **No** | Mundial | — | **Deshabilitada: requiere tu aprobación** (no comercial) |
| Global Energy Monitor | Ductos de petróleo y gas | Gratis | Formulario por descarga | — | CC BY 4.0 (por verificar) | Sí, con atribución | Mundial | — | **Deshabilitada**: no se puede automatizar |
| OIEA PRIS | Reactores nucleares | Gratis | No | — | Términos del OIEA (por verificar) | Por verificar | Mundial | — | No integrada (se usan las centrales nucleares de GPPD) |
| USGS MRDS | Minas | Gratis | No | — | Dominio público | Sí | Histórica; USGS dejó de actualizarla | — | No integrada (se usa OSM) |

## Capas en movimiento

| Fuente | Capa | Costo | Registro / llave | Límites | Licencia | ¿Uso comercial? | Frecuencia | Estado |
|---|---|---|---|---|---|---|---|---|
| OpenSky Network (`/api/states/all`) | Aeronaves (mundial) | Gratis | No (anónimo) | ~400 créditos/día anónimo (por verificar); puede bloquear IPs de nube | Términos de OpenSky: uso no comercial y de investigación | **No** | Cada 20 min | Activa; si falla, solo quedan militares de adsb.lol |
| adsb.lol (`/v2/mil`) | Aeronaves militares | Gratis | No | Por verificar | ODbL (por verificar) | Por verificar | Cada 20 min | Activa |
| adsb.lol (`/api/0/routeset`) | Origen y destino de vuelos de aerolínea y carga (ruta habitual del indicativo) | Gratis | No | Lotes de 100, máximo 2,000 consultas nuevas por corrida, caché de 12 h | Base comunitaria de rutas (por verificar) | Por verificar | Cada 20 min (solo indicativos nuevos) | Activa; nunca para aviación general |
| adsbdb.com (`/v0/callsign`) | Respaldo de rutas si adsb.lol no responde | Gratis | No | Máximo 150 consultas por corrida, 0.3 s entre cada una | Términos de adsbdb (por verificar) | Por verificar | Solo si falla adsb.lol | Respaldo |
| OpenSky (`/api/tracks/all`), desde el navegador | Trayectoria detallada del vuelo en curso al abrir su ficha | Gratis | No (puede negarse sin cuenta) | Una petición por ficha abierta | Términos de OpenSky (no comercial) | **No** | Al abrir la ficha | Opcional: si no responde se usan las posiciones de las instantáneas |
| AISStream.io | Buques (AIS) | Gratis | **Sí: clave gratuita** en el secreto `AISSTREAM_API_KEY` | Por verificar | Términos de AISStream | Por verificar | Ventana de 75 s cada 20 min | Inactiva hasta que agregues la clave |
| CelesTrak (grupos GP en TLE) | Satélites | Gratis | No | No descargar el mismo grupo más de una vez cada 2 h (se descarga cada 6 h) | Uso libre con atribución (por verificar) | Por verificar | Cada 6 h; posición calculada en el navegador | Activa |
| OFAC SDN (`sdn.csv`) | Aeronaves y buques sancionados (matrícula, IMO) | Gratis | No | — | Dominio público, gobierno de EUA | Sí | Diaria | Activa |
| OpenSanctions | Sanciones consolidadas | Gratis no comercial | No | — | CC BY-NC 4.0 | **No** sin licencia | — | No integrada |
| NASA GIBS | Luces nocturnas VIIRS, color verdadero MODIS | Gratis | No | — | Datos abiertos de NASA (por verificar) | Sí | Diaria (imagen de ayer) | Activa, bajo demanda |

## Eventos (Fase 2: ingesta horaria, `ingest/run.py`)

Qué se guarda de cada nota: título, fuente, fecha y enlace. El resumen (~30 palabras) lo redacta el sistema con reglas a partir de hechos extraídos (países, organismos, cifras, tipo de hecho); no copia oraciones del medio (ver docs/INDICADORES.md). El texto del artículo, la descripción del feed y las palabras del enlace solo se usan en memoria para clasificar (`tests/test_ingesta.py` lo comprueba). La configuración está en `config/fuentes.json`. El estado real de cada fuente en cada corrida queda en `run-log.json` y en el resumen del workflow **Ingesta de eventos**.

| Fuente | Qué aporta | Costo | Registro / llave | Licencia / términos | Frecuencia | Estado |
|---|---|---|---|---|---|---|
| GDELT 2.0 Events (`lastupdate.txt` + 4 archivos `export.CSV.zip` de 15 min) | Eventos codificados (CAMEO 10–20: exigencias, amenazas, protestas, coerción, combate) con coordenada y número de artículos | Gratis | No | Uso libre con cita a GDELT Project | Cada hora | Activa |
| BBC World (RSS) | Titulares internacionales (inglés) | Gratis | No | Términos de BBC: titular y enlace | Cada hora | Activa |
| DW Español (RDF) | Titulares (español) | Gratis | No | Términos de DW | Cada hora | Activa |
| France 24 Español (RSS) | Titulares (español) | Gratis | No | Términos de France 24 | Cada hora | Activa |
| El País Internacional (RSS) | Titulares (español) | Gratis | No | Términos de PRISA | Cada hora | Activa |
| Al Jazeera (RSS) | Titulares (inglés) | Gratis | No | Términos de Al Jazeera | Cada hora | Activa |
| International Crisis Group (RSS) | Análisis | Gratis | No | Términos de Crisis Group | Cada hora | Activa |
| CIDOB (RSS) | Análisis (español) | Gratis | No | Términos de CIDOB | — | Deshabilitada: la URL devolvió un feed vacío; falta la URL oficial |
| Real Instituto Elcano (RSS) | Análisis (español) | Gratis | No | Términos de Elcano | — | Deshabilitada: responde 403 al bot y no se evade el bloqueo |
| ReliefWeb API v2 (`/reports`) | Crisis humanitarias y desastres con país ISO3 | Gratis | **Sí: `appname` preaprobado** en el secreto `RELIEFWEB_APPNAME` | Términos de ReliefWeb (OCHA) | Cada hora | Inactiva hasta que agregues el secreto |

Una corrida hace 1 petición por feed y 5 a GDELT por hora, muy por debajo de cualquier límite publicado. Si una fuente falla, la corrida sigue con las demás y el error queda registrado.

## Exclusiones (no se integran)

| Excluido | Motivo |
|---|---|
| Domicilios, ubicaciones en tiempo real, familiares, datos de contacto y vida personal de cualquier persona, incluidas las figuras públicas | Riesgo de acoso o daño físico. Las personas solo aparecen con su rol público y nunca en el mapa (`tests/test_privacidad.py`). |
| Vincular aviones privados o carteras de criptomonedas a personas con nombre | Mismo motivo. Se excluyen además las aeronaves cuyos dueños pidieron privacidad (banderas PIA/LADD). |
| Rastreo de carteras de criptomonedas de personas | Solo se muestran direcciones que OFAC publica dentro de la ficha de entidades sancionadas. |
| Cámaras privadas, expuestas por error de configuración o halladas por escaneo | Solo se aceptan cámaras que un organismo público publica para verse en abierto; ninguna está aprobada todavía. |
| Escaneo de puertos o reconocimiento de redes de terceros | Ilegal o contrario a términos de uso en la mayoría de jurisdicciones. |
| Detalles operativos de instalaciones militares | Solo nombre, tipo, país, operador y enlace a la fuente pública. |
| Scraping que viole términos de servicio (X/Twitter, TikTok y similares) | X cobra ~0.005 USD por post leído (fuentes secundarias); 100 posts/hora ≈ 360 USD/mes. |

## Cámaras públicas: candidatas por aprobar

No hay ninguna integrada. Para proponer una fuente se necesita: organismo que la publica, página donde la ofrece al público, términos de uso que permitan mostrarla o enlazarla, y forma de saber si está en vivo. Las candidatas se verificarán una por una (por ejemplo, las cámaras de tráfico que Caltrans publica en su portal de datos abiertos).
