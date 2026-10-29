# Fase 1: mesa del analista y calidad de información

Alcance exclusivo: F004, F017, F027, F091, F097, F002, F003, F008, F010 y F087 de la auditoría funcional.

Abrir **Secciones → Mesa del analista · Fase 1** en el mapa, o `analista.html` directamente. También hay acceso desde Caja del analista. No necesita WebGL, registro, clave o backend.

| ID | Entrega |
|---|---|
| F002 | Requerimientos PIR/IR/EEI: pregunta, responsable, plazo, criterio y estado. Para activar, los campos de planificación son obligatorios. |
| F003 | Fuentes vinculadas a requerimientos, territorios, idiomas, periodos, frecuencia y vacíos. Resumen de preguntas sin fuente planificada. Planificación no significa cobertura real asegurada. |
| F004 | Ficha de evento separa confianza de clasificación de corroboración, revisión humana y derechos. Dos medios no se presentan como confirmación independiente. |
| F008 | Nota ejecutiva, alerta y SITREP editables con juicio, hechos, fuentes/fechas, confianza, alternativas, implicaciones y acciones. Para aprobar se requieren fuentes, juicio, confianza y revisor. Exportación Markdown. |
| F010 | Registro de resultado esperado/observado, evidencia y mejora, vinculado al requerimiento. |
| F017 | Fichas de eventos, entidades generales y cámaras distinguen aproximaciones de precisión no documentada. Ausencia de bandera aproximada no acredita exactitud. No cambia geometrías ni cálculos de otras funciones. |
| F027 | Trenes muestran antigüedad de observación y descarga separadas; SEPTA no fabrica fecha de posición. La caché antigua de SEPTA se interpreta como edad desconocida. Se rechazan fechas futuras fuera de tolerancia de dos minutos. No aumenta la frecuencia de ingestión. |
| F087 | Briefing/relevo con novedades, pendientes, decisiones, faltantes, acciones y recepción. Para cerrar se requiere receptor y confirmación. No envía mensajes. |
| F091 | Inventario inicial de derechos por modalidad pública/comercial/privada: fuentes críticas documentadas, cámaras configuradas y RSS. Fuentes sin evaluación quedan en revisión. No habilita ni aplica un modo comercial global. SOURCES.md continúa como referencia de las otras integraciones. |
| F097 | Accesos por tarea, formularios, búsqueda por sección, estado de trabajo y navegación accesible. |

## Almacenamiento y exportación

Los registros usan exclusivamente la clave local `dominus_fase1_v1`. No se modifican cuadernos, preferencias o registros de otras herramientas. No son expedientes multiusuario ni un almacén apto para información confidencial. El estado aprobado y el revisor son declaraciones locales, no firmas autenticadas.

Guardar es explícito. Los cambios no guardados se advierten al navegar. Si el navegador impide persistir, no se informa éxito ni se reemplaza el estado en memoria. Exportar JSON respalda todos los registros guardados; Markdown exporta un producto o registro individual. Importar requiere confirmación, valida formato, campos, referencias y estados y reemplaza solo los datos de Fase 1. Máximo 4 MB y 1.000 registros por colección; se rechaza el exceso, no se eliminan registros automáticamente.

## Comprobación

1. Crear PIR, asignar fuente en Cobertura y comprobar el contador.
2. Crear SITREP vinculado; probar aprobación incompleta (rechazada) y con revisor/fuentes/confianza (permitida).
3. Crear lección y relevo; el cierre sin recepción debe ser rechazado.
4. Recargar y verificar persistencia; editar, buscar y exportar Markdown/JSON.
5. Importar respaldo válido y uno inválido; el inválido no debe modificar datos existentes.
6. Revisar derechos comerciales de C2IntelFeeds y fuentes sin licencia evaluada; no deben presentarse como autorizadas.
7. Revisar fichas existentes y posiciones sin hora, antiguas o futuras.

Las pruebas de lógica de extremo a extremo local están en `tests/js/fase1_mesa.test.mjs`; contratos temporales en `tests/test_fase1_calidad.py`. No se implementan funciones de fases 2–8.
