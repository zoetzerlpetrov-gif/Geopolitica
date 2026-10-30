# Fase 5A · Áreas de interés, exposición y movilidad

Entrada fase5.html, desde Secciones y las páginas de fases. Se conserva el mapa principal y los módulos previos. Parte del main 6938e69: conserva economía, publicación de cámaras y cambios de procesos incorporados después de Fase 4.

## Alcance

- Dibujar polígonos y corredores por clics sobre MapLibre, o pegar geometrías GeoJSON. Cartografía de países Natural Earth ya alojada en el sitio; no se solicitan mapas externos ni se envían geometrías al consultar fuentes. Sin WebGL siguen funcionando el formulario GeoJSON y las tablas.
- Polígonos de un anillo cerrado simple, con límites incluidos; sin huecos, cruces ni contactos de lados no adyacentes. Corredores de LineString con radio 0.1–200 km. Distancia esférica de radio terrestre 6371.0088 km y distancia transversal al segmento de círculo máximo, acotada a sus extremos. No es cálculo de ruta transitable ni navegación.
- Restricciones explícitas: hasta 200 vértices, latitudes ±85°, sin extensión longitudinal >=180° ni cruces del antimeridiano; cada segmento de corredor <=3000 km. El mapa muestra línea central de corredor, no franja de radio a escala. El análisis de polígonos usa lados lineales en lon/lat; su representación proyectada es orientativa. No mide áreas catastrales.
- Fuente pública de eventos del sitio, posiciones ferroviarias y un GeoJSON propio de puntos. Descarga/apertura y vista previa separadas del guardado. Solo solicita URLs fijas del origen, nunca añade AOI ni coordenadas privadas a consultas. Las filas inválidas, ejemplos, IDs repetidos o geometrías no puntuales se omiten con conteo; rechaza feed público de ejemplo, archivos >5 MB o entradas >20 000 filas. Hasta 6000 puntos válidos combinados; rechaza exceso sin recorte oculto.
- Fechas de observación y de generación/descarga separadas. No inventa observación para puntos sin fecha; las fechas de texto deben incluir zona. En la copia de Irish Rail no se usa como observación el timestamp generado por el adaptador al consultar, ya que no procede de una observación publicada por operador. No modifica su adaptador anterior ni el mapa principal.
- Las precisiones «declarada», «aproximada» y «no documentada» son metadatos, no exactitud comprobada. Las ubicaciones inciertas aparecen entre coincidencias del área, pero se excluyen de exposición de activos salvo selección explícita. Un centroide de país dentro de una zona no prueba un hecho ocurrido allí.
- Georreferencias privadas a nodos existentes del expediente, con incertidumbre y fundamento. No se geocodifican nombres/direcciones. Exposición posible por proximidad de puntos coincidentes a registros georreferenciados (radio elegido + incertidumbre declarada). Cero incertidumbre es una declaración. No confirma afectación, causa ni interrupción.
- Recorre relaciones «A depende de B» en sentido inverso desde los registros próximos para sugerir dependientes posibles, sin duplicar ciclos. Las relaciones son las declaradas en Fase 4A, no una topología inferida o verificada.
- Instantáneas revisadas con copia de geometría, filtros, fuentes/huellas, fechas, puntos, exclusiones, exposición y dependencias. Huella del informe para verificar alteraciones al recuperar. No es atestación independiente. Comparación de IDs entre muestras de igual geometría, fuentes y filtros espaciales; los intervalos de tiempo quedan visibles y pueden ser distintos. No reconstruye trayectorias ni demuestra inicio/fin de eventos.
- Exportación explícita de áreas GeoJSON y reportes JSON/CSV en claro, con neutralización de fórmulas comunes en CSV. Respaldo cifrado completo desde Fase 4A. Crear señal desde un informe requiere juicio/severidad/confianza humanos; guarda señal manual en Fase 4B sin evaluar reglas ni crear incidente. Un informe no genera señales duplicadas.

## Persistencia

Campo opcional spatial, versión 1, dentro del mismo expediente IndexedDB. Admite los casos anteriores sin el campo y se incluye en respaldos y copias cifradas de colaboración. Se validan referencias, geometrías, límites, hashes de puntos e informes y versión esperada al guardar.

Límites: 30 geometrías, 500 georreferencias, tres copias de fuente, 6000 puntos combinados, 20 informes de hasta 300 coincidencias, además del máximo global de 4 MB. Si el dato no cabe, no se borra ni trunca historial automáticamente. Las copias de fuentes se reemplazan por ID solo tras vista previa y confirmación. Las versiones anteriores del expediente conservan estados anteriores; el respaldo estándar de Fase 4A sigue exportando la versión actual, no todo el historial.

El contenido se guarda en claro en el perfil del navegador; el cifrado protege las exportaciones o paquetes de nube y las entrevistas que ya se cifran individualmente. No es repositorio confidencial administrado por una institución.

## Trenes añadidos

Se amplía el adaptador tools/transporte/trenes.py y las capas existentes de Trenes sin sustituir las cinco redes anteriores:

- Renfe Cercanías, España: https://gtfsrt.renfe.com/vehicle_positions.json. GTFS-RT JSON, licencia CC BY 4.0. No abarca toda la red española ni se presenta como cobertura AVE/LD.
- KTMB, Malasia: https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb. GTFS-RT Protobuf, licencia CC BY 4.0. No abarca todas las redes del país ni todos los servicios de bus/metro.

Sin registro ni clave en las consultas realizadas. Se usa la hora del vehículo, nunca la del encabezado como sustituto; omite observaciones de más de 30 minutos o futuras >2 minutos, coordenadas inválidas y duplicados; rechaza feeds diferenciales. La velocidad se convierte de m/s a km/h solo si existe y es plausible. KTMB requiere el paquete Python del proceso de nube, añadido al workflow, sin instalaciones del usuario.

El sitio mantiene su cadencia existente de publicación (~20 minutos, con retrasos posibles de GitHub); no imita la frecuencia de 20/30 segundos del proveedor. El fallback anterior por fuente se conserva. Un fallo no convierte una posición antigua en reciente. En las capas principales se sigue mostrando la edad de posición y consulta. La disponibilidad de operadores y la cobertura fluctúan.

Fuentes primarias: https://data.renfe.com/dataset/ubicacion-vehiculos y https://developer.data.gov.my/realtime-api/gtfs-realtime.en.

## Tutorial y aceptación

El tutorial de uso está dentro de fase5.html. Prueba sintética: polígono [-100,19]–[-99,20], punto [-99.5,19.5] con fecha reciente y precision=declarada, activo Terminal en el mismo punto y Cliente depende de Terminal. Se esperan una coincidencia, una exposición geométrica y un dependiente posible. Cambiar precisión a no documentada debe excluir exposición salvo inclusión explícita. Exportar/recuperar el respaldo debe conservar áreas, puntos, informe y señal.

Pruebas: geometrías/bordes/negativas, distancias de corredor y extremos, calidad/fechas, ciclos de dependencias, comparación compatible, integridad, CSV, proveedores GTFS-RT y flujo DOM/IndexedDB completo. La consulta de proveedores en vivo es evidencia de disponibilidad puntual, no garantía de continuidad.

## Pendientes del resto de Fase 5

Vigilancia privada 24/7, rutas multimodales, corredores alternativos calculados sobre redes reales, horarios y planificación GTFS completa, expansión de redes que requieren registro, logística/carga y análisis energético especializado. Supabase preparado en la fase anterior no activa automáticamente vigilancia o tareas periódicas. Esta entrega es Fase 5A, no toda la Fase 5 ni las fases 6–8.

## Continuación Fase 5B

La misma página incorpora rutas web de automóvil, bicicleta y caminata con consulta explícita, alternativas, copia revisada y conversión a corredor. El plano SVG permite dibujar también sin WebGL. Detalles y límites: [FASE5B.md](FASE5B.md). Los otros modos y la vigilancia privada 24/7 siguen pendientes.
