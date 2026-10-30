# Continuación web: IA generativa y colaboración opcional

## IA en laboratorio.html

La pestaña IA ejecuta Qwen2.5-0.5B-Instruct (ONNX, q4) con Transformers.js 3.8.1 y WebAssembly, dentro de un worker. No necesita cuenta, clave ni GPU WebGPU. La primera ejecución descarga motor y pesos externos; requiere conexión y puede consumir cientos de MB de transferencia y más de 1 GB de memoria. No es adecuada para todos los teléfonos. El worker se termina al cancelar, cambiar de expediente, salir de la página o tras diez minutos. El navegador puede conservar los pesos en su caché.

Modelo: onnx-community/Qwen2.5-0.5B-Instruct. Revisión fijada: 22942cb7d7ba4cc81bb4673549ca4d4614469b5e. Proveedores de descarga: jsDelivr y Hugging Face/CDN de archivos. La aplicación no llama a una API de inferencia ni les envía preguntas o fragmentos; sí reciben las peticiones de descarga y metadatos de conexión. Es código de terceros: esta descripción del flujo no garantiza protección frente a un proveedor o dependencia comprometidos.

Flujo: recuperar fragmentos por términos, seleccionar de uno a tres, indicar pregunta, aceptar descarga, generar, comparar y corregir afirmaciones y citas, registrar revisor y guardar explícitamente. El modelo recibe como datos solo pregunta y los fragmentos seleccionados (hasta 500 unidades UTF-16 cada uno). No recibe entrevistas ni originales binarios; un texto pegado en Documentos sí puede ser seleccionado. No tiene herramientas, acceso a cuentas o facultad de ejecutar acciones.

El resultado puede contener errores aun con referencias existentes. Se comprueba que tenga al menos una referencia [n] y que todos sus números existan en el contexto. No se comprueba automáticamente que cada afirmación esté sustentada. Un resultado sin citas o con números inexistentes se muestra pero no se admite como informe revisado. La revisión es una declaración del usuario, no su identidad autenticada.

Los informes nuevos pueden incluir generation con modelo, revisión, motor, huellas de prompt/respuesta, revisor declarado y fecha. Los casos anteriores sin generation siguen siendo válidos. Se conserva además la salida original del modelo y su huella, separadas del análisis revisado. Se comprueban ambas huellas al recuperar el respaldo. Estos metadatos no son una atestación independiente de ejecución. Los informes se guardan en claro en el navegador y siguen formando parte de los respaldos de Fase 4A.

## Colaboración en colaboracion.html

El módulo está desactivado hasta proporcionar un proyecto propio. No crea proyectos, habilita planes, inicia sesiones ni sube datos por sí solo. Necesita URL Supabase y publishable key (o anon pública antigua); rechaza claves secret/service_role y dominios fuera de *.supabase.co. No guarda configuración, código OTP ni sesión en localStorage. El SDK conserva la sesión solo en memoria y no procesa credenciales desde URL. La app retira su sesión a los 30 minutos; Supabase también aplica la caducidad de sus tokens. Recargar exige acceso nuevo.

Pasos completos en el propio sitio: crear cuenta/proyecto dedicado, ejecutar config/colaboracion.sql desde SQL Editor, configurar Email OTP y usuarios en Auth, copiar Project URL/clave pública y conectar. No se requiere terminal, CLI ni programas locales. El usuario de Auth debe existir previamente; shouldCreateUser=false evita registro automático. El flujo solicita un código al correo que introduce la propia persona y verifica su usuario contra Supabase. No manda invitaciones ni contraseñas a otros participantes.

El correo predeterminado de Supabase puede limitarse a direcciones del equipo del proyecto. Para destinatarios externos se necesita SMTP configurado en el panel, sujeto a disponibilidad, costos y cuotas del proveedor. El plan gratuito no implica servicio de correo ilimitado ni disponibilidad continua. No se asume que el proyecto esté operativo sin probarlo.

### Roles y conservación

- Propietario: crea la copia, publica versiones y añade, cambia o revoca miembros.
- Editor: lee copias cifradas y publica nuevas versiones, sin administrar miembros.
- Lector: lee copias cifradas e historial; no publica ni administra permisos.
- Usuario ajeno y anónimo: no pueden leer expedientes ni revisiones. Anónimo tampoco puede invocar las funciones protegidas.

El SQL habilita RLS en dominus_cases, dominus_members y dominus_revisions. No concede escritura directa a authenticated; las funciones de escritura comprueban auth.uid() y permisos, tienen search_path vacío y privilegios acotados. No modifica objetos de otras aplicaciones. Repetir el SQL es idempotente para este esquema. No sustituye una revisión de seguridad del proyecto ni las políticas de otras tablas que ya existan.

Una publicación cifra en el navegador un paquete de expediente completo con la utilidad existente (AES-GCM/PBKDF2). La contraseña no se envía. Alias, UUID, fechas, versión y motivos son metadatos visibles. Las entrevistas conservan además su propio cifrado. La base almacena la copia cifrada y su revisión en una sola transacción. El guardado requiere la versión esperada; un conflicto no sobrescribe la versión nueva ni crea revisión fantasma. No hay firmas jurídicas ni almacenamiento WORM; el administrador de base conserva privilegios.

La descarga descifra y valida esquema, originales y huellas, y crea una copia local nueva. No reemplaza ni fusiona expedientes. Los contadores de nube y navegador son independientes. El usuario edita la copia en las fases existentes y publica otra instantánea cuando corresponda. No es edición simultánea ni sincronización continua.

La revocación bloquea consultas y publicaciones futuras, no elimina copias descargadas ni cambia contraseñas conocidas. El rol se aplica al expediente completo, no a entrevistas individuales. El historial de nube muestra las últimas 50 revisiones; la lista de expedientes muestra hasta 100 recientes accesibles. Las cuotas y los respaldos del servicio deben administrarse desde su panel.

### Validación y límites de esta entrega

- Pruebas de interfaz cubren preparación desconectada, copia cifrada, recuperación como caso nuevo y limpieza de contraseñas, usando un adaptador de prueba sin correos ni datos externos.
- Un PostgreSQL real en WebAssembly (PGlite) ejecuta el SQL y comprueba propietario/editor/lector, aislamiento de otro usuario, denegación anónima, revocación, protección del historial y conflictos/rollback atómicos. No es un simulador de políticas.
- Esto no equivale a probar el SMTP, proyecto Supabase, caducidad ni configuración reales del propietario: no hay proyecto ni credenciales configurados en esta entrega. La activación y una prueba completa de dos usuarios reales quedan pendientes de ese registro/configuración.
- Jira/ServiceNow y otras integraciones autenticadas externas, autorización individual de entrevistas, vigilancia privada con el sitio cerrado y tareas de servidor siguen fuera del alcance implementado. No se introducen claves secretas en el frontend para simularlas.

## Referencias primarias

- https://huggingface.co/docs/transformers.js/v3.8.1/pipelines
- https://huggingface.co/docs/transformers.js/guides/dtypes
- https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/reference/javascript/initializing
- https://supabase.com/docs/reference/javascript/auth-signinwithotp
- https://supabase.com/docs/reference/javascript/auth-verifyotp
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/pricing
