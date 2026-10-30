# INPC por producto y servicio (archivo manual)

La API pública de INEGI solo trae el INPC general y sus agregados. Los índices de cada producto y servicio
(tortilla, cerveza, leche, electricidad, agua, gas LP, transporte, renta… unos 299 «genéricos») solo se pueden
descargar desde la herramienta web **Índices de precios** de INEGI. Por eso se cargan a mano: cualquier archivo
`.csv` que se ponga en esta carpeta aparece en economia.html → «🛒 Precios México», con su gráfica.

## Cómo descargarlo (una vez, y luego cada mes)

1. Abre https://www.inegi.org.mx/app/indicesdeprecios/
2. Entra a **Índice Nacional de Precios al Consumidor** y elige la estructura **por objeto del gasto**
   (la que llega hasta el nivel de **genérico**). Los nombres exactos de los menús pueden variar un poco.
3. Marca los genéricos que quieras (o todos) y el periodo (por ejemplo, de 2015 a la fecha), con frecuencia **mensual**.
4. Pulsa **Exportar** y elige el formato **CSV**.
5. En GitHub, abre el repositorio Geopolitica → carpeta `config/inpc_genericos` → **Add file → Upload files**,
   sube el archivo (por ejemplo `inpc_genericos.csv`) y confirma con **Commit changes**.
6. Al día siguiente (o al lanzar a mano el workflow «Economía») aparecen las gráficas.

Para actualizarlo cada mes, repite los pasos y reemplaza el archivo con el mismo nombre.

## Formatos que se leen

- Una columna con el periodo (`2026/09`, `2026-09` o `Sep 2026`) y una columna por genérico, o
- Una fila por genérico y los periodos como encabezados.

Si el archivo de INEGI trae otro acomodo, la sección lo indica como error y se ajusta el lector.
