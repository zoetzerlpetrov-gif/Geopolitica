# Fase 2 · Análisis y expedientes

Entrada: `fase2.html`, enlazada desde `analista.html`. Alcance F005, F007, F043, F029, F031, F032, F033, F041, F049, F052. No modifica mapa, cámaras, capas, ingestas, transporte, planes ni herramientas previas.

## Uso y persistencia

1. Crear preguntas en la Mesa de Fase 1 y abrir Fase 2 en el mismo origen/navegador. Solo se lee `dominus_fase1_v1`; no se escribe.
2. Registrar hipótesis y evidencias: mismo código de evidencia para valorar un documento contra alternativas. Comparar por requerimiento. La suma de contradicciones ponderadas (pesos ordinales 1–3) NO es una probabilidad ni selección automática. Evidencia no valorada se muestra como faltante. Separar preguntas distintas con requerimientos distintos; el grupo sin vínculo es solo un borrador común.
3. Empresas: registrar jurisdicción, fuente y fecha, RFC/LEI/registro si existen. Consultar candidatos de GLEIF con botón explícito; revisar antes de guardar. No hay fusión por nombre. RFC/LEI solo validan formato, no autenticidad ni existencia. Fuente GLEIF no garantiza identificar beneficiario final.
4. Vincular contratos/licitaciones/sanciones, patentes y diligencias a empresas. La concentración usa solo contratos locales por contratante y moneda, sin conversión ni filtro de fechas. Los identificadores repetidos son señales de revisión. Comparar contratos del mismo periodo para una evaluación válida.
5. Patentes: número de publicación, familia, titular, CPC, jurisdicción, estado documentado y fecha. Documentación manual, sin vigilancia automática ni consulta EPO OPS integrada.
6. Diligencia: estados SAT separados; revisar fuentes documentales antes del dictamen. Revisada requiere dictamen, fuente, fecha, responsable y revisor. No descarga ni verifica listas SAT/sanciones automáticamente.
7. Teléfonos: normalización sintáctica E.164 (+ y 7–15 dígitos); no valida asignación, actividad, titular ni ubicación. País/operador se documentan con fuente, sin inferirlos del formato ni ignorar portabilidad.
8. Exportar JSON y Markdown. Ediciones exigen motivo y conservan anteriores campos. El historial es local y editable mediante respaldo: no es una bitácora antifraude. Dependencias impiden borrar entidades referenciadas. Máximo 100 revisiones por registro, 1000 registros por colección, 12000 caracteres por campo, 4 MB por respaldo/almacenamiento serializado. Una restauración reemplaza SOLO Fase 2 tras confirmación; no fusiona ni trunca.

Datos bajo `dominus_fase2_v1`. No hay backend, cifrado propio, usuarios, sincronización, ejecución continua ni aprobación autenticada. No introducir datos confidenciales en el sitio público. Al fallar lectura se bloquea guardar y se permite exportar el original para recuperarlo. Fallo de cuota no muestra éxito ni borra datos anteriores.

## F049: importación autorizada

En Hallazgos: documentar activos/fecha/referencia de autorización; seleccionar informe hasta 4 MB:
- Nmap XML `nmaprun`, puertos `state=open`: registra exposición **informativa**, no vulnerabilidad confirmada.
- Greenbone XML sin compresión: `report/results/result`, host, puerto, NVT OID, nombre, severidad y descripción. Solo se permite la declaración vacía `<!DOCTYPE nmaprun>` de Nmap; se rechazan DTD externos, subconjuntos y entidades; no admite contenedores base64 ni PDF.
- OWASP ZAP JSON tradicional: `site[].alerts[].instances[]`, una fila por URI/alerta.
- SARIF 2.1.0: `runs[].results[]`; una fila por ubicación (URI y línea), admite resultado sin ubicación. No ejecuta reglas ni scripts del informe.

Deduplica herramienta+activo+regla+título; reimportar no cambia estados. Cerrar como resuelto/falso positivo exige revalidación/justificación. La edición conserva el original en historial. Severidad original no equivale a criticidad empresarial. No hay escaneo desde la web.

## Cabeceras documentadas y multimedia en web

Cabeceras y TLS documentado analiza texto aportado, hasta 64 000 caracteres. Omite Cookie, Set-Cookie, Authorization y Proxy-Authorization. Indica presencia de cabeceras conocidas únicamente dentro del texto; no consulta la URL, no valida certificados ni deduce vulnerabilidades por ausencias parciales. Las tecnologías Server/X-Powered-By son declaraciones.

Procedencia multimedia calcula SHA-256 hasta 100 MB mediante Web Crypto, sin subir el original. Los informes JSON aportados se registran sin repetir su verificación. Esta edición no verifica firmas C2PA. Ausencia de metadatos no prueba engaño, y una firma reportada no acredita una escena.

## Registro y APIs

- La aplicación documental, hashes, importadores y análisis de texto no necesitan cuentas ni tokens.
- Consulta GLEIF pública integrada: petición explícita, máximo 20 candidatos, timeout 15 s, sin credenciales. Red/CORS/cuotas pueden impedirla; permanece entrada manual. No hace scraping ni solicitudes periódicas.
- Espacenet: enlace de consulta; EPO OPS requiere registro/credenciales para una integración automatizada futura, no se incluye llave ni se promete monitorización.
- Listas SAT, contratos, sanciones y estados de patentes: evidencia aportada/documentada, sin cobertura universal ni alertas automáticas.
- Almacenamiento compartido/privado, APIs con secretos y tareas periódicas requieren backend y gestión de acceso de fases posteriores. No se modifica infraestructura existente para simular estas capacidades.


## Entorno web

No hay pasos de preparación del equipo. Tutorial y cifrador: plataforma.html. Expedientes unificados: fase4.html. Las claves de almacenamiento existentes se conservan; esta migración no borra registros de Fase 1/2.
