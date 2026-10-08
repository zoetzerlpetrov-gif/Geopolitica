# Plan de pruebas

Cómo leer este documento: cada funcionalidad tiene criterios de aceptación verificables (formato "Dado / Cuando / Entonces" resumido) y cómo se prueban: **A** = automática en GitHub Actions, **M** = manual en el navegador.

## Pruebas automáticas (corren en cada push)

| Archivo | Qué cubre |
|---|---|
| `ingest/validate.py` | `data/events.json` contra `schema/event.schema.json` + reglas de negocio (ids únicos, principal ≠ secundaria, subtemas de sus áreas, lat/lon juntas, fechas UTC) |
| `tests/test_contratos.py` | 13 áreas exactas con colores (y el esquema enumera las mismas); palabras clave ES/EN; regiones; chokepoints; polígonos sin líneas cruzadas; caso Mar Rojo; 11 pruebas negativas del validador |
| `tests/js/refresh.test.mjs` | Cálculo de la próxima corrida (minuto 17, cambio de hora y de día); escape de HTML; bloqueo de enlaces `javascript:` |
| `tests/test_clasificador.py` + `tests/titulares.json` | 26 titulares (2 por cada una de las 13 áreas), plurales, palabra completa, subtemas válidos, caso Mar Rojo |
| `tests/test_dimensiones.py` | Reglas de nivel_alerta (7 casos), delta (5), índice de inestabilidad (fórmula, vida media, ventana) y correlación (radio, ventana, áreas distintas) |
| `tests/test_privacidad.py` | Ninguna persona tiene coordenadas, domicilio, contacto, familiares, aeronave ni cartera; el esquema las rechaza (15 campos prohibidos); el código del mapa no dibuja categorías no dibujables |
| `tests/test_vivos.py` (rutas y rastros) | Campos nuevos de OpenSky y adsb.lol (velocidad vertical, squawk, categoría), exclusión PIA/LADD, lectura de la respuesta de rutas, tramo correcto en rutas con escala, rastros solo para vuelos permitidos y poda de 3 h |
| `tests/test_vivos.py` | Clasificación de aeronaves (sancionada, en tierra, Estado, militar, carga, comercial, general) y buques por código AIS; sin campo de propietario |
| `tests/js/estilo.test.mjs` | Etiquetas del mapa base sin alfabetos no latinos, sin cursivas, carreteras y pueblos desde zoom 9, LITE más ligero |
| `tests/js/capas.test.mjs` | Solo categorías dibujables; una capa de personas declarada a propósito no se dibuja; disponibilidad según manifiesto; zoom mínimo por subtipo |
| `tests/js/analisis.test.mjs` | Línea de tiempo (rango, histograma, ventana), 10 pasos y 7 lentes válidas, orden de lentes, regla de probabilidad, niveles 5 × 5, ajustes del usuario, CSV, semáforo y agrupación México, quiz (opciones, preferencia por confianza, marcador), índice por país y ficha con checklist |
| `tests/js/vuelos.test.mjs` | Aerolínea por indicativo, squawk y categoría, punto cardinal, arco de gran círculo (también sobre el antimeridiano), llegada estimada y avance, GeoJSON de la trayectoria (recorrido, rumbo 30 min, arco al destino, aeropuertos), encuadre, aviación general sin ruta ni trayectoria, ficha escapada e instantáneas viejas |
| `tests/js/movimiento.test.mjs` | Proyección de posición (incluido el antimeridiano), recorte a la vista con tope de 5,000, URL de NASA GIBS |
| `tests/test_ingesta.py` | Filas sintéticas de GDELT (filtros CAMEO, mínimo de artículos, severidad), RSS 2.0, Atom y RDF; país por texto y por coordenada; deduplicación con varias fuentes; ventana de 72 h; delta entre corridas; tope de eventos; historial y poda de 90 días; que no se guarde texto del medio |
| `ingest/validate_entities.py` | Catálogo de entidades y registros de Wikidata contra `schema/entity.schema.json` |
| Workflow **Medición de rendimiento** | Mide el sitio publicado («antes») y la rama («después»); falla si no se cumple una meta obligatoria |

Regla de publicación: el workflow **Publicar en GitHub Pages** depende del job de pruebas. Si alguna falla, no se publica y el sitio conserva la última versión buena.

## Criterios por funcionalidad

| # | Funcionalidad | Criterio de aceptación | Prueba | Fase |
|---|---|---|---|---|
| 1 | Marcadores y clusters | Cada evento usa el color de su área principal; al alejar se agrupa en círculos con número; clic en un grupo acerca el mapa | M | 1 ✔ |
| 1b | Rendimiento | Con `?carga=50000`: el filtro tarda menos de 50 ms y el mapa sigue fluido al moverlo | M (consola) | 1 ✔ |
| 2 | Filtros | Áreas, región, severidad mínima, "solo México" y ventana de tiempo cambian mapa, lista y contadores a la vez | M | 4 ✔ |
| 3 | Capas fijas | Chokepoints e índice por país se encienden y apagan; aparecen los 8 chokepoints + Cabo de Buena Esperanza | A + M | 4 ✔ |
| 4 | Mapa de calor por país | Coropleta del Índice de Inestabilidad (30 días, vida media 7 días); países sin eventos transparentes; clic muestra valor y número de eventos; leyenda de 4 escalones | A (`unirIndice`) + M | 4 ✔ |
| 5 | Línea de tiempo | Ventana (todo, 6 h, 24 h, 72 h, 7 días) y deslizador hacia el pasado cambian los eventos visibles; histograma de 48 barras resalta la ventana; «Reproducir» recorre el periodo; con datos nuevos se queda en «ahora». «30 días» y «90 días» descargan el historial bajo demanda (90 días solo severidad ≥ 3; no se ofrece en LITE) | A (`ventana`, `histograma`, `historial.test.mjs`) + M (Playwright) | 4 ✔ |
| 6 | Ficha del evento | Muestra título, fuentes con enlace, áreas, subtemas, pregunta guía, actores, severidad, impacto México; se cierra con Esc | M | 1 ✔; 4 ✔ (checklist, notas y lentes) |
| 7 | Checklist de 10 pasos | Se puede marcar, muestra el avance (n/10) y se conserva por evento al recargar, junto con las notas (solo en el navegador, máximo 300 eventos) | A (ficha) + M (Playwright) | 4 ✔ |
| 8 | Lentes teóricas | Siete lentes con autores, idea central y preguntas con los actores y el país del evento; las afines al área van primero | A | 4 ✔ |
| 9 | Vista México | Eventos con impacto agrupados por área en el orden de la taxonomía, semáforo por severidad (rojo ≥ 4, ámbar 3, verde ≤ 2) y resumen de conteos; clic abre la ficha | A + M | 5 ✔ |
| 10 | Matriz de riesgo | 5 × 5 con niveles bajo, medio, alto y crítico; probabilidad inicial por regla y ajustable por evento; exporta CSV con BOM que abre bien en Excel | A + M | 5 ✔ |
| 11 | Modo aprendizaje | Pregunta el área de un evento real (4 opciones, sin las secundarias), explica la respuesta con la pregunta guía y lleva marcador por área | A + M | 5 ✔ |
| 11b | Calidad de datos | Pestaña con estado de cada fuente, embudo de la corrida, indicadores (sin país, confianza baja, verificados, varias fuentes, impacto México), eventos por área y muestra de títulos sin área | A (`calidad`) + M (Playwright) | ✔ |
| 12 | Interfaz | Español; usable a 390 px de ancho; tema claro/oscuro recordado | M | 1 ✔ |
| — | Actualización | La barra superior muestra hace cuánto se generaron los datos y la cuenta regresiva al minuto 17 de la siguiente hora; datos con más de 2.5 h se marcan como atrasados | A + M | 1 ✔; 2 ✔ (datos reales; el tooltip lista las fuentes con error) |
| — | Base de respaldo | Si OpenFreeMap no responde en 6 s, aparece el mapa local de países y un aviso | M | 1 ✔ |
| — | Accesibilidad | Todo operable con teclado (Tab, Enter, Esc); enlace "saltar a la lista"; foco visible; textos con contraste AA | M | 1 ✔ |

## Metas de rendimiento (verificadas en CI por `tools/medicion/metas.mjs`)

| Meta | Objetivo | Tipo |
|---|---|---|
| Mapa usable en móvil 4G simulado (CPU 4x más lenta) | < 3 s | Obligatoria |
| Latencia al cambiar filtros (peor escenario, incluye 50,000 eventos) | < 200 ms | Obligatoria |
| Carga inicial sin mosaicos del mapa base | < 1.5 MB | Obligatoria |
| JS heap tras la espera | < 350 MB | Obligatoria |
| CLS de Lighthouse móvil | < 0.1 | Obligatoria |
| Ninguna long task > 200 ms al navegar | — | Informativa: el runner no tiene GPU |
| ≥ 50 FPS en paneo y zoom | — | Informativa: el runner dibuja con CPU (SwiftShader) |

Prueba de carga manual: `index.html?carga=50000&aviones=5000&mov=aeronaves&capas=aeropuertos,centrales,zonas` (requiere que existan las capas).

## Caso de aceptación de referencia

Ataques hutíes en el Mar Rojo (finales de 2023–2024).

- Área principal: Geografía y territorio (chokepoint Bab el-Mandeb).
- Secundarias: Seguridad, Geoeconomía, Identidad y narrativa.
- Impacto México: insumos asiáticos con más días de tránsito y fletes más caros.
- Debe agrupar 2 fuentes en un solo evento (demostración de deduplicación).

Se verifica en `test_caso_de_aceptacion_mar_rojo` y manualmente en `index.html#evento=mar-rojo-huties-2023`.
