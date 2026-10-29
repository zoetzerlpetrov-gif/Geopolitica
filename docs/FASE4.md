# Fase 4A · Expedientes unificados, activos y evidencia

Primera entrega de la Fase 4. Requiere el backend privado de Fase 3 actualizado. No crea otra base ni duplica los expedientes. Las entregas siguientes (alertas/tablero/playbooks; integraciones/IA; entrevistas/Python) no se declaran implementadas aquí.

## Acceso y ejemplo

1. Inicia sesión privada, selecciona organización y expediente.
2. Abre **Fase 4A · Expediente unificado, activos y evidencia**.
3. En Activos crea «Terminal de prueba»: tipo instalación, responsable «Operaciones», identificador interno «TERM-QA-01», ubicación declarada y criticidad. No se consultan ni escanean las IP registradas.
4. En Entidades y eventos crea «Interrupción de suministro de prueba», tipo evento y fuente documental.
5. En Relaciones elige evento → afecta → terminal y documenta el fundamento. Puedes vincular también registros existentes de Fase 1/2 y originales incorporados, sin copiar sus campos. Referencias inexistentes, relaciones duplicadas o consigo mismas se rechazan.
6. En Vista unificada busca títulos, observa identificadores y relaciones. Las relaciones son declaraciones del analista, no atribuciones automáticas.
7. En Originales y custodia incorpora un archivo sintético, fuente/método de obtención, fecha con zona horaria, custodio y motivo. Ejemplo de fecha: 2026-10-29T10:00:00-06:00. El servidor calcula SHA-256, registra actor y recepción, crea una versión y un evento de auditoría.
8. Descarga el original por acción explícita. Se verifica la huella y se audita; se entrega como archivo adjunto binario. Trátalo según su origen, la aplicación no lo analiza con antivirus.
9. Registra una transferencia declarada, custodio y motivo. No concede acceso a ese custodio ni prueba que aceptó la recepción. Los permisos se administran por separado.
10. Consulta historial de expediente y verifica que otra cuenta solo accede si tiene autorización vigente. El original sigue sujeto a conservación y papelera del caso.

## Integridad, protección y límites

El documento del caso incorpora fase4/version1 con entidades, activos, relaciones y originales. Se cifra en el mismo sobre AES-GCM que F1/F2 y se versiona en revisiones. No hay cambio de tablas: backup/restauración/rotación/retención existentes incluyen esta información. Los originales no se aceptan por importación ni edición genérica: solo por recepción dedicada. Los eventos de custodia solo se añaden por su acción autenticada; no se pueden cambiar/borrar por edición documental.

Límite de original: 512 KiB; máximo 30 originales por caso, sujeto al máximo global de 4 MB documentales incluyendo base64 y metadatos. La representación base64 aumenta el espacio aproximadamente un tercio. Cada versión conserva el documento completo; no usar como repositorio de videos o imágenes de disco. Para evidencia grande hace falta una siguiente entrega de almacenamiento de objetos, cuotas, retención y backup probados, no un enlace a una URL pública arbitraria.

Originales pequeños se conservan dentro del documento cifrado y las revisiones, no en rutas ejecutables ni carpetas públicas. No se descomprimen, previsualizan ni ejecutan; no hay descarga desde URL, antivirus, WORM ni sello de tiempo de tercero. La fecha de adquisición y custodio son declaraciones; recepción y actor son registrados por el servidor y dependen de su reloj. SHA-256 no confirma veracidad, autoría ni admisibilidad legal. El administrador con claves/base mantiene capacidades sobre el sistema; el HMAC no sustituye custodia independiente.

Las exportaciones documentales en claro incluyen fase4 y originales codificados; no pegarlas en servicios públicos. Importar originales exportados a otro caso por edición documental se rechaza para no inventar recepción autenticada. Usa respaldo cifrado completo para recuperación íntegra; vuelve a incorporar de manera explícita si se inicia otro expediente.

La autorización es por caso: no hay compartimentos diferentes por evidencia en esta entrega. No incorporar identidades HUMINT que requieran permisos separados. Registrar una IP no autoriza tareas técnicas.

## Pruebas

Checks de backend incluyen relaciones con F1/F2, rechazo de referencias huérfanas, conservación de originales por todas las rutas de escritura, custodia incremental autenticada, descarga idéntica/integridad, aislamiento por cliente/ACL/revocación, conflicto de versión, límites, cifrado en base, backup/restore, rotación de claves y purga del caso. La aceptación Docker comprueba también carga/descarga del original y persistencia tras reiniciar API.
