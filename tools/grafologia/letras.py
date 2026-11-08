"""Genera config/grafologia_letras.json: letras y números con sus variantes y lecturas.

Las lecturas con fuente "m" resumen el manual de grafología de la persona usuaria (J. Tovar Molina: grafología inductiva
y números); las demás son lecturas tradicionales generales y se muestran como complementarias.
Uso: python3 tools/grafologia/letras.py
"""
import json
OV_AB = ("ovalo_abierto_arriba", "Óvalo abierto arriba", "franqueza y facilidad para comunicar; en exceso, indiscreción o dificultad para guardar confidencias")
OV_CE = ("ovalo_cerrado", "Óvalo bien cerrado", "reserva y discreción; sabe guardar lo propio")
OV_LA = ("ovalo_con_lazo", "Óvalo cerrado con lazo o doble lazo", "reserva marcada; capacidad de callar o de ocultar lo que no quiere mostrar")
OV_BA = ("ovalo_abierto_abajo", "Óvalo abierto por abajo", "la escuela lo lee como poca transparencia en lo material o en lo íntimo; es un indicio débil que debe confirmarse con otros rasgos")
JAMBA = [
 ("jamba_bucle_amplio", "Parte de abajo (jamba) con bucle amplio", "imaginación y necesidad de satisfacción en lo material, físico o afectivo; si es muy inflado, fantasía o exigencia en ese terreno"),
 ("jamba_bucle_estrecho", "Jamba con bucle estrecho o apretado", "contención o inhibición en lo físico y afectivo"),
 ("jamba_angulosa", "Jamba angulosa (en triángulo o con ángulo en la base)", "exigencia, insatisfacción o tensión en lo afectivo y material; agresividad contenida"),
 ("jamba_curva_abierta", "Jamba curva que no se cierra (gancho)", "deseos o proyectos materiales que no se concretan; también ternura que no termina de expresarse"),
 ("jamba_palo_recto", "Jamba en palo recto, sin bucle", "sentido práctico, independencia afectiva y energía dirigida a objetivos concretos"),
 ("jamba_larga", "Jamba muy larga", "mucha energía física o fuerte interés por lo material y lo corporal"),
 ("jamba_corta", "Jamba corta", "poca energía o poco interés por lo material y lo físico"),
 ("jamba_hacia_izquierda", "Jamba que termina hacia la izquierda sin unirse", "según el simbolismo del espacio, apego al pasado, al hogar o a la figura materna"),
 ("jamba_hacia_derecha", "Jamba que termina hacia la derecha y enlaza con la letra siguiente", "energía orientada a la acción y hacia los demás; buen paso de la idea a la realización"),
]
HAMPA = [
 ("hampa_bucle_amplio", "Parte de arriba (hampa) con bucle amplio", "imaginación, sensibilidad e idealismo"),
 ("hampa_bucle_estrecho", "Hampa con bucle estrecho", "contención de la imaginación; razonamiento más controlado"),
 ("hampa_palo", "Hampa en palo simple, sin bucle", "pensamiento práctico, directo y sobrio"),
 ("hampa_muy_alta", "Hampa muy alta respecto de la zona media", "aspiraciones elevadas, idealismo u orgullo"),
 ("hampa_baja", "Hampa baja o corta", "realismo, aspiraciones modestas o poca confianza en las propias ideas"),
]
def sel(lista, *ids): return [x for x in lista if x[0] in ids]
C = []
def add(id, nombre, simb, var, tipo="letra"): C.append({"id": id, "nombre": nombre, "tipo": tipo, "simboliza": simb, "variantes": [list(v) for v in var]})

add("a", "Letra a", "la comunicación y la apertura hacia los demás (su óvalo)", [OV_AB, OV_CE, OV_LA, OV_BA,
  ("de_imprenta", "En forma de imprenta (a de dos pisos)", "cultura, gusto por la lectura y por la forma clara")])
add("b", "Letra b", "la relación entre las ideas (hampa) y el yo íntimo (óvalo)", sel(HAMPA, "hampa_bucle_amplio", "hampa_palo", "hampa_muy_alta") + [
  ("ovalo_abierto", "Óvalo abierto", "apertura y credulidad; confía con facilidad"), ("ovalo_cerrado", "Óvalo cerrado", "reserva sobre lo íntimo")])
add("c", "Letra c", "la adaptación y el trato con los demás (curva abierta a la derecha)", [
  ("curva_amplia", "Curva amplia y redonda", "amabilidad y facilidad de adaptación"), ("angulosa", "Angulosa", "firmeza y espíritu crítico"),
  ("gancho_inicial", "Con gancho inicial", "apego a ideas, costumbres o personas del pasado")])
add("d", "Letra d", "la autoestima, las ideas propias y la reacción ante la crítica (hampa) junto con el yo (óvalo)", sel(HAMPA, "hampa_muy_alta", "hampa_baja", "hampa_palo") + [
  ("hampa_con_bucle", "Hampa con bucle", "la escuela de rasgos la asocia con sensibilidad a la crítica, sobre todo si el bucle es amplio"),
  ("hampa_hacia_izquierda", "Hampa que regresa en curva hacia la izquierda (d griega)", "cultura y gusto estético; también, vuelta hacia el pasado o hacia uno mismo"),
  ("ovalo_y_hampa_separados", "Óvalo y hampa separados", "pensamiento analítico; tiende a separar la razón del afecto"), OV_AB])
add("e", "Letra e", "la receptividad y la sociabilidad (su ojo)", [
  ("ojo_abierto", "Ojo abierto y claro", "receptividad y tolerancia a las opiniones ajenas"), ("ojo_cerrado", "Ojo cerrado o lleno de tinta", "cerrazón a las opiniones ajenas o tensión"),
  ("griega", "En forma de épsilon (ε)", "cultura y gusto por la forma")])
add("f", "Letra f", "el equilibrio entre planear (parte de arriba) y ejecutar (parte de abajo); recorre las tres zonas", [
  ("bucles_proporcionados", "Partes de arriba y de abajo proporcionadas", "equilibrio entre planear y ejecutar; buena organización"),
  ("arriba_mayor", "Parte de arriba más grande", "predominio de las ideas y los planes sobre la realización"),
  ("abajo_mayor", "Parte de abajo más grande", "predominio de lo práctico y lo material"), ("palo_simple", "Palo simple, sin bucles", "sentido práctico y rapidez"),
  ("nudo_en_cruce", "Con nudo en el cruce", "tenacidad; termina lo que empieza")])
add("g", "Letra g", "lo instintivo, lo material y la vida afectiva (su jamba) y la comunicación (su óvalo)", JAMBA + [OV_AB, OV_CE])
add("h", "Letra h", "las ideas (hampa) y el trato con los demás (su arco)", sel(HAMPA, "hampa_bucle_amplio", "hampa_palo", "hampa_muy_alta") + [
  ("arco_anguloso", "Arco anguloso", "firmeza y poca concesión en el trato"), ("arco_redondo", "Arco redondo", "amabilidad y adaptación")])
add("i", "Letra i", "la atención al detalle, la precisión y la memoria (su punto)", [
  ("punto_preciso", "Punto preciso, justo encima", "precisión, atención al detalle y buena memoria"), ("punto_alto", "Punto muy alto", "imaginación e idealismo"),
  ("punto_adelantado", "Punto adelantado (a la derecha)", "impaciencia, entusiasmo y rapidez"), ("punto_atrasado", "Punto atrasado (a la izquierda)", "prudencia, duda o tendencia a postergar"),
  ("sin_punto", "Sin punto", "prisa o descuido de los detalles"), ("punto_circulo", "Punto en forma de círculo", "deseo de originalidad o de llamar la atención"),
  ("punto_raya", "Punto en forma de raya o acento", "rapidez, impaciencia o irritabilidad"),
  ("puntos_desiguales", "Puntos desiguales a lo largo del escrito", "el manual lo cuenta entre los indicadores del temperamento nervioso: atención y precisión variables", "m")])
add("j", "Letra j", "el detalle (su punto) y lo instintivo y material (su jamba)", sel(JAMBA, "jamba_bucle_amplio", "jamba_angulosa", "jamba_palo_recto", "jamba_larga", "jamba_corta", "jamba_hacia_izquierda") + [
  ("sin_punto", "Sin punto", "prisa o descuido de los detalles")])
add("k", "Letra k", "la actitud ante la autoridad y los desafíos (su lazo central)", [
  ("lazo_exagerado", "Lazo o bucle central exagerado", "actitud desafiante o rebelde ante la autoridad"), ("de_imprenta", "En forma de imprenta", "sentido práctico y claridad")] + sel(HAMPA, "hampa_bucle_amplio", "hampa_palo"))
add("l", "Letra l", "las aspiraciones y la vida intelectual (su hampa)", HAMPA)
add("m", "Letra m", "la relación con los demás y el orgullo (sus arcos)", [
  ("arcos_redondos", "Arcos redondos", "amabilidad y adaptación"), ("arcos_angulosos", "Arcos angulosos", "firmeza y espíritu analítico"),
  ("primer_arco_alto", "Primer arco más alto", "orgullo y buena autoestima frente a los demás"), ("ultimo_arco_alto", "Último arco más alto", "susceptibilidad; necesidad de destacar ante los demás"),
  ("en_guirnalda", "En guirnalda (como u)", "receptividad y afecto; facilidad de trato"), ("filiforme", "Filiforme (como hilo)", "habilidad, rapidez; también evasión")])
add("n", "Letra n", "la relación con los demás (sus arcos)", [
  ("arcos_redondos", "Arcos redondos", "amabilidad y adaptación"), ("arcos_angulosos", "Arcos angulosos", "firmeza y espíritu analítico"),
  ("en_guirnalda", "En guirnalda (como u)", "receptividad y afecto"), ("filiforme", "Filiforme (como hilo)", "habilidad, rapidez; también evasión")])
add("enie", "Letra ñ", "la comunicación (arcos) y el impulso (su tilde)", [
  ("tilde_larga", "Tilde larga o enérgica", "entusiasmo e impulso"), ("tilde_ausente", "Sin tilde", "prisa o descuido"), ("tilde_adelantada", "Tilde adelantada", "impaciencia")])
add("o", "Letra o", "la comunicación, la sinceridad y la vida íntima (su óvalo)", [OV_AB, OV_CE, OV_LA, OV_BA,
  ("ovalo_grande", "Óvalo grande respecto de las demás letras", "expansividad emocional; necesidad de ser escuchado")])
add("p", "Letra p", "la energía física, lo material y la actividad (palo) y el yo afectivo (óvalo)", [
  ("ovalo_abierto", "Óvalo (bolita) abierto", "comunicación y apertura sobre lo propio"), ("ovalo_cerrado", "Óvalo cerrado", "reserva sobre lo íntimo"),
  ("ovalo_grande", "Óvalo grande respecto del palo", "importancia del yo y de lo afectivo"), ("ovalo_pequeno", "Óvalo pequeño", "modestia o contención afectiva"),
  ("palo_largo", "Palo largo hacia abajo", "energía física, actividad, interés por lo material o por el deporte"),
  ("palo_corto", "Palo corto (p chaparra)", "poca energía física o desinterés por lo material"),
  ("palo_con_bucle", "Palo con bucle abajo", "imaginación en lo físico; gusto por la actividad física"),
  ("palo_sube_arriba", "Palo que sube por encima de la zona media", "deseo de destacar y combatividad; la escuela la asocia con gusto por la discusión"),
  ("palo_anguloso", "Base del palo angulosa", "firmeza o tensión en lo material")])
add("q", "Letra q", "lo material e instintivo (jamba) y la comunicación (óvalo)", sel(JAMBA, "jamba_bucle_amplio", "jamba_angulosa", "jamba_palo_recto", "jamba_larga", "jamba_corta", "jamba_hacia_izquierda", "jamba_hacia_derecha") + [OV_AB, OV_CE])
add("r", "Letra r", "la habilidad manual y la agudeza", [
  ("de_imprenta", "En forma de imprenta (techo plano)", "habilidad manual y sentido práctico"), ("puntiaguda", "Puntiaguda", "agudeza, curiosidad y espíritu crítico"),
  ("redondeada", "Redondeada", "suavidad y adaptación")])
add("s", "Letra s", "la flexibilidad y la adaptación", [
  ("de_imprenta", "En forma de imprenta", "claridad y sentido práctico"), ("puntiaguda", "Puntiaguda", "agudeza y espíritu crítico"),
  ("abierta_abajo", "Abierta por abajo", "generosidad"), ("cerrada_con_lazo", "Cerrada con lazo", "reserva y cautela")])
add("t", "Letra t", "la voluntad, la ambición y la capacidad de dirigir (su barra)", [
  ("barra_alta", "Barra alta (en el extremo de arriba)", "ambición y metas elevadas"), ("barra_baja", "Barra baja", "metas modestas o poca confianza en sí"),
  ("barra_larga", "Barra larga", "energía y entusiasmo"), ("barra_corta", "Barra corta", "poca energía o timidez"),
  ("barra_ascendente", "Barra ascendente", "optimismo y ambición"), ("barra_descendente", "Barra descendente", "terquedad, actitud dominante o pesimismo"),
  ("barra_adelantada", "Barra adelantada (a la derecha, sin tocar el palo)", "impaciencia y prisa"), ("barra_atrasada", "Barra atrasada (a la izquierda)", "duda o tendencia a postergar"),
  ("barra_gruesa", "Barra gruesa o con presión", "voluntad fuerte y autoridad"), ("sin_barra", "Sin barra", "prisa o descuido"),
  ("cruce_con_lazo", "Cruce hecho con lazo", "tenacidad y persistencia"),
  ("barras_centradas", "Barras altas, centradas y bien hechas", "el manual lo cuenta entre los indicadores del temperamento bilioso: voluntad firme y dirigida", "m"),
  ("barras_desiguales", "Barras desiguales a lo largo del escrito", "el manual lo cuenta entre los indicadores del temperamento nervioso: voluntad cambiante", "m"), ("palo_con_bucle", "Palo con bucle", "la escuela de rasgos lo asocia con sensibilidad a la crítica sobre el propio trabajo")])
add("u", "Letra u", "la receptividad y el trato", [("redonda", "Redonda (en guirnalda)", "receptividad y amabilidad"), ("angulosa", "Angulosa (como v)", "firmeza y espíritu crítico")])
add("v", "Letra v", "la agudeza y el análisis (su vértice)", [("vertice_agudo", "Vértice agudo", "análisis y espíritu crítico"), ("redondeada", "Redondeada (como u)", "suavidad y adaptación")])
add("w", "Letra w", "la agudeza y el trato (sus vértices)", [("vertices_agudos", "Vértices agudos", "análisis y firmeza"), ("redondeada", "Redondeada", "suavidad y adaptación")])
add("x", "Letra x", "la decisión (su cruce)", [("cruce_firme", "Cruce firme y bien hecho", "decisión"), ("dos_curvas", "Hecha con dos curvas separadas", "indecisión o búsqueda de consenso")])
add("y", "Letra y", "lo instintivo, lo material y la vida afectiva (su jamba)", JAMBA)
add("z", "Letra z", "lo material (su jamba, si la tiene)", [("con_jamba_bucle", "Con jamba y bucle", "imaginación en lo material"), ("angulosa", "Angulosa", "firmeza y tensión")])
add("mayusculas", "Mayúsculas en general", "la autoimagen y la forma de presentarse ante los demás", [
  ("muy_grandes", "Mucho más grandes que la zona media", "orgullo y autoestima alta; deseo de destacar"), ("pequenas", "Poco más grandes que la zona media", "modestia o sencillez"),
  ("de_imprenta", "De imprenta dentro de la cursiva", "cultura y deseo de claridad"), ("en_medio_de_palabra", "Mayúsculas en medio de palabra", "impulsividad o deseo de llamar la atención")], tipo="mayuscula")
add("yo", "Pronombre «yo» o la Y/I personal", "la imagen de sí mismo (en la grafología de lengua inglesa se observa la «I»; en español, el «Yo»)", [
  ("alta", "Más alta que las demás mayúsculas", "autoestima alta"), ("pequena", "Pequeña", "baja autoestima o modestia"), ("inclinada_izquierda", "Inclinada a la izquierda", "retraimiento o defensa"),
  ("con_bucle", "Con bucle o adorno", "deseo de agradar o de ser visto")], tipo="mayuscula")
add("numeros", "Números en general", "la administración de los recursos: dinero, tiempo, esfuerzo y la precisión con los datos", [
  ("dibujados_lentamente", "Dibujados lentamente, con cuidado casi artístico", "ve el dinero como un medio y no como un fin; prefiere no hablar de él, gasta por gusto estético y valora las cosas por lo que valen, no por lo que cuestan; los negocios no son su fuerte", "m"),
  ("trazados_rapidamente", "Trazados con rapidez y naturalidad, sin perder legibilidad", "buena disposición para los negocios, la compraventa y la negociación; calibra el valor del dinero y le da importancia", "m"),
  ("raros_complicados", "Raros, complicados o adornados al punto de dificultar su lectura", "el manual lo asocia con inclinación a falsear presupuestos o a especular de forma equívoca; dificultad para administrarse (indicio que debe confirmarse con el ambiente gráfico)", "m"),
  ("gran_tamano", "De gran tamaño respecto de las minúsculas", "valoración de la vida desde lo económico; tendencia a medir personas y cosas por su precio; posible despilfarro", "m"),
  ("muy_pequenos", "Muy pequeños respecto del texto", "timidez ante lo económico; siente el mundo de las cifras como complicado o fuera de su alcance; tendencia a economizar", "m"),
  ("irregulares", "Irregulares o desiguales de tamaño", "poca constancia y organización en lo económico; dificultad para distribuir gastos; también flexibilidad para adaptarse", "m"),
  ("diferente_direccion", "En diferente dirección", "poca noción del valor del dinero; confunde cifras y presupuestos; puede ser engañado con facilidad", "m"),
  ("aplastados", "Aplastados (más anchos que altos)", "sensación de dependencia económica y falta de espíritu emprendedor", "m"),
  ("apretados", "Apretados entre sí", "control y desconfianza extrema con el dinero; miedo a gastar; ansiedad por lo económico", "m"),
  ("espaciados", "Espaciados, cada cifra con su lugar", "desprendimiento y generosidad, si están bien trazados", "m"),
  ("a_la_derecha", "Fecha o números colocados a la derecha", "no está a gusto con los recursos que maneja y busca nuevas oportunidades", "m"),
  ("a_la_izquierda", "Fecha o números colocados a la izquierda", "se siente cómodo con cómo administra lo que tiene", "m"),
  ("primeros_grandes", "Los primeros números más grandes", "se sentía más satisfecho antes con lo que ganaba o tenía", "m"),
  ("ultimos_grandes", "Los últimos números más grandes", "espera un mejor porvenir económico con otros recursos", "m"),
  ("en_la_firma", "Números o signos de dinero en la firma", "presencia de lo económico en su yo social y laboral; según su lugar: arriba a la derecha, aspiraciones; abajo, pequeños o tachados, culpa por el dinero", "m"),
  ("claros", "Claros y legibles", "claridad y orden en lo material y el dinero"),
  ("retocados", "Retocados o corregidos", "preocupación o inseguridad con el dinero; indicio a vigilar, débil por sí solo"),
  ("angulosos", "Angulosos", "rigor y firmeza con el dinero"), ("curvos", "Curvos", "flexibilidad con lo material")], tipo="numero")
for d, simb, var in [
  ("0", "lo material (como cero: lo cerrado o abierto)", [("abierto", "Abierto", "apertura en lo material"), ("cerrado_lazo", "Cerrado con lazo", "control o reserva en lo material")]),
  ("1", "la firmeza (su trazo vertical)", [("con_gancho", "Con gancho o pico inicial grande", "insistencia o apego"), ("con_base", "Con base", "necesidad de apoyo o seguridad")]),
  ("2", "la adaptación (su curva y base)", [("base_larga", "Base larga", "necesidad de estabilidad"), ("con_bucle", "Con bucle", "imaginación")]),
  ("3", "la sociabilidad (sus dos curvas)", [("curvas_iguales", "Curvas iguales", "equilibrio"), ("anguloso", "Anguloso", "firmeza")]),
  ("4", "lo concreto (su estructura)", [("abierto", "Abierto arriba", "sentido práctico y rapidez"), ("cerrado", "Cerrado (triángulo)", "control y método")]),
  ("5", "la iniciativa (su barra)", [("barra_separada", "Barra separada", "rapidez o impaciencia"), ("barra_unida", "Barra unida en un solo trazo", "habilidad y continuidad")]),
  ("6", "lo afectivo (su óvalo)", [("ovalo_abierto", "Óvalo abierto", "apertura"), ("ovalo_cerrado", "Óvalo cerrado", "reserva")]),
  ("7", "la decisión (su trazo inclinado)", [("con_barra", "Con barra cruzada", "costumbre caligráfica europea o deseo de evitar confusiones; método"), ("sin_barra", "Sin barra", "sencillez")]),
  ("8", "el equilibrio (sus dos óvalos)", [("ovalos_iguales", "Óvalos iguales", "equilibrio entre lo intelectual y lo material"), ("dos_circulos", "Hecho con dos círculos separados", "trazo lento o escolar")]),
  ("9", "las ideas (su óvalo arriba) y su realización (su jamba)", [("jamba_larga", "Jamba larga", "energía para concretar"), ("con_bucle", "Jamba con bucle", "imaginación en lo material")])]:
  add("n" + d, f"Número {d}", simb, var, tipo="numero")
# Grafología inductiva (manual de la persona usuaria): lo que representa cada letra.
INDUCTIVA = {
 "a": "la vida afectiva y las relaciones de afecto con los demás", "b": "la administración del presupuesto y las reservas; la lucha diaria por lo material y necesario",
 "c": "el egoísmo", "d": "la vida y orientación intelectual, espiritual y psíquica", "e": "los contactos sociales y las relaciones superficiales diarias",
 "f": "la síntesis de la vida profesional, intelectual, afectiva y sexual; el grado de éxito global", "g": "el sexo, la coquetería, el encanto y la seducción",
 "h": "la realización de los ideales en la vida cotidiana; la idea que dirige la actividad diaria", "i": "la precisión, científica o de otro tipo",
 "j": "la vida privada y el balance personal de la actividad diaria", "k": "el nivel de adaptación y la habilidad manual",
 "l": "la imaginación, los proyectos y los mandatos de los padres que influyen en la actividad", "ll": "la relación entre la vida privada y la profesional o pública",
 "m": "el yo íntimo, familiar y social puesto en escena cada día", "n": "los problemas escondidos; complemento de la m", "enie": "el comportamiento social",
 "o": "la vida afectiva y social, la relación con el dinero y la vida práctica cotidiana", "p": "el trabajo y la actividad cotidiana en conjunto",
 "q": "la vida sexual en su conjunto", "r": "la canalización de la energía, la conciencia profesional y las aptitudes técnicas",
 "s": "el dinero y la conciencia moral", "t": "la voluntad", "u": "el sentido de la realidad", "v": "el impulso de dar: sacrificio, entrega y también desilusión",
 "w": "el complemento de la v", "x": "la madurez afectiva", "y": "el balance personal y de la actividad cotidiana y profesional", "z": "la realización de la vida sexual",
}
add("ll", "Letra ll", "la relación entre dos ámbitos (sus dos hampas)", [
  ("hampas_iguales", "Las dos hampas iguales", "equilibrio entre la vida privada y la pública"), ("primera_mayor", "Primera hampa más alta", "predomina la vida privada"),
  ("segunda_mayor", "Segunda hampa más alta", "predomina la vida profesional o pública")])
for c in C:
    if c["id"] in INDUCTIVA:
        c["estructura"] = c["simboliza"]
        c["simboliza"] = INDUCTIVA[c["id"]]
        c["fuente_simboliza"] = "manual"
orden = [*"abcdefghijkl", "ll", "m", "n", "enie", *"opqrstuvwxyz"]
pos = {c["id"]: i for i, c in enumerate(C)}
C.sort(key=lambda c: orden.index(c["id"]) if c["id"] in orden else 100 + pos[c["id"]])
GEN = [
  ("mas_grande", "Más grande que las demás", "énfasis en lo que representa: {s}; ese aspecto adquiere importancia o se exagera"),
  ("mas_pequena", "Más pequeña que las demás", "se resta importancia o se inhibe lo que representa: {s}"),
  ("otra_inclinacion", "Con inclinación distinta al resto", "cambio de actitud o conflicto en lo que representa: {s}"),
  ("forma_propia", "Forma propia, distinta del modelo caligráfico", "originalidad e independencia de criterio en {s}; si la forma es rebuscada, deseo de llamar la atención"),
  ("simplificada", "Simplificada", "sentido práctico, rapidez y síntesis en {s}"),
  ("adornada", "Adornada o con florituras", "necesidad de agradar o de ser visto en {s}; vanidad si es excesiva"),
  ("retocada", "Retocada o corregida", "inseguridad, escrúpulo o ansiedad respecto de {s}"),
  ("deformada", "Deformada o ilegible", "ocultamiento o descuido en {s}"),
]
REGLAS = [
 "Solo se aplica cuando la letra se aparta claramente del modelo caligráfico y da un sello personal a la escritura.",
 "La letra debe repetirse igual a lo largo del escrito; si cambia solo en ciertas palabras, eso también se analiza.",
 "Una letra que copia el modelo (Palmer, script o tipográfica) no tiene valor singular: habla de equilibrio y madurez.",
 "Una letra no define a la persona: es un detalle que complementa el estudio completo, nunca lo sustituye.",
 "También puede observarse en la firma (el yo íntimo).",
]
datos = {
 "fuente": "Lo que representa cada letra (grafología inductiva), las lecturas de los números y las reglas de aplicación resumen el manual de grafología de la persona usuaria (J. Tovar Molina). Las demás variantes son lecturas tradicionales generales (zonas y simbolismo del espacio de Max Pulver, 1931; escuela de rasgos) y se muestran como lectura complementaria.",
 "reglas_inductiva": REGLAS, "genericas": [list(g) for g in GEN], "caracteres": C}
import os
salida = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "config", "grafologia_letras.json")
with open(salida, "w", encoding="utf-8") as f:
    json.dump(datos, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(len(C), sum(len(c["variantes"]) for c in C) + len(C) * len(GEN))
