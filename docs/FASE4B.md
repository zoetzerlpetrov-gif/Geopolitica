# Fase 4B · Indicadores, tablero y coordinación web

Acceso: operaciones.html, desde Secciones, el Centro de trabajo y Fase 4A. No modifica mapas, cámaras ni fuentes anteriores. Funciona en navegador, sin preparación del equipo ni servicios de pago.

## Datos y continuidad

Comparte IndexedDB y expedientes de Fase 4A. Añade el campo opcional operations/version1, conservando documentos, originales, relaciones y versiones anteriores. Los respaldos cifrados de Fase 4A incluyen la operación actual. Las copias antiguas sin operations siguen admitidas.

La autorización, responsable, declarante y aprobación son documentales, no identidades autenticadas. El almacenamiento del navegador no se cifra automáticamente. No hay trabajo compartido ni evaluación privada con la página cerrada. La evaluación periódica opcional revisa señales ya guardadas cada cinco minutos cuando la página está visible y sin formularios pendientes. Cambiar expediente la detiene. La persistencia se reinicia tras pausas mayores de seis minutos; no prueba continuidad entre observaciones.

## Recorrido de prueba

1. Crear un expediente sintético en Fase 4A y seleccionarlo en Fase 4B.
2. En Señales registrar dos observaciones recientes con «energía», país MEX, severidad 4 y confianza declarada 0.8.
3. Crear regla sobre señales manuales, responsable Operaciones, palabras «energía», país MEX, severidad mínima 3, confianza mínima 0.5, umbral 2, ventana 24 horas y persistencia 0.
4. Evaluar: debe aparecer un incidente. Repetir sin datos nuevos: no debe duplicarse.
5. Añadir plantillas en Procedimientos y aplicar la de verificación al incidente: crea tres tareas. Volver a aplicarla se rechaza.
6. Intentar cerrar con tareas abiertas: se rechaza. Completar la tarea con aprobación requerida sin registrarla también se rechaza.
7. Registrar aprobación declarada, completar tareas y documentar cierre con motivo. El tablero reduce el conteo de abiertos.
8. Evaluar la misma condición cerrada: no crea otro incidente idéntico. Una señal nueva o un reinicio observado de la condición permite un episodio posterior.
9. Exportar tickets CSV/JSON por acción explícita. No se envía información a plataformas externas.
10. Abrir Fase 4A y probar exportación cifrada y recuperación como copia nueva; operations se conserva con el resto del documento.

## Señales y fuentes

Las señales manuales requieren fecha no futura, título, severidad 1–5 y confianza 0–1. Las referencias opcionales deben existir en el expediente y las URL externas deben ser HTTPS sin credenciales.

La incorporación del feed público usa data/events.json por acción explícita. Rechaza modo ejemplo y generación de más de 24 horas o futura más de cinco minutos. Omite eventos de ejemplo, futuros, mayores de siete días, IDs incompatibles o metadatos inválidos. Conserva máximo 1000 señales por expediente. Reimportar no duplica ni actualiza silenciosamente señales existentes. La confianza del feed es de clasificación, no una probabilidad de amenaza. Las señales públicas guardadas con copia de más de 24 horas no se utilizan como observación reciente para reglas.

## Reglas y duplicados

Hasta 100 reglas. Cada una define fuente, palabras combinadas con Y (sin expresiones regulares), país opcional, severidad/confianza mínimas, cantidad de señales distintas, ventana de 1–168 horas, persistencia de 0–60 minutos, responsable, pausa y silencio por una hora. Los incidentes se agrupan por regla: máximo uno abierto por regla, con señales adicionales vinculadas. No se fusionan automáticamente incidentes de reglas distintas.

Las condiciones nuevas requieren observación. La prioridad automática usa la severidad máxima de las señales coincidentes y puede elevarse con señales nuevas; no baja por sí sola. No se cierran incidentes automáticamente cuando baja un conteo. El cierre exige decisión explícita y todas las tareas completadas. Los temporizadores del navegador pueden suspenderse; no hay promesa de vigilancia continua ni SLA.

## Tablero, tareas y procedimientos

Tablero: incidentes abiertos, prioridad alta/crítica, tareas pendientes/vencidas y reglas activas; filtro por prioridad y responsable. Los incidentes admiten alta manual, cambios de estado y decisiones con evidencia referenciada. El historial conserva motivo, fecha del equipo y declarante.

Tareas: responsable, vencimiento, estado, notas y aprobación declarada cuando corresponda. Procedimientos: plantillas o hasta 20 pasos propios, con aprobación indicada por ! al principio de la línea. Aplicar un procedimiento copia sus pasos como tareas y evita la aplicación repetida al mismo incidente. No ejecuta comandos, escaneos, cambios en sistemas industriales/firewall/EDR ni comunicaciones.

Exportación: tickets CSV con protección frente a fórmulas comunes y JSON documental. Son archivos en claro. No se conectan cuentas de Jira/ServiceNow ni se envían correos. Los respaldos cifrados se hacen desde Fase 4A.

Límites adicionales: 200 incidentes, 500 tareas, 1000 decisiones y 30 procedimientos por expediente, siempre sujetos al máximo total de 4 MB y espacio del navegador. El máximo no es un objetivo de cobertura; si se excede, la transacción se rechaza sin truncar registros.

## Pendientes de fases posteriores

Fases 4C/4D: laboratorio.html incorpora intercambio documental, búsqueda literal con citas, entrevistas cifradas y recetas Python web (docs/FASE4CD.md). La continuación añade IA generativa en navegador y colaboración opcional con Supabase, pendiente de activar el proyecto propio (docs/IA_Y_COLABORACION_WEB.md). Integraciones externas autenticadas, entrevistas compartimentadas individualmente por roles y las fases 5–8 siguen pendientes. Se prioriza que cada control visible corresponda a una función web disponible.
