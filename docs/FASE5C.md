# Fase 5C · Horarios y conexiones GTFS en el navegador

Entrada: `transporte.html`, desde Secciones, Centro de trabajo y accesos de las fases existentes. Continúa movilidad sin cambiar cámaras, capas o ingestas anteriores. Los cambios compartidos del expediente solo admiten el nuevo campo opcional y actualizan su versión de caché.

## Alcance entregado

- Abrir ZIP GTFS en el navegador o consultar tres copias públicas: KTMB (ferrocarril), BAS.MY Johor Bahru y BAS.MY Kangar (autobuses), Malasia. Fuentes oficiales data.gov.my, CC BY 4.0, sin API key ni registro en las consultas realizadas. No representa cobertura mundial precargada; el importador permite otros países/operadores con el subconjunto compatible de GTFS y licencia correspondiente.
- Las copias se sirven desde el propio sitio porque las respuestas de origen verificadas no anunciaban CORS. Un workflow diario recopila fuentes fijas sin recibir consultas o expedientes. Los ZIP viven en `datos-transporte`, con manifiesto, URL, licencia, SHA-256, tamaño y fechas. Una actualización fallida conserva la fecha/hash de la copia anterior; si no existe copia no se inventa contenido.
- Recolección de ZIP, comprobación de tamaño, estructura y CRC, directorio, compresión y tablas requeridas. El navegador vuelve a comprobar estructura, CRC, UTF-8, límites y el hash del manifiesto. No extrae al disco ni ejecuta contenido. Sin ZIP64 ni cifrado. La descompresión utiliza una API nativa del navegador, no instalaciones del usuario.
- Procesamiento en Web Worker por acción explícita. Fuente completa e índices solo en memoria. Previsualización y confirmación separadas; no modifican el expediente. No abre archivos ni descarga feeds al entrar. Los trayectos se calculan localmente, sin transmitir origen o destino a un planificador.
- Validación de referencias, agencias/zona horaria común, paradas, rutas, viajes, calendario semanal y altas/bajas de calendar_dates. Los tipos se muestran como códigos declarados por el productor, sin corregirlos por inferencia (la copia KTMB comprobada identifica algunos servicios ferroviarios con route_type 0). Permite horas de servicio posteriores a 24:00 y reconoce timepoint aproximado. Las horas son GTFS, en la zona de agencia; no son una conversión a la zona del analista ni una cuenta regresiva UTC.
- Búsquedas directas y con un transbordo máximo en el mismo `stop_id`, sin caminatas. Respeta pickup/drop_off (embarque y desembarque ordinarios), prohibiciones y mínimos genéricos aplicables a la plataforma o su estación padre. Ante varias reglas genéricas aplicables utiliza la restricción conservadora. Si hay reglas específicas por viaje/ruta o enlaces de continuidad a bordo, se desactivan todos los transbordos de esa copia y se mantienen búsquedas directas.
- Exclusión visible de viajes por frecuencias, flexibles, sin horas completas o secuencia temporal utilizable. No interpola horas ni transforma una frecuencia en una salida confirmada. No combina feeds ni días de servicio diferentes; una búsqueda de madrugada que necesite servicios de la víspera debe evaluarse por separado con su fecha y hora GTFS correspondiente.
- Ventana de primera salida de 1–12 horas; llegadas hasta 24 horas desde la hora consultada; conexión mínima elegida de 1–120 min y espera máxima dos horas. Orden por llegada, menos tramos y salida; hasta 50 resultados con total encontrado visible. Más de dos millones de comprobaciones o 20 000 candidatos pide reducir filtros; no entrega un cálculo parcial como si fuera exhaustivo.
- Itinerario revisado guardado con tramos/paradas/horas, consulta, calendario/advertencias, procedencia, zona, fecha de recolección/carga, hash del ZIP y hash del registro. El hash permite detectar modificaciones accidentales, no es firma, autenticación del operador ni prueba independiente. Exportación JSON y GeoJSON explícita en claro. El GeoJSON es un esquema entre paradas: no representa calles, vías ni ruta navegable y no crea corredores automáticamente.

## Persistencia y límites

Campo opcional `transit: {version: 1, plans: [...]}` en el expediente IndexedDB. Hasta 20 planes, sujetos al límite general de 4 MB; no recorta registros para caber. Conserva versión esperada al guardar y rechaza conflictos de otra pestaña. Se incluye en respaldos cifrados y copias cifradas de colaboración; no activa Supabase ni requiere credenciales nuevas.

ZIP hasta 25 MB, 100 entradas y 100 MB descomprimidos, hasta 60 MB por entrada. Tablas de interés en raíz, UTF-8, métodos ZIP 0/8. Hasta 20 000 paradas, 10 000 rutas, 20 000 viajes, 400 000 stop_times y 2000 paradas por viaje. El selector muestra 200 coincidencias por filtro sin eliminar las demás del motor. Los feeds que exceden estos límites se rechazan con mensaje; no se afirma admitir cualquier GTFS del mundo.

La copia completa no se guarda en el expediente ni se recupera automáticamente al abrirlo. El itinerario guardado sí permanece; para recalcular se incorpora una fuente de nuevo. Las fechas de calendario/vigencia son distintas de carga/recolección: descargar hoy no vuelve vigente un horario antiguo. No se verifica circulación real, cancelaciones, ocupación, accesibilidad, tarifas ni seguridad del recorrido.

## Tutorial integrado y ejemplo

1. Selecciona un expediente; para crear uno nuevo utiliza Fase 4A.
2. Abre fuentes públicas y previsualiza KTMB, o incorpora un ZIP oficial compatible. Revisa zona, fechas, exclusiones y huella, y confirma la fuente.
3. Ejemplo KTMB: filtra origen por `KL SENTRAL` (ID 19100) y destino por `BATU CAVES` (ID 50600). Escoge una fecha dentro del calendario de la copia. Hora `08:00:00`, ventana 3 horas, solo directo o hasta un transbordo.
4. Revisa los resultados y abre las paradas/horas del itinerario. La disponibilidad y los horarios cambian con la copia del operador. El ejemplo no constituye una reserva ni confirmación de salida.
5. Guarda explícitamente un itinerario. Recarga: la copia del plan permanece, con procedencia. Para cifrado completo exporta el expediente desde Fase 4A.
6. En un archivo de otro país respeta la licencia indicada por su proveedor y el subconjunto admitido. La hora de servicio y la zona pueden ser distintas de las tuyas.

## Validación

Pruebas de CSV/ZIP/CRC, fechas/calendarios/excepciones, servicios nocturnos, referencias inválidas, restricciones de embarque/transbordo, plataformas distintas, reglas de estación padre, exclusiones de frecuencia, vigencia, integridad, compatibilidad y esquema GeoJSON. Flujo DOM: sin carga automática, fuente previsualizada y confirmada, búsqueda simulada local, guardado sin modificar activos previos, cifrado/recuperación del plan y recarga sin feed en memoria. Pruebas del colector: fuentes fijas, hash, conservación de copia/fecha y ausencia de datos inventados cuando falla la descarga. Verificación puntual con ZIP reales de KTMB y Johor Bahru.

## Fuentes y pendientes

- https://developer.data.gov.my/realtime-api/gtfs-static.en
- https://gtfs.org/documentation/schedule/reference/

Pendientes: expansión de catálogos mundiales precargados; frecuencias y transporte a demanda; conexiones entre plataformas con caminata verificada; varios feeds/días/transbordos; tarifas y accesibilidad; integración de retrasos/cancelaciones GTFS-RT; planificación aérea/marítima sin feed compatible, carga y restricciones especializadas; vigilancia privada con la página cerrada y siguientes fases. La recolección pública diaria no equivale a vigilancia periódica del expediente.

## Continuación Fase 5D

La misma página admite reglas de transbordo por ruta/viaje y conexiones entre plataformas con mínimo explícito GTFS, además de un ejemplo sintético local. Se conservan los planes anteriores. Ver [FASE5D.md](FASE5D.md) para alcance, prioridades y límites; las restricciones originales de Fase 5C sobre reglas específicas se sustituyen por ese alcance.
