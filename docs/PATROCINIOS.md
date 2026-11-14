# Patrocinios y menciones de marca en Brújula Diaria

El video ya está preparado para llevar patrocinios. Mientras ninguna campaña de `config/patrocinios.json` tenga `"activo": true`, el video sale igual que siempre.

## Qué hace el sistema

- El anuncio va en su propia escena: «Publicidad», con el logo, la marca y un texto corto. Nunca va dentro de una nota, de Indicadores ni de Mercados.
- Hay tres posiciones posibles:
  - `apertura`: después de la portada.
  - `pausa`: antes de Indicadores, o a la mitad de las notas sin partir una sección.
  - `cierre`: antes de la despedida.
- La voz siempre empieza con «Mensaje patrocinado por <marca>.» y, salvo en el cierre, termina con «Fin del mensaje patrocinado. Seguimos con las noticias.».
- Si ese día una nota o un instrumento de Mercados habla de la marca, la pantalla dice «<marca> patrocina este programa» y la descripción lo avisa.
- En la descripción:
  - La segunda línea dice «Incluye promoción pagada de …» y aclara que las noticias no son patrocinadas ni revisadas por los patrocinadores.
  - Al final se agrega la lista de patrocinadores con su enlace.
- Al subir el video, se declara a YouTube que tiene promoción pagada (`paidProductPlacementDetails.hasPaidProductPlacement`). YouTube muestra entonces el aviso «Incluye promoción pagada».

## Reglas automáticas

Una campaña no sale si:
- le falta la marca o la referencia del contrato;
- la posición no es una de las tres de arriba;
- la voz pasa de 320 caracteres (unos 20 segundos) o la pantalla pasa de 140;
- el texto se presenta como noticia («última hora», «noticia») o promete rendimientos («sin riesgo», «garantizado»);
- el enlace no es https;
- su categoría está en `reglas.categorias_prohibidas`: política electoral, partidos, propaganda de gobierno, tabaco y vapeadores, apuestas y casinos, armas, productos milagro, emisión propia de criptomonedas y contenido para adultos.

Además, salen como máximo `reglas.max_por_video` campañas por video (hoy, 2).

## Paso a paso para una campaña nueva

1. Firma con el patrocinador una orden de inserción o un contrato. Debe decir las fechas, la posición, el texto de la voz y de la pantalla, el precio, el logo autorizado y que no tiene control editorial sobre las noticias.
2. Guarda el logo en `assets/patrocinios/`: PNG, JPG, WEBP o SVG, máximo 512 KB.
3. En `config/patrocinios.json`, copia el bloque de ejemplo y llena los datos:
   - `activo: true`, `marca`, `categoria`, `posicion`, `desde` y `hasta`;
   - `dias` si no sale todos los días, por ejemplo `["lun","mie","vie"]`;
   - `pantalla`, `voz`, `enlace` (con parámetros UTM para medir clics), `logo` y `contrato`;
   - en `alias`, otros nombres de la marca para detectar si aparece en las notas.
4. Haz el cambio en una rama, con una PR. Las pruebas revisan el formato. Revisa el primer video antes de hacerlo público.
5. Cuando termine la campaña, pon `activo: false`. Si `hasta` ya pasó, deja de salir sola.

## Normativa y buenas prácticas a revisar con un abogado antes del primer patrocinio

Esto es una guía de qué revisar, no asesoría legal.

- **YouTube.** Sus políticas de promociones pagadas piden declarar el contenido patrocinado con la casilla de promoción pagada; el sistema lo hace al subir el video. El patrocinador tampoco puede ir contra las políticas de anuncios de Google.
- **México: Ley Federal de Protección al Consumidor.** La publicidad debe ser veraz y comprobable, sin inducir a error, y PROFECO puede revisarla.
- **México: autorregulación.** El Código de Ética Publicitaria del CONAR pide distinguir la publicidad del contenido editorial. La etiqueta PUBLICIDAD y la escena separada cumplen ese criterio.
- **Productos regulados.**
  - Salud, alimentos, bebidas y suplementos: Reglamento de la Ley General de Salud en materia de publicidad (COFEPRIS). Algunos anuncios necesitan permiso o aviso previo.
  - Servicios financieros e inversiones: CONDUSEF y CNBV. La publicidad debe incluir el CAT y los avisos de riesgo cuando aplique.
  - Bebidas alcohólicas: leyendas obligatorias y límites de horario y audiencia.
- **Electoral.** La compra de propaganda política está muy restringida por la LGIPE y las reglas del INE. Por eso está prohibida aquí.
- **Audiencia fuera de México.** En Estados Unidos aplican las Endorsement Guides de la FTC (declarar con claridad la relación pagada). En la UE, la Directiva de prácticas comerciales desleales.
- **Fiscal (SAT).** Los ingresos por patrocinio se facturan con CFDI y la retención depende del régimen de quien factura. Consulta con tu contador.
- **Datos personales.** El enlace del patrocinador solo lleva parámetros UTM, sin datos de quien ve el video. No se comparten listas de suscriptores.

## Integridad editorial

- La IA que redacta las notas no recibe la lista de patrocinadores. Una nota sobre la marca se elige igual que cualquier otra (eco entre medios) y se marca como conflicto de interés.
- Un patrocinador no puede pedir que se quite o suavice una nota. Ese compromiso conviene ponerlo por escrito en el contrato.
