# Evaluación de riesgos del propio proyecto (ISO/IEC 27001 6.1.2 · ISO 31000)

Método: probabilidad (1–5) × impacto (1–5); riesgo alto ≥ 15, medio 8–14, bajo ≤ 7. Revisión trimestral o tras un incidente.

| # | Riesgo | P | I | Nivel | Tratamiento y control vigente | Dueño |
|---|---|---|---|---|---|---|
| R1 | Robo de la cuenta de GitHub y cambio malicioso del sitio | 2 | 5 | Medio (10) | 2FA; ruleset de `main`; vigía compara el index publicado con el del repo; CodeQL | Titular |
| R2 | Robo de la cuenta de Cloudflare (DNS, Pages, Worker, D1) | 2 | 5 | Medio (10) | 2FA; tokens separados por uso; alertas de inicio de sesión | Titular |
| R3 | Fuga de un secreto (token, llave de API) | 2 | 4 | Medio (8) | Secretos solo en GitHub Secrets/Worker; autoauditoría busca patrones de llaves; push protection | Administración técnica |
| R4 | Exposición de páginas de Admin | 3 | 3 | Medio (9) | Páginas en `/ops/` tras Cloudflare Access; noindex; vista de pago las niega | Titular |
| R5 | Ataque de denegación de servicio | 3 | 3 | Medio (9) | Cloudflare; modo «Under Attack» automático del vigía | Administración técnica |
| R6 | Uso de una fuente sin licencia comercial al vender planes | 3 | 4 | Medio (12) | config/comercial_licencias.json; la vista de pago oculta esas fuentes | Titular |
| R7 | Agotar la cuota de una API y perder datos | 3 | 2 | Bajo (6) | Admin → Cuotas de APIs con semáforo diario | Administración técnica |
| R8 | XSS por texto de una fuente externa | 2 | 4 | Medio (8) | esc() en las inserciones de HTML; CodeQL; CSP | Administración técnica |
| R9 | Pérdida del acceso a datos de clientes (Supabase/D1) | 2 | 4 | Medio (8) | D1 Time Travel (30 días); respaldo exportable de la cartera | Titular |
| R10 | Incumplimiento de derechos ARCO | 2 | 4 | Medio (8) | Procedimiento ARCO con correo y plazos | Responsable de datos |
| R11 | Interrupción de un proveedor (GitHub Actions, Cloudflare) | 2 | 3 | Bajo (6) | Datos publicados en ramas; reconstrucción documentada (BIA) | Titular |
| R12 | Vinculación pública de la identidad del titular | 3 | 3 | Medio (9) | Dominio propio para el Worker; modo discreto en redes; SAS y oficina virtual (pendiente) | Titular |
