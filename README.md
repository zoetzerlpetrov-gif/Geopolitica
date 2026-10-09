# Monitor Geopolítico

Mapa mundial interactivo de eventos geopolíticos clasificados en 13 áreas, con vista de impacto para México.
Sitio estático en GitHub Pages; los eventos se actualizan cada hora con GitHub Actions (GDELT, 8 feeds RSS y ReliefWeb).

- **Mapa:** `index.html`
- **Taxonomía visual (13 áreas, subtemas y palabras clave):** `taxonomia.html`
- **Plan de pruebas:** [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md)
- **Fuentes y licencias:** [`SOURCES.md`](SOURCES.md)

> Los datos provienen de terceros. La clasificación es automática y puede tener errores. No es asesoría.

## Cómo está armado

```
 GitHub Actions (cron "17 * * * *", Fase 2)          GitHub Pages (sitio estático)
 ┌──────────────────────────────────────────┐        ┌──────────────────────────────────────┐
 │ ingest/  descarga → normaliza → geocodif.│        │ index.html + js/ (módulos ES)         │
 │          → deduplica → clasifica         │ commit │  └ MapLibre GL (WebGL, vendor/)       │
 │ ingest/validate.py  ← schema/            │ ─────► │     ├ mapa base OpenFreeMap           │
 │ pytest + node --test                     │  data/ │     │  (respaldo: Natural Earth local) │
 │ si todo pasa → workflow "pages.yml"      │        │     └ capas: eventos, chokepoints     │
 └──────────────────────────────────────────┘        └──────────────────────────────────────┘
```

| Carpeta | Contenido |
|---|---|
| `config/` | `taxonomy.json` (13 áreas, Eje 1), `entities.json` (12 categorías de entidades, Eje 2), `capas.json` (familias de capas y su estado), `regions.json`, `chokepoints.json`, `gazetteer.json`, `fuentes.json` (ingesta), `analisis.json` (checklist y lentes) |
| `data/` | `events.json`, `run-log.json`, `indice-paises.json`, `entidades/` (Wikidata), `base/countries.geojson`, `history/` |
| `schema/` | `event.schema.json` y `entity.schema.json` (contratos de datos) |
| `js/` | `app.js`, `map.js`, `card.js`, `capas.js` (PMTiles), `movimiento.js` + `sat-worker.js`, `imagenes.js`, `seguimiento.js`, `refresh.js`, `linea-tiempo.js`, `indice.js`, `analisis.js` (se descarga al abrir «Análisis»), `analisis-logica.js`, `cuaderno.js` |
| `vendor/` | MapLibre GL 5.24.0, pmtiles 4.5.0 y satellite.js 6.0.2 copiados localmente |
| `ingest/` | `run.py` (ingesta horaria), `fuentes.py` (GDELT, RSS, ReliefWeb), `geo.py` (país por coordenada o por texto), `classify.py` (clasificador por reglas), `dimensiones.py` (alerta, delta, índice, correlación), validadores |
| `tools/` | `capas/` (PMTiles), `entidades/` (Wikidata), `vivos/` (aviones, buques, satélites), `medicion/` (rendimiento) |
| `tests/` | Pruebas de Python (`pytest`) y de JavaScript (`node --test`) |
| `docs/` | `TEST_PLAN.md`, `INDICADORES.md` |

### Dónde vive cada dato

| Dato | Dónde se guarda | Por qué |
|---|---|---|
| Código y configuración (y eventos de ejemplo) | rama `main` | Cambian poco o pesan poco |
| Eventos de 72 h, historial de 90 días (un archivo por día, se descarga solo al pedir 30 o 90 días), run-log, índice por país | rama huérfana `datos-eventos`, reescrita cada hora | Un commit por hora haría crecer el historial sin límite |
| Capas PMTiles (~40 MB) | rama huérfana `datos-capas`, reescrita en cada reconstrucción | Para no sumar 40 MB al historial cada mes |
| Aviones, buques, satélites, sanciones | rama huérfana `datos-vivos`, reescrita cada 20 min | Una instantánea cada 20 min inflaría el historial decenas de MB al día |

El workflow de publicación copia esas ramas a `data/capas/`, `data/vivos/` y `data/` (eventos) antes de publicar en Pages. Mientras `datos-eventos` no exista, se publican los datos de ejemplo.

### Por qué es rápido con muchos datos

Igual que los mapas OSINT que manejan miles de íconos, este mapa no crea un elemento HTML por marcador. Todo se dibuja con **WebGL** en la tarjeta gráfica:

1. Los eventos se envían a la GPU como una sola fuente GeoJSON con propiedades mínimas (`id`, área, severidad, título). El resto de la información se busca por `id` solo al abrir la ficha.
2. La agrupación (clusters) la calcula MapLibre en un *Web Worker*, en segundo plano, sin congelar la página.
3. Los colores por área y el tamaño por severidad son *expresiones* de estilo que evalúa la GPU.
4. Los filtros recorren un arreglo en memoria (unos 10 ms con 50,000 eventos) y reemplazan los datos de una sola vez.

5. Las capas estáticas son **PMTiles**: el navegador pide por rangos HTTP solo los mosaicos visibles (en la prueba: 45 KB de 41 MB).
6. Aviones y buques: solo lo que cae en la vista, máximo 5,000, recalculado 500 ms después de mover el mapa; flechas SDF que la GPU rota y colorea.
7. Satélites: SGP4 en un Web Worker. Modo **LITE** (por defecto en celular): sin capas en movimiento ni imágenes, menos píxeles y sin animaciones.

Pruebas de carga (consola del navegador, F12):
- `?carga=50000` agrega 50,000 eventos sintéticos.
- `?aviones=5000&mov=aeronaves` agrega 5,000 aviones sintéticos y activa la capa.
- `?capas=aeropuertos,centrales,zonas` activa capas estáticas al abrir.

## Ver el sitio en tu computadora

Los navegadores bloquean la lectura de archivos JSON con `file://`, así que hay que levantar un servidor local:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Correr las pruebas

```bash
pip install -r requirements-dev.txt
python3 ingest/validate.py          # valida data/events.json
python3 -m pytest -q                # contratos, esquema, caso Mar Rojo
node --test "tests/js/*.test.mjs"   # cuenta regresiva y seguridad de HTML
```

## Publicar en GitHub Pages (una sola vez)

1. *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
2. Haz merge a `main`. El workflow **Publicar en GitHub Pages** corre las pruebas y, si pasan, publica.
3. El sitio queda en `https://zoetzerlpetrov-gif.github.io/Geopolitica/`.

## Regenerar archivos derivados

```bash
cd tools && npm ci
npm run countries   # data/base/countries.geojson y config/gazetteer.json desde Natural Earth
npm run vendor      # copia MapLibre a vendor/
cd .. && python3 tools/make_sample_events.py   # datos de ejemplo de la Fase 1
python3 tools/monumentos/construir.py           # config/monumentos.json (lugares famosos, Wikidata + curados)
```

Si cambia `config/monumentos.json` o las frases de `js/reconocer.js`, hay que regenerar `config/monumentos_vec.json`
con `node tools/monumentos/vectores.mjs` (necesita `npm i @huggingface/transformers@3.0.2` y acceso a Hugging Face).
Mientras no se regenere, el navegador nota que la huella no coincide y calcula los vectores él mismo (más lento).

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Lectura del repo de clima y propuesta | Hecha |
| 1 | `taxonomy.json`, mapa con datos de ejemplo, esquema, pruebas, publicación | Hecha |
| A | Diagnóstico y corrección de rendimiento; metas en CI | Hecha |
| B | 13 áreas, clasificador por reglas, 26 titulares | Hecha |
| C0 | Catálogo de entidades, esquemas, alerta/delta/índice/correlación, privacidad | Hecha |
| C1 | Zonas e infraestructura estática en PMTiles | Hecha: 34 familias, incluidas cables, presas y ductos (OSM); las de Overpass a veces quedan «parcial» y se reintentan |
| C2 | Organizaciones y personas de rol público (Wikidata) | Hecha |
| C3 | Satélites (SGP4 en worker), ficha GCAT, pases visibles y telescopios | Hecha; CelesTrak en pausa por su robots.txt (pendiente de permiso); órbitas de SatNOGS |
| C4 | Aeronaves (OpenSky, adsb.lol) y buques (AISStream con clave): ficha con ruta o destino declarado, bandera y trayectoria | Hecha |
| C5 | Recursos estratégicos e instalaciones militares públicas (OSM) | Hecha (cobertura parcial de OSM) |
| C6 | Seguimiento, imágenes NASA GIBS; cámaras públicas (solo enlace a la página oficial) | Hecha: 8 cámaras curadas en `config/camaras.json` |
| 2 | Ingesta GDELT, ReliefWeb y RSS cada hora | Hecha; ReliefWeb requiere tu `appname` |
| 4 | Línea de tiempo, mapa de calor por país, checklist de 10 pasos con notas, 7 lentes teóricas | Hecha |
| 5 | Vista México con semáforo, matriz de riesgo 5 × 5 con CSV, modo aprendizaje | Hecha |
| 6 | Redes sociales e IA opcional | Parcial: resúmenes con IA (Groq) cuando hay clave; algunas fuentes de redes sociales públicas |

## Exclusiones

No se integran: domicilios, ubicaciones en tiempo real, familiares, contactos o vida personal de personas (incluidas figuras públicas); vínculos entre aviones privados o carteras de criptomonedas y personas con nombre; cámaras privadas o expuestas por error; escaneo de puertos o reconocimiento de redes; detalles operativos de instalaciones militares; scraping que viole términos de servicio. Detalle y motivos en [`SOURCES.md`](SOURCES.md#exclusiones-no-se-integran).
