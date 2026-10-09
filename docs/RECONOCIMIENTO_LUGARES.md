# Reconocimiento de lugares en fotos (retirado, guardado para reutilizar)

Entre los PR #51 y #53 la herramienta de fotos tuvo un botón «🔎 Reconocer el lugar (experimental)».
Comparaba la foto con 403 lugares famosos y sugería los 5 más parecidos. Se retiró a pedido: la prioridad es mostrar los
metadatos (EXIF) y llevar al punto GPS. Esta nota explica cómo funcionaba, qué tan bien funcionaba y cómo restaurarlo.

## Cómo funcionaba

1. El navegador descargaba el modelo **CLIP** `Xenova/clip-vit-base-patch32` (cuantizado q8, ~89 MB, solo la parte
   visual) desde Hugging Face, con **Transformers.js 3.0.2** cargado de jsDelivr (`.../transformers@3.0.2/+esm`).
   La primera vez tardaba ~10 s con buena conexión; después quedaba guardado en el navegador.
2. La foto se convertía en un vector de 512 números. Nunca salía del navegador.
3. Cada lugar tenía un vector de texto: el promedio de 3 frases («a photo of the Statue of Liberty», «…, New York»,
   «a tourist photo of the …, a famous landmark»). Esos vectores se precalculaban en GitHub Actions
   (`config/monumentos_vec.json`, 285 KB en int8) para no descargar la parte de texto del modelo.
4. Similitud coseno × 100 → softmax → 5 candidatos con su porcentaje y su ciudad más cercana (Natural Earth).
5. Aparte, 4 frases de «réplica o souvenir» contra 4 de «monumento real al aire libre» daban la probabilidad de réplica:
   aviso medio desde 50 %, alto desde 75 %.

La lista `config/monumentos.json` salía de `tools/monumentos/construir.py`: lugares de Wikidata con artículo en al menos
45 Wikipedias, menos los no reconocibles en una foto (regiones, rutas, ruinas sin imagen característica), más 70 curados
(Ángel de la Independencia, Bellas Artes, Taj Mahal, Big Ben…).

## Resultados medidos (octubre de 2026)

| Prueba | Resultado |
|---|---|
| 42 fotos de Wikimedia Commons de 14 lugares | El primer lugar acertó en 29 (69 %) |
| Probabilidad de réplica en fotos reales | Máximo 45 % |
| Souvenirs (llaveros, figuras, imanes) | 76–100 % en 7 de 9; 2 fotos de parques de miniaturas al aire libre quedaron en 9 % y 22 % |
| Chromium real, foto de la Estatua de la Libertad | «Estatua de la Libertad, cerca de Nueva York, 86 %» en 10 s |

Límites conocidos: no distingue réplicas grandes al aire libre (Las Vegas, París); confunde lugares del mismo tipo
(Chichén Itzá → Pirámide del Sol, Torre Eiffel → Torre Montparnasse); no lee letreros; solo conoce los 403 lugares.

## Cómo restaurarlo

Todo está en el commit `b12f23c` de `main` (el último antes del retiro):

```bash
git checkout b12f23c -- js/reconocer.js config/monumentos.json config/monumentos_vec.json \
  tools/monumentos tests/js/reconocer.test.mjs tests/test_monumentos.py
git show b12f23c:js/foto.js > /tmp/foto_con_reconocimiento.js   # tomar de aquí htmlLugares, avisoReplica y el botón
```

Además, en `index.html` hay que volver a poner el botón `#foto-reconocer` y el contenedor `#foto-lugares-res`,
y en `css/app.css` los estilos `.lugares` y `.aviso-replica`. Si se cambian la lista o las frases, se regeneran los
vectores con `node tools/monumentos/vectores.mjs` (necesita `npm i @huggingface/transformers@3.0.2`). Si los vectores
no coinciden con la huella de las frases, el navegador los calcula él mismo, descargando también la parte de texto
del modelo (~60 MB más).

Licencias: CLIP, MIT (OpenAI); Transformers.js, Apache 2.0; Wikidata, CC0.
