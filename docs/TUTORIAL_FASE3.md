# Tutorial de Fase 3 · Uso web

Abre https://zoetzerlpetrov-gif.github.io/Geopolitica/plataforma.html#tutorial-f3. Los pasos también están dentro de la página; no hay comandos de terminal.

## 1. Elegir fase

Fase 1 organiza preguntas y cobertura. Fase 2 analiza registros e hipótesis. Fase 3 calcula huellas y cifra respaldos. Fase 4A reúne expedientes, activos, relaciones y originales. El mapa, las cámaras y las herramientas web existentes conservan su funcionamiento.

## 2. Comprender la persistencia

Fase 1/2 utiliza localStorage del origen. Fase 4 utiliza IndexedDB. Los registros pertenecen al perfil y dirección web usados; no se sincronizan con otros dispositivos. Una ventana privada puede perderlos al cerrarse. No hay cuentas ni custodia privada institucional. No se migra ni publica información de un servicio anterior.

## 3. Usar formularios

Elige sección, completa campos y guarda. Documenta fuente, fecha y límites. Las ediciones de Fase 2 requieren motivo. Exporta JSON antes de cambiar de navegador o borrar datos del sitio. Las aprobaciones y custodios documentados son declaraciones, no autenticación.

## 4. Crear expediente web

Abre fase4.html. Escribe un título y crea el expediente. Incorpora una copia de Fase 1/2 de este navegador, o importa respaldos. Los registros originales permanecen intactos. La incorporación posterior es explícita; una copia no se actualiza automáticamente al editar otra fase.

Registra un activo «Terminal QA», responsable Operaciones e identificador TERM-QA-01. Registra un evento «Interrupción de prueba». Relaciona evento → afecta → terminal, con fundamento. Consulta Vista unificada para buscar títulos y relaciones. Registrar dominios o IP no ejecuta escaneos.

## 5. Originales y custodia

Incorpora un archivo ficticio no vacío de hasta 512 KiB, origen, fecha con zona horaria, custodio y motivo. Ejemplo de fecha: 2026-10-29T10:00:00-06:00. Se calcula SHA-256; contenido y declaraciones se guardan en el navegador. Máximo 4 MB por caso incluyendo originales codificados.

Para una entrega posterior registra una declaración de transferencia. No demuestra recepción por otra persona. Antes de descargar se comprueba la huella. El archivo no se ejecuta ni se abre automáticamente. No hay antivirus, WORM ni sello temporal externo.

## 6. Cifrar un respaldo

Desde Fase 4, abre Respaldos y versiones, elige una contraseña de al menos 12 caracteres y descarga. Para Fase 1/2, exporta su JSON y selecciónalo en el cifrador de Fase 3. Introduce la contraseña dos veces.

El cifrado solo protege la copia descargada. El almacenamiento del navegador no se cifra automáticamente. Custodia contraseña y archivo por separado. No hay recuperación por cuenta. El respaldo del expediente contiene versión actual, originales y custodia; no todo el historial del navegador.

## 7. Probar recuperación

Abre el sitio en otro perfil o equipo. En Fase 4 selecciona el respaldo, introduce contraseña y abre una copia nueva. Se validan estructura y huellas. Para Fase 1/2 descifra el respaldo con Fase 3 y restaura el JSON desde su propia página. Descifrar no cambia registros por sí mismo. Las copias en claro deben custodiarse.

## 8. Errores habituales

- Falta de espacio: el guardado falla sin mostrar éxito. Conserva una copia antes de borrar datos del sitio.
- Conflicto de versión: otra pestaña guardó primero. Conserva el borrador, recarga y compara; no se fuerza sobrescritura.
- Contraseña incorrecta o archivo alterado: no se obtiene una recuperación parcial. Comprueba contraseña y copia de origen.
- Huella diferente: se bloquea incorporación/restauración o descarga; no se presenta el original como íntegro.
- Fuente no disponible: revisa último éxito y cobertura. El monitor genérico no equivale a vigilancia privada.
- Sin Web Crypto: abre la dirección HTTPS del sitio en un navegador compatible. No abras una copia descargada de la página como sustituto del sitio.

## Capacidades que esta edición no ofrece

No hay cuentas, MFA, permisos compartidos, servidor privado, vigilancia individual con la página cerrada ni verificación de firmas C2PA/TLS. No se ofrecen instrucciones para preparar el equipo. Los informes de terceros se registran sin convertirlos en verificaciones propias.
