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
- Greenbone XML sin compresión: `report/results/result`, host, puerto, NVT OID, nombre, severidad y descripción. Se rechazan DTD/entidades; no admite contenedores base64 ni PDF.
- OWASP ZAP JSON tradicional: `site[].alerts[].instances[]`, una fila por URI/alerta.
- SARIF 2.1.0: `runs[].results[]`; una fila por ubicación (URI y línea), admite resultado sin ubicación. No ejecuta reglas ni scripts del informe.

Deduplica herramienta+activo+regla+título; reimportar no cambia estados. Cerrar como resuelto/falso positivo exige revalidación/justificación. La edición conserva el original en historial. Severidad original no equivale a criticidad empresarial. No hay escaneo desde la web.

## F052: observación local de TLS/cabeceras

Con Python 3.10+ y autorización del servicio:

```sh
python tools/fase2/inspeccionar.py https://tu-dominio.example --autorizado --salida servicio.json
```

Importar `servicio.json` en TLS y cabeceras, revisar formulario y guardar. Hace una conexión HTTPS con validación de cadena y hostname del equipo, una petición HEAD, timeout 10 s. No sigue redirecciones, no enumera puertos ni obtiene cuerpos. Conserva protocolo/cifrado, emisor, expiración y cabeceras seleccionadas. No guarda cookies. Certificado inválido causa error sin desactivar verificación. 405 o cabeceras ausentes son resultados parciales, no prueba de vulnerabilidad. No inspecciona todas las versiones TLS ofrecidas ni la cadena completa. `Server`/`X-Powered-By` son declaraciones, no detección concluyente de tecnología.

## F043: archivos y C2PA

En navegador: SHA-256 hasta 100 MB, sin subir el original. Para informe local:

```sh
python tools/fase2/multimedia.py archivo.jpg --salida multimedia.json
# Opcional: anclas PEM seleccionadas por el operador
python tools/fase2/multimedia.py archivo.jpg --anclas confianza.pem --salida multimedia.json
```

SHA-256 siempre; `exiftool` y `c2patool` opcionales deben instalarse desde sus distribuidores oficiales. El script no los instala, no firma ni modifica el archivo. Sin herramienta queda explícito `no instalado`; con error/timeout queda error. C2PA se verifica mediante c2patool, no con búsqueda de cadenas. Revisar `validation_status`, confianza, versión de herramienta y anclas; éxito del proceso no acredita escena real. Reportes de terceros son declaraciones importadas, no verificación repetida por el navegador. stdout limitado a 8000 caracteres por herramienta, stderr 1500: el informe puede ser parcial. Conservar también el informe original completo para evaluación pericial. Metadatos pueden contener ubicación o datos privados: revisarlos antes de compartir. Ausencia de metadatos o credenciales no demuestra IA, engaño ni autenticidad. ELA existente no se cambia.

## Registro y APIs

- La aplicación documental, hashes, importadores y observación local no necesitan cuentas ni tokens.
- Consulta GLEIF pública integrada: petición explícita, máximo 20 candidatos, timeout 15 s, sin credenciales. Red/CORS/cuotas pueden impedirla; permanece entrada manual. No hace scraping ni solicitudes periódicas.
- Espacenet: enlace de consulta; EPO OPS requiere registro/credenciales para una integración automatizada futura, no se incluye llave ni se promete monitorización.
- Listas SAT, contratos, sanciones y estados de patentes: evidencia aportada/documentada, sin cobertura universal ni alertas automáticas.
- Almacenamiento compartido/privado, APIs con secretos y tareas periódicas requieren backend y gestión de acceso de fases posteriores. No se modifica infraestructura existente para simular estas capacidades.

## Referencias primarias de formatos y herramientas

- Nmap XML: https://nmap.org/book/output-formats-xml-output.html
- Greenbone GMP: https://docs.greenbone.net/API/GMP/gmp-22.6.html
- ZAP JSON: https://www.zaproxy.org/docs/desktop/addons/report-generation/report-traditional-json/
- SARIF 2.1.0: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
- c2patool: https://opensource.contentauthenticity.org/docs/c2patool/docs/usage/
- ExifTool: https://exiftool.org/
- GLEIF: https://www.gleif.org/en/lei-data/gleif-api/
- EPO: https://www.epo.org/en/service-support/ordering/fair-use

## Verificación

`node --test 'tests/js/*.test.mjs'`, `python -m pytest -q`, `python ingest/validate.py`, `python ingest/validate_entities.py`. Pruebas de observadores usan dobles sin red: validan autorización, URL, TLS estricto por defecto, HEAD único sin redirecciones, exclusión de cookies, hash y ausencia/error de herramientas. La disponibilidad de cada servicio externo no puede garantizarse con estas pruebas.
