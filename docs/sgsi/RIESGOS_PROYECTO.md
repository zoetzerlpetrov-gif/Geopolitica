# Evaluación de riesgos del propio proyecto

SGSI-03 · Versión 2 · Evaluación inicial: 2026-11-22 · Dueño: titular del proyecto. Próxima revisión: 2027-02-22 o tras incidente/cambio relevante. Registro reproducible: riesgos-2026-11-22.json. Referencias: ISO/IEC 27001:2022, 6.1.2 y 6.1.3; ISO 31000.

## Método 5×5

Riesgo = probabilidad × impacto. Alto: 15–25; medio: 8–14; bajo: 1–7. La probabilidad es una estimación cualitativa a 12 meses; los valores no son frecuencias observadas ni predicciones estadísticas. El impacto es el mayor efecto creíble sobre confidencialidad, integridad, disponibilidad, privacidad y obligaciones.

| Valor | Probabilidad orientativa | Impacto orientativo |
|---|---|---|
| 1 | Excepcional, necesita varias condiciones poco plausibles | Menor, corrección local sin exposición ni interrupción material |
| 2 | Poco probable, escenario plausible con barreras | Limitado y recuperable, alcance reducido |
| 3 | Posible, existen vectores o dependencias relevantes | Material, afecta servicio, clientes u obligaciones |
| 4 | Probable, exposición recurrente o condición observada | Grave, pérdida importante o afectación de datos/obligaciones |
| 5 | Muy probable o condición activa sin contención | Crítico, toma administrativa, divulgación extensa o recuperación comprometida |

Bajo no implica aceptación automática: una combinación de baja probabilidad y gran impacto puede exigir tratamiento. Ningún riesgo residual se considera aceptado sin evidencia y decisión del titular. Para alto: responsable y plan en 7 días; para medio: plan en 30 días; para bajo: seguimiento trimestral. Los vencimientos son objetivos propuestos, no evidencia de ejecución.

## Registro del propio servicio

| ID | Amenaza | P | I | P×I | Nivel | Dueño | Tratamiento |
|---|---|---|---|---|---|---|---|
| R1 | Robo de la cuenta de GitHub y cambio malicioso del sitio | 2 | 5 | 10 | medio | Titular | 2FA; ruleset de `main`; vigía compara el index publicado con el del repo; CodeQL |
| R2 | Robo de la cuenta de Cloudflare (DNS, Pages, Worker, D1) | 2 | 5 | 10 | medio | Titular | 2FA; tokens separados por uso; alertas de inicio de sesión |
| R3 | Fuga de un secreto (token, llave de API) | 2 | 4 | 8 | medio | Administración técnica | Secretos solo en GitHub Secrets/Worker; autoauditoría busca patrones de llaves; push protection |
| R4 | Exposición de páginas de Admin | 3 | 3 | 9 | medio | Titular | Páginas en `/ops/` tras Cloudflare Access; noindex; vista de pago las niega |
| R5 | Ataque de denegación de servicio | 3 | 3 | 9 | medio | Administración técnica | Cloudflare; modo «Under Attack» automático del vigía |
| R6 | Uso de una fuente sin licencia comercial al vender planes | 3 | 4 | 12 | medio | Titular | config/comercial_licencias.json; la vista de pago oculta esas fuentes |
| R7 | Agotar la cuota de una API y perder datos | 3 | 2 | 6 | bajo | Administración técnica | Admin → Cuotas de APIs con semáforo diario |
| R8 | XSS por texto de una fuente externa | 2 | 4 | 8 | medio | Administración técnica | esc() en las inserciones de HTML; CodeQL; CSP |
| R9 | Pérdida del acceso a datos de clientes (Supabase/D1) | 2 | 4 | 8 | medio | Titular | Comprobar retención según plan contratado de D1; ensayar restauración y exportación cifrada de cartera. |
| R10 | Incumplimiento de derechos ARCO | 2 | 4 | 8 | medio | Responsable de datos | Procedimiento ARCO con correo y plazos |
| R11 | Interrupción de un proveedor (GitHub Actions, Cloudflare) | 2 | 3 | 6 | bajo | Titular | Datos publicados en ramas; reconstrucción documentada (BIA) |
| R12 | Vinculación pública de la identidad del titular | 3 | 3 | 9 | medio | Titular | Dominio propio para el Worker; modo discreto en redes; SAS y oficina virtual (pendiente) |
| R13 | Confundir una transformación legítima del proxy con alteración y pasar por alto un cambio real | 4 | 3 | 12 | medio | Administración técnica | Comparación completa del HTML con excepción exacta versionada de beacon; pruebas de inyección, token, SRI y atributos. |
| R14 | Decidir con un informe de autoauditoría anterior a los controles implantados | 4 | 3 | 12 | medio | Administración técnica | Reevaluar al cambiar documentos o controles; mostrar fecha, commit y revisión; conservar historial. |

Los controles listados son existentes o propuestos para verificar; no se declara 2FA, recuperación, configuración de proveedores o ausencia de vulnerabilidades sin evidencia privada. Se revisan activos del alcance: repositorio/CI, nube/DNS, cuentas, datos de clientes, publicación, licencias y continuidad. La exposición y evaluación residual se completan tras comprobar eficacia.

El registro guarda fecha, responsable, tratamiento, objetivo, evidencia y aceptación pendiente. El titular decide reducir, evitar, transferir o aceptar tras evaluar consecuencias. Registrar decisión y caducidad de excepciones; las acciones y soportes sensibles no se publican.
