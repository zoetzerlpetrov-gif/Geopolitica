# Inicio de sesión con Google para los planes

Los clientes entran en `/cuenta/` con su cuenta de Google. El Worker solo pide `openid email` (permisos básicos: Google no exige verificación especial para ellos) y busca el plan por el **correo verificado** en la tabla `dominus_memberships_email` de D1 (se crea sola la primera vez).

## 1. Cliente de Google (una vez)
1. Google Cloud → Google Auth Platform → **Clientes** → «Crear cliente» → tipo **Aplicación web**, nombre «DOMINUS planes».
2. **URI de redireccionamiento autorizados**: `https://<dirección del Worker>/cuenta/google/callback` (hoy `https://geopolitica.zoetzerl-petrov.workers.dev/cuenta/google/callback`; si el Worker pasa a `admin.dominusosint.com`, agrega también esa).
3. Copia el ID de cliente y el secreto (no los pegues en ningún chat).

## 2. Secretos del Worker
Cloudflare → Workers y Pages → `geopolitica` → Configuración → **Variables y secretos** → «Agregar» → tipo **Secreto**:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

## 3. Dar un plan (o una cortesía) por correo
Cloudflare → D1 → `dominusosint-planes` → **Consola**:

```sql
INSERT INTO dominus_memberships_email (email, plan, expires_at) VALUES ('cliente@ejemplo.com', 'command', unixepoch() + 2592000);
```
(30 días; sin vencimiento: quita `, expires_at` y `, unixepoch() + 2592000`). Retirar: `UPDATE dominus_memberships_email SET active = 0 WHERE email = 'cliente@ejemplo.com';`

Si la tabla aún no existe (nadie ha entrado con Google), créala primero con la sentencia `TABLA_EMAIL` de `cloudflare/planes/google.js`.
