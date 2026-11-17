# Actualizar datos sin reiniciar el mapa

La actualización del service worker ejecutaba `location.reload()` al cambiar de controlador. Una nueva versión podía reiniciar una página abierta y perder sus capas y filtros, que viven en memoria. El registro ahora conserva la página. El nuevo worker espera a que terminen las sesiones abiertas, sin `skipWaiting`; el worker activo sigue consultando datos por red.

Los datos conservan sus ciclos de actualización. No se desactiva la ingesta ni la actualización de riesgos, aviones, barcos o satélites. Se retiran únicamente las recargas automáticas por instalación del service worker. Los botones de recarga solicitada por el usuario (reintentar, cambiar modo ligero) siguen disponibles.

Al reconstruir el selector de tipos de riesgo se conserva el tipo elegido, incluso si desaparece de la tanda de datos: se muestra con cero coincidencias. La línea de tiempo conserva la ventana y las horas de desplazamiento hacia atrás. Si está en «ahora», sigue las novedades; una instantánea vacía no restablece el filtro temporal. Los desplazamientos históricos siguen siendo relativos al evento más reciente, como indica el control.

El refresco general confirma la nueva versión del registro solo después de aplicar los datos. Si falla la descarga, mantiene los datos/filtros actuales y reintenta en una revisión posterior. Las capas activas siguen actualizándose sin modificar sus selecciones ni reactivar capas desmarcadas.

Esto conserva la sesión durante las actualizaciones automáticas; no añade restauración tras cerrar la pestaña, recargarla manualmente o un descarte de pestañas realizado por el navegador. Las versiones nuevas se usan al volver a abrir/recargar de forma voluntaria.

## Comprobaciones

`tests/js/actualizacion-sesion.test.mjs` simula cambios de controlador, instalación de un worker nuevo, cero coincidencias, ventanas temporales con rangos cambiantes y fallos de descarga con reintento. `tests/js/seleccion-capas.test.mjs` comprueba además un refresco real del gestor de riesgos con filtros activos, conservación de datos tras un error y cancelaciones durante descargas. No requieren detener la actualización de datos ni realizar una publicación de prueba.
