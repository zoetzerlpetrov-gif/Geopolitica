# Starlink y posibles trenes en DOMINUS

En el menú izquierdo: En movimiento → Satélites → Mostrar en el mapa → Subtipos.

- **Starlink · efemérides SpaceX** dibuja los modelos vigentes de la instantánea.
- **Trenes Starlink · formaciones candidatas** filtra objetos de despliegues recientes conocidos o de agrupaciones orbitales compatibles.
- **Pases y posibles trenes** calcula desde el centro actual del mapa. Incluye oscuridad local, elevación mínima de 10° y satélite iluminado. No evalúa nubes, brillo individual ni obstáculos.
- Los resultados permiten dibujar la trayectoria terrestre del objeto. No es una predicción de brillo ni una observación de un tren real.

Estos subtipos están habilitados para Demo, Recon, Analyst, Command y Admin. No agregan otra casilla principal fuera de Subtipos.

## Procedencia y actualización

La fuente principal es el endpoint documentado de CelesTrak SupGP `FILE=starlink&FORMAT=JSON`, filtrado a `DATA_SOURCE=SpaceX-E`. Su política M2M publicada el 12 de noviembre de 2026 establece consultas conforme a documentación, un intervalo mínimo de dos horas y detenerse ante errores HTTP. DOMINUS mantiene una sola instantánea compartida cada tres horas. El recolector clásico de los otros grupos de CelesTrak sigue sin modificarse.

- https://celestrak.org/NORAD/documentation/sup-gp-queries.php
- https://celestrak.org/usage-policy.php
- https://docs.space-safety.starlink.com/docs/space-safety-articles/starlink_cola_conops/

El RMS de SupGP corresponde al ajuste publicado por CelesTrak, no a un error máximo medido por DOMINUS. Se descartan RMS ausentes o mayores de 3 km, fechas futuras y modelos que superen la ventana de uso de 24 horas desde su época. Las maniobras pueden modificar la predicción. La ficha muestra el proveedor, la época y la ventana de uso.

Como respaldo se pueden ajustar modelos SGP4 a las efemérides OCM/ITRF2000 públicas de SpaceX. Se prueban ventanas de hasta 48 horas y se reducen cuando el ajuste falla; se conservan solo modelos cuyo error máximo en las muestras de validación sea de hasta 3 km. Los identificadores provisionales de SpaceX se distinguen de NORAD. No se fabrican elementos orbitales para nombres sin datos.

El inventario del manifiesto no equivale al número de modelos válidos ni al número de objetos visibles desde una ubicación. No se muestran posiciones fuera de su ventana de uso.

Las fechas y lotes de lanzamiento disponibles se atribuyen a GCAT, J. McDowell, planet4589.org/space/gcat, CC BY 4.0. Sin metadatos de lanzamiento, las candidatas se detectan por cercanía espacial de hasta 150 km, planos próximos y al menos tres objetos; el cálculo de pases exige además horarios y direcciones próximas. Esto no certifica una fila visible.

La disponibilidad técnica pública no se presenta como una licencia CC de SpaceX. La fuente conserva `licencia_verificada: false` y las condiciones del operador; el acceso expreso para estos roles no cambia las reglas del resto de fuentes.

## Operación en la web

El workflow **Órbitas públicas de SpaceX** se inicia al publicar el recolector, cada tres horas o con **Run workflow** en GitHub Actions. No requiere claves de API ni instalaciones en el equipo del usuario.

La rama independiente `datos-starlink` se reescribe en cada ejecución, sin acumular historial de instantáneas. GitHub Pages copia sus archivos a `data/starlink/`. El navegador descarga la instantánea comprimida únicamente al activar un subtipo o consultar pases. La consulta de pases analiza hasta 200 objetos por operación para limitar el trabajo del navegador y declara la cobertura analizada.

Si falla un proveedor, se conserva lo anterior solo mientras su ventana siga vigente. Los avisos permanecen en `index.json`. El respaldo OCM respeta diez segundos entre peticiones, consulta por lotes y detiene las descargas si recibe un error HTTP.
