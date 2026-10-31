# Fase 5E · Salidas exactas publicadas por intervalo

Continúa `transporte.html`, ahora identificado en los accesos existentes como **Fases 5C / 5D / 5E · Horarios y conexiones**. El cálculo, el ejemplo y los expedientes funcionan en el navegador. No añade proveedores, registros, claves, instalaciones ni consultas externas. No cambia las ingestas de cámaras, posiciones ferroviarias, inmuebles o economía.

## Comportamiento

- `frequencies.txt` con `exact_times=1` representa un horario fijo comprimido. Se calculan las salidas de cabecera `start_time + n × headway_secs` mientras sean menores que `end_time`. El final es exclusivo.
- Se conservan los tiempos relativos de `stop_times.txt`, las permanencias en las paradas, el calendario y las restricciones de embarque/desembarque. Consultar desde una parada intermedia también encuentra un vehículo cuya salida de cabecera sea anterior a la hora solicitada, si todavía pasa por esa parada después de ella.
- Cada instancia conserva el `trip_id` original para las reglas por viaje de Fase 5D. La identidad interna distingue las salidas; no crea IDs que puedan confundirse con viajes publicados por el productor. Las reglas se validan contra los viajes originales.
- `exact_times=0` o vacío sigue excluido de las búsquedas de horas puntuales. No se presenta una hora ficticia para un servicio que solo declara una separación entre vehículos.
- Se validan referencias, enteros, valores de exactitud, intervalos positivos, ausencia de solapamientos/duplicados y exactitud uniforme por viaje. Se admiten intervalos contiguos. Una plantilla incompleta, flexible, no monótona o demasiado corta continúa excluida.
- Para expandir una plantilla se exige igualdad entre llegada y salida en su primera parada. Un horario calculado fuera de 00:00:00–99:59:59 se rechaza. Se admiten horas de servicio posteriores a 24:00 sin mezclar calendarios de otras fechas.
- Límites de esta implementación: 20 000 intervalos, separación de 1 a 86 400 segundos, 20 000 viajes y 400 000 registros de horario antes y después de expandir. Si la expansión supera estos límites no se activa la fuente ni se entrega un resultado parcial. El motor permanece en un trabajador web con el límite de ejecución ya existente.

## Procedencia y compatibilidad

Cada etapa calculada desde una frecuencia exacta agrega un campo opcional `frequency`: `exactTimes`, `startTime`, `endTime`, `headwaySeconds`, `instanceStart`, `templateDeparture` y `stopOffsets` del tramo guardado. La interfaz muestra el viaje plantilla, la salida de cabecera, el intervalo y la separación entre salidas. Es un horario calculado de la publicación del productor, no una observación del vehículo en vivo.

La validación comprueba que la instancia pertenece a la secuencia del intervalo y que cada hora coincide con su desplazamiento. El campo participa en la huella del plan y en el respaldo cifrado del expediente; JSON y GeoJSON conservan la procedencia. La huella detecta alteraciones del registro respecto a la copia guardada; no es una firma del operador.

`transit.version` permanece en 1. Las etapas sin `frequency` conservan su esquema previo y no se reescriben sus hashes. Se actualizan únicamente las versiones de caché de los consumidores del validador compartido para admitir la extensión al recuperar/respaldar un expediente. Los datos de otras áreas se preservan.

## Práctica en la web

1. Abre **Secciones → Fases 5C / 5D / 5E · Horarios y conexiones** y selecciona un expediente. Puedes crear uno en Fase 4A.
2. Pulsa **Cargar ejemplo de salidas exactas · Fase 5E**. Se genera un ZIP ficticio en memoria y se procesa con el mismo lector y trabajador que un archivo real; no se consulta la red.
3. Revisa SIMULACIÓN, licencia ficticia, huella, calendario y conteos. Confirma la fuente. Hay un viaje plantilla y cuatro salidas exactas: 08:00, 08:15, 08:30 y 08:45. Las 09:00 no están incluidas.
4. La consulta se configura de Origen ficticio A1 a Destino ficticio B1, desde 08:05 y sin transbordos. Devuelve tres resultados: 08:15–08:40, 08:30–08:55 y 08:45–09:10.
5. Consulta desde 08:46. No devuelve otra salida para ese origen, porque el intervalo ya no contiene una que cumpla el filtro. Esto no es una afirmación sobre un servicio real.
6. Elige P1 como origen y 08:05 como hora: el viaje de cabecera 08:00 pasa por P1 a las 08:10 y llega a B1 a las 08:25. El cálculo usa los desplazamientos de las paradas, no compara únicamente la salida de cabecera.
7. Guarda un resultado. Se identifica con `[SIMULACIÓN]`. Exporta JSON/GeoJSON y despliega **Ver copia del itinerario y procedencia** para examinar la regla del intervalo.
8. Recarga y vuelve a seleccionar el expediente. El plan y su procedencia se recuperan; la fuente completa no se guarda. Para recalcular hay que cargarla y confirmarla otra vez.

## Validación

Pruebas del ZIP de ejemplo, extremo exclusivo, plantilla que no se ofrece como salida independiente, embarque intermedio, permanencias, exclusión de exact_times=0/vacío, referencias inválidas, intervalos contiguos/solapados, exactitud mezclada, límites de recursos, calendario, horas posteriores a 24, reglas de transbordo por viaje plantilla, procedencia, integridad, GeoJSON y compatibilidad.

El flujo de interfaz comprueba confirmación previa, tres resultados, búsqueda negativa, guardado junto a planes anteriores y activos, respaldo cifrado y recuperación de la procedencia sin peticiones de red. La validación publicada se realiza después de los controles de GitHub.

Referencia primaria: https://gtfs.org/documentation/schedule/reference/#frequenciestxt.

Pendientes: servicios por frecuencia sin salidas exactas con ventanas de espera explícitas, recorridos peatonales y GTFS pathways, continuidad a bordo, más transbordos/feeds/días, GTFS-RT, expansión del catálogo mundial, transporte especializado y vigilancia privada con la página cerrada. Esta entrega no completa todos los pendientes del proyecto.
