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
| GRanD / GOODD (Global Dam Watch) | Presas por uso | Gratis | Registro para descargar | — | CC BY 4.0 (por verificar) | Por verificar | Mundial, ~7,000 grandes presas | — | No usada (requiere registro); la reemplaza OSM |
| OpenStreetMap: presas (`waterway=dam` con `wikidata`) | Presas relevantes; hidroeléctrica, riego u otros según etiquetas | Gratis | No | Overpass: cortesía de 15 s entre cajas | ODbL 1.0 | Sí, con atribución | Mundial | Mensual | Activa |
| TeleGeography Submarine Cable Map (`api/v3/cable/cable-geo.json` y `landing-point/landing-point-geo.json`) | Cables submarinos (líneas) y puntos de aterrizaje | Gratis | No | — | CC BY-NC-SA 3.0, con atribución | **No** | Mundial | Mensual | Activa (aprobada el 2026-10-08). Rutas esquemáticas, no el trazado exacto. Si el proyecto se vuelve comercial hay que retirarla o licenciarla |
| Global Energy Monitor | Ductos de petróleo y gas | Gratis | Formulario por descarga | — | CC BY 4.0 (por verificar) | Sí, con atribución | Mundial | — | No usada (formulario); si se descarga a mano y se sube al repositorio, se puede usar en lugar de OSM |
| OpenStreetMap: ductos (`man_made=pipeline`, `substance` de petróleo o gas, con nombre) | Oleoductos y gasoductos troncales (líneas) | Gratis | No | Overpass | ODbL 1.0 | Sí, con atribución | Mundial; la cobertura depende de cada país | Mensual | Activa. Los ductos sin nombre (locales) se omiten |
| OIEA PRIS | Reactores nucleares | Gratis | No | — | Términos del OIEA (por verificar) | Por verificar | Mundial | — | No integrada (se usan las centrales nucleares de GPPD) |
| USGS MRDS | Minas | Gratis | No | — | Dominio público | Sí | Histórica; USGS dejó de actualizarla | — | No integrada (se usa OSM) |

## Capas en movimiento

| Fuente | Capa | Costo | Registro / llave | Límites | Licencia | ¿Uso comercial? | Frecuencia | Estado |
|---|---|---|---|---|---|---|---|---|
| OpenSky Network (`/api/states/all`) | Aeronaves (mundial) | Gratis | No (anónimo) | ~400 créditos/día anónimo (por verificar); puede bloquear IPs de nube | Términos de OpenSky: uso no comercial y de investigación | **No** | Cada 20 min | Activa; si falla, solo quedan militares de adsb.lol |
| adsb.lol (`/v2/mil`) | Aeronaves militares | Gratis | No | Por verificar | ODbL (por verificar) | Por verificar | Cada 20 min | Activa |
| adsb.lol (`/api/0/routeset`) | Origen y destino de vuelos de aerolínea y carga (ruta habitual del indicativo) | Gratis | No | Lotes de 100, máximo 2,000 consultas nuevas por corrida, caché de 12 h | Base comunitaria de rutas (por verificar) | Por verificar | Cada 20 min (solo indicativos nuevos) | Activa; nunca para aviación general |
| adsbdb.com (`/v0/callsign`) | Respaldo de rutas si adsb.lol no responde | Gratis | No | Máximo 300 consultas por corrida, 0.3 s entre cada una | Términos de adsbdb (por verificar) | Por verificar | Cada 20 min, solo si falla adsb.lol | Activa (en oct 2026 adsb.lol responde vacío) |
| OpenSky (`/api/tracks/all`), desde el navegador | Trayectoria detallada del vuelo en curso al abrir su ficha | Gratis | No (puede negarse sin cuenta) | Una petición por ficha abierta | Términos de OpenSky (no comercial) | **No** | Al abrir la ficha | Opcional: si no responde se usan las posiciones de las instantáneas |
| AISStream.io | Buques (AIS): posición, rumbo, velocidad, estado de navegación; datos estáticos (indicativo, IMO, tipo, eslora, manga, calado, destino y ETA declarados) | Gratis | **Sí: clave gratuita** en el secreto `AISSTREAM_API_KEY` | Por verificar | Términos de AISStream | Por verificar | Ventana de 3 min cada 20 min; buques no oídos se conservan 2 h con su última posición; datos estáticos en caché 72 h; rastro de 6 h (nunca para recreo) | Activa. Solo antenas terrestres de voluntarios: mucha cobertura en Europa y EUA, poca en México y Centroamérica. El AIS no transmite puerto de origen; la bandera se deduce del MID del MMSI (tabla de la UIT) |
| CelesTrak (grupos GP en TLE: stations, gnss, geo, weather, military, visual, resource, science, oneweb, iridium-NEXT, planet; Starlink en archivo aparte, apagado al inicio) | Satélites: posición, traza en tierra (media vuelta atrás y una adelante), zona de cobertura, tipo de órbita, perigeo/apogeo, inclinación, lanzamiento | Gratis | No | No descargar el mismo grupo más de una vez cada 2 h (se descarga cada 6 h) | Uso libre con atribución (por verificar) | Por verificar | Cada 6 h; posición calculada en el navegador con SGP4 (error típico de 1 a 3 km en órbita baja con TLE de menos de un día) | Activa. Los puntos alineados sobre el Ecuador son geoestacionarios: es su posición real |
| OFAC SDN (`sdn.csv`) | Aeronaves y buques sancionados (matrícula, IMO) | Gratis | No | — | Dominio público, gobierno de EUA | Sí | Diaria | Activa |
| OpenSanctions | Sanciones consolidadas | Gratis no comercial | No | — | CC BY-NC 4.0 | **No** sin licencia | — | No integrada |
| NASA GIBS (WMTS en EPSG:3857) | Luces nocturnas VIIRS; color verdadero VIIRS NOAA-20 (sin huecos), MODIS Terra y MODIS Aqua (con cuñas negras entre órbitas cerca del Ecuador: es lo que el satélite no vio) | Gratis | No | — | Datos abiertos de NASA (por verificar) | Sí | Diaria (ayer por defecto; se puede elegir hasta 7 días atrás) | Activa, bajo demanda |

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
| CIDOB (RSS de la web) | Análisis (español) | Gratis | No | Términos de CIDOB | — | Deshabilitada: la URL devolvió un feed vacío. Sustituida por Bluesky y YouTube |
| CIDOB (RSS de su perfil de Bluesky) | Publicaciones institucionales; el título es la primera frase de la publicación (los posts no tienen título) | Gratis | No | Términos de Bluesky | Cada hora (máx. 20) | Activa |
| CIDOB (feed Atom de su canal de YouTube) | Videos de análisis | Gratis | No | Términos de YouTube | — | Deshabilitada: el robots.txt de youtube.com no permite a bots leer los feeds |
| Real Instituto Elcano (RSS de la web) | Análisis (español) | Gratis | No | Términos de Elcano | — | Deshabilitada: responde 403 al bot y no se evade el bloqueo |
| Real Instituto Elcano (feed Atom de su canal de YouTube) | Videos de análisis | Gratis | No | Términos de YouTube | — | Deshabilitada: el robots.txt de youtube.com no permite a bots leer los feeds |
| Mastodon `#geopolitics` (RSS público de la etiqueta en mastodon.social) | Publicaciones de personas usuarias que mencionan un país | Gratis | No | Términos de mastodon.social | Cada hora (máx. 20) | Activa en modo «solo enlace»: se guarda el enlace público y un título generado («Publicación pública en Mastodon con #geopolitics sobre Taiwán»); el texto y el autor se usan solo en memoria para ubicar el país, no se publican ni se envían a la IA. Sin país, se descarta |
| Groq (API compatible con OpenAI) | Resumen redactado con IA (~35 palabras, español) de hasta 40 notas por corrida, FLASH y PRIORIDAD primero | Gratis (plan gratuito con límites por minuto y por día) | **Sí: secreto `GROQ_API_KEY`** | 429 al pasar el límite: la ronda se detiene y sigue en la próxima corrida | Términos de Groq | Revisar sus términos | Cada hora | Activa si existe el secreto |
| ReliefWeb API v2 (`/reports`) | Crisis humanitarias y desastres con país ISO3 | Gratis | **Sí: `appname` preaprobado** en el secreto `RELIEFWEB_APPNAME` | Términos de ReliefWeb (OCHA) | Cada hora | Inactiva hasta que agregues el secreto |
| OMS · Disease Outbreak News (API pública) | Brotes de enfermedades notificados por la OMS (ébola, cólera, gripe aviar…) | Gratis | No | Contenido de la OMS; solo título, enlace y fecha | Cada hora | Activa; sustituto parcial de ReliefWeb |
| Cruz Roja · IFRC GO (API pública) | Emergencias y desastres atendidos por la Cruz Roja, con país, tipo y nivel (amarillo, naranja, rojo) | Gratis | No | Términos de IFRC GO; no se guardan los contactos que publica | Cada hora | Activa; sustituto parcial de ReliefWeb |
| Noticias ONU (RSS en español) | Noticias de la ONU, incluidas crisis humanitarias | Gratis | No | Términos de la ONU; solo título, enlace y fecha | Cada hora | Activa |
| ReliefWeb RSS | Mismo contenido que el API | — | — | — | — | No usado: responde con una verificación anti-bots (HTTP 202 vacío) |

Una corrida hace 1 petición por feed y 5 a GDELT por hora, muy por debajo de cualquier límite publicado. Antes de leer un feed se consulta el `robots.txt` del sitio (una vez por sitio y corrida); si no lo permite, la fuente queda en error con ese motivo. Si una fuente falla, la corrida sigue con las demás y el error queda registrado.

X/Twitter, Facebook, Instagram y LinkedIn de CIDOB y Elcano no se usan: no ofrecen un feed público y leerlos con scraping viola sus términos.

## Clima y riesgos naturales

| Fuente | Qué aporta | Costo | Registro / llave | Licencia / términos | Frecuencia | Estado |
|---|---|---|---|---|---|---|
| NOAA GFS 1° vía filtro GRIB de NOMADS (`filter_gfs_1p00.pl`) | Viento a 10 m (animado con partículas), temperatura a 2 m y lluvia (mm/h); horizontes ≈ ahora, +12, +24, +48 y +72 h | Gratis | No | Dominio público (gobierno de EUA) | Cada 6 h (4 variables, 5 archivos pequeños por corrida; pausa de 2 s entre descargas) | Activa (`tools/clima/gfs.py` en el workflow «Datos en movimiento») |
| Clima Táctico (repositorio WarRoomViajero), leído desde su GitHub Pages | Ciclones (cono, trayectoria y radios de viento), incendios, GDACS, pronóstico 7 días por ciudad, calidad del aire, volcanes, señales de seguridad y de granizo/tornado en noticias, deslaves y clima espacial | Gratis | No | Las de cada fuente original (NOAA NHC, NASA FIRMS, GDACS, Open-Meteo, CENAPRED/Smithsonian, Google News/GDELT, NOAA SWPC) | 2 veces al día (6:00 y 18:00 de CDMX) | Activa. No se copian datos: se leen al activar cada capa. Las capas de noticias son señales por verificar |
| GDACS (eventos TC y servicio de polígonos) + IBTrACS ACTIVE (NOAA NCEI) | Tifones, ciclones y tormentas tropicales de todas las cuencas (Pacífico occidental, Índico, Pacífico sur…), con trayectoria y zonas de viento | Gratis | No | GDACS: términos de la ONU/CE; IBTrACS: dominio público | GDACS: 1 vez al día entre 04:00 y 06:45 UTC, una petición por corrida (su robots.txt pide «Request-rate: 1/60» y «Visit-time: 0400-0645»); IBTrACS: cada 3 h | Activa (`tools/clima/ciclones.py`); complementa al NHC de Clima Táctico |
| NOAA National Weather Service (`api.weather.gov/alerts/active`) | Alertas meteorológicas oficiales de EUA (polígonos) | Gratis | No | Dominio público | En vivo, cada 5 min | Activa. Corregido: el parámetro anticaché rompía la consulta |
| USGS (feed `2.5_day.geojson`) | Sismos M2.5+ de las últimas 24 h | Gratis | No | Dominio público | En vivo desde el navegador, cada 5 min | Activa |

## Seguridad, conflictos y religión

| Fuente | Qué aporta | Costo | Registro / llave | Licencia / términos | Frecuencia | Estado |
|---|---|---|---|---|---|---|
| GDELT 2.0: archivos de eventos (cada 15 min) y, cuando responde, la API DOC | Terrorismo, narcotráfico, mafias y crimen organizado (72 h). Eventos: acciones violentas (CAMEO 13–20) con un actor criminal (CRM), insurgente (INS), rebelde (REB), armado (UAF) o separatista (SEP), con coordenadas de GDELT; el título se reconstruye del enlace. API DOC: búsquedas en español con medios de México y mundiales en inglés y español | Gratis | No | Uso libre con cita a GDELT. La API DOC limita (429) las consultas desde GitHub; los archivos de eventos no | Cada hora (se acumulan 72 h) | Activa (`tools/crimen/crimen.py`). Se guarda título, enlace, medio, fecha, tipo, severidad estimada y lugar; nunca el texto. Son señales por verificar. Google News RSS no se usa: su robots.txt no permite leer `/rss/search` |
| GDELT 2.0 eventos: códigos CAMEO de ataque (183x bombas y atentados, 194 artillería, 195x ataques aéreos, 1951 misiles o munición guiada, 1952 drones, 204x armas de destrucción masiva) | Capa «Ataques: misiles, drones, bombas y artillería» (48 h), con ícono por tipo de arma; también ataques entre Estados | Gratis | No | Uso libre con cita a GDELT | Cada hora | Activa. El tipo de arma se precisa con las palabras del enlace (misil, dron, coche bomba…) |
| Medios mexicanos por RSS (`config/fuentes_mx.json`: Quadratín Guerrero, Aristegui, Infobae México y América, La Jornada; descartados y su motivo en `descartadas`: El Sur, El Universal y SinEmbargo por robots.txt, Animal Político, Milenio y Excélsior sin feed, Proceso rechaza la conexión) | Titulares de crimen, ataques (drones, explosivos) y deslaves, ubicados por ciudad o estado | Gratis | No | Términos de cada medio; se respeta robots.txt | Cada hora | Activa. Solo título, enlace, medio, fecha y lugar; las URL que no respondan quedan anotadas en `vivos/crimen.geojson` |
| UCDP GED + Candidate Events (Universidad de Uppsala) | Dominio o disputa de grupos armados no estatales (cárteles, insurgencias, yihadistas, milicias) en celdas de 1°, últimos 24 meses | Gratis | No | CC BY 4.0; citar Sundberg y Melander (2013) y Hegre et al. (2020) | Mensual | Activa. Mide violencia registrada (eventos con al menos una muerte), no control territorial |
| Pew Research Center 2020 vía Our World in Data | Religión mayoritaria y composición por país: cristianismo, islam, hinduismo, budismo, judaísmo, populares o tradicionales (chamanismo, animismo), otras (bahaí, sij, wicca…) y sin afiliación (ateos, agnósticos) | Gratis | No (el archivo original de Pew pide cuenta; OWID lo republica) | CC BY 4.0 (OWID) | Anual | Activa. Brujería y esoterismo no se miden por separado |
| Wikidata: forma de gobierno (P122) | Forma de gobierno por país: república presidencial, semipresidencial o parlamentaria, monarquía constitucional o absoluta, teocracia, partido único, junta militar | Gratis | No | CC0 | Mensual | Activa. Si hay varias formas registradas se colorea la de mayor prioridad |
| Wikidata: jefes de Estado y de gobierno, partido (P102), alineación (P1387) e ideología (P1142) | Orientación política del gobierno: extrema izquierda … extrema derecha, comunista de partido único, sin partido | Gratis | No | CC0 | Mensual | Activa. Es lo registrado en Wikidata (editable, fuentes variables), no una opinión del proyecto |
| Wikidata: lugares de culto con varias Wikipedias o Patrimonio Mundial (P1435 = Q9259) | Catedrales, basílicas, iglesias notables, mezquitas, sinagogas, templos hindúes y budistas, pagodas, santuarios sintoístas, gurdwaras, monasterios; importancia muy alta, alta o media | Gratis | No | CC0 | Mensual | Activa. Iglesias de barrio fuera (sin medida de importancia) |
| Wikidata: organizaciones criminales y terroristas (clases Q1788992, Q4335775, Q1260006, Q275186, Q1849110, Q17127659, Q17149090) con sede (P159/P740) y área de operaciones (P2541) | Presencia documentada de mafias, cárteles, pandillas y organizaciones terroristas vigentes, por país | Gratis | No | CC0 | Mensual | Activa. Complementa a UCDP, que solo ve violencia con muertos. Solo grupos, nunca personas; la presencia por país se dibuja en el centro aproximado del país |
| Natural Earth 1:10m populated places | Ciudades del mundo para la consola de zona (capitales, capitales estatales, ciudades principales) | Gratis | No | Dominio público | Al regenerar `config/ciudades.json` | Activa |
| Open-Meteo Geocoding (GeoNames) | Lugares que no están en la lista de ciudades (se consulta desde el navegador solo al buscar una zona) | Gratis | No | CC BY 4.0 (GeoNames); uso no comercial de Open-Meteo | Bajo demanda | Activa |
| Open-Meteo Air Quality (modelo CAMS de Copernicus) | Calidad del aire US AQI, PM2.5, PM10, ozono, NO₂, SO₂ y CO en ~490 ciudades (capitales nacionales, capitales y ciudades principales de México, ciudades de 1.5 M+) | Gratis | No | Uso no comercial de Open-Meteo; datos CAMS con atribución | Cada 3 h | **En pausa**: el robots.txt de air-quality-api.open-meteo.com dice `Disallow: /` (comprobado el 2026-10-09), así que `tools/clima/aire.py` no descarga nada. Hoy la capa usa los ~530 puntos que publica Clima Táctico |
| CENAPRED: reporte diario «Monitoreo del volcán Popocatépetl hoy» en gob.mx | Semáforo de Alerta Volcánica del Popocatépetl (Verde, Amarillo Fase 1–3, Rojo) | Gratis | No | Información pública del Gobierno de México; robots.txt de gob.mx no restringe | Cada 3 h | Activa (`tools/clima/volcanes.py`). Si el reporte no menciona el semáforo, no se muestra ningún nivel |
| USGS Volcano Hazards (HANS, API pública) | Nivel de alerta (NORMAL/ADVISORY/WATCH/WARNING) y código de aviación de volcanes de EUA con alerta elevada, con coordenadas | Gratis | No | Dominio público (EUA) | Cada 3 h | Activa |
| NOAA GFS 1° vía NOMADS: viento a 500, 300 y 200 hPa | Hacia dónde iría la ceniza de un volcán y qué distancia recorrería en 3 y 6 h a ~5.5, ~9 y ~12 km de altura | Gratis | No | Dominio público (EUA) | Cada 6 h (≈ ahora y +12 h) | Activa (`tools/clima/gfs.py`). Aproximación de trayectoria, no modelo de dispersión; la referencia oficial es el VAAC de Washington. No se usa la API de Open-Meteo: su robots.txt dice `Disallow: /` |
| DEA National Drug Threat Assessment (mapa de presencia de cárteles) | Presencia de cárteles por estado | Gratis | No | Dominio público (EUA) | Anual | No usada: el mapa es una imagen dentro de un PDF, sin datos descargables |

## Exclusiones (no se integran)

| Excluido | Motivo |
|---|---|
| Domicilios, ubicaciones en tiempo real, familiares, datos de contacto y vida personal de cualquier persona, incluidas las figuras públicas | Riesgo de acoso o daño físico. Las personas solo aparecen con su rol público y nunca en el mapa (`tests/test_privacidad.py`). |
| Vincular aviones privados o carteras de criptomonedas a personas con nombre | Mismo motivo. Se excluyen además las aeronaves cuyos dueños pidieron privacidad (banderas PIA/LADD). |
| Rastreo de carteras de criptomonedas de personas | Solo se muestran direcciones que OFAC publica dentro de la ficha de entidades sancionadas. |
| Cámaras privadas, expuestas por error de configuración o halladas por escaneo | Solo se aceptan cámaras que un organismo público, o un operador turístico en su propio sitio, publica para verse en abierto. Lista curada en `config/camaras.json`. |
| Escaneo de puertos o reconocimiento de redes de terceros | Ilegal o contrario a términos de uso en la mayoría de jurisdicciones. |
| Detalles operativos de instalaciones militares | Solo nombre, tipo, país, operador y enlace a la fuente pública. |
| Scraping que viole términos de servicio (X/Twitter, TikTok y similares) | X cobra ~0.005 USD por post leído (fuentes secundarias); 100 posts/hora ≈ 360 USD/mes. |

## Cámaras públicas

Lista curada en `config/camaras.json` más dos fuentes de datos abiertos de cámaras de carretera. Solo se incluyen cámaras que su operador publica para verse en abierto. La ficha muestra la imagen fija enlazada desde el servidor del operador (no se copia ni se guarda) y un botón a su sitio. El workflow **Construir capas** las actualiza cada mes, respeta `robots.txt` y deja el estado de cada fuente en el manifiesto.

| Cámaras | Operador | Tipo | Cómo se obtienen | Licencia |
|---|---|---|---|---|
| Volcán Kīlauea | USGS · Observatorio Vulcanológico de Hawái | Organismo público | Enlace curado: usgs.gov/volcanoes/kilauea/webcams | Dominio público (EUA) |
| Monte Santa Helena | USGS · Observatorio Vulcanológico de las Cascadas | Organismo público | Enlace curado | Dominio público (EUA) |
| Etna; Estrómboli y Vulcano | INGV · Osservatorio Etneo | Organismo público | Enlace curado: ct.ingv.it | Términos del INGV |
| Popocatépetl (reporte diario y monitoreo) | CENAPRED | Organismo público | Enlace curado: gob.mx/cenapred | Términos de gob.mx |
| Popocatépetl desde Altzomoni; Volcán de Colima | Webcams de México | Operador turístico | Enlace curado: webcamsdemexico.com | Términos del operador |
| Canal de Panamá (esclusas) | Autoridad del Canal de Panamá | Organismo público | Enlace curado: pancanal.com («Cámaras Web») | Términos de la ACP |
| ~470 cámaras de clima y tráfico en carreteras de Finlandia | Fintraffic (Digitraffic) | Organismo público | API abierta `tie.digitraffic.fi/api/weathercam/v1/stations`, sin clave | CC BY 4.0 («Fuente: Fintraffic / digitraffic.fi») |
| Cámaras de tráfico de carreteras estatales de California | Caltrans | Organismo público | Archivos `cwwp2.dot.ca.gov/data/dN/cctv/cctvStatusDNN.json` (12 distritos), sin clave | Datos públicos de Caltrans |

No se incluyen cámaras «abiertas» por error (sin contraseña o mal configuradas), aunque se puedan ver: no hay forma de saber si su dueño quiere publicarlas, suelen grabar casas y personas (imágenes que la Ley Federal de Protección de Datos Personales en Posesión de los Particulares trata como datos personales), y entrar a un equipo ajeno sin autorización puede encuadrar en leyes de acceso ilícito a sistemas según el país. Tampoco se usan directorios que las recopilan.

Candidatas para más adelante: Windy Webcams (decenas de miles de cámaras publicadas a propósito, requiere clave gratuita), cámaras de tráfico de Nueva York (NYC DOT), Ontario 511 y Statens vegvesen (Noruega, requiere registro). En México no se encontró un catálogo abierto de cámaras de tráfico de la SICT o CAPUFE.
