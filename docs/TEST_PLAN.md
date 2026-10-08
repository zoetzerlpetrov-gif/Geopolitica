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
| `tests/test_vivos.py` | Clasificación de aeronaves (sancionada, en tierra, Estado, militar, carga, comercial, general) y buques por código AIS; sin campo de propietario |
| `tests/js/estilo.test.mjs` | Etiquetas del mapa base sin alfabetos no latinos, sin cursivas, carreteras y pueblos desde zoom 9, LITE más ligero |
| `tests/js/capas.test.mjs` | Solo categorías dibujables; una capa de personas declarada a propósito no se dibuja; disponibilidad según manifiesto; zoom mínimo por subtipo |
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
| 2 | Filtros | Áreas, severidad mínima y "solo México" cambian mapa, lista y contadores a la vez | M | 1 parcial; resto en 4 |
| 3 | Capas fijas | La capa de chokepoints se enciende y apaga; aparecen los 8 + Cabo de Buena Esperanza | A + M | 1 ✔ (otras capas en 4) |
| 4 | Mapa de calor por país | Color por número y severidad de eventos en 7/30 días | — | 4 |
| 5 | Línea de tiempo | Deslizar cambia los eventos visibles por fecha | — | 4 |
| 6 | Ficha del evento | Muestra título, fuentes con enlace, áreas, subtemas, pregunta guía, actores, severidad, impacto México; se cierra con Esc | M | 1 ✔ (checklist en 4) |
| 7 | Checklist de 10 pasos | Se puede marcar y se conserva por evento | — | 4 |
| 8 | Lentes teóricas | Siete lecturas por evento | — | 4 |
| 9 | Vista México | Eventos con impacto agrupados por área y semáforo | — | 5 |
| 10 | Matriz de riesgo | Probabilidad × impacto; exporta CSV | — | 5 |
| 11 | Modo aprendizaje | Pregunta el área de un evento real y califica | — | 5 |
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
