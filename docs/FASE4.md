# Fase 4A · Expedientes web

Entrada: fase4.html. Funciona desde el navegador, sin servidor privado ni programas adicionales. Reutiliza las definiciones documentales de Fase 1/2; no modifica sus registros de origen.

## Funciones

- Crear y abrir expedientes guardados en IndexedDB del origen y perfil actuales.
- Incorporar Fase 1/2 mediante copia explícita del navegador o respaldo JSON.
- Registrar activos, entidades/eventos y relaciones con fundamento.
- Incorporar originales de hasta 512 KiB, calcular SHA-256 y registrar custodia declarada.
- Buscar títulos y consultar relaciones desde una vista unificada.
- Guardar versiones atómicas con detección de conflictos entre pestañas.
- Exportar versión actual en claro o cifrada con contraseña.
- Abrir respaldos como una copia nueva, comprobando esquema y hashes.

## Ejemplo

Crea «Suministro QA». Añade activo «Terminal QA», evento «Interrupción de prueba» y relación evento → afecta → terminal. Incorpora un TXT ficticio, fecha con zona horaria y custodio declarado. Exporta cifrado y prueba recuperar una copia. No se autentican identidades por escribir un nombre.

## Persistencia y límites

Base dominus_fase4_web_v1; almacenes cases e history. Cada guardado compara versión esperada dentro de la misma transacción de lectura/escritura. Los originales no se reemplazan por edición de formularios; la custodia se añade mediante su acción. Un usuario con control del navegador puede alterar almacenamiento o archivos: no es WORM, control de acceso ni prueba independiente.

Máximo 4 MB por caso, 30 originales, 100 eventos de custodia por original y 500 registros por colección, además de cuotas del navegador. Los originales se guardan codificados y aumentan el tamaño. Cada versión conserva un documento completo. No hay reducción silenciosa de historial: si no hay espacio se rechaza el guardado. Exportar un expediente entrega la versión actual con sus originales/custodia, no todo el historial.

El cifrado AES-GCM protege únicamente el archivo exportado. Datos persistidos en IndexedDB y formularios no se cifran automáticamente. No hay cuentas, roles, MFA, sincronización ni conservación administrada por una institución. No usar como repositorio confidencial de clientes sin controles adicionales del entorno.

## Compatibilidad y retirada del modo anterior

Las exportaciones documentales dominus-case-export-v1 se pueden abrir como copias nuevas después de validar esquema y originales. Actor, custodia y aprobaciones de origen se tratan como declaraciones importadas. Los respaldos completos cifrados del servicio anterior no son este formato y no se abren con el cifrador web. No se conecta ni publica una base anterior automáticamente.

Se retiró la interfaz autohospedada. El sitio no presenta como activas sus cuentas, permisos, claves ni tareas. Alertas privadas, colaboración e IA con documentos privados siguen fuera de esta edición web.

## Continuación: Fase 4B

operaciones.html añade indicadores y alertas observadas, tablero, incidentes, decisiones, tareas, procedimientos y exportaciones documentales. Comparte el expediente y sus respaldos cifrados mediante el campo opcional operations. Guía y pruebas de aceptación: docs/FASE4B.md. No evalúa con la página cerrada.

## Continuación: Fases 4C y 4D

laboratorio.html añade intercambio por archivos con vista previa, documentos y citas verificables, informes, entrevistas cifradas y recetas fijas de Python en el navegador. Alcance, tutorial y pendientes: docs/FASE4CD.md. Comparte los respaldos y versiones de Fase 4A mediante research opcional.
