# Cumplimiento para ventas en el extranjero

Última revisión: 12 de noviembre de 2026. Documento de trabajo; no sustituye la opinión de un abogado con licencia en
cada país.

## Decisión: opción A

DOMINUS se **dirige** a México y Latinoamérica (precios en pesos, idioma español, publicidad en la región). Como es un
sitio web, alguien de otro país puede contratarlo; para ese caso se dejan listos los avisos y derechos de cada región, y
lo que exige pago o depende de la plataforma en Cloudflare queda **en observación** hasta tenerlo.

## Matriz de aplicabilidad

| Norma o estándar | ¿Aplica? | Qué ya está | Estado |
|---|---|---|---|
| LFPDPPP 2025 (México) | Sí | Aviso integral y simplificado, derechos ARCO, conservación, seguridad | Faltan nombre, domicilio y correo del responsable |
| Ley Federal de Protección al Consumidor (México) | Sí | Términos: precios en pesos, cancelación desde la cuenta sin contactarnos, PROFECO y Concilianet | Listo en texto; aplicar al abrir la venta |
| CFDI 4.0 (SAT) | Sí | Términos: CFDI para clientes de México y RFC genérico para extranjeros | Depende del proveedor de facturación (PAC) |
| RGPD (UE/EEE) y UK GDPR | Solo si alguien de esos países contrata | Privacidad, sección 10: bases jurídicas, derechos, transferencias, autoridad | Observación: representante (art. 27) |
| Directiva 2011/83/UE (desistimiento de 14 días) | Consumidores de la UE | Términos, sección 11: consentimiento para empezar de inmediato | Observación: casilla en el pago (Cloudflare) |
| Reglamento UE de IA | Si hay usuarios en la UE | Etiqueta «Generado con IA» en notas, reportes y video; sin decisiones automatizadas; Conducta y escritura solo para administración | Ver «Gobierno de IA de DOMINUS» |
| Leyes estatales de privacidad de EUA (CCPA/CPRA y similares) | Muy probablemente no (umbrales de ingresos o de volumen de datos) | Privacidad, sección 10: categorías, no venta, Global Privacy Control, derechos | Revisar si se superan los umbrales |
| Sanciones (OFAC, ONU, UE) | Sí | Términos, sección 2: no se vende a países o personas sancionados | Observación: bloqueo por país en el pago |
| LGPD (Brasil), Ley 25.326 (Argentina), Ley 1581 (Colombia), Ley 19.628 (Chile), Ley 29733 (Perú) | Sí (región objetivo) | Privacidad, sección 10: derechos y autoridades | Observación: encargado de datos (DPO) para LGPD si deja de aplicar la exención de agentes pequeños |
| Licencias de datos abiertos (ODbL, Copernicus, CC BY) | Sí | Atribuciones en la página y en SOURCES.md | Listo |
| WCAG 2.2 AA (accesibilidad) | Buena práctica (la Ley Europea de Accesibilidad exime a microempresas) | Compromiso en Términos, sección 12 | Observación: auditoría de accesibilidad |
| ISO/IEC 27001 / 42001, SOC 2 | Voluntarias | Borrador del SGSI (docs/SGSI.md) | Observación: certificación (con costo) |

## En observación (se activa al tener presupuesto o Cloudflare)

| Pendiente | Por qué | Cuándo |
|---|---|---|
| Representante en la UE y en el Reino Unido (RGPD art. 27 / UK GDPR art. 27) | Obligatorio si se ofrece el servicio de forma dirigida en esos territorios | Antes de promocionar allá (servicio de pago) |
| Contratos de tratamiento de datos y cláusulas tipo con Cloudflare, Google y Mercado Pago | Transferencias internacionales | Al crear las cuentas de producción |
| Bloqueo por país en el cobro (sanciones) | Evitar ventas a países sancionados | Al configurar Mercado Pago / Cloudflare |
| Casilla de consentimiento para empezar el servicio en la UE | Pérdida del derecho de desistimiento | En la página de pago |
| IVA de servicios digitales en la UE (ventanilla OSS) e impuestos de otros países | Ventas B2C a consumidores extranjeros | Si las ventas al extranjero dejan de ser ocasionales |
| Impuesto sobre ventas de servicios digitales en estados de EUA | Solo al superar umbrales de cada estado | Revisión anual |
| Auditoría de accesibilidad (WCAG 2.2 AA) | Calidad y mercados que la exigen | Con presupuesto |
| Prueba de penetración externa y certificaciones (ISO/IEC 27001, 42001) | Clientes corporativos | Con presupuesto |

## Gobierno de IA de DOMINUS (inventario propio)

| Sistema | Qué hace | Riesgo (Reglamento UE de IA) | Controles |
|---|---|---|---|
| Resúmenes de noticias y panorama (Qwen3-4B local) | Redacta resúmenes propios y escenarios | Limitado (transparencia, art. 50) | Etiqueta «Generado con IA», enlace a la fuente, validaciones (no copia el título, sin enlaces, longitud), tope de tiempo |
| Brújula Diaria (Qwen3-4B + voz Kokoro) | Noticiero en video con voz sintética | Limitado (art. 50) | Declarado como contenido sintético en YouTube; aviso de IA en la descripción; no inventar cargos ni cifras (regla en la instrucción); revisión de muestras |
| Chat con IA del cliente | Conversación con un modelo externo con la llave del cliente | Limitado (art. 50.1) | El proveedor es tercero; aviso de que se conversa con una IA |
| Conducta y escritura (lenguaje corporal, grafología, grafoscopía) | Análisis de imágenes y escritura | Podría ser reconocimiento de emociones o categorización biométrica (alto riesgo; prohibido en trabajo y escuelas) | Solo administración; no se ofrece a clientes; nunca para decisiones sobre personas |

Marcos de referencia: ISO/IEC 42001 (sistema de gestión de IA), ISO/IEC 23894 (riesgos de IA), ISO/IEC 42005
(evaluación de impacto), NIST AI RMF 1.0 y su perfil de IA generativa (NIST AI 600-1), OWASP Top 10 para LLM.
La auditoría «Gobierno de la inteligencia artificial» de la Caja del analista (config/auditorias.json, áreas comunes)
sirve tanto para clientes como para revisar a DOMINUS mismo.
