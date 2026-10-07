# Monitor Geopolítico

Mapa mundial interactivo de eventos geopolíticos clasificados en 11 áreas, con vista de impacto para México.
Sitio estático en GitHub Pages; los datos se actualizan cada hora con GitHub Actions (a partir de la Fase 2).

- **Mapa:** `index.html`
- **Taxonomía visual (11 áreas, subtemas y palabras clave):** `taxonomia.html`
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
| `config/` | `taxonomy.json` (11 áreas), `regions.json` (país → región), `chokepoints.json`, `gazetteer.json` (centroide por país) |
| `data/` | `events.json` (eventos vigentes), `run-log.json` (bitácora de la última corrida), `history/` (archivo diario, 90 días), `base/countries.geojson` |
| `schema/` | `event.schema.json`: contrato de datos de cada evento |
| `js/`, `css/` | Interfaz. Sin frameworks ni compilación |
| `vendor/` | MapLibre GL 5.24.0 copiado localmente (no depende de un CDN) |
| `ingest/` | Scripts de Python (validador hoy; ingesta en la Fase 2) |
| `tests/` | Pruebas de Python (`pytest`) y de JavaScript (`node --test`) |
| `tools/` | Generadores de una sola vez: capa de países, copia de MapLibre, datos de ejemplo |

### Por qué es rápido con muchos datos

Igual que los mapas OSINT que manejan miles de íconos, este mapa no crea un elemento HTML por marcador. Todo se dibuja con **WebGL** en la tarjeta gráfica:

1. Los eventos se envían a la GPU como una sola fuente GeoJSON con propiedades mínimas (`id`, área, severidad, título). El resto de la información se busca por `id` solo al abrir la ficha.
2. La agrupación (clusters) la calcula MapLibre en un *Web Worker*, en segundo plano, sin congelar la página.
3. Los colores por área y el tamaño por severidad son *expresiones* de estilo que evalúa la GPU.
4. Los filtros recorren un arreglo en memoria (unos 10 ms con 50,000 eventos) y reemplazan los datos de una sola vez.

Prueba de carga: abre `index.html?carga=50000` y mira la consola del navegador (F12). Cada cambio de filtro imprime cuántos milisegundos tardó.

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
```

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Lectura del repo de clima y propuesta | Hecha |
| 1 | `taxonomy.json`, mapa con datos de ejemplo, esquema, pruebas, publicación | Hecha (palabras clave pendientes de aprobación) |
| 2 | Ingesta GDELT, ReliefWeb y RSS cada hora con GitHub Actions | Pendiente |
| 3 | Clasificador por reglas + pruebas con ≥22 titulares | Pendiente |
| 4 | Filtros completos, capas fijas, mapa de calor, línea de tiempo, checklist, lentes teóricas | Pendiente |
| 5 | Vista México, matriz de riesgo, modo aprendizaje | Pendiente |
| 6 | Redes sociales y clasificación con IA (opcional) | Pendiente |
