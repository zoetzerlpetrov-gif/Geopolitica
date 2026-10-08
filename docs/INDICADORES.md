# Indicadores y dimensiones transversales

Todas son reglas fijas, sin IA. Código: `ingest/dimensiones.py`. Pruebas: `tests/test_dimensiones.py`.

## Nivel de alerta (`nivel_alerta`)

| Nivel | Regla |
|---|---|
| **FLASH** | Severidad 5; o severidad 4 en un área crítica (Seguridad, Salud NRBQ, Infraestructura) confirmada por 3 o más fuentes |
| **PRIORIDAD** | Severidad 3 o más; o severidad 2 con impacto para México; o el evento escaló respecto de la corrida anterior |
| **RUTINA** | Todo lo demás |

Ejemplo: un ciberataque (Tecnología) de severidad 4 con 5 fuentes es PRIORIDAD, no FLASH, porque Tecnología no es un área crítica en esta regla. Si se quiere que lo sea, se agrega a `AREAS_CRITICAS`.

## Delta (`delta`)

Compara cada evento con el mismo `id` en la corrida anterior (una hora antes).

| Valor | Regla |
|---|---|
| `nuevo` | No existía en la corrida anterior |
| `escala` | Subió la severidad, o se sumaron 2 o más fuentes |
| `desescala` | Bajó la severidad |
| `sin_cambio` | Ninguna de las anteriores |

## Estado del dato (`estado_dato`)

| Valor | Significado | Ejemplos |
|---|---|---|
| `tiempo_real` | Llega al navegador directo de la fuente, segundos de retraso | (reservado) |
| `retrasado` | Instantánea generada por GitHub Actions; minutos u horas de retraso | eventos de noticias, aviones y buques |
| `estimado` | Calculado, no observado | posición de satélites (SGP4) |
| `estatico` | Catálogo que cambia poco | aeropuertos, centrales, zonas, eventos de ejemplo |

## Índice de Inestabilidad por País (0–100)

**Indicador propio de este proyecto.** No es comparable con índices académicos ni de agencias de riesgo; sirve para ordenar países según la actividad reciente que capta el monitor.

```
A = Σ  severidad² × peso_área × 0.5^(edad_en_días / 7)        (eventos del país en los últimos 30 días)
índice = 100 × (1 − e^(−A / 25))
```

| Área | Peso | Área | Peso |
|---|---|---|---|
| Seguridad | 1.0 | Geoeconomía | 0.4 |
| Identidad (protestas) | 0.6 | Energía, Clima, Tecnología, Geografía | 0.3 |
| Instituciones (elecciones, golpes) | 0.6 | Regional, Riesgo aplicado | 0.2 |
| Salud NRBQ, Infraestructura | 0.5 | | |
| Demografía | 0.4 | | |

Ejemplo resuelto: un solo evento de Seguridad, severidad 5, de hoy: A = 5² × 1.0 × 1 = 25 → índice = 100 × (1 − e⁻¹) = **63**. El mismo evento de hace 7 días: A = 12.5 → **39**.

Límites conocidos: depende de cuánta cobertura de prensa tenga cada país (sesgo de cobertura), y un país sin eventos en el monitor aparece sin valor, no como "estable".

## Correlación entre áreas

Dos eventos se correlacionan si tienen **áreas principales distintas**, ocurren a **menos de 300 km** y con **menos de 72 h** de diferencia. Cada evento guarda hasta 10 correlacionados (los más cercanos). Se usa una rejilla de 3° × 3° para no comparar todos contra todos.

Ejemplo: un ataque en el Mar Rojo (Seguridad) y una alza de fletes reportada desde Yibuti (Geoeconomía) el mismo día se correlacionan; dos ataques en la misma zona (ambos Seguridad), no.

## Relaciones

`relaciones` une un evento con entidades (`chokepoint:suez`, `osm:n123`), zonas (`mar_rojo`) y personas de rol público (ids de Wikidata). Las personas nunca llevan coordenadas: ver `tests/test_privacidad.py`.

## Reglas de la ingesta (Fase 2)

**Severidad de GDELT (1–5).** Parte de 1; +1 si la escala Goldstein es ≤ −5; +1 si es ≤ −8; +1 con 20 artículos o más; +1 con 50 o más. Ejemplo: combate con Goldstein −10 en 40 artículos → 1 + 1 + 1 + 1 = **4**.

**Severidad de RSS y ReliefWeb.** Base 2. Sube a 3 si el título o la descripción mencionan, por ejemplo, ataque, sanciones, protestas, misil o brote. Sube a 4 si mencionan muertos, bombardeo, golpe de estado, estado de emergencia, terremoto o pandemia. La lista completa está en `ingest/run.py` (`GRAVES`, `MEDIAS`).

**Impacto para México (regla automática, sin verificar).** Hay texto de impacto si el evento ocurre en México, si lo menciona, o si ocurre en un socio o vecino directo (EUA, Canadá, China, Guatemala, Belice, Honduras, El Salvador, Cuba, Venezuela, Colombia) en un área sensible (geoeconomía, energía, demografía, infraestructura, salud NRBQ). La regla de socios exige además severidad 3 o más, y «New Mexico» / «Nuevo México» (estado de EUA) no cuenta como mención de México. Seguridad quedó fuera tras la primera corrida real: marcaba como impacto para México 55 de 235 eventos, casi todos hechos policiales en EUA.

**Deduplicación.** Una nota sin país detectado se compara con todos los grupos y, si se agrupa, el evento toma el país de la nota que sí lo trae. Dos notas son la misma historia si comparten país, están a menos de 36 h y sus títulos tienen un Jaccard ≥ 0.6 (palabras de más de 3 letras). Se conserva la de mayor severidad y se suman las fuentes. `verificado` = 2 o más medios distintos.

**Tope.** Se publican hasta 3,000 eventos de las últimas 72 h. Si hay más, quedan los de mayor severidad y con más fuentes. El historial guarda hasta 2,000 registros compactos por día durante 90 días.

## Matriz de riesgo (Fase 5)

Escala 5 × 5 según la práctica de ISO 31000: **probabilidad** de que el hecho escale o tenga consecuencias en 30 días (1–5) × **impacto** (1–5).

- Impacto inicial = severidad del evento.
- Probabilidad inicial **por regla**, como punto de partida para el analista (no es un pronóstico): base 2; +2 si escaló frente a la corrida anterior; +1 si es nuevo con severidad ≥ 4; −1 si desescala; +1 si está verificado por 2 o más medios; +1 si tiene 3 o más eventos correlacionados. Límite 1–5.
- Niveles por puntaje (probabilidad × impacto): 1–4 bajo, 5–9 medio, 10–15 alto, 16–25 crítico.

Ejemplo resuelto: un evento que escaló (+2) y está verificado (+1) → probabilidad 2 + 2 + 1 = 5. Con severidad 4 → puntaje 20 → **crítico**.

Los ajustes del analista se guardan solo en su navegador y el CSV indica en la columna `origen` si el valor viene de la regla o del usuario.

## Vista México: semáforo

Rojo = severidad 4 o 5; ámbar = 3; verde = 1 o 2. Cada área toma el color de su evento más grave.

## Ajustes del clasificador con datos reales (8 oct 2026)

- **Siglas solo en mayúsculas:** UN (Naciones Unidas), WHO (OMS), COP (cumbre climática) y AI (inteligencia artificial) cuentan solo si el texto original las escribe en mayúsculas. Antes, el artículo español «un» sumaba a Instituciones y el pronombre inglés «who» a Salud.
- **«mine»** (también «mío» en inglés) se reemplazó por «copper/lithium/gold/coal mine». Se agregaron «COP29», «COP30» y «COP31».
- **Fuera de tema:** notas de deportes o espectáculos (cricket, fútbol, tenis, cine, conciertos…) se descartan, salvo que el texto sea grave (muertos, ataque, etc.). Se cuentan en el run-log como `fuera_de_tema`.
- **País por texto:** se agregaron gentilicios (ruso, israelí, alemán…), regiones (Texas, Cataluña, Tigray, Donbás…) y líderes (Putin, Netanyahu, Macron…). Para ubicar el hecho gana un **lugar** (país, ciudad, región) sobre un **actor** (gentilicio, líder, grupo): «ataques rusos en el norte de Ucrania» → Ucrania. Entre lugares gana el que va después de una preposición de lugar («in», «en», «near», «off», «coast of»): «Russian missile kills 19 in Kyiv» → Ucrania. Si solo hay actores, se usa el primero.

## Resumen propio de cada evento (~30 palabras, sin IA)

`ingest/resumen.py` lee el título y la descripción del feed solo en memoria y extrae **hechos**: países (en orden de aparición), organismos (ONU, OTAN, UE, OMS, FMI, hutíes, Hamás…), cifras con unidad (muertos, heridos, desplazados, detenidos, drones, misiles, hogares afectados, montos y porcentajes) y el tipo de hecho (área y subtema del clasificador). Con eso redacta su propia frase en español:

> Seguridad y poder militar · Actores no estatales en Arabia Saudita (Medio Oriente): 3 muertos y 12 heridos. Involucra a Arabia Saudita, Yemen, los hutíes y la ONU. Nota en inglés de Al Jazeera.

En GDELT el título se traduce («Combate: Rusia → Ucrania (Kyiv, Ucrania)») y el resumen agrega las palabras del enlace de origen, que suelen ser el titular del artículo. Una prueba automática verifica que ninguna secuencia de 5 palabras de la descripción del medio aparezca en el resumen. Límite: es una frase armada con reglas; un resumen redactado (con IA) queda para la Fase 6.
