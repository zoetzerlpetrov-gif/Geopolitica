# Política de seguridad de la información (ISO/IEC 27001, cláusula 5.2 · NIST CSF GV)

Versión 1 · 2026-11-19 · **Estado: borrador para aprobación.** Aprobada por: ______ · Fecha: ______

## Compromisos
1. Proteger la confidencialidad de los datos de clientes y de la administración, la integridad del sitio publicado y su disponibilidad.
2. Cumplir la LFPDPPP (DOF 20-03-2025), los términos de servicio y licencias de cada fuente, y los contratos con clientes.
3. Mejorar de forma continua: autoauditoría semanal automática, revisión trimestral por la dirección y corrección de hallazgos.

## Reglas
- **Secretos:** nunca en el código; solo en GitHub Secrets o en los secretos del Worker. Tokens de mínimo privilegio y con caducidad cuando el servicio lo permite.
- **Cuentas:** segundo factor en GitHub, Cloudflare, Google, Supabase, Mercado Pago y el correo; llave física cuando el servicio lo admita.
- **Cambios:** todo cambio entra por PR con pruebas y CodeQL en verde; la rama `main` no se puede borrar ni reescribir (ruleset).
- **Datos personales:** se recaba lo mínimo (correo o ID de cuenta para planes); de noticias solo título, enlace, medio y fecha.
- **Fuentes:** se respetan robots.txt, límites de uso y términos; una fuente bloqueada se omite.
- **Incidentes:** el vigía abre un aviso «🛡️ Vigía»; se atiende según docs/SEGURIDAD.md y se registra lo aprendido.
- **Dispositivos:** equipo con cifrado de disco, bloqueo automático y actualizaciones al día.

## Roles (ISO 27001 cláusula 5.3)
| Rol | Responsabilidades |
|---|---|
| Titular del proyecto (dirección) | Aprueba esta política, revisa el SGSI cada trimestre, decide riesgos y presupuesto |
| Administración técnica | Opera GitHub, Cloudflare y Supabase; atiende alertas del vigía y de CodeQL; mantiene secretos |
| Responsable de datos personales | Atiende solicitudes ARCO (docs/sgsi/ARCO.md) y actualiza el aviso de privacidad |

En un proyecto de una persona, los tres roles recaen en el titular; la separación se mantiene por registro (PR, bitácora, actas).
