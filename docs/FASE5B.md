# Fase 5B · Rutas web y plano sin WebGL

Continúa Fase 5A en `fase5.html`, sin cambiar ingestas, cámaras, trenes ni otros módulos del mapa principal. El nuevo acceso se identifica como Fases 5A / 5B en Secciones, Centro de trabajo y los accesos entre fases.

## Funciones

- Consulta manual de rutas independientes para automóvil, bicicleta o caminata a FOSSGIS/OSRM, con datos OpenStreetMap. No combina modos ni horarios. Alternativas reales si el proveedor las devuelve; muestra distancia y duración estimadas, diferencias respecto a la primera alternativa y extremos ajustados a la red.
- Coordenadas introducidas manualmente, entre 5 m y 1000 km de separación geodésica. Nunca obtiene automáticamente geolocalización, activos o nombres del expediente. Confirmación de envío junto al formulario antes de cada consulta. La consulta transmite extremos, modo, IP y origen del sitio al proveedor, que registra consultas. No se envía el expediente.
- Consultas ocasionales gratuitas sin registro ni API key en las verificaciones realizadas. El uso de datos OSM y el uso del servidor son condiciones distintas. Atribución visible, enlace de corrección y enlace al proveedor. El servidor comunitario no se presenta como infraestructura para licencias comerciales o consultas masivas; uso sostenido requiere proveedor contratado o autorización. Sin instalación local.
- Una consulta a la vez, sin sondeo ni reintentos. Web Locks coordina las pestañas del mismo origen y localStorage conserva solo contadores: máximo 30 consultas por día UTC, mínimo cinco segundos entre solicitudes. No es un límite global por servidor, no coordina dispositivos distintos ni impide modificar el navegador. En 429 impone al menos un minuto antes de otra solicitud. Sin Web Locks o almacenamiento disponible, bloquea antes de transmitir.
- Caché en memoria por petición exacta, manteniendo fecha original. Los cambios de expediente borran las alternativas visibles; no cambian los registros guardados. Sin almacenamiento de coordenadas en la cuota ni caché persistente externa. Ver las alternativas o rutas guardadas no consulta al proveedor.
- Tiempo máximo 20 s, respuesta hasta 2 MB, sin redirecciones, credenciales omitidas y referrer de origen. Errores de red/CORS, NoRoute, métricas inválidas o extremos ajustados a más de 1000 m no crean registros parciales. No cambia de modo ni proveedor silenciosamente.
- Copia revisada de la ruta en el expediente: fecha de consulta, modo, extremos solicitados/ajustados, distancia, duración, trazado simplificado, huella de respuesta y huella del registro. Exportación GeoJSON explícita en claro. Máximo 20 rutas de hasta 10 000 vértices, sujeto al límite general de 4 MB.
- Conversión explícita de ruta guardada a corredor de Fase 5A con radio declarado. Conserva relación y trazado idéntico. Hasta 200 vértices: no se recorta una ruta larga para caber. La simplificación es del proveedor (`overview=simplified`) y no declara una tolerancia geométrica garantizada. La distancia/tiempo proceden del motor; la evaluación espacial utiliza la representación simplificada. Un corredor no demuestra transitabilidad, ausencia de cierres o seguridad.
- El plano SVG se activa cuando falla la inicialización WebGL o con el botón “Usar plano sin WebGL”. Cartografía Natural Earth del mismo sitio cuando está disponible. Permite dibujo con clics, zoom, desplazamiento, centro como vértice y teclado (flechas, +/−, Enter). Representación lon/lat orientativa; no tiene calles ni escala métrica. El cálculo espacial mantiene las distancias esféricas existentes.

## Persistencia y compatibilidad

Campo opcional `mobility: {version: 1, routes: [...]}` dentro del expediente. Los casos anteriores siguen siendo válidos. Se valida forma, límites, extremos, métricas, referencias al corredor y huella al recuperar; esta última detecta modificaciones accidentales, no constituye firma ni prueba independiente. No se modifica el formato anterior de instantáneas espaciales. Los informes de Fase 5A conservan la geometría usada; la procedencia del cálculo de ruta se conserva en el registro de movilidad del expediente y en su exportación de ruta.

Los respaldos cifrados y copias de colaboración incluyen el campo junto al resto del caso. No habilita Supabase ni vigilancia con la página cerrada. La edición conserva versión esperada y evita sobrescribir cambios concurrentes. La nueva validación se distribuye con versiones de caché en las páginas que escriben expedientes.

## Tutorial en el sitio

1. Abre un expediente existente en Fases 5A / 5B. Para uno nuevo utiliza Fase 4A.
2. Abre Rutas web. Introduce cuatro coordenadas públicas y el modo. Ejemplo de prueba en Berlín: origen [13.38886, 52.517037], destino [13.397634, 52.529407]. El orden es longitud, latitud.
3. Revisa el aviso y marca el envío de esos extremos públicos. Pulsa Consultar y enviar coordenadas públicas.
4. Revisa las alternativas, hora, duración estimada y ajuste de extremos. Ver en mapa/plano no provoca otra consulta.
5. Asigna título y guarda una alternativa. Después declara título/radio y crea un corredor. El corredor queda seleccionado.
6. Incorpora fuentes en Fuentes y usa Analizar para evaluar coincidencias en el corredor. La proximidad no demuestra interrupción o amenaza.
7. Para el dibujo sin WebGL abre Áreas, activa el dibujo y usa clics o el teclado del plano. Guarda la geometría con la acción existente. Las rutas guardadas y áreas se incluyen en los respaldos de Fase 4A.

## Verificación

Pruebas de validación negativa, huellas, límites, cuota/caché/errores/concurrencia, conservación de trazados largos, corredor vinculado, compatibilidad y dibujo SVG. Flujo DOM integrado: no transmitir al abrir ni sin confirmación, consulta simulada, ruta revisada y corredor guardados conservando activos e informe/señal anterior. Se verifica además disponibilidad puntual de los tres perfiles con GET y CORS; no garantiza continuidad del servicio.

Fuentes primarias:
- https://routing.openstreetmap.de/about.html (modos, privacidad, límites y atribución).
- https://www.openstreetmap.de/nutzen/dienste-osm-de/ (sin registro y disponibilidad comunitaria).
- https://project-osrm.org/docs/v5.24.0/api/ (rutas, alternativas, distancias, tiempos y waypoints).
- https://www.openstreetmap.org/copyright (datos y ODbL).

Pendientes: transporte público con horarios/transbordos, rutas ferroviarias y marítimas operativas, planificación aérea/carga, restricciones de mercancías, vigilancia privada 24/7 y análisis energético especializado. Los marcadores de trenes son posiciones publicadas, no un planificador de itinerarios.
