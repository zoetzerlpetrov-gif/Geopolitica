# Sistema de gestión de seguridad de la información (SGSI) · DOMINUS OSINT

**Estado: BORRADOR para aprobar.** Cuando la persona responsable lo apruebe, anota abajo la fecha y su nombre. Después cambia a «cumple» los controles manuales correspondientes en `config/autoauditoria.json` (iso_4_3, iso_5_2, nist_gv, bc_8_2).

Referencias: ISO/IEC 27001:2022 (cláusulas 4 a 10), ISO 22301:2019 (8.2), NIST CSF 2.0 (función «Gobernar»).

---

## 1. Alcance (ISO 27001, cláusula 4.3)

| Incluido | Qué es |
|---|---|
| Sitio público | Páginas y datos abiertos publicados en GitHub Pages (zoetzerlpetrov-gif.github.io/Geopolitica) |
| Versión comercial | Workers de Cloudflare, la base D1 de cuentas y planes, el inicio de sesión con Google y Apple, y el cobro con Mercado Pago |
| Procesos automáticos | Los flujos de GitHub Actions que recolectan, procesan y publican datos (ingesta, datos en movimiento, capas, economía, normativa, noticiero en video, autoauditoría) |
| Código y secretos | Repositorio de GitHub, GitHub Secrets y los secretos de los Workers |
| Proveedores | GitHub, Cloudflare, Mercado Pago, Google y Apple (identidad), proveedor de facturación, fuentes de datos con llave |
| Personas | La persona responsable (administración) y quien ella autorice por escrito |

| Excluido | Motivo |
|---|---|
| Computadoras personales de clientes | Fuera del control del proyecto |
| Portafolio de inversión (repositorio aparte) | Tiene su propio alcance; solo se consume su reporte público |

## 2. Política de seguridad de la información (cláusula 5.2)

**Objetivo.** Que el servicio publique información correcta y disponible, que los datos de quienes pagan estén protegidos y que ninguna llave o acceso quede expuesto.

**Compromisos:**

1. Ninguna llave, contraseña o token en el código; solo en GitHub Secrets o en los secretos de Cloudflare.
2. Segundo factor obligatorio en GitHub, Cloudflare, Mercado Pago, Google, Apple y en el correo de administración.
3. Todo cambio entra por PR con pruebas automáticas; nada se publica directo a `main`.
4. Mínimo de datos personales: solo los necesarios para dar acceso y cobrar (ver privacidad.html).
5. Respetar los términos de uso y las licencias de cada fuente; las fuentes que no permiten uso comercial no entran en la versión de pago.
6. Revisar esta política una vez al año o tras un incidente grave.

**Medición.** La autoauditoría semanal (estado.html → Autoauditoría) y la revisión trimestral (sección 6).

## 3. Roles y responsabilidades (cláusula 5.3)

| Rol | Quién | Responsabilidades |
|---|---|---|
| Responsable del SGSI y de datos personales | La persona dueña del proyecto | Aprobar políticas, decidir riesgos aceptados, atender derechos ARCO, avisar a afectados en un incidente |
| Desarrollo y operación | La persona dueña, con apoyo de asistentes de IA bajo su supervisión | Cambios por PR, pruebas, corrección de fallas, revisión diaria de procesos |
| Proveedores | GitHub, Cloudflare, Mercado Pago | Seguridad de su infraestructura según sus contratos |

## 4. Evaluación de riesgos del propio proyecto (cláusula 6.1.2)

Método: matriz 5 × 5 (probabilidad × impacto), la misma de DOMINUS OPS. Riesgo = P × I; alto ≥ 15, medio 8–14, bajo ≤ 7.

| # | Riesgo | P | I | Nivel | Tratamiento |
|---|---|---|---|---|---|
| R1 | Fuga de una llave de API en un commit | 2 | 4 | 8 medio | Secretos fuera del código, revisión automática de secretos, plan de incidentes |
| R2 | Toma de la cuenta de GitHub o Cloudflare | 2 | 5 | 10 medio | Segundo factor, llaves de seguridad, revisión del registro de seguridad |
| R3 | Una fuente cambia o cae y el sitio deja de actualizar | 4 | 3 | 12 medio | Revisión diaria automática (estado.html), fuentes alternas, datos anteriores conservados |
| R4 | Uso comercial de una fuente que no lo permite | 3 | 4 | 12 medio | config/comercial_licencias.json; no vender hasta resolver las pendientes |
| R5 | Vulneración de datos de clientes | 1 | 5 | 5 bajo | Mínimo de datos, cookies seguras, CSP, plan de incidentes |
| R6 | Se agotan las cuotas gratuitas (GitHub Actions, Cloudflare) | 2 | 3 | 6 bajo | Repositorio de datos público (minutos sin costo), caché, límites por plan |
| R7 | Dependencia vulnerable | 3 | 3 | 9 medio | Dependabot, CodeQL, versiones fijadas |
| R8 | Información errónea publicada como cierta | 3 | 4 | 12 medio | Etiquetas «verificar», fuente y fecha en cada dato, aviso de alcance |

Repetir cada trimestre y guardar la versión con fecha.

## 5. Análisis de impacto al negocio (ISO 22301, 8.2)

| Servicio | Crítico | RTO (tiempo máximo sin servicio) | RPO (pérdida de datos aceptable) | Cómo se recupera |
|---|---|---|---|---|
| Acceso de clientes de pago (Worker + D1) | Sí | 4 h | 24 h | Redesplegar el Worker desde GitHub; restaurar D1 con Time Travel de Cloudflare (hasta 30 días en el plan de pago, 7 en el gratuito) |
| Sitio público y mapa | Sí | 8 h | 0 (todo se regenera) | Volver a correr «Publicar» en GitHub Actions |
| Datos en movimiento y eventos | Medio | 24 h | 1 día | Relanzar los flujos; se conservan los últimos datos buenos |
| Noticiero en video | No | 48 h | 1 día | Relanzar el flujo |
| Normativa y bitácora | Medio | 72 h | 0 (rama que solo crece) | La rama datos-normativa conserva todo el historial |

## 6. Revisión por la dirección (cláusula 9.3)

Cada trimestre (enero, abril, julio, octubre), media hora:

1. Puntaje de la autoauditoría y su tendencia.
2. Incidentes del trimestre (`docs/incidentes/`).
3. Riesgos de la sección 4: ¿cambió algo?
4. Fuentes con licencia pendiente.
5. Decisiones y responsables, con fecha.

Guardar el acta en `docs/revisiones/AAAA-TT.md`.

## 7. Declaración de aplicabilidad (cláusula 6.1.3)

La autoauditoría ya evalúa los controles del Anexo A que aplican a un proyecto web sin oficinas ni equipo físico propio. Los controles físicos (A.7.1 a A.7.14) **no aplican**: no hay instalaciones propias y la infraestructura es de los proveedores. La lista completa con justificación se genera en `estado.html` → Autoauditoría.

---

**Aprobación**

| Fecha | Nombre | Firma o confirmación |
|---|---|---|
| | | |
