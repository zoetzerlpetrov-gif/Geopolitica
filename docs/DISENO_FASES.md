# Diseño compartido del Centro de inteligencia

Las nueve páginas de fases comparten la paleta del mapa: `analista.html`, `fase2.html`, `plataforma.html`, `fase4.html`, `operaciones.html`, `laboratorio.html`, `colaboracion.html`, `fase5.html` y `transporte.html`.

## Base visual

`css/tema.css` contiene los colores, fuentes, radios, sombras y gradientes comunes. `css/app.css` importa esta base manteniendo las reglas de distribución del mapa. `css/fases-tema.css` importa la misma base y adapta las cabeceras, navegación, botones, formularios, tarjetas, tablas, estados, avisos y tutoriales de las fases. No importa la distribución del mapa en los formularios.

Se conservan los valores de la paleta general: fondo claro #f5f6f7, superficie #ffffff, texto #1c2329, acento #2E6F8E; fondo oscuro #0f1418, superficie #161d22, texto #e4e9ed y acento #6fb0cf. La marca reutiliza la cruz roja existente y su gradiente dorado. Los avisos conservan colores semánticos diferenciados.

Los alias anteriores (`--fondo`, `--panel`, `--texto`, `--linea`, `--acento`, `--nota`) se enlazan a la base compartida para que los componentes existentes conserven su estructura. Los fondos blancos y bordes fijos de algunas hojas/estilos internos se sobreescriben por colores del tema, sin cambiar formularios, campos ni métodos de cálculo.

## Tema

Cada cabecera permite alternar claro/oscuro con un botón accesible. Usa la preferencia `gp_theme` que ya emplea el mapa. Un script pequeño la aplica antes de pintar, aceptando únicamente light o dark. Si no hay preferencia explícita se sigue el esquema del sistema.

`js/fases-tema.js` controla solo la presentación. Refleja el tema en `aria-pressed`, persiste la elección y escucha cambios de otras pestañas del mismo origen. La operación visual sigue funcionando si el almacenamiento está restringido. No lee expedientes, modifica registros ni consulta proveedores.

## Navegación, tamaños e impresión

Se conserva el menú del Centro de inteligencia y la selección explícita de las etapas, incluida la corrección de acceso a la etapa 5. Los encabezados y controles se reorganizan en pantallas estrechas; las tablas conservan desplazamiento horizontal en sus contenedores. Se mantienen indicadores de foco y estados deshabilitados. La impresión utiliza fondo blanco, texto negro y oculta el control de tema.

## Validación

Pruebas de inclusión de la base visual en nueve páginas, preferencia compartida, alternancia, sincronización, seguimiento del sistema y almacenamiento restringido. Se ejecutan también los flujos de formularios, expedientes, exportaciones, respaldos y navegación existentes. La revisión visual se realiza en páginas publicadas, con ejemplos ficticios y temas claro/oscuro.

Esta entrega homologa la presentación; los pendientes funcionales de FASE5F.md conservan su estado.
