# Política de seguridad de la información

SGSI-02 · Versión 2 · Preparado: 2026-11-22 · BORRADOR PENDIENTE DE APROBACIÓN. Dueño: titular del proyecto. Revisión anual propuesta: 2027-11-22 y tras incidentes o cambios relevantes. Referencias: ISO/IEC 27001:2022, 5.2 y 5.3; NIST CSF 2.0, GV.PO y GV.RR.

## Compromisos

Proteger confidencialidad, integridad y disponibilidad de los activos del alcance; cumplir obligaciones aplicables, contratos y licencias; tratar datos con una finalidad legítima; y mejorar continuamente el SGSI mediante riesgos, pruebas, incidentes y decisiones documentadas.

## Objetivos medibles propuestos

| Medida | Fuente, dueño y frecuencia | Umbral y acción |
|---|---|---|
| Cambios con pruebas aprobadas / cambios publicados | CI y bitácora; administración técnica; por entrega | 100%; bloquear fallo o registrar excepción autorizada con caducidad |
| Cuentas administrativas con MFA verificado / cuentas inventariadas | Evidencia privada del proveedor; titular; trimestral | 100%; restringir cuenta no verificada y priorizar MFA resistente a phishing |
| Riesgos altos con dueño y tratamiento / riesgos altos identificados | Registro de riesgos; titular; mensual | 100%; escalar faltantes y evitar aceptación tácita |
| Solicitudes ARCO atendidas en plazo / solicitudes exigibles del periodo | Folios privados; responsable de datos; semanal | 100%; sin solicitudes se informa sin casos, no 100% por defecto; escalar vencimientos |
| Ensayos de recuperación registrados | Acta y BIA; administración técnica; trimestral | Al menos uno; abrir acción si no logra RTO/RPO |

Son objetivos para aprobación, no resultados ya medidos ni SLA ofrecidos a clientes. El titular revisará recursos y viabilidad antes de aprobarlos.

## Reglas

- Secretos sólo en almacenes de GitHub/Cloudflare, mínimo privilegio y rotación tras exposición o cambio de custodio. No tokens en código ni bitácoras públicas.
- MFA para cuentas administrativas de GitHub, Cloudflare, Google, correo, pagos y Supabase cuando aplique; recuperación privada. Registrar verificación, no presumirla.
- Cambios trazables, pruebas y revisión proporcional al riesgo. La separación por registro en un proyecto unipersonal no sustituye revisión independiente cuando sea necesaria.
- Datos mínimos y permisos por necesidad; acceso a datos restringidos validado en servidor. Expedientes, solicitudes ARCO, firmas y documentos de identidad fuera del repositorio público.
- Respetar licencias, robots.txt, límites y términos de fuentes. No presentar una fuente o dato como verificado si no lo está.
- Equipos administrativos actualizados, con cifrado y bloqueo automático; evidencia de configuración privada.
- Responder a incidentes con docs/INCIDENTES.md: preservar evidencia, contener, recuperar y corregir la causa. Una diferencia de hash requiere investigar y no prueba por sí sola una intrusión.
- Revisar proveedores, respaldos y recuperación. No asumir retención por el nombre de un producto o su plan gratuito.
- Revisar trimestralmente el avance y comunicar cambios a las personas con responsabilidades. La autoauditoría automática no sustituye auditoría interna ni revisión de dirección.

## Roles y autoridad

| Rol | Responsabilidad y decisiones | Registro |
|---|---|---|
| Titular / dirección | Aprobar política y recursos, designar roles, aceptar riesgos residuales y revisar el SGSI | Aprobación y actas; suplente por designar en privado |
| Administración técnica | Nube, repositorio, accesos, publicaciones, monitoreo, respaldo y corrección de incidentes | CI, commits, bitácoras y ensayos; escalar al titular |
| Responsable de datos | Tramitar ARCO, verificar identidad proporcionalmente, coordinar búsqueda y responder | Folios privados; escalar vencimientos o incidentes |
| Colaboradores y asistentes supervisados | Acceder sólo a lo autorizado y reportar incidentes; no firmar ni aceptar riesgo por el titular | Instrucciones, revisiones y baja de accesos |
| Proveedores | Obligaciones según contrato; el proyecto conserva las de su configuración y tratamiento | Contratos, condiciones y evaluación |

Los tres primeros roles pueden recaer en una persona. Eso no es segregación independiente. Designación nominal, suplencia y comunicación quedan pendientes de confirmación y registro privado.

## Aprobación y comunicación

| Documento | Autoridad | Fecha | Evidencia |
|---|---|---|---|
| SGSI-02 v2 | Pendiente de aprobación del titular | Pendiente | Pendiente |

Registrar una firma electrónica o confirmación verificable que identifique versión, decisión, autoridad y fecha en config/sgsi_gobierno.json; conservar soporte privado. No es necesario publicar firma manuscrita. Después comunicar y registrar destinatarios. La existencia de este documento no constituye aprobación ni comunicación.
