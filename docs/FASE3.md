# Fases 2 y 3 · Plataforma privada y vigilancia gratuita

Esta entrega agrega un backend ejecutable y separado del sitio público. No convierte GitHub Pages en un servidor privado. No modifica mapas, cámaras, transporte, ingestas previas ni planes comerciales. En los tableros y War Room públicos solo añade un aviso sobre la compartición heredada por instantánea, sin alterar sus funciones. La entrada pública es `plataforma.html`; enlaza desde Fase 2. Solo publica metadatos genéricos de salud de fuentes.

## Qué funciona y dónde

| Función | Ejecución | Registro/clave |
|---|---|---|
| Expedientes F1/F2 compartidos, historial y conflictos | Backend privado con base persistente | Cuenta local provisionada, sin SaaS |
| Contratos de Estados Unidos | USAspending, paginación y filtros por periodo/palabras | Sin API key |
| Lista SDN OFAC | Descarga XML oficial, nombres/alias y candidatos documentados | Sin API key |
| SAT 69-B | Copia pública que ya produce este repositorio; RFC exacto y estados originales | Sin API key; se indica antigüedad y corte |
| Publicaciones de patentes europeas | EPS REST: última semana y prefijo de publicación | Sin registro de usuario ni API key |
| Documento europeo conocido | EPS XML y huella del documento | Sin registro ni API key |
| C2PA | SDK oficial local y verificador aislado del backend | Sin registro; anclas adicionales opcionales |
| Programación privada | Worker con base persistente, mientras el equipo esté encendido | Sin servicio de automatización de pago |
| Monitor público de conectores | GitHub Actions, diariamente 04:27 UTC | Usa la cuenta GitHub del proyecto; revisar políticas/cuotas Actions |
| SSO opcional | Proveedor OIDC configurado por el operador | Cliente OIDC e identidad previamente vinculada |
| EPO OPS / SAM.gov / OpenSanctions | Solo bóveda para claves opcionales; no se activan conectores de pago | OPS y SAM requieren registro; OpenSanctions comercial exige condiciones/licencia propias |

EPS no es OPS. EPS permite documentos europeos y listas semanales, no búsqueda mundial por titular ni estado jurídico consolidado. Ningún conector afirma cobertura mundial completa. La comparación OFAC es por nombres normalizados/alias y produce candidatos, no identidad confirmada. SAT 69-B no es la lista OFAC ni una lista genérica de culpabilidad.

## Inicio gratuito en un equipo propio

Requisitos: Docker Engine con Compose v2 y Python 3 para generar configuración. No se compra infraestructura, no se acepta un contrato externo y no se usa un plan SaaS por defecto. El software no incluye el costo del equipo, electricidad, administración ni conectividad.

Desde la raíz del repositorio:

```sh
python backend/generar_entorno.py
cd backend
docker compose build
docker compose up -d db
docker compose run --rm api python -m dominus.cli init
docker compose run --rm api python -m dominus.cli provision --organization "Mi organización" --username analista --role owner --output /app/backend/private/inicio.json
docker compose up -d api worker backups validator
mkdir -p private
docker compose cp api:/app/backend/private/inicio.json private/inicio.json
```

Abrir **http://127.0.0.1:8000** en ese mismo equipo. El servicio se enlaza a loopback; no queda publicado en Internet por esta configuración. El archivo `private/inicio.json` contiene la contraseña y URI/semilla TOTP: importarla en el autenticador del usuario, custodiar la contraseña y retirar ambas copias de onboarding del servidor/equipo cuando estén bajo custodia segura. En Linux restringir permisos de la copia con `chmod 600 private/inicio.json`. No enviar ese archivo al repositorio ni a una conversación. No hay contraseña ni semilla por defecto.

`backend/.env` se crea con modo 0600 y claves aleatorias distintas. Conservar MASTER_KEY y BACKUP_KEY fuera del servidor: perderlas impide recuperar datos cifrados. No imprimir `docker compose config` sin `--quiet`, ni compartir variables de entorno o volcados de contenedores. `backend/private/` y `.env` están excluidos de Git y de la imagen Docker.

Crear otros usuarios con el mismo comando `provision`, cambiando usuario, organización y rol; cada archivo de salida debe ser nuevo. Los roles son owner, analyst, reviewer y viewer. Si el usuario ya existe, el propietario puede asignarlo a otra organización desde Administración; no se crea una segunda identidad por nombre.

### Acceso desde distintos equipos

La base compartida funciona desde varios clientes del mismo servidor, pero la configuración incluida solo escucha en loopback. Para una red o Internet hay que disponer de un host bajo control del propietario, un nombre DNS y TLS válido. Configurar un proxy HTTPS, establecer PUBLIC_ORIGIN con el origen exacto y ALLOW_LOCAL_HTTP=0, y reiniciar. Solo el proxy debe poder llegar al puerto de API; la base no tiene un puerto publicado. No habilitar CORS ni exponer HTTP de desarrollo para simular colaboración pública. El despliegue público no se realiza automáticamente ni se contrata alojamiento.

No es necesario modificar GitHub Pages para utilizar la interfaz privada: esta se sirve desde el backend. No introducir una URL privada o credenciales en el repositorio público.

## Importar y trabajar con Fase 1 y 2

1. Exportar los respaldos JSON desde las páginas locales actuales.
2. Iniciar sesión privada, elegir organización y crear un expediente.
3. Importar cada respaldo y confirmar la importación. Se crea una versión del expediente, sin escribir el localStorage del sitio público.
4. Elegir fase/sección para crear o editar registros. Fase 2 conserva el motivo e historial documental. El servidor valida esquema y relaciones además de la validación del cliente.
5. Compartir con otro usuario de la organización por 1–7 días. Permisos independientes de lectura, escritura y revisión; revocables inmediatamente. Pertenecer a una organización no da acceso a todos sus expedientes: el propietario de organización sí tiene acceso de administración.
6. El editor guarda con versión esperada. Si alguien guardó antes, devuelve conflicto 409 y conserva el formulario para revisión; no sobrescribe automáticamente.
7. Un revisor autorizado distinto del último editor puede registrar una revisión de esa versión. Los estados “aprobado” que provienen de respaldos locales no son aprobación autenticada. La revisión tampoco certifica hechos ni decisiones institucionales.
8. Las exportaciones individuales de expediente se descargan **en claro**, por acción explícita del usuario. Custodiarlas; no confundirlas con las copias automáticas cifradas.

La búsqueda usa títulos (máximo 200 resultados por consulta). Títulos, nombres de usuario, membresías y metadatos de auditoría se indexan/almacenan en claro en la base; el cuerpo documental, revisiones, criterios de vigilancia, resultados, notas de revisión, semillas TOTP y secretos se cifran con AES-256-GCM y contexto por objeto. El cifrado de disco/volumen completo corresponde al operador. No hay envío automático de datos a motores de IA.

## Vigilancia y fuentes

Seleccionar un expediente, abrir Fuentes y vigilancia, elegir fuente y criterios. La interfaz muestra el host que recibirá la consulta y exige confirmación expresa. USAspending recibe palabras/periodo y EPS documento recibe el identificador público. OFAC, SAT y EPS semanal usan descargas fijas y filtran el criterio en el servidor privado, sin transmitirlo. Nunca se envía el cuerpo completo del expediente. No se admiten URL arbitrarias.

- OFAC: buscar nombre/alias con mínimo 3 caracteres. Revisar identificadores, jurisdicción y documento antes de atribuir una coincidencia. Cobertura solo SDN; no cubre todos los programas, jurisdicciones ni listas.
- USAspending: palabras clave y periodo; por defecto últimos 90 días. Hasta 10 páginas de 100 registros por ejecución. Si hay más, se conserva continuación y periodo para la siguiente ejecución. Un segmento parcial se marca; no se presenta como universo completo. No es un buscador mundial de licitaciones.
- EPS semanal: consulta última fecha disponible, lista publicaciones y filtra por prefijo EP opcional. No consulta Espacenet por scraping. Un nuevo documento no prueba que una patente esté vigente.
- EPS documento: identificador de publicación conocido como `EP1004359NWB1`; se conserva fecha, título, huella y enlace al XML. No descubre todas las familias o beneficiarios.
- SAT: RFC exacto, copia pública existente del proyecto y fecha de generación/corte. Si la copia tiene más de 14 días o fecha futura, se marca antigua; no se infiere ausencia en fuente oficial actual de una copia vieja.

Workers con arrendamiento de 15 minutos evitan procesar a la vez la misma vigilancia en PostgreSQL. Reintentos con espera exponencial, caché de una hora separada por organización, destinos fijos HTTPS, resolución pública con IP fijada y SNI/validación TLS del hostname original, sin proxies de entorno ni redirecciones arbitrarias. Solo OFAC puede seguir una redirección del endpoint SDN al hostname exacto de su almacenamiento publicado, ruta Published terminada en SDN.XML, con IP pública fijada y TLS validado; no se registra su URL firmada. Una caída conserva el último resultado. Se deduplican resultados consecutivos sin cambios; si el estado cambia y luego vuelve, se registra otra transición. La huella ignora la fecha de descarga y el orden de filas.

Cuotas conservadoras compartidas: máximo 60 peticiones/hora por host, 100 MB/7 días para EPS y 512 MB/7 días para los otros hosts. Cada descarga reserva su tamaño máximo y liquida los bytes reales si termina correctamente; errores consumen la reserva conservadora. EPS limita además la transferencia a 120 KiB/s y separa peticiones al menos 2 segundos. Frecuencia mínima: 24 h para OFAC/USAspending/EPS semanal; 7 días para EPS documento y copia SAT. Máximo 50 vigilancias por organización. “Solicitar consulta” no evita las cuotas. No se envían emails ni mensajes.

El monitor de GitHub Actions usa consultas **genéricas**, no vigilancias privadas. Publica únicamente estado, fechas, cobertura y huella en `datos-fase23/estado.json`; Pages la copia a `data/fase23/estado.json`. Un job exitoso puede contener fuentes con error: ver estado individual. La programación puede retrasarse; no equivale a un SLA.

## C2PA: pendiente resuelto sin depender de c2patool

```sh
python -m pip install -r backend/requirements.txt
python tools/fase2/multimedia.py archivo.jpg --salida multimedia.json
# Con anclas adicionales PEM seleccionadas por el operador:
python tools/fase2/multimedia.py archivo.jpg --anclas confianza.pem --salida multimedia.json
```

El script prefiere `c2pa-python`; si no está instalado conserva el fallback de `c2patool`. El SDK está fijado en requirements. No firma ni modifica los originales. La verificación tiene validación criptográfica y confianza activadas; desactiva red, OCSP y búsqueda de manifiestos remotos. Esto limita las conclusiones sobre revocación y credenciales remotas. Anclas de laboratorio no equivalen a una CA institucional.

El backend admite JPEG/PNG/WebP/AVIF/MP4/PDF hasta 4 MB. En Docker envía el archivo por socket Unix a un contenedor verificador con red deshabilitada, sin claves del backend, sin volumen de base/copias, sistema de archivos de solo lectura y temporales limitados. El proceso tiene límites de CPU, memoria y tiempo en Linux; elimina temporales al finalizar y deshabilita la red del SDK. Si el verificador configurado no responde, falla sin ejecutar un fallback dentro de la API. En pruebas/desarrollo sin MEDIA_SOCKET se usa un proceso local con entorno mínimo sin heredar secretos; este modo no sustituye el aislamiento del contenedor de producción. El original no se conserva. El SHA-256 y resultado se devuelven al usuario; no se incorporan como conclusión automática de un expediente. Para archivos mayores usar la herramienta local (hasta 100 MB para SDK), con custodia propia.

Pruebas reales generan un certificado raíz y uno de firma efímeros de laboratorio: verifican una firma, distinguen confianza y detectan alteración de bytes; prueban también archivo sin manifiesto. No se incluyen claves privadas de prueba ni originales de usuarios en el repositorio.

## Copias, recuperación y retención

El contenedor `backups` crea una copia lógica cifrada al iniciar y cada 24 h; conserva siete archivos en el volumen privado. Es una copia local, **no** una copia externa ante pérdida del servidor. Copiarla a un destino independiente bajo control del propietario. La copia usa BACKUP_KEY distinta de MASTER_KEY; el cuerpo sigue cifrado con MASTER_KEY, por lo que ambas claves son necesarias para recuperación íntegra. No copia sesiones activas, intentos de login ni caché transitoria.

Copia manual y recuperación:

```sh
# Desde backend/ con la instalación en marcha:
docker compose exec api python -m dominus.cli backup --file /app/backend/private/manual.dominus
docker compose cp api:/app/backend/private/manual.dominus private/manual.dominus
# En una instalación de recuperación con las claves originales y base VACÍA inicializada:
docker compose cp private/manual.dominus api:/app/backend/private/recuperar.dominus
docker compose exec api python -m dominus.cli restore --file /app/backend/private/recuperar.dominus
```

La restauración rechaza bases no vacías, archivos alterados y claves incorrectas; se realiza en transacción. Las pruebas restauran datos y comprueban descifrado y cadena de auditoría. Probar periódicamente en un host independiente, también con las claves custodiadas, antes de considerar cubierta la recuperación operativa.

Enviar a papelera exige propietario y confirmación del ID; deshabilita vigilancias. Conservación por caso de 1–3650 días tras la papelera, con bloqueo de conservación que impide purga. El worker elimina datos del caso solo cuando vence ese plazo y no hay bloqueo; queda evento de purga sin contenido documental. Las copias antiguas conservan su ciclo de siete archivos y requieren una política propia para archivos externos.

Restaurar de papelera mediante API autenticada `POST /api/orgs/{org}/cases/{id}/restore`; propietario, mismo origen y CSRF. Conserva vigilancias pausadas. No hay endpoint HTTP de borrado inmediato de toda la base.

La auditoría registra actor, acción, objeto y fecha, sin copiar consultas ni secretos. Cadena HMAC por organización con bloqueo transaccional: detecta cambios sin la clave, pero no es WORM ni prueba independiente contra el administrador que controla claves y base. Integrar sellado externo o almacenamiento inmutable si el uso exige esa garantía.

## Recuperar cuentas y rotar claves

```sh
docker compose exec api python -m dominus.cli reset-user --username analista --output /app/backend/private/recuperacion-nueva.json
```

Regenera contraseña y TOTP, revoca sesiones y registra recuperación; verificar identidad del solicitante por el procedimiento del operador antes de ejecutarlo. Entregar el archivo por un canal bajo control del propietario y retirarlo del servidor. No es recuperación anónima ni por correo automático.

Las claves de proveedores se cambian en Administración por el propietario, sin volver a devolver el valor. No usar la bóveda como activación de licencias ni como almacén general de claves privadas. Para rotar MASTER_KEY: detener API/worker/backups, hacer copia recuperable, ejecutar offline `python -m dominus.cli rotate-master` con la clave anterior en MASTER_KEY y la nueva en NEW_MASTER_KEY, actualizar el entorno y reiniciar. Recifra todos los campos protegidos y la cadena HMAC y revoca sesiones. Custodiar las claves antiguas necesarias para copias antiguas; la rotación no recifra retroactivamente archivos externos. La operación requiere mantenimiento; no es rotación sin interrupción ni KMS/HSM administrado.

## SSO opcional

Se admite OIDC Authorization Code mediante Authlib con PKCE y validación de tokens del proveedor. Configurar OIDC_ISSUER HTTPS, OIDC_CLIENT_ID y OIDC_CLIENT_SECRET, callback exacto `https://tu-origen/auth/callback`. Vincular una identidad ya provisionada con `python -m dominus.cli link-sso --username usuario --subject sub-del-proveedor`. No se concede acceso por email, nombre ni claim de organización. El ID token debe declarar amr MFA/OTP/hwk; un proveedor que no lo emita requiere adaptar su configuración, no omitir la comprobación. El acceso local con MFA funciona sin SSO ni registro en terceros.

La prueba real del flujo SSO con un proveedor concreto requiere su cliente y configuración; no se declara validado contra un proveedor no configurado. TLS público, correo transaccional y un proveedor externo no se crean de oficio.

## Verificación y cobertura

- Suite existente Python y JavaScript sin retirar pruebas anteriores.
- `PYTHONPATH=backend python -m pytest backend/checks_backend.py backend/checks_c2pa.py backend/checks_http.py -q` con dependencias del backend más pytest/Pillow.
- Workflow separado con SQLite y PostgreSQL/PostGIS real, construcción de imagen Docker y aceptación del stack efímero completo por HTTP: MFA, persistencia tras reiniciar API y verificador C2PA por socket, sin red ni secretos del backend.
- Flujo HTTP real con Uvicorn: acceso MFA, creación/lectura, CSRF y cierre de sesión. Pruebas de separación de clientes con ID conocido, permisos por caso, expiración/revocación, MFA/replay, CSRF/Host, conflictos de edición, revisión independiente, secretos, auditoría alterada, respaldo/restauración/rotación y conservación.
- Conectores: contratos de formatos, paginación/continuación, cambios y errores, cuotas, destinos fijos, rechazo XXE y antigüedad. El monitor consulta servicios reales y muestra fallos individuales.
- Navegador: página pública de fuentes. La instalación privada requiere un host accesible al navegador; las pruebas de API no sustituyen una aceptación de usuario del despliegue final.

## Registro de alcance Fase 3

F088 identidad/roles/MFA y SSO opcional; F089 expedientes/War Room con acceso revocable; F090 secretos cifrados y cuotas; F094 PostGIS e índices; F092 worker/registro de conectores/cache/checkpoints; F093 estados/calidad/edad; F095 importaciones/destinos/procesos aislados/CSP; F098 módulos separados y adaptadores sin reescribir funciones previas; F099 pruebas operativas y permisos; F100 copias/retención/auditoría; F044 divulgación de criterios por proveedor, sin IA automática; F066 certificados, custodia de secretos y recuperación autorizada.

Los enlaces heredados de warroom.html siguen siendo instantáneas legibles, sin autenticación, vencimiento ni revocación: no se pueden convertir en privados retroactivamente. Se añade aviso explícito en su vista y en DOMINUS OPS; la colaboración protegida se realiza exclusivamente en el backend nuevo.

La interfaz privada todavía no integra el mapa público completo ni mensajes en tiempo real: consulta compartida bajo petición y vigilancia por worker. No se presenta el historial local previo ni Git público como evidencia privada autenticada.

## Referencias primarias

- EPS REST: https://data.epo.org/publication-server/doc/EPS%20REST%20services.pdf
- Condiciones EPO: https://www.epo.org/en/service-support/ordering/fair-use
- USAspending: https://api.usaspending.gov/docs/endpoints
- OFAC SLS: https://ofac.treasury.gov/sanctions-list-service
- C2PA Python: https://github.com/contentauth/c2pa-python
- PostGIS Docker: https://github.com/postgis/docker-postgis
- FastAPI seguridad: https://fastapi.tiangolo.com/tutorial/security/

Para uso empresarial en México, definir antes de cargar información real: responsable del tratamiento, finalidad, acceso, conservación, transferencia y procedimiento de incidentes. El código implementa controles técnicos; no concede por sí mismo cumplimiento normativo ni autorización para tratar cualquier dato.
