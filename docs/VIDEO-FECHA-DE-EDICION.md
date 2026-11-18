# Fecha de edición y último video disponible

La fecha del noticiero se calcula al comenzar su generación en `America/Mexico_City`. La fecha UTC del runner, la de los artículos y la de referencia del DOF, clima o indicadores no sustituyen la fecha de edición. Por ejemplo, el 17 de noviembre de 2026 es martes; el 18 es miércoles. Antes de las 06:00 UTC del día 18 todavía es día 17 en Ciudad de México.

El guion guarda `edicion`: fecha, zona, origen automático/manual e instante de generación. Se valida que coincidan el título, la descripción, la portada y su locución antes de renderizar y antes de solicitar autorización para subir a YouTube. La miniatura utiliza el mismo guion. Si una edición automática llega a la subida ya en otro día local, la subida se detiene: no se cambia únicamente la etiqueta de un audio que dice otra fecha.

Una fecha manual explícita conserva la función de generar ediciones históricas. Una fecha mal escrita o inexistente se rechaza, en lugar de sustituirse silenciosamente por hoy. El artefacto de Actions incluye la fecha (`noticiero-AAAA-MM-DD-número`) y el resumen de la corrida indica zona y origen. La fecha de publicación que muestra la plataforma de YouTube es distinta de la fecha editorial y no se falsifica.

## Fallo identificado el 17 de noviembre

Las corridas `44091861337` y `44183202305` fallaron al restaurar `guiones`, antes de ejecutar el render. El último video completado correspondía al 16. El archivo de ese día no se debe rebautizar como edición del 17.

La restauración compartida inicializa su propio repositorio en el destino antes de descargar/archivar la rama. Esto evita que, ejecutándose dentro de `datos/`, Git herede el prefijo de esa subcarpeta y omita los guiones al restaurar. Si la rama existe y legítimamente no tiene carpeta `guiones`, se crea vacía y se emite un aviso; un fallo de descarga sí detiene la generación. Se conserva el grupo de concurrencia compartido entre video y comentarios. No se cambia la moderación ni la publicación de comentarios.

Las pruebas reproducen la carpeta de trabajo anidada con un repositorio Git real, un historial sin guiones, el límite de medianoche local y fechas inconsistentes en las salidas. No generan ni suben videos, ni modifican videos ya publicados.
