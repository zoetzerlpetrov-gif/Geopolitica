# INPC por producto y servicio (archivo manual)

La API pública de INEGI solo trae el INPC general y sus agregados. Los índices de cada producto y servicio
(tortilla, cerveza, leche, electricidad, agua, gas LP, transporte, renta… unos 299 «genéricos») solo se pueden
descargar desde la herramienta web **Índices de precios** de INEGI. Por eso se cargan a mano: cualquier archivo
`.csv` que se ponga en esta carpeta aparece en economia.html → «🛒 Precios México», con su gráfica.

## Cómo descargarlo (una vez, y luego cada mes)

1. Abre la liga directa del INPC nacional mensual:
   https://www.inegi.org.mx/app/indicesdeprecios/Estructura.aspx?idEstructura=112001300040
   (si se abre la página principal en blanco, con solo «Periodo» y «Restaurar», es porque no hay una estructura elegida;
   esta liga ya la trae elegida).
2. En el árbol hay dos versiones del INPC. Usa la que dice **«Actualización de Canasta y Ponderadores 2024»**: la otra
   («Base segunda quincena de Julio 2018» sin esa frase) es la serie anterior y **termina en julio de 2024**.
   Dentro de ella despliega **«por objeto del gasto»** hasta el último nivel, el de los **genéricos**
   («Tortilla de maíz», «Cerveza», «Electricidad»…). Los niveles intermedios («Pan, tortillas y cereales») también
   se leen, pero agrupan varios productos. No uses «por origen de los bienes» ni «por durabilidad» si buscas productos.
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
