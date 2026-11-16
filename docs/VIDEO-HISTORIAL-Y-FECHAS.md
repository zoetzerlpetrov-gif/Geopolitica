# Brújula Diaria: repetición de noticias y fechas en voz

El historial de los tres días anteriores se aplica a noticias, titulares de Mercados y publicaciones del DOF. Se normalizan URLs (host, protocolo, anclas y parámetros de seguimiento) sin eliminar identificadores de artículos. En el DOF se usa el parámetro `codigo`, que identifica la publicación, aunque cambien la fecha o el formato del enlace.

Los nuevos guiones incluyen `noticias` con título original, URL, sección y fecha. Así se excluyen también titulares iguales con diferencias de mayúsculas, acentos o puntuación publicados bajo otro enlace. No se aplica una equivalencia amplia por tema: una nota con cifras/hechos nuevos en el título puede seguir siendo candidata. Este filtro no garantiza reconocer paráfrasis o traducciones de la misma noticia. Los guiones antiguos sin títulos siguen funcionando mediante sus URLs.

Los títulos del DOF no se excluyen por similitud con los de otros días: dos acuerdos nuevos pueden compartir encabezado. Se excluye el mismo código de publicación. Si no quedan publicaciones nuevas, no se crea el bloque. Si se cubre por primera vez una publicación anterior dentro de la ventana de tres días, la locución dice su fecha original. Una URL del DOF seleccionada ya en otra sección tampoco se añade de nuevo al bloque legal.

## Persistencia

El guardado del historial inicializa el repositorio temporal **antes** de `git fetch`; antes la recuperación fallaba fuera de un repositorio y el fallo se ignoraba, dejando únicamente el nuevo guion. Ahora las recuperaciones fallidas detienen el proceso en lugar de continuar sin historial o sobrescribirlo con un conjunto incompleto. El flujo de video y el de comentarios comparten el grupo de concurrencia `datos-comentarios` para no sobrescribirse.

Se mantienen los últimos 30 guiones y se registra como narrado lo subido correctamente a YouTube. No se recuperan automáticamente guiones anteriores ya perdidos. Estos cambios se aplican a generaciones posteriores; no editan videos ya subidos.

## Fechas y SEP

`fechas_voz.expandir_fechas` expande meses abreviados en contextos de fecha, incluyendo día + mes, mes + año y marcadores temporales. Acepta ene, feb, mar, abr, may, jun, jul, ago, sep/sept/set, oct, nov y dic. El día y mes se validan antes de expandirlos. Ejemplo: `15 nov. de 2026` → `15 de noviembre de 2026`.

`SEP` como institución se pronuncia `sep` con el diccionario de voz. `15 SEP de 2026` se interpreta como septiembre; `la SEP de 2026 anunció becas` conserva el nombre de la institución. Ante un `SEP` aislado ambiguo, sin día ni contexto temporal explícito, se conserva como sigla pronunciable. Solo se modifica la locución, no titulares, resúmenes ni escritura en pantalla.

Las pruebas verifican seguimiento de URLs, códigos DOF, títulos iguales, actualización con cifras distintas, guiones antiguos, conservación del historial, serialización de escritores y pronunciación contextual. No requieren subir un video ni conectarse a YouTube.
