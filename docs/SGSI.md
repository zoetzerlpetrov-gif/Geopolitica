# SGSI de DOMINUS OSINT

Revisión documental: 2026-11-22. Dueño: titular del proyecto. Mantenimiento: administración técnica. Documentación de trabajo, no certificación.

Los documentos vigentes se consultan en Centro de control → Autoauditoría → Documentos del SGSI. Los originales versionados son:

| Documento | Finalidad | Estado |
|---|---|---|
| ALCANCE.md | Límites, activos, proveedores, personas y partes interesadas | Documentado y revisado |
| POLITICA_SEGURIDAD.md | Objetivos, reglas, responsabilidades y revisión anual | Borrador pendiente de aprobación del titular |
| RIESGOS_PROYECTO.md | Método 5×5 y evaluación del propio proyecto | Evaluación inicial fechada, no aceptación de riesgos residuales |
| riesgos-2026-11-22.json | Registro estructurado con probabilidad, impacto, responsable y tratamiento | Estimaciones documentadas, pendientes de validación del titular |
| ARCO.md | Canal, requisitos, plazos, búsqueda, respuesta y cierre | Canal confirmado por el titular el 2026-11-22; ensayo documentado pendiente |
| BIA.md | Impacto, objetivos RTO/RPO y recuperación | Los objetivos requieren ensayo de recuperación |
| SOA.md | Declaración de aplicabilidad | Aplicabilidad no equivale a eficacia comprobada |

Los archivos están en docs/sgsi/. La aprobación se registra en config/sgsi_gobierno.json. Nunca se simula una firma ni se publica un documento de identidad, firma manuscrita o solicitud ARCO. Puede conservarse una confirmación verificable o firma electrónica en un repositorio privado, identificando documento, versión, decisión, fecha y autoridad.

La autoauditoría se actualiza semanalmente y cuando cambian sus documentos o controles. El informe indica commit y revisión de configuración. Cumple = 1, parcial = 0.5, no cumple = 0; sin evaluar y no aplica se excluyen del denominador y se muestran por separado. El porcentaje mide esta lista de controles: no mide la probabilidad de estar protegido ni un porcentaje de certificación ISO.

Usar nube no excluye automáticamente los controles físicos: se revisan equipos de administración, proveedores, respaldos y accesos. Las afirmaciones de la SoA necesitan evidencia de diseño y operación. La revisión automática no sustituye una auditoría interna ni la revisión de la dirección.
