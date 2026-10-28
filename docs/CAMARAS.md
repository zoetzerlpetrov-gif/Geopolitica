# Cámaras públicas del mundo

La ampliación solo afecta a cámaras. Se consultan catálogos oficiales; nunca se escanean dispositivos ni se incorporan cámaras privadas expuestas. Los archivos de otras capas y sus metadatos se verifican por hash antes de cada publicación del workflow de cámaras.

## Funcionamiento

- `config/camaras_fuentes.json`: registro de fuentes, direcciones de API, permisos y dominios de medios admitidos.
- `tools/capas/camaras_mundo.py`: importadores independientes, validación de coordenadas, eliminación de duplicados y caché por proveedor.
- `capas/camaras_estado.json`: conteos reales por proveedor, errores sin secretos, países y fechas. Disponible como artefacto **estado-camaras** en cada ejecución de GitHub Actions.
- Si una fuente falla, se conserva su catálogo anterior y la ficha lo advierte. Que el catálogo responda no verifica que cada cámara esté operativa ni que su imagen sea reciente.
- Las imágenes y videos se solicitan directamente al operador al abrir una ficha. Los MP4 de TfL son clips, no video continuo. HLS se carga al pulsar el botón; si el operador no permite CORS o la cámara falla, queda el enlace original.
- Actualización de metadatos diaria a las 08:17 UTC, manual o al modificar los archivos de cámaras. El workflow solo ejecuta `construir.py camaras`. La publicación conserva las demás capas byte por byte.

## Nuevos catálogos sin registro

Las cantidades cambian; los conteos vigentes se obtienen del artefacto de ejecución, después de eliminar duplicados entre proveedores. Un punto puede agrupar varias vistas; un enlace a un portal no equivale a video incorporado.

| Fuente | País | Acceso y costo | Presentación | Condiciones |
|---|---|---|---|---|
| [Transport for London](https://api.tfl.gov.uk/Place/Type/JamCam) | GBR | Catálogo público, sin clave | Imagen original y clips MP4 | [TfL Open Data Licence (Contains OS data © Crown copyright and database rights)](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service) |
| [DriveBC · Gobierno de British Columbia](https://www.drivebc.ca/api/webcams/) | CAN | Catálogo público, sin clave | Imagen original | [Open Government Licence – British Columbia; respetar créditos de colaboradores](https://www2.gov.bc.ca/gov/content/data/open-data/open-government-licence-bc) |
| [City of Calgary](https://data.calgary.ca/resource/k7p9-kppz.json?$limit=5000) | CAN | Catálogo público, sin clave | Imagen original | [Open Calgary Terms of Use](https://data.calgary.ca/stories/s/Open-Calgary-Terms-of-Use/u45n-7awa/) |
| [City of Vancouver](https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/web-cam-url-links/exports/json) | CAN | Catálogo público, sin clave | Página oficial (sin extraer señal) | [Open Government Licence – Vancouver (metadatos)](https://opendata.vancouver.ca/pages/licence/) |
| [City of Toronto](https://opendata.toronto.ca/transportation/tmc/rescucameraimages/Data/tmcearthcameras.json) | CAN | Catálogo público, sin clave | Imagen original | [Open Government Licence – Toronto](https://open.toronto.ca/open-data-license/) |
| [Statens vegvesen](https://ogckart-sn1.atlas.vegvesen.no/ogc/features/v1/collections/datex_3_1:CctvSimple/items?f=application/geo%2Bjson&limit=5000) | NOR | Catálogo público, sin clave | Imagen original y HLS disponible | [NLOD 2.0](https://dataut.vegvesen.no/en/dataset/webkamera) |
| [Transport for NSW](https://data.livetraffic.com/cameras/traffic-cam.json) | AUS | Catálogo público, sin clave | Imagen original | [CC BY 4.0 · Transport for NSW](https://opendata.transport.nsw.gov.au/data/dataset/live-traffic-nsw) |
| [Department of Transport and Main Roads, Queensland](https://data.qldtraffic.qld.gov.au/webcameras.geojson) | AUS | Catálogo público, sin clave | Imagen original | [CC BY 4.0; pueden aplicarse derechos de terceros](https://qldtraffic.qld.gov.au/more/More-Help-And-Info/Help-info/copyright.html) |
| [Servei Català de Trànsit](https://www.gencat.cat/transit/opendata/cameres.xml) | ESP | Catálogo público, sin clave | Página oficial (sin extraer señal) | [Datos abiertos Generalitat; imágenes según operador](https://transit.gencat.cat/ca/serveis/dades-obertes/) |
| [Dirección de Tráfico · Gobierno Vasco](https://opendata.euskadi.eus/contenidos/ds_localizaciones/camaras_trafico/opendata/camaras-trafico.json) | ESP | Catálogo público, sin clave | Imagen original | [CC BY 4.0 · Open Data Euskadi](https://opendata.euskadi.eus/inicio/) |
| [GeoNet · GNS Science](https://images.geonet.org.nz/volcano/cameras/all.json) | NZL | Catálogo público, sin clave | Imagen original | [CC BY 3.0 NZ · GeoNet](https://www.geonet.org.nz/policy) |
| [King County Road Services](https://services.arcgis.com/Ej0PsM5Aw677QF1W/arcgis/rest/services/TRAFFICCAMERA_POINT_2029/FeatureServer/0/query?where=1%3D1&outFields=AssetID,Location,ImageURL,Live,Owner,CurrentStatus&f=geojson) | USA | Catálogo público, sin clave | Página oficial (sin extraer señal) | [Condiciones de datos de King County](https://gis-kingcounty.opendata.arcgis.com/) |
| [WSDOT](https://data.wsdot.wa.gov/travelcenter/Cameras.json) | USA | Catálogo público, sin clave | Imagen original | [WSDOT · cámaras públicas de tráfico](https://wsdot.wa.gov/traffic/api/) |
| [Autostrade per l’Italia](https://viabilita.autostrade.it/json/webcams.json) | ITA | Catálogo público, sin clave | Página oficial (sin extraer señal) | [Catálogo público; imágenes reservadas al operador](https://www.autostrade.it/en/condizioni-utilizzo) |
| [Delaware Department of Transportation](https://tmc.deldot.gov/json/videocamera.json) | USA | Catálogo público, sin clave | Página oficial (sin extraer señal) | [Catálogo público; incorporación de señal no autorizada aquí](https://deldot.gov/Information/legal/index.shtml) |
| [CITA · Administration des ponts et chaussées](https://www.cita.lu/kml/cameras.kml) | LUX | Catálogo público, sin clave | Página oficial (sin extraer señal) | [CC0 para ubicaciones; imágenes con condiciones propias](https://data.public.lu/en/datasets/cameras-sur-le-reseau-autoroutier/) |
| [Transpordiamet · Tarktee](https://tarktee.transpordiamet.ee/api/v1/datex/roadCameraLocations) | EST | Catálogo público, sin clave | Página oficial (sin extraer señal) | [Datos públicos de Transpordiamet; imágenes en portal oficial](https://tarktee.ee/) |

## Fuentes conservadas y ampliadas

| Fuente | Cobertura | Requisito | Presentación |
|---|---|---|---|
| Fintraffic / Digitraffic | Finlandia | Gratis, sin clave; CC BY 4.0 | Imágenes originales, hasta 4 vistas por estación |
| Caltrans | Los 12 distritos de California | Gratis, sin clave; condiciones de Caltrans | Imágenes originales |
| LTA / data.gov.sg | Singapur | Gratis sin clave, con límite de consultas | Imagen vigente solicitada al abrir la ficha |
| Transport Department / DATA.GOV.HK | Hong Kong | Gratis sin clave; condiciones DATA.GOV.HK | Imágenes originales |
| NZTA | Nueva Zelanda | Gratis sin clave | Imágenes originales |
| Vegagerðin | Islandia | Gratis sin clave | Imágenes originales, vistas agrupadas |
| Webcams de México | México | API WordPress pública sin clave | Reproductor oficial de YouTube cuando el operador lo publica |
| YouTube Data API v3 | Mundo | `YOUTUBE_API_KEY` | Reproductor oficial de transmisiones públicas con incorporación habilitada |
| Windy Webcams v3 | Mundo | `WINDY_WEBCAMS_KEY` | Atribución y enlace oficial; no guardar imágenes temporales del plan gratuito |
| WSDOT | Washington, EE. UU. | API con `WSDOT_ACCESS_CODE` o catálogo público alternativo sin clave | Imágenes originales; duplicados eliminados |
| Lista curada | América, África, Asia, Europa y Antártida | Sin clave | Portales de USGS, INGV, SANParks, BAS, NIPR, IGP, IG-EPN, OVSICORI, INSIVUMEH y JMA; ubicaciones aproximadas claramente indicadas |

YouTube amplía las búsquedas de 16 a 40: incluye Japón, Corea, Taiwán, India, Nepal, Tailandia, Indonesia, Vietnam, Malasia, Filipinas, Dubái, Estambul, Jerusalén, La Meca, Sudáfrica, Namibia, Kenia, Seychelles, Brasil, Argentina, Chile, Ecuador, Australia y Antártida. Hasta 4.000 unidades por ejecución más las consultas de detalles, dentro de la cuota habitual de 10.000 unidades/día; las ejecuciones adicionales comparten esa cuota. Solo se aceptan transmisiones con ubicación publicada por el canal o una ciudad reconocible en el título; estas últimas se marcan aproximadas.

Windy conserva el límite existente de hasta 1.000 resultados por ejecución. No se afirma importar todo su catálogo ni se guardan URLs temporales. La cuota efectiva depende del plan asociado a la clave.

## Registro gratuito: conectores listos

Guardar las claves en **Settings → Secrets and variables → Actions → New repository secret**. Nunca pegar claves en issues, documentos ni el código. Ya están conectadas a ambos workflows (`camaras.yml` y `capas.yml`); tras guardar una, ejecutar **Actualizar cámaras del mundo → Run workflow** o esperar la próxima ejecución diaria. Sin la clave, el proveedor se omite y el resto continúa.

| Proveedor | Registro | Secreto de GitHub | Estado del conector |
|---|---|---|---|
| Ontario 511 | [Developers](https://511on.ca/developers/doc) | `CAM_511_ON` | Listo, requiere clave propia |
| Alberta 511 | [Developers](https://511.alberta.ca/developers/doc) | `CAM_511_AB` | Listo, requiere clave propia |
| Nueva York 511 | [Developers](https://511ny.org/developers/doc) | `CAM_511_NY` | Listo, requiere clave propia |
| Arizona 511 | [Developers](https://www.az511.gov/developers/doc) | `CAM_511_AZ` | Listo, requiere clave propia |
| Nevada / NVRoads | [Developers](https://www.nvroads.com/developers/doc) | `CAM_511_NV` | Listo, requiere clave propia |
| Georgia 511 | [Developers](https://511ga.org/developers/doc) | `CAM_511_GA` | Listo, requiere clave propia |
| WSDOT | [Traffic API](https://wsdot.wa.gov/traffic/api/) | `WSDOT_ACCESS_CODE` | Existente; ahora hay alternativa pública sin registro |
| Windy Webcams | [API keys](https://api.windy.com/keys) | `WINDY_WEBCAMS_KEY` | Existente; condiciones y límites del plan gratuito |
| Google / YouTube | [Proyecto y API key](https://developers.google.com/youtube/v3/getting-started) | `YOUTUBE_API_KEY` | Existente, búsquedas regionales ampliadas |

La documentación anterior del proyecto indica que las claves WSDOT y Windy ya estaban agregadas. No se leen ni se exponen sus valores. Los logs del workflow indican si cada fuente respondió con la configuración disponible.

## Acuerdo previo para NYC DOT

[NYC DOT Data Feeds](https://www.nyc.gov/html/dot/html/about/datafeeds.shtml) requiere acuerdo de datos para desarrolladores. Su acceso técnico sin clave no equivale a autorización de reutilización. Tras completar el acuerdo, crear el secreto **`CAM_NYC_ACUERDO` con valor `true`**. El conector está listo; mientras tanto no se incorporan sus imágenes ni se conserva una copia pública de su caché. Esto se distingue de 511NY, que es otro proveedor y usa su propia API key.

## Registros, permisos o contratación pendientes

Estas fuentes están documentadas como pendientes, **no se cuentan como integradas**. Los conectores que requieren credenciales y no se han validado están indicados expresamente.

| Fuente | Acceso / acción necesaria |
|---|---|
| [WorldCam.io](https://worldcam.io/) | API empresarial; sin API gratuita verificada. No extraer su inventario por scraping. |
| [ASFINAG · Austria](https://contentportal.asfinag.at/) | Portal de contenidos: solicitar credenciales propias y habilitación del producto webcams. |
| [Trafikverket · Suecia](https://api.trafikinfo.trafikverket.se/) | API gratuita con clave propia; conector pendiente de validar con credenciales. |
| [TDX · Taiwán](https://tdx.transportdata.tw/) | Client ID y Client Secret; cuota y condiciones según plan. Conector OAuth pendiente. |
| [OHGO · Ohio](https://publicapi.ohgo.com/) | Solicitar API key; conector pendiente de validar con credenciales. |
| [National Highways · Inglaterra](https://nationalhighways.co.uk/roads-and-travel/live-travel-updates/traffic-cameracctv-services/) | Licencia de reutilización de CCTV según uso; condiciones y posible costo por confirmar. |
| [Traffic Scotland](https://www.traffic.gov.scot/copyright) | Solicitar permiso/servicio de imágenes; se prohíbe enlazar directamente imágenes sin autorización. |
| [Florida 511](https://fl511.com/privacy) | Solicitar consentimiento de FDOT para redistribución/uso fuera del ámbito personal. |
| [Houston TranStar](https://traffic.houstontranstar.org/disclaimer.aspx) | Se requiere consentimiento para imágenes, enlaces directos o iframe. |
| [SkylineWebcams](https://www.skylinewebcams.com/en/faq.html) | No extraer señales. Solicitar autorización del programa de incorporación. |
| [EarthCam](https://www.earthcam.com/) | Solicitar licencia o incorporación autorizada; no existe API abierta gratuita verificada. |
| [OpenCCTV](https://opencctv.org/) | Verificar autorización del catálogo y de cada operador antes de importarlo. |
| [Freeway Bureau · Taiwán (archivo XML)](https://tisvcloud.freeway.gov.tw/history/motc20/CCTV.xml) | El archivo público no respondió desde el entorno de prueba; usar TDX con credenciales. |


Osiris y God's Eye son aplicaciones agregadoras, no una licencia alternativa sobre las cámaras de terceros. Esta ampliación conecta directamente fuentes oficiales coincidentes (p. ej., TfL, DriveBC, Noruega y NSW) y fuentes adicionales, evitando importar código con credenciales ajenas o asumir que una licencia de software cubre las imágenes.

## Comprobación

```sh
python3 -m pytest tests/test_camaras_mundo.py tests/test_camaras_abiertas.py
node --test tests/js/camaras_mundo.test.mjs tests/js/capas.test.mjs
python3 tools/capas/construir.py camaras
```

Las pruebas incluyen JSONP sin evaluación de código, orden excepcional de coordenadas GeoNet, validación de medios, catálogos truncados, duplicados, fallos sin filtración de claves y la protección de otras capas. El workflow adjunta los resultados de la descarga real, separados del resultado de las pruebas unitarias.
