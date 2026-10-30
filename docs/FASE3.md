# Fase 3 · Herramientas completamente web

Entrada: [plataforma.html](https://zoetzerlpetrov-gif.github.io/Geopolitica/plataforma.html). Esta edición sustituye el entorno autohospedado anterior. No ofrece una cuenta, API privada ni preparación del equipo. Basta abrir la página web por HTTPS.

## Funciones disponibles

- Datos declarados del archivo y cálculo SHA-256, hasta 100 MB, mediante Web Crypto y File API. No se sube ni ejecuta el archivo.
- Cifrado y apertura de respaldos JSON: AES-256-GCM, derivación PBKDF2-SHA256, sal e IV aleatorios por copia. Contraseña de al menos 12 caracteres. No se guarda ni envía.
- Monitor público de OFAC SDN, USAspending, EPO EPS semanal/documento y copia SAT 69-B. GitHub Actions consulta criterios genéricos diariamente a las 04:27 UTC, publica metadatos y Pages los sirve. No necesita la computadora del usuario encendida.
- Tutorial web con pasos para formularios, expedientes, originales, respaldos y recuperación.

El cifrado protege el archivo exportado. No convierte localStorage o IndexedDB en una base cifrada ni ofrece aislamiento entre personas que comparten el perfil del navegador. Perder la contraseña impide recuperar la copia cifrada. Comprueba periódicamente que puedas abrir tus respaldos.

## Cobertura de fuentes

OFAC compara nombres/alias y produce candidatos, no identidades confirmadas. Solo SDN. USAspending cubre contratos federales estadounidenses, no contratación mundial completa. EPS es el servidor de publicaciones europeo, no OPS ni un buscador mundial de titularidad/vigencia. SAT utiliza la copia del proyecto con su fecha/corte. Revisar antigüedad y fuente oficial.

El monitor conserva último éxito ante fallos individuales. Un job exitoso puede incluir fuentes con error. Las consultas son genéricas y no leen expedientes ni claves. Los conectores de destinos fijos están en tools/fase23/connectors.py, exclusivamente para el proceso de nube.

## Capacidades retiradas

Se retiraron los instaladores, interfaz/API autohospedada y utilidades de escritorio de estas fases. El acceso web actual no ofrece MFA, organizaciones, permisos revocables, revisiones autenticadas, PostGIS privado, bóveda de secretos, vigilancia privada continua ni copias automáticas de datos privados. Ninguna se simula con un botón o contraseña de navegador. No se transfieren datos de servicios anteriores a la página pública.

Esta edición no verifica criptográficamente C2PA ni inspecciona certificados/conexiones TLS. Fase 2 admite informes documentales aportados, identificados como tales, y analiza texto de cabeceras. Los scripts anteriores pueden existir en el historial Git, pero no forman parte de la edición actual ni de sus instrucciones.

La documentación completa de uso está en docs/TUTORIAL_FASE3.md y en el sitio. Fase 4A funciona directamente en fase4.html.
