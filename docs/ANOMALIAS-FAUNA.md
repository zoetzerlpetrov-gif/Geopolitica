# Fauna extraordinaria dentro de Fenómenos Anómalos

Tres subtipos añadidos al arreglo existente `TIPOS_ANOM` y al subgrupo **Por tipo de fenómeno**:

- `prehistoric`: animales prehistóricos, reportes no confirmados.
- `mythical`: animales mitológicos, reportes y relatos.
- `cryptid`: críptidos, reportes no confirmados.

No hay un menú o sección nuevos. Se conservan las reglas de acceso del grupo Fenómenos Anómalos. Todos siguen marcados `noAmenaza`: no generan alertas de seguridad ni cuentan como incidentes confirmados.

## Datos y clasificación

El colector existente `tools/anomalias/anomalias.py` aplica los términos nuevos a los RSS y al flujo GDELT GKG que ya usa en producción. Norte Digital se incorpora como un medio general: solo pasan títulos pertinentes y ubicables. Se comprobó su RSS y el permiso de robots para leerlo. La siguiente ingesta ordinaria recoge los cambios; no se crea otro proceso que compita por escribir la rama de datos.

El filtro de fauna exige un nombre o término reconocible y contexto de reporte, video, avistamiento o contraste. Excluye referencias a fósiles, películas, videojuegos, exhibiciones y algunos usos comerciales. Conserva desmentidos y verificaciones como parte del seguimiento. Es una clasificación por texto, no una validación zoológica, y puede omitir artículos ambiguos o no reconocer todos los idiomas/nombres locales. Phoenix como ciudad no se interpreta como ave fénix.

Las notas del archivo que cumplan las reglas se reclasifican sin cambiar sus fechas o enlaces. Los grupos por país separan los tres tipos de fauna de las otras anomalías para que el filtro no muestre noticias OVNI como si fueran reportes de animales. Los grupos anteriores conservan sus identificadores.

## Caso inicial de Ciudad Juárez

`data/anomalias-fauna.geojson` incorpora un reporte de noviembre de 2026 con referencia aproximada de Ciudad Juárez, no de la cámara. La fecha `2026-11-09` corresponde a la publicación de Norte Digital, no a la grabación. La ficha enlaza además a la cobertura de Azteca Ciudad Juárez del 12 de noviembre que recoge el rechazo de Protección Civil municipal. El registro permanece en nivel **medios**, porque registrar una noticia o un rechazo recogido en prensa no equivale a identificar científicamente la figura ni a contar con un expediente primario de la autoridad.

Los tres subtipos combinan este respaldo con la instantánea habitual sin repetir su identificador; esto permite consultarlo desde la publicación del código, sin esperar al siguiente ciclo general. El colector agrega el mismo registro al archivo de notas y después aplica el paso de recientes a archivo según la fecha. No se inventan casos para llenar los otros subtipos.

## Fechas y presentación

- RSS: publicación de la fuente cuando está disponible.
- GDELT: detección de la noticia, que puede diferir de la publicación.
- Avistamiento: no confirmado por el monitor salvo información curada explícita.
- Íconos de fauna diferenciados; se conservan los de OVNI y demás tipos.
- Fuente, ubicación aproximada, contraste y estado visibles en la ficha.

La incorporación de nuevos nombres no confirma la existencia de criaturas mitológicas o especies prehistóricas vivas. Los pterosaurios se tratan como la identificación alegada por el reporte, no como un ave actual identificada.
