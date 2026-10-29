# Tutorial de Fase 3 · Instalar y operar el entorno privado

Esta guía se lee completa desde el sitio web. Los comandos se ejecutan en tu computadora o servidor; los botones de copiar no ejecutan nada. GitHub Pages muestra esta guía y las fuentes públicas, pero no puede ejecutar Python, Docker, cuentas ni la base privada.

## 1. Entender qué vas a instalar

Piensa en dos espacios: el **sitio público** es el mapa y las herramientas locales; el **servidor privado** es otra aplicación con inicio de sesión, expedientes compartidos y vigilancia. Instalar el segundo no cambia el primero.

| Componente | Para qué sirve | Qué debes observar |
|---|---|---|
| API e interfaz privada | Formularios, permisos y expedientes | Abre en tu navegador en el puerto 8000 |
| PostgreSQL/PostGIS | Guarda los registros y áreas | Servicio db saludable, sin puerto abierto al exterior |
| Worker | Consulta las fuentes habilitadas | Necesita el equipo encendido e Internet para sus consultas |
| Backups | Crea siete copias locales cifradas | No sustituye una copia en otro equipo |
| Validator | Comprueba C2PA en aislamiento | No tiene red ni las claves de la base |

Un **contenedor** ejecuta un componente aislado. Una **imagen** es su paquete de software. Un **volumen** conserva datos aunque reinicies un contenedor. Docker Compose coordina estos componentes. **Loopback / 127.0.0.1** significa «este mismo equipo»; no es una dirección para compartir con otra persona.

**Resultado esperado:** identificar dónde vivirán los datos. Empieza con información ficticia; todavía no cargues expedientes reales.

## 2. Preparar Windows, Linux o macOS

Necesitas Git, Python 3 y Docker con Compose v2. La conexión inicial descarga el repositorio, imágenes y dependencias. Verifica espacio disponible; el tamaño depende de imágenes, archivos y copias, no hay una cifra garantizada para todos los equipos.

- **Windows:** instala Docker Desktop siguiendo su documentación oficial y usa contenedores Linux. La ruta habitual usa WSL 2; habilítalo según las instrucciones de Docker/Microsoft. Abre Docker Desktop y espera a que el motor esté en marcha. Usa PowerShell para los comandos de este tutorial. Comprueba `python --version`; si tu instalación solo reconoce `py`, sustituye `python` por `py -3` únicamente en los comandos Python del equipo anfitrión, nunca dentro del contenedor.
- **Linux:** instala Docker Engine y el complemento Compose desde la documentación de tu distribución. Si tu operador requiere `sudo` para Docker, utiliza el procedimiento de permisos de tu organización. Pertenecer al grupo Docker da privilegios elevados sobre ese equipo.
- **macOS:** instala una versión de Docker Desktop compatible con tu equipo y utiliza Terminal. Si Python se llama `python3`, sustituye `python` por `python3` solo en los comandos del anfitrión.

Comprueba las herramientas una a una:

```sh
git --version
python --version
docker version
docker compose version
```

**Resultado esperado:** cada comando muestra su versión; `docker version` muestra cliente y servidor. Si dice que no se conecta al daemon, abre Docker o pide al operador iniciar el servicio. No continúes con el motor detenido.

DOMINUS no contrata un servicio de alojamiento. Docker Desktop tiene condiciones propias: su uso personal y ciertos usos de pequeñas empresas son gratuitos; gobierno y otros usos empresariales requieren suscripción según su licencia. Docker Engine en Linux es una alternativa con condiciones diferentes. Revisa las condiciones vigentes antes de instalar en una empresa o dependencia.

Referencias oficiales: [Windows](https://docs.docker.com/desktop/setup/install/windows-install/), [WSL 2](https://docs.docker.com/desktop/features/wsl/), [Docker Engine](https://docs.docker.com/engine/install/), [Compose](https://docs.docker.com/compose/install/), [licencia Desktop](https://docs.docker.com/subscription-billing/desktop-license/).

## 3. Descargar y ubicar el proyecto

Abre una terminal en la carpeta donde guardarás el proyecto. No uses una carpeta pública compartida para archivos privados.

```sh
git clone https://github.com/zoetzerlpetrov-gif/Geopolitica.git
cd Geopolitica
```

Si ya tienes una copia de trabajo con modificaciones, no la sobrescribas ni hagas un reset: utiliza otra carpeta para esta instalación. En este punto debes estar en la raíz del proyecto, donde están las carpetas `backend` y `docs`. Puedes comprobarlo con `dir` en PowerShell o `ls` en Linux/macOS.

**Resultado esperado:** encontrar `backend/generar_entorno.py` y `backend/compose.yml`. El repositorio solo contiene código; tus cuentas y expedientes todavía no existen.

## 4. Generar claves sin inventar contraseñas por defecto

Desde la raíz del proyecto:

```sh
python backend/generar_entorno.py
```

Se crea `backend/.env` con configuración local y claves aleatorias. Si el archivo ya existe, el generador se niega a reemplazarlo: esto protege las claves de una instalación anterior. No lo borres para quitar el error.

**MASTER_KEY** permite descifrar datos. **BACKUP_KEY** protege la envoltura de las copias. Para recuperar todo necesitas ambas. Custódialas en un gestor o soporte protegido, separado del servidor. No pegues sus valores en el sitio público, chats, tickets ni capturas. En Windows revisa también los permisos NTFS de esa carpeta; el modo Unix 0600 no sustituye las ACL de Windows.

**Resultado esperado:** archivo creado una sola vez y claves bajo custodia. No necesitas registrarte en una API para generar este entorno.

## 5. Construir e inicializar la base

Entra a la carpeta backend y ejecuta cada línea cuando termine la anterior:

```sh
cd backend
docker compose build
docker compose up -d db
docker compose run --rm api python -m dominus.cli init
```

`build` prepara las imágenes. `up -d db` inicia la base en segundo plano. `init` crea las tablas e índices necesarios; no crea usuarios. La primera preparación puede tardar según la red y el equipo.

```sh
docker compose ps
```

**Resultado esperado:** servicio db en marcha y saludable. Si la inicialización falla, no elimines volúmenes: consulta el apartado de errores y conserva el mensaje sin secretos.

## 6. Crear la primera cuenta y activar servicios

Crea una organización ficticia inicial y su propietario:

```sh
docker compose run --rm api python -m dominus.cli provision --organization "Mi organización" --username analista --role owner --output /app/backend/private/inicio.json
docker compose up -d api worker backups validator
```

El archivo de inicio se escribe en un volumen privado, no en Git. Crea en el anfitrión una carpeta llamada `private` dentro de `backend` si aún no existe. En PowerShell puedes usar `New-Item -ItemType Directory -Force private`; en Linux/macOS, `mkdir -p private`. Luego copia el archivo:

```sh
docker compose cp api:/app/backend/private/inicio.json private/inicio.json
```

En Linux/macOS restringe el archivo con `chmod 600 private/inicio.json`. En Windows limita sus permisos al usuario que lo custodia. Ábrelo localmente con un editor: contiene la contraseña y la URI/semilla TOTP. Importa esa URI/semilla en una aplicación autenticadora compatible; cada usuario debe custodiar la suya. Ajusta la hora automática de computadora y teléfono.

Abre en el navegador del **mismo equipo**: **http://127.0.0.1:8000**. Escribe usuario, contraseña y el código vigente de seis cifras del autenticador. Un código ya utilizado no se reutiliza para otro inicio de sesión.

Cuando la contraseña y el autenticador estén bajo custodia segura, retira las copias de onboarding del anfitrión y del volumen privado mediante el procedimiento del operador. No elimines `.env` ni las claves de recuperación. La aplicación no borra esas copias automáticamente.

**Resultado esperado:** ver «Sesión privada activa», una organización seleccionable y el formulario Nuevo expediente. Tener Docker en marcha no significa que GitHub Pages se haya convertido en una app privada.

## 7. Práctica guiada con datos ficticios

1. Crea el expediente **Prueba · suministro de combustible**.
2. En Fase 1 del sitio público crea una pregunta de prueba y exporta su respaldo JSON. Haz lo mismo con una ficha de Fase 2 si lo necesitas.
3. En el servidor privado selecciona el expediente y usa **Importar respaldo Fase 1 o 2**. Revisa el contenido y confirma. Importar una fase reemplaza esa fase en el expediente; conserva las otras fases y el historial del servidor.
4. Elige fase y sección, modifica un campo y registra el motivo. Guarda y observa que aumenta la versión.
5. Recarga el expediente: el dato debe seguir disponible.
6. Exporta una versión documental solo si necesitas una copia. Esa exportación está **en claro**; no es una copia cifrada completa del servidor.

Los estados «aprobado» importados son anotaciones locales. La revisión autenticada requiere un revisor autorizado distinto del último editor y se refiere a una versión concreta. Un cambio posterior requiere una revisión nueva si tu proceso la exige.

**Resultado esperado:** la información persiste al recargar y el historial muestra quién guardó cada versión. La aplicación no certifica que los hechos registrados sean verdaderos.

## 8. Añadir cuentas, permisos y revisión

Desde `backend`, repite la provisión con un nombre y archivo nuevos:

```sh
docker compose exec api python -m dominus.cli provision --organization "Mi organización" --username revisor --role reviewer --output /app/backend/private/revisor-inicio.json
```

Entrega las credenciales y configuración MFA mediante un canal protegido bajo control del operador, siguiendo la misma custodia del primer usuario. No se envían por correo automáticamente. Roles disponibles: `owner`, `analyst`, `reviewer`, `viewer`.

En el expediente, abre **Acceso al expediente**, elige un usuario de la organización, permiso y vigencia de uno a siete días. Pertenecer a la organización no da acceso a todos sus casos; el propietario de la organización sí tiene facultades de administración. Revocar acceso bloquea solicitudes posteriores, pero no retira archivos que la persona ya descargó.

Para probar un segundo usuario local usa otro perfil o ventana privada del navegador. Para otro **equipo físico**, primero configura HTTPS como explica el paso 12. Dos personas que usan `127.0.0.1` en equipos distintos no se conectan al mismo servidor.

**Resultado esperado:** un usuario sin autorización no abre el caso; al conceder lectura puede consultarlo y no puede editarlo. La revisión exige el rol y permiso adecuados.

## 9. Configurar vigilancia sin API key

Selecciona un expediente y abre **Fuentes y vigilancia**. Lee el proveedor receptor y su cobertura, escribe el criterio y confirma el envío indicado. El worker trabaja mientras el equipo esté encendido. «Solicitar consulta» respeta cuotas y frecuencias; no significa respuesta inmediata.

| Fuente | Prueba o criterio | Límite de interpretación |
|---|---|---|
| OFAC SDN | Nombre o alias de al menos tres caracteres | Coincidencia candidata; confirmar identidad. No es todas las listas del mundo |
| USAspending | Palabras del contrato | Contratos federales de EE. UU.; no todas las licitaciones mundiales |
| EPO EPS semanal | Prefijo EP opcional | Publicaciones europeas; no búsqueda mundial por dueño |
| EPO EPS documento | EP1004359NWB1 como ejemplo público | Documento conocido; no certifica vigencia jurídica |
| SAT 69-B | RFC exacto | Copia del proyecto con fecha y corte; revisar la fuente oficial |

OFAC, SAT y EPS semanal filtran criterios en el servidor sobre descargas fijas. USAspending recibe palabras/periodo; EPS documento recibe el identificador. No se envía el expediente completo. Frecuencia mínima: 24 horas para OFAC, contratos y EPS semanal; siete días para documento EPS y copia SAT. Máximo 50 vigilancias por organización.

**Resultado esperado:** aparece una vigilancia y, tras su ejecución exitosa, fecha del último éxito y observación. Un error conserva el último resultado; revisa antigüedad y si hay cobertura parcial. El monitor de la página pública usa consultas genéricas y no muestra tus vigilancias.

## 10. Verificar multimedia con C2PA

En el expediente privado abre **Verificar credenciales C2PA**, selecciona un formato admitido de hasta 4 MB y ejecuta la verificación. El archivo viaja a tu servidor privado, se procesa en un contenedor sin red ni claves de la base y se elimina al terminar. No se conserva automáticamente como evidencia.

Revisa por separado: presencia de manifiesto, integridad de firma, confianza y limitaciones. Un archivo sin manifiesto no es necesariamente falso y una firma válida no demuestra que la escena sea cierta. La verificación no consulta OCSP ni manifiestos remotos.

**Resultado esperado:** informe con huella y resultado; no una etiqueta automática de «verdadero». Para conservar un original pequeño en Fase 4A usa su acción de incorporación, que es independiente de C2PA.

## 11. Operación diaria, parada y actualización

Desde `backend`, comprobar servicios:

```sh
docker compose ps
docker compose logs --tail=50 api worker backups validator
```

No compartas registros sin revisar datos sensibles. No muestres salidas de configuración completa ni variables de entorno. Si necesitas validar sintaxis, utiliza `docker compose config --quiet`.

Para detener temporalmente y volver a iniciar sin borrar datos:

```sh
docker compose stop
docker compose up -d api worker backups validator
```

No utilices `docker compose down -v`, `docker volume rm` ni limpieza de volúmenes en una instalación con datos: eliminan almacenamiento persistente. Apagar el equipo pausa vigilancias y copias; al encenderlo vuelve a revisar servicios y último éxito.

Antes de actualizar: haz copia recuperable, conserva ambas claves, registra tu versión con `git rev-parse HEAD` y prueba la nueva versión en un entorno separado. Si tu checkout está limpio y ya validaste la actualización, desde la raíz ejecuta `git pull --ff-only`; después, desde backend:

```sh
docker compose stop api worker backups
docker compose build
docker compose run --rm api python -m dominus.cli init
docker compose up -d api worker backups validator
```

No cambies el nombre de carpeta/proyecto Compose de una instalación existente sin planificar los volúmenes: podrías iniciar otra base vacía. Conserva la versión y configuración para una recuperación probada. No regeneres `.env` para actualizar.

## 12. Acceso desde varios equipos y HTTPS

Este es un paso de despliegue a cargo del operador. La configuración incluida publica la API solo en `127.0.0.1:8000`. **No cambies ese enlace por 0.0.0.0 para saltarte la preparación.**

Necesitas un host bajo tu control, DNS cuando corresponda, un certificado TLS válido y un proxy HTTPS que reenvíe las solicitudes a la API local. Configura `PUBLIC_ORIGIN` con el origen exacto, sin ruta, y `ALLOW_LOCAL_HTTP=0` en el entorno del servidor. El proxy debe conservar el Host correspondiente al origen configurado. Recréa los servicios para que lean la configuración:

```sh
docker compose up -d --force-recreate api worker backups
```

Solo el proxy debe ser accesible por los clientes; PostgreSQL no se publica. Las cookies de producción requieren HTTPS. No habilites CORS ni desactives comprobaciones de Host/origen como solución a un error.

**Prueba de aceptación:** desde dos equipos autorizados abrir el origen HTTPS real, iniciar sesión con cuentas distintas, leer el mismo caso autorizado, verificar permisos, editar con conflicto de versión y revocar un permiso. Revisar también caducidad del certificado, firewall y recuperación. El proyecto no configura automáticamente tu DNS, proxy ni hosting; por eso este tutorial no da por terminado ese despliegue.

## 13. Copias cifradas y recuperación

El servicio backups crea una copia al iniciar y cada 24 horas; retiene siete copias locales. Para una copia manual, desde backend:

```sh
docker compose exec api python -m dominus.cli backup --file /app/backend/private/manual.dominus
docker compose cp api:/app/backend/private/manual.dominus private/manual.dominus
```

Usa un nombre de archivo nuevo en cada copia manual. Lleva la copia a un destino independiente, protegido y bajo tu control. Ver un archivo no prueba que puedas recuperarlo: ensaya restauración en un **entorno separado**, con base vacía y las claves originales.

En ese entorno de recuperación, con la API iniciada y la base inicializada pero sin cuentas ni datos:

```sh
docker compose cp private/manual.dominus api:/app/backend/private/recuperar.dominus
docker compose exec api python -m dominus.cli restore --file /app/backend/private/recuperar.dominus
```

No ejecutes provision antes de restaurar: la base dejaría de estar vacía. La restauración rechaza una base con datos, copia alterada o claves incompatibles. No borres producción para conseguir una base vacía. Mantén las consultas de vigilancia y tareas del entorno de prueba pausadas mientras compruebas la recuperación.

**Resultado esperado:** iniciar sesión nuevamente, recuperar el caso y sus versiones y comprobar auditoría. Las sesiones activas no se restauran. En Fase 4A comprueba también la descarga y huella de un original de prueba.

## 14. Recuperar una cuenta y conservar expedientes

Si un usuario pierde su contraseña o autenticador, el operador primero verifica su identidad por el procedimiento de la organización. Después, desde backend:

```sh
docker compose exec api python -m dominus.cli reset-user --username analista --output /app/backend/private/recuperacion-nueva.json
```

Se regeneran contraseña y TOTP, se revocan sesiones y se registra la recuperación. Custodia y retira el archivo como en el alta. No existe recuperación anónima por correo.

Para suspender/restituir una cuenta:

```sh
docker compose exec api python -m dominus.cli disable-user --username analista
docker compose exec api python -m dominus.cli enable-user --username analista
```

La restitución permite nuevos accesos; no reactiva sesiones previas. En Administración puedes consultar papelera y restaurar casos autorizados. Al enviar un caso a papelera se pausan sus vigilancias. La retención se configura entre uno y 3650 días; un bloqueo de conservación impide purga. Una copia antigua mantiene su propio ciclo: no desaparece por borrar un caso actual.

La rotación de claves maestras y SSO se explican en la referencia operativa incluida debajo; requieren preparación del operador. No son necesarios para probar el acceso local con MFA.

## 15. Resolver errores sin perder datos

| Mensaje o síntoma | Qué revisar | Acción que evita perder información |
|---|---|---|
| Docker no conecta al daemon | Motor en marcha y contenedores Linux | Inicia el motor; no regeneres claves |
| .env ya existe | Posible instalación previa | Conserva el archivo y verifica su custodia |
| Puerto 8000 ocupado | Otra aplicación o instalación | Identifica al propietario del puerto; no detengas procesos desconocidos |
| No abre desde otro equipo | 127.0.0.1 solo es local | Prepara proxy HTTPS y origen; no expongas HTTP de desarrollo |
| Host u origen no permitido | Dirección usada y PUBLIC_ORIGIN | Corrige configuración del proxy/origen y recrea servicios |
| Código MFA rechazado | Hora del teléfono/equipo y código ya usado | Sincroniza hora, espera un código nuevo; si perdiste la semilla usa recuperación por operador |
| Conflicto 409 al guardar | Otra edición o evidencia elevó la versión | Conserva tu borrador, recarga y compara; no fuerces una sobrescritura |
| Fuente con error o sin novedades | Último éxito, cuota, worker y conectividad | Conserva último resultado y revisa cobertura; no lo interpretes como ausencia de riesgo |
| C2PA no responde | Servicio validator y sus logs | Restablece el contenedor; no le des red ni claves para resolverlo |
| Copia no restaura | Base realmente vacía, versión y ambas claves | Ensaya en otro entorno; no borres producción |
| Fase 4A aún no aparece | Imagen backend anterior | Copia, actualización y rebuild; refresca la interfaz privada |

## 16. Checklist antes de información real

- Identificar al operador y a quien autoriza accesos, conservación y recuperación.
- Confirmar MFA por usuario, claves bajo custodia y ausencia de credenciales por defecto.
- Probar permisos de lectura/escritura/revisión y revocación con cuentas distintas.
- Ensayar copia y restauración en otro entorno.
- Para varios equipos, validar TLS y el origen real; no usar el modo HTTP local.
- Definir finalidad, autorización para tratar datos, retención y procedimiento de incidentes conforme al contexto de la organización.
- Recordar que el historial HMAC no es WORM, las relaciones no prueban identidad y una recepción declarada no es validación jurídica de cadena de custodia.

Este checklist es técnico y operativo; no acredita cumplimiento normativo ni sustituye la evaluación jurídica aplicable al caso.
