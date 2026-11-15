# Clima e impactos futuros (Admin)

Ruta: `Secciones → Admin → Clima e impactos futuros` (`clima-impactos.html`).
Usa la clasificación y el guard de páginas Admin existentes en `config/planes.json`; no cambia permisos de otras páginas. Como las demás páginas estáticas del repositorio público, el código y los datos meteorológicos publicados son públicos. No se guardan secretos ni expedientes privados en las instantáneas. La consola de Cloudflare conserva su autenticación existente.

## Componentes

- `config/clima-impactos.json`: 24 puntos territoriales, 21 fichas, 8 grupos de alimentos, 5 horizontes y 29 fuentes de datos/consulta.
- `js/clima-impactos-logica.js`: ventanas, antigüedad, cribado configurable, simulación, búsqueda, importación acotada y CSV.
- `js/clima-impactos.js`: interfaz, procedencia, fechas, tutorial, tareas locales y exportación.
- `tools/clima_impactos/actualizar.py`: biblioteca estándar de Python; consulta compartida y caché de MET Norway.
- `.github/workflows/clima-impactos.yml`: actualización diaria a las 12:53 UTC (06:53 CDMX); dispara también al cambiar colector/configuración. GitHub puede retrasar el cron.
- Rama `datos-clima-impactos`: instantánea y metadatos HTTP compartidos. Se reescribe sin historial creciente. Pages incorpora únicamente `panorama.json`.

## Datos

ENSO: NOAA CPC, estado del boletín y probabilidades oficiales RONI por trimestres solapados. El parser conserva el mes de emisión de la tabla y la fecha exacta del boletín por separado, y resuelve trimestres que cruzan años.

Tiempo: MET Norway Locationforecast, hasta el horizonte realmente disponible (aproximadamente 10 días). CC BY 4.0 con atribución y nota de transformación. Se identifican las consultas con el repositorio, se limitan coordenadas a cuatro decimales, se respetan `Expires`/`Last-Modified`, se usa `If-Modified-Since` y se espacia la consulta por ciudad. Sin API key ni consulta del navegador a MET Norway al abrir el panel.

Polos: lee la publicación existente de `polos_indicadores.json` (NCEI, NASA Ozone Watch y DMI). Se muestran fechas de cada variable; extensión no es volumen, balance superficial no es balance total, ozono estratosférico no es ozono urbano.

Ciclones: lee `ciclones_mundo.geojson` del proyecto, con enlace a NHC/GDACS/SMN. Un conjunto vacío o vencido no se interpreta como ausencia de peligro.

Precios: reutiliza `data/economia/precios_mx.json`; conserva nombre, mercado, unidad, fuente, error y fecha de cada serie. No modifica ni actualiza los colectores económicos. Un índice no se presenta como precio por kilogramo. Un dato antiguo no se presenta como precio actual.

## Inferencias y límites

- Umbrales de temperatura, lluvia por 6 h y viento sostenido: criterios orientativos de revisión, sin calibración local, no alertas oficiales ni probabilidades de daño.
- No se generan señales actuales a partir de una emisión meteorológica de más de 48 h o sin muestras futuras. Un fallo conserva el dato anterior sin cambiar la fecha de su emisión.
- No se suman ventanas móviles de lluvia; las temperaturas representadas son muestras, no extremos diarios oficiales.
- Las fichas son mecanismos y acciones de referencia. No significan eventos activos. A semanas/meses/años se explica la incertidumbre y se enlazan productos especializados; no se extrapola el modelo de diez días.
- No existe un modelo causal de precios en este módulo. El simulador usa variación/merma/logística elegidas por el usuario y muestra fórmula y supuestos.
- Las perspectivas de ENSO no equivalen a probabilidad de escasez, inflación, inundación o ciclón en una localidad.
- Las tareas/notas quedan en el navegador y se pueden exportar/importar en JSON. El informe Markdown incluye fechas y fuentes. No hay colaboración o vigilancia individual programada de planes.

## Verificación

Pruebas de parsers, cambio de año, datos ausentes/cero, caché HTTP, conservación ante fallos, umbrales, simulación, filtrado, importación, CSV y clasificación Admin. La página incorpora un tutorial con ejemplo de abasto, GRC, criterios de activación y explicación de fuentes automáticas frente a enlaces externos.
