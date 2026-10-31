# Fase 5F · Recorridos internos de estación documentados

Continúa `transporte.html`, identificado en los accesos existentes como **Fases 5C–5F · Horarios y conexiones**. No agrega proveedores, cuentas, claves, instalación ni consultas externas. El ZIP, el ejemplo y el cálculo permanecen en el navegador. No cambia las ingestas de cámaras, clima, posiciones ferroviarias, inmuebles o economía.

## Cálculo

El nuevo modo **Exigir recorrido interno con tiempos publicados** admite un transbordo entre plataformas distintas solo si existe una secuencia dirigida de `pathways.txt` con tiempo explícito `traversal_time` en cada enlace. La conexión en el mismo stop_id conserva el margen del analista sin inventar un desplazamiento.

El lector incorpora `pathways.txt` desde el ZIP. Valida IDs únicos, referencias, tipos 1–7, bidireccionalidad, tiempos positivos y extremos de la misma estación. Respeta `is_bidirectional`; una puerta de salida de tipo 7 no puede ser bidireccional. Los nodos genéricos pueden carecer de coordenadas y aun así participar en el cálculo temporal.

Los enlaces sin tiempo publicado se excluyen con conteo visible. No se estiman tiempos por longitud, escaleras, distancia o proximidad. No se crean pasos por nombres similares, pertenecer a una estación o entre plataformas y sus áreas de embarque. Una plataforma con áreas de embarque no puede utilizarse como extremo de un enlace, según el modelo de pathways; los horarios de esta entrega siguen usando plataformas de tipo 0 y no se sintetiza el acceso a tipo 4.

El algoritmo busca el recorrido de menor tiempo entre los enlaces utilizables con tiempos publicados. No considera accesibilidad, anchura, pendiente, aforo, tarifas, funcionamiento de equipos ni cierres. Una secuencia de escaleras puede resultar la más rápida. El resultado no es una recomendación de accesibilidad ni una verificación física del lugar.

Las reglas de `transfers.txt` de Fase 5D siguen aplicándose por viaje/ruta y especificidad. Una prohibición de tipo 3 bloquea el transbordo; los conflictos máximamente específicos detienen la búsqueda. El mínimo efectivo es el mayor de:

- El margen elegido por el analista.
- El mínimo de la regla de transbordo aplicable, si existe.
- La suma de los tiempos publicados del recorrido elegido.

En este modo una secuencia completa puede fundamentar el cruce aunque no haya una regla `transfers.txt` de tipo 2. Los modos anteriores conservan su comportamiento: misma plataforma, o plataformas distintas con regla tipo 2 y mínimo explícito. El modo de recorridos internos no cae automáticamente al segundo si falta un paso.

Se mantienen un transbordo, espera máxima de dos horas, hasta 5 km de separación geométrica entre plataformas, límites temporales/calendarios y exclusión conservadora de continuidad a bordo 4/5. El límite geométrico no representa la distancia del recorrido.

## Límites de recursos

Máximo 20 000 enlaces por feed, 2000 ubicaciones exploradas desde una plataforma, 500 plataformas alcanzables y 100 enlaces por recorrido guardado. El recorrido no supera dos horas. El cálculo comparte el presupuesto previo de dos millones de comprobaciones y el trabajador con tiempo de ejecución limitado. Si se excede un límite explícito se detiene la consulta sin devolver resultados parciales. Permanecen los límites de ZIP y expansión de frecuencias de Fase 5E.

## Procedencia y exportación

La interfaz muestra una tabla con cada paso, extremos, ID, tipo, segundos publicados y dirección utilizada. Identifica la duración total como promedio declarado por el productor y no como observación actual.

La nueva conexión `kind: pathway-platforms` conserva un campo `pathway` con `stationId`, `totalSeconds`, `nodes` y `edges`. Los nodos guardan ID, nombre, tipo, estación declarada y coordenadas o null. Los enlaces guardan ID, extremos publicados, tipo, bidireccionalidad, segundos y si se utilizó el sentido inverso permitido.

La validación comprueba extremos, dirección, continuidad, ausencia de ciclos, suma de tiempos y mínimo aplicado. La secuencia participa en la huella del plan y en los respaldos cifrados. La huella no es una firma del productor ni una atestación independiente.

JSON y GeoJSON conservan la secuencia documental. La línea GeoJSON une únicamente las dos plataformas como esquema, incluso si hay nodos intermedios: no se presenta como geometría navegable ni se convierte automáticamente en corredor. Los nodos sin coordenadas no se colocan artificialmente en un mapa.

Se mantiene `transit.version=1`; `pathway` y el modo de consulta son extensiones opcionales. Los planes anteriores no se reescriben ni cambian de huella. Los otros consumidores solo actualizan sus versiones de caché para validar/respaldar estos planes.

## Práctica en la web

1. Abre **Secciones → Fases 5C–5F · Horarios y conexiones** y selecciona un expediente.
2. Pulsa **Cargar ejemplo de recorrido interno · Fase 5F**. El ZIP se genera en memoria y pasa por el mismo lector y trabajador web que un archivo real. No consulta la red.
3. Revisa SIMULACIÓN, licencia ficticia y huella. Confirma la fuente. Se eligen A1 → B1, 08:00 y el nuevo modo de recorridos.
4. Primera etapa ficticia: A1 08:00 → P1 08:20. Segunda: Q1 08:30 → B1 08:50. Hay diez minutos entre etapas.
5. El recorrido publicado es P1 → N1 por escaleras (90 s) y N1 → Q1 por pasillo (330 s): 420 s, siete minutos. La alternativa directa P1 → Q1 tarda 660 s y no se elige. N1 no tiene coordenadas; se muestra en la tabla, no se inventa una ubicación.
6. Con margen del analista de cinco minutos se aplica el mayor: siete. La conexión cabe en los diez disponibles. Con margen de once minutos desaparece el resultado.
7. Selecciona **Incluir plataformas distintas documentadas en GTFS**: no aparece el trayecto, porque este ejemplo no contiene una regla transfers.txt de tipo 2. El modo anterior conserva su alcance y no incorpora pathways automáticamente.
8. Vuelve al modo de recorridos y margen de cinco minutos. Guarda. El plan usa `[SIMULACIÓN]`, fuente y lugares ficticios.
9. Exporta JSON o GeoJSON. Recarga, selecciona el expediente y abre **Ver copia del itinerario y procedencia**: la tabla y tiempos se recuperan sin cargar la fuente. Para calcular de nuevo hay que incorporarla y confirmarla otra vez.

## Validación

Pruebas del ZIP real generado, elección entre alternativas, ausencia de coordenadas intermedias, dirección/inversión, ausencia de tiempos, prohibiciones/mínimos, referencias/IDs inválidos, estaciones diferentes, ciclos, límites, secuencia guardada, integridad, GeoJSON y compatibilidad de planes.

El flujo de interfaz verifica confirmación, tabla de dos enlaces, búsqueda negativa por margen, guardado junto a activos y tres planes previos, respaldo cifrado y recuperación sin peticiones de red. Después de los controles de GitHub se valida el sitio publicado.

Referencia primaria: https://gtfs.org/documentation/schedule/reference/#pathwaystxt.

Pendientes: recorridos por calles y accesibilidad verificada, equipamiento/cierres en vivo, niveles y acceso a áreas de embarque, servicios por frecuencia sin salidas exactas con ventanas de espera explícitas, continuidad a bordo, más transbordos/feeds/días, GTFS-RT, expansión mundial del catálogo, transporte especializado y vigilancia privada con la página cerrada. Esta entrega no completa todos los pendientes del proyecto.
