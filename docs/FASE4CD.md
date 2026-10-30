# Fases 4C y 4D · Laboratorio web

Entrada: laboratorio.html. Accesible desde Secciones y las páginas de fases. Comparte el expediente IndexedDB de Fase 4A y el campo opcional research, versión 1. No cambia el mapa, las cámaras ni las fuentes existentes.

## Fase 4C disponible

- Intercambio de señales por CSV o JSON dominus-signals-v1, sin integración autenticada. Plantillas descargables. Vista previa de todas las filas y confirmación separada antes de guardar.
- Archivo máximo 500 KB, 1–200 filas. Una fila incompatible rechaza el archivo completo. Fechas con zona horaria, no futuras; severidad entera 1–5, confianza 0–1, país ISO3 o vacío y URL HTTPS sin credenciales o vacía. Códigos ISO3 se validan por forma, no por un catálogo de países.
- ID derivado del contenido normalizado de cada señal. Reimportaciones idénticas se omiten; cambios de contenido son observaciones distintas. La operación añade señales manuales a Fase 4B sin evaluar reglas. El historial anota cantidad y SHA-256 del archivo. No importa tickets de Jira o ServiceNow.
- Documentos de consulta: TXT UTF-8 o texto pegado, título y procedencia declarada. Hasta 50 documentos de 20 000 caracteres; TXT máximo 80 KB. No se ejecuta HTML ni contenido cargado. No se abre PDF/DOCX/URL externa.
- Búsqueda literal por todos los términos de un fragmento, sin distinguir mayúsculas ni acentos. Bloques de hasta 500 unidades UTF-16 dentro de cada línea; hasta 30 resultados. Una frase que atraviesa el límite de bloque puede no coincidir. La pestaña Consultas no es búsqueda semántica, IA ni comprobación de hechos. La pestaña IA ofrece generación opcional (docs/IA_Y_COLABORACION_WEB.md).
- Informes con pregunta, análisis humano y 1–10 citas exactas. Cada cita registra documento, huella, posición UTF-16 y texto; el validador comprueba coincidencia con el contenido almacenado. Hasta 100 informes. Exportación TXT/JSON en claro solo de documentos e informes; no incluye entrevistas ni operación. El JSON de informe es de entrega, no un respaldo reimportable; para recuperar se usa el respaldo de Fase 4A.

## Fase 4D disponible

- Entrevistas con alias, propósito, consentimiento/fundamento declarado y notas. Se cifran con la utilidad Web Crypto existente: AES-256-GCM, PBKDF2-SHA256 con 600 000 iteraciones, sal de 16 bytes e IV de 12 bytes aleatorios por registro.
- Solo ID, fecha y paquete cifrado persisten en el expediente e historial; no se guarda contraseña. Hasta 30 registros, cada paquete con máximo 100 000 bytes de contenido cifrado. Las entrevistas son registros independientes sin edición. La fecha visible puede revelar cuándo se creó un registro.
- Descifrado temporal por contraseña, bloqueo explícito, al ocultar la pestaña, cambiar sección/expediente o tras tres minutos. Retirar texto de pantalla no garantiza borrado de memoria ni defensa frente a extensiones/capturas/acceso al dispositivo. El almacenamiento es del perfil del navegador: no hay roles, cuentas ni compartimentación autenticada. Cifrar no verifica identidad, consentimiento o fundamento jurídico.
- Python en un worker de módulo mediante Pyodide 314.0.7, descargado desde jsDelivr solo por acción de ejecución. Sin instalar programas, registro, clave ni paquetes adicionales. Requiere navegador compatible con WebAssembly, conexión y memoria disponible. El proveedor de descarga recibe petición y metadatos de conexión; la aplicación no envía entradas al proveedor. No equivale a una garantía frente a código de terceros comprometido.
- Dos recetas fijas: frecuencia de severidad y frecuencia de país. Entrada mínima de hasta 1000 señales existentes, solo severity/country. Incluye registros antiguos y no estima riesgo ni cobertura global. No se ejecuta código del usuario ni se construye código interpolando los datos. No se leen entrevistas/documentos en el worker.
- Cancelar termina el worker; límite de tres minutos para carga/ejecución. El resultado queda en memoria hasta confirmación de guardado. Hasta 30 ejecuciones, entrada y código exactos, versión de motor, resultado, hashes de entrada/código y fecha. La reproducción usa la entrada guardada y compara el texto de resultado. Una bitácora importada no prueba por sí misma que se haya ejecutado; los hashes no son una firma o atestación independiente.

## Conservación y compatibilidad

Todo cabe dentro del máximo general de 4 MB por expediente y las cuotas del navegador. Los respaldos completos de Fase 4A incluyen research y siguen aceptando casos antiguos sin el campo. Al recuperar respaldos se comprueban huellas de documentos, entradas y recetas, además de los originales previos. Los documentos, informes y resultados persisten en claro; las entrevistas persisten cifradas incluso dentro de un respaldo sin cifrar. Conservar contraseñas fuera del expediente: no se recuperan.

No hay llamadas automáticas a servicios de IA, servicios de entrevistas, redes sociales, correo o tickets; no hay vigilancia cerrada ni sincronización. La IA generativa está disponible como opción en navegador. La colaboración autenticada por copias cifradas requiere activar un proyecto propio desde colaboracion.html. Integraciones externas autenticadas y compartimentación individual de entrevistas siguen pendientes. Se distinguen de las funciones disponibles en la propia página.

## Prueba de aceptación

1. Crear expediente sintético en Fase 4A. Abrir Laboratorio.
2. Descargar plantilla, usar datos de prueba, previsualizar: no cambia versión. Confirmar: suma señales y una versión. Reimportar: cero señales nuevas. Archivo con una fila errónea: cero guardados.
3. Incorporar «Energía y suministro sintético.» como documento QA. Buscar «energia suministro». Seleccionar una cita y redactar pregunta/análisis. Guardar y comprobar fuente, posiciones y huella en Informes.
4. Crear entrevista ficticia con contraseña de prueba. Verificar que las notas no aparecen en exportación en claro del expediente; solo paquete cifrado. Contraseña incorrecta: falla; correcta: lectura. Bloquear: desaparece de pantalla.
5. Ejecutar receta severidad. Verificar total igual a señales guardadas. Guardar y repetir sobre entrada guardada: coincidencia. Cancelar no crea bitácora.
6. Exportar respaldo completo cifrado desde Fase 4A y recuperar copia. Comprobar documento/informe/entrevista/bitácora. El texto de entrevista solo se lee con su propia contraseña.

Referencias primarias: https://pyodide.org/en/stable/usage/webworker.html y https://pyodide.org/en/stable/usage/quickstart.html (consultadas para versión 314.0.7).
