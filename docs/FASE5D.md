# Fase 5D · Conexiones documentadas y reglas de transbordo

Continúa el módulo de `transporte.html`; se identifica como Fases 5C / 5D en los accesos ya creados. No añade servicios externos, registros, claves ni instalaciones. El cálculo y el ejemplo se ejecutan en el navegador. No modifica las ingestas de cámaras, trenes o economía.

## Cambios

- Reglas GTFS `transfers.txt` tipos 0–3 por parada/estación, ruta o viaje. Comprueba referencias, pertenencia de trip_id a route_id y claves duplicadas. Las reglas de estación abarcan sus plataformas hijas; se valida la jerarquía de `parent_station`.
- La especificidad prioriza ambos viajes, un viaje y la ruta opuesta, un viaje, ambas rutas, una ruta y, por último, solo paradas. Entre las reglas aplicables se elige la de mayor especificidad. No hereda el permiso o tiempo de una regla genérica si una más específica cambia el tipo. Si dos reglas máximamente específicas discrepan en tipo o tiempo mínimo, se detiene esa búsqueda sin entregar resultados parciales. Puede buscarse solo trayectos directos mientras se corrige la fuente.
- El modo inicial conserva conexiones en el mismo stop_id. El modo **Incluir plataformas distintas documentadas en GTFS** requiere una regla aplicable de tipo 2 con min_transfer_time explícito. No genera enlaces por proximidad, nombres parecidos o pertenecer a la misma estación. Conserva la dirección de la regla y sus restricciones de viaje/ruta.
- Aplica el mayor de los mínimos del productor y del analista. Mantiene una espera máxima de dos horas, un transbordo, una llegada dentro de 24 horas de la hora consultada y los límites anteriores de búsqueda. Para plataformas distintas impone además un máximo de 5 km de separación geométrica redondeada, como límite de alcance del prototipo, no como recomendación de caminata. Como máximo 500 plataformas candidatas por parada, 20 000 reglas y dos millones de comprobaciones; no trunca silenciosamente un cálculo que exceda esos límites.
- Una prohibición aplicable de tipo 3 bloquea la conexión. Tipos 0/1 no habilitan por sí solos conexiones entre plataformas distintas. Los enlaces de continuidad a bordo 4/5 siguen desactivando todos los transbordos del feed: no se simula soporte de esas reglas. Las frecuencias, transporte flexible, varias fechas/feeds, tarifas, caminos peatonales y GTFS-RT siguen fuera del alcance.
- Cada conexión nueva conserva extremos y estaciones padre declaradas, separación geométrica, mínimo aplicado y copia de la regla GTFS elegida con sus selectores y especificidad. La interfaz muestra su alcance en palabras. No confirma que el paso esté abierto, sea accesible o transitable; es una conexión documental del productor.
- Los planes guardados anteriores siguen siendo válidos sin añadirles campos ni recalcular hashes. Las nuevas búsquedas guardan el alcance elegido y la procedencia de la conexión. Se verifica continuidad temporal, extremos, mínimo, regla y huella al recuperar. La huella es comprobación de integridad, no firma del operador ni atestación independiente.
- Exportación JSON incluye esa procedencia; en GeoJSON los enlaces entre plataformas se separan como líneas esquemáticas con su regla y advertencia. No representan un recorrido peatonal ni crean corredores automáticamente.

## Ejemplo sintético integrado

El botón **Cargar ejemplo sintético de conexión · Fase 5D** genera un ZIP pequeño en memoria y lo procesa con el mismo lector/validador que los feeds incorporados. No consulta la red y no representa un operador o trayecto real.

1. Selecciona un expediente y pulsa el botón de ejemplo.
2. Revisa el nombre SIMULACIÓN y confirma la fuente.
3. Se seleccionan Origen ficticio (A1), Destino ficticio (B1), salida 08:00 y modo documentado. El calendario amplio es ficticio para permitir la práctica.
4. Primera etapa: autobús ficticio A1 08:00 → plataforma P1 08:20.
5. Segunda etapa: tren ficticio Q1 08:30 → B1 08:50. P1 y Q1 son plataformas distintas de ST1.
6. La regla ST1 → ST1, específica para T_BUS → T_TRAIN, es tipo 2 y publica 480 segundos (8 minutos). Hay 10 minutos entre etapas: el horario satisface ese mínimo. No es prueba de una caminata real.
7. Cambia a Solo la misma plataforma y vuelve a buscar: ese itinerario no aparece. Cambia el mínimo del analista a 11 minutos: tampoco aparece. Son ejercicios para distinguir alcance y margen.
8. Guarda el resultado revisado. El título se prefija con [SIMULACIÓN], junto con nombres, licencia y fuente ficticios. Se puede exportar y recuperar con el expediente sin convertirlo en un servicio real.

El ejemplo no se carga automáticamente ni se mezcla con una fuente pública ya cargada. Sustituir una fuente requiere la revisión normal de cambios/resultados sin guardar.

## Compatibilidad y validación

Campo raíz `transit` mantiene versión 1. `query.connectionMode` y `itinerary.connection` son extensiones opcionales para conservar los planes previos. No se modifica el formato de las demás áreas del expediente. Los consumidores de la validación compartida actualizan su versión de caché para conservar los nuevos planes.

Pruebas: ZIP generado/CRC, alcance mismo punto/documentado, dirección, mínimo de fuente/analista, máximo geométrico, jerarquías, prioridad de reglas, pertenencia viaje/ruta, prohibiciones, empate contradictorio, continuidad a bordo no admitida, integridad, esquema GeoJSON y recuperación de planes anteriores. El flujo DOM prueba carga explícita, ejemplo preseleccionado, consulta, guardado etiquetado y conservación de activos/planes previos sin peticiones de red.

Referencia primaria: https://gtfs.org/documentation/schedule/reference/#transferstxt.

Pendientes: recorridos peatonales verificados y GTFS pathways, enlaces a bordo, más transbordos/feeds/días, frecuencias, retrasos/cancelaciones, expansión mundial del catálogo, transporte especializado y vigilancia privada con la página cerrada. Esta entrega amplía conexiones documentales; no completa todos los pendientes del proyecto.
