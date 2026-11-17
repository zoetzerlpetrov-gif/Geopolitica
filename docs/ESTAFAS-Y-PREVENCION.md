# Estafas y prevención

En el mapa: **Riesgos y clima → Red y ciberseguridad → Estafas y fraudes: alertas y prevención (30 días)**. Activa la casilla, abre un punto y despliega cada reporte. Incluye fuente, fecha, canales citados, modalidad orientativa, patrón general y prevención. Usa el diseño y el control de capas existentes, incluidos refresco y desactivación. Conserva los permisos de la sección Riesgos y clima.

En **Secciones → Noticiero DOMINUS → Ciberseguridad: estafas y prevención** aparecen también los reportes recientes sin país (hasta 72 h). El menú de noticias se genera a partir de los datos publicados; la nueva sección aparece tras la siguiente ejecución de Datos en movimiento.

En **Brújula Diaria**, la sección se llama **Ciberseguridad**. Si existe una noticia reciente seleccionable, muestra la noticia, después una escena de modus operandi orientativo y otra de prevención, con orientación de CONDUSEF e INCIBE. No se publica un video por instalar esta mejora. Si no hay noticia apta, no se inventa una alerta. Conserva el historial de noticias usadas y la selección/editorial existentes. Una nota de estafa etiquetada para esta sección no se consume antes en Tecnología o Economía.

## Fuentes y alcance

- INCIBE: https://www.incibe.es/ciudadania/avisos/feed
- Revista Proteja su Dinero (CONDUSEF): https://revista.condusef.gob.mx/feed/
- MVS, Latinus, Infobae México, El Financiero y Xataka México: índices/canales ya configurados; filtrados por tema.
- WeLiveSecurity (ESET): https://www.welivesecurity.com/es/rss/feed/
- Una al Día (Hispasec): https://unaaldia.hispasec.com/feed
- GDELT: descubrimiento complementario de titulares, con atribución al medio.

Son consultas públicas sin registro ni API key; se respeta robots.txt. Se conservan metadatos y enlaces, no el artículo completo. Las recomendaciones generales se apoyan en las guías enlazadas en `tools/red/estafas_prevencion.py`. No sustituyen la comprobación del caso en el artículo original. La revista de CONDUSEF es una fuente educativa: no equivale a recibir todas las alertas del organismo.

Los canales incluyen llamadas, SMS, WhatsApp, correo, redes sociales, banca, compras e inversiones. Solo se asignan si aparecen indicios en el titular. Un canal no prueba un método específico. Si el título no lo explica, se indica expresamente. Se excluye fraude electoral/fiscal/contable sin indicios de suplantación o canal de engaño al usuario.

## Ubicación y conteo

El mapa utiliza el país mencionado. Si un aviso oficial de INCIBE o la revista de CONDUSEF no menciona país, utiliza el ámbito del organismo (España o México), etiquetándolo como tal. El punto en el país es una referencia de visualización, nunca ubicación del estafador, víctima, teléfono o IP. Sin país ni ámbito de organismo, la nota queda sin punto y sigue disponible en el Noticiero. La cantidad representa notas distintas por título/enlace, no víctimas, casos confirmados, tendencia estadística o probabilidad de fraude. Un mismo reporte puede citar varios países.

`tools/red/estafas.py` reutiliza `vivos/noticiero.json` y `data/events.json`. Conserva hasta 30 días en `vivos/estafas_estado.json`; publica `vivos/estafas.geojson`. Para conservar avisos que superen las 72 h del Noticiero, consulta también los dos feeds públicos de INCIBE/CONDUSEF, con robots.txt y estado de cada fuente en el GeoJSON. Si una fuente falla, conserva los avisos anteriores aún dentro de la ventana. El workflow Datos en movimiento lo ejecuta después del Noticiero. Un archivo corrupto detiene la actualización y conserva los anteriores mediante el manejo de fallos del workflow.

## Verificación

`tests/test_estafas.py` recorre clasificación, fechas, exclusión de duplicados, ubicación desconocida, ámbito emisor, noticia → guion → escenas preventivas y exclusión por historial. `tests/js/riesgos.test.mjs` valida el registro de la capa, fichas desplegables, escape de HTML y enlaces seguros. No se necesita generar ni subir videos para estas pruebas.
