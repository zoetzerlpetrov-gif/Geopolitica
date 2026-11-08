"""Genera config/dibujo_proyectivo.json: tests proyectivos de dibujo.

Resume el manual de grafología de la persona usuaria (J. Tovar Molina): tipos de test, áreas simbólicas de la hoja,
valores gráficos del dibujo, partes de la figura humana, el árbol y la casa, garabatos y colores. Las lecturas de los
modificadores (parte exagerada, omitida, sombreada…) son principios generales del análisis de dibujos y se marcan como
complementarias. Se omiten las lecturas clínicas del manual (diagnósticos), que requieren evaluación profesional.
Uso: python3 tools/grafologia/dibujos.py
"""
import json
import os

FIG, ARB, CASA, GAR = "figura", "arbol", "casa", "garabatos"
TESTS = [
    ("htp", "Casa – Árbol – Persona (H-T-P) del manual", "En hojas separadas: 1) dibuja una figura humana; 2) una figura del sexo opuesto a la anterior; 3) dibújate a ti mismo; 4) un árbol; 5) una casa.", [FIG, ARB, CASA]),
    ("nino_adulto_anciano", "Un niño, un adulto y un anciano", "Dibuja un niño, un adulto y un anciano.", [FIG]),
    ("libre_historia", "Dibujo libre con una historia", "Haz el dibujo que quieras y después cuenta o escribe una historia sobre él.", []),
    ("garabatos", "Garabatos o dibujos automáticos", "Trazos espontáneos o «distraídos»; mejor si se hicieron sin pensar en que serían analizados.", [GAR]),
    ("tres_arboles", "Los tres árboles", "Dibuja tres árboles, cada uno en su hoja, según la consigna de la escuela que sigas.", [ARB]),
    ("casa", "Test de la casa", "Dibuja una casa.", [CASA]),
    ("casa_pueblo", "La casa y el pueblo", "Dibuja una casa y el pueblo donde está.", [CASA]),
    ("machover", "Figura humana (Karen Machover)", "Dibuja una persona; luego, una persona del sexo opuesto. Proyecta cómo se percibe la persona a sí misma y a los demás.", [FIG]),
    ("linea_ondulada", "La línea ondulada", "Traza una línea ondulada de un lado a otro de la hoja.", []),
    ("persona_lluvia", "Una persona bajo la lluvia", "Dibuja una persona bajo la lluvia. Se observa cómo se protege (paraguas, ropa, refugio) ante la presión del entorno.", [FIG]),
    ("bender", "Test visomotor de Bender", "Copia de las láminas del test. Requiere las láminas originales y su protocolo de calificación; aquí solo se anotan observaciones del trazo.", []),
    ("arbol", "Test del árbol", "Dibuja un árbol (que no sea pino ni palmera, si sigues la consigna clásica).", [ARB]),
    ("familia", "Dibujo de la familia", "Dibuja una familia (o a tu familia). Se observa quién aparece, el orden, el tamaño y la distancia entre figuras.", [FIG]),
    ("animal", "Dibujo de un animal", "Dibuja un animal.", []),
    ("pareja", "Dibujo de una pareja", "Dibuja una pareja.", [FIG]),
    ("paisaje", "Test del paisaje", "Dibuja un paisaje.", []),
    ("dos_trabajando", "Dos personas trabajando", "Dibuja a dos personas trabajando.", [FIG]),
    ("persona_cinetica", "Una persona haciendo algo (cinética)", "Dibuja a una persona haciendo algo.", [FIG]),
]
MATERIALES = [
    "Una hoja blanca tamaño carta para cada dibujo, entregada por separado.",
    "Lápiz de grado H de preferencia (no lapicero, que da un solo grosor), sacapuntas y borrador.",
    "Opcional: útiles de distintos tipos y colores (plumones, plumas, colores; para niños, crayones no tóxicos).",
    "Tiempo libre y un lugar sin distracciones. Aclara que no se califica el valor artístico.",
    "Guarda los originales en protectores y trabaja sobre copias.",
]
VALORES = [
    ("situacion", "Situación en la hoja (dónde se acumula el dibujo)", [
        ("superior", "Zona superior", "el espíritu consciente, los sueños, la imaginación y la ambición: mira hacia lo alto, lo noble o lo espiritual; también alegría o euforia"),
        ("inferior", "Zona inferior", "lo material, las necesidades físicas y los instintos; según el conjunto, apego a lo concreto, pesimismo o mucha actividad"),
        ("izquierda", "Zona izquierda", "el pasado, la introversión, la relación con la madre y los valores familiares: inhibición, timidez o apego a la rutina"),
        ("derecha", "Zona derecha", "el futuro, la extraversión y la relación con el padre y con los demás: comunicación, planes y confianza en el porvenir; en exceso, impaciencia"),
        ("centro", "Centro", "el estado emocional del yo en el presente: buena adaptación, objetividad y control de sí"),
        ("superior_izquierda", "Superior izquierda", "preocupaciones del pasado o dificultad para proyectarse al futuro"),
        ("superior_derecha", "Superior derecha", "necesidad de contacto con el exterior, imaginación y curiosidad por lo nuevo"),
        ("inferior_izquierda", "Inferior izquierda", "inseguridad, introversión, desconfianza o dificultad para adaptarse a algo nuevo"),
        ("inferior_derecha", "Inferior derecha", "necesidades físicas y materiales"),
    ]),
    ("dimension", "Dimensión (espacio que ocupa el dibujo)", [
        ("muy_grande", "Muy grande (no cabe en la hoja)", "amplias miras con poco interés por el detalle; posible compensación de un sentimiento de inferioridad. Si quedó cortado, conviene pedirlo de nuevo en otra hoja"),
        ("grande", "Grande (ocupa casi toda la hoja)", "extraversión, vitalidad, orgullo, visión global, generosidad y quizá vanidad"),
        ("normal", "Normal (alrededor de la mitad de la hoja)", "adaptación a las normas, equilibrio entre introversión y extraversión y una valoración ajustada de sí"),
        ("pequeno", "Pequeño (alrededor de una cuarta parte)", "sencillez, introversión, tendencia al ahorro y razonamiento analítico; con trazo débil, poca vitalidad"),
        ("muy_pequeno", "Muy pequeño (una octava parte o menos)", "introversión marcada, temor al esfuerzo, ahorro excesivo o inhibición; también capacidad de especializarse y profundizar en el detalle"),
    ]),
    ("direccion", "Dirección del dibujo o de sus elementos", [
        ("izquierda", "Hacia la izquierda", "distanciamiento de los demás, vida interior rica; en la casa (humo, camino, picaporte), conflicto entre lo que es y lo que desea ser"),
        ("derecha", "Hacia la derecha", "extraversión, iniciativa, avance confiado al porvenir y deseo de independencia"),
        ("ambivalente", "Ambivalente (elementos en direcciones opuestas)", "la persona parece dividida; observar qué elemento contradice a los demás"),
        ("desigual", "Desigual (asimetría entre los lados)", "leer cada lado por el espacio simbólico: la izquierda, la vida íntima y familiar; la derecha, la vida social y pública"),
    ]),
    ("forma", "Forma del trazo", [
        ("recta", "Predominio de líneas rectas", "fuerza, predominio de la razón y claridad de ideas; sequedad o frialdad en lo afectivo"),
        ("curva", "Predominio de curvas", "afectividad, sensibilidad, imaginación y suavidad en el trato"),
        ("angulo", "Predominio de ángulos", "razonamiento e introversión; con trazo firme, tenacidad y resistencia; con trazo débil, obstinación que no se sostiene"),
        ("zigzag", "Zigzag", "agresividad súbita, explosividad, expresiones duras"),
        ("circulos", "Círculos cerrados", "según la zona, egoísmo, aislamiento, introversión o desconfianza"),
        ("remolinos", "Remolinos (curvas continuas sin levantar el útil)", "ideación feliz, dinamismo, reflejos ágiles y expresividad"),
    ]),
    ("fuerza", "Fuerza del trazo (presión)", [
        ("deficiente", "Deficiente, con temblores o interrupciones", "inhibición, timidez y falta de energía; puede deberse a cansancio, edad o salud"),
        ("fina", "Fina o débil pero uniforme", "delicadeza en el trato, emotividad, vida interior; riesgo de alejarse de la realidad"),
        ("firme", "Firme o normal", "vitalidad, seguridad en sí y en su criterio, fuerza del yo frente al entorno"),
        ("fuerte", "Fuerte, excesiva o pastosa", "mucha energía física y sensualidad, que en exceso puede volverse brusquedad"),
    ]),
    ("continuidad", "Continuidad del trazo", [
        ("continua", "Línea continua, sin levantar el útil", "extraversión, comunicación, dinamismo y constancia; en dibujos torpes, rutina"),
        ("media", "Continuidad media (pocas detenciones)", "equilibrio entre intuición y deducción, entre vida interior y contacto; persistencia razonada"),
        ("sueltas", "Líneas sueltas, en muchos trazos", "introversión e intuición; buenas ideas con poca persistencia para realizarlas; reserva"),
        ("porosas", "Rayas «peludas» (muchas rayitas encimadas)", "inseguridad de fondo, mucha sensibilidad e influenciabilidad, falta de aplomo"),
    ]),
    ("desarrollo", "Desarrollo del dibujo", [
        ("escueto", "Escueto o esquematizado", "agilidad, aprovechamiento del esfuerzo y control de la afectividad; si es por cansancio, torpeza"),
        ("incompleto", "Incompleto o a medio hacer", "deseo de ocultarse o de permanecer en la sombra; autocontrol fuerte e inseguridad"),
        ("elaborado", "Elaborado o complicado (mucho sombreado)", "concentración y gusto por el detalle; también encubrimiento de la personalidad y fantasía"),
        ("original", "Original o artístico", "fantasía personal y sentido artístico, a veces como compensación de inseguridades"),
        ("exotico", "Exótico o extraño", "deseo de apartarse de lo establecido, originalidad o alejamiento de la realidad"),
    ]),
    ("dinamismo", "Dinamismo o eficacia", [
        ("infantil", "Infantil o inmaduro (rígido, sin profundidad)", "esperable hasta los 14 años; en adultos, rasgos de inmadurez"),
        ("torpe", "Torpe o dificultoso", "dificultades de ideación o de relación, menos vitalidad o cierre afectivo"),
        ("agil", "Ágil o dinámico", "rapidez, facilidad de contacto y reflejos rápidos"),
    ]),
    ("armonia", "Equilibrio y armonía", [
        ("armonico", "Armónico o proporcionado", "armonía con el entorno y consigo mismo; equilibrio entre lo espiritual y lo material; dominio de sí"),
        ("deforme", "Deforme o desproporcionado", "dificultades de contacto y relación; las deformaciones suelen señalar conflicto en la zona deformada"),
    ]),
]
PARTES = {
    FIG: [
        ("Cabeza", "el área racional: intelecto, imaginación, reflexión y toma de decisiones", [
            ("cabello", "Cabello", "potencia física, sensualidad y vanidad"), ("expresion", "Expresión del rostro", "la emoción presente y la necesidad de expresarla"),
            ("frente", "Frente", "las ideas, el pensamiento y las aspiraciones"), ("cejas", "Cejas", "el tacto y la diplomacia al expresarse"),
            ("orejas", "Orejas", "la receptividad y la toma de decisiones"), ("ojos", "Ojos", "el contacto con el entorno: apertura o cierre, confianza o temor"),
            ("nariz", "Nariz", "el acercamiento social y el temperamento activo o pasivo"), ("boca", "Boca", "la expresión verbal, la seguridad y la afectividad"),
            ("labios", "Labios", "sensualidad y vanidad"), ("dientes", "Dientes", "lo instintivo: agresividad y defensa"),
            ("menton", "Mentón y mandíbula", "firmeza, tenacidad y empuje práctico")]),
        ("Tronco", "el área emocional: sentimientos, sensibilidad y voluntad", [
            ("cuello", "Cuello", "el filtro entre la razón y el sentimiento"), ("hombros", "Hombros", "la voluntad de enfrentar las cosas y la fuerza vital"),
            ("pecho", "Pecho", "la identidad de género y de rol"), ("brazos", "Brazos", "los contactos sociales y la demostración de afecto"),
            ("manos", "Manos (dedos y uñas)", "la productividad y la forma de actuar sobre el mundo")]),
        ("Parte inferior", "el área instintiva: impulsos y necesidades físicas", [
            ("cadera", "Cadera y entrepierna", "la sexualidad y su control"), ("articulaciones", "Articulaciones", "defensa, fortaleza y flexibilidad"),
            ("piernas", "Piernas", "seguridad, aplomo y cómo se para ante la vida"), ("pies", "Pies", "aplomo y seguridad"), ("dedos_pie", "Dedos del pie", "el nivel de agresividad")]),
        ("Accesorios", "la imagen social", [
            ("ropa", "Ropa", "la apariencia social y la vanidad"), ("bolsillos", "Bolsillos", "egocentrismo e independencia"), ("lentes", "Lentes", "intelectualidad o pretensión de ella"),
            ("corbata", "Corbata", "aceptación social e imagen"), ("botones", "Botones", "dependencia materna o de la infancia"), ("sombrero", "Sombrero", "la autoridad"),
            ("zapatos", "Zapatos", "seguridad y aplomo"), ("cinturon", "Cinturón o cintura", "el control de los impulsos"), ("joyas", "Joyas o accesorios", "vanidad"),
            ("pipa", "Pipa o cigarro", "lo oral")]),
    ],
    ARB: [("Árbol", "la figura paterna, la imagen inconsciente de sí y el desarrollo de la vida", [
        ("raices", "Raíces", "los instintos"), ("suelo", "Suelo", "la estabilidad y el aplomo ante la realidad"),
        ("tronco", "Tronco", "la fortaleza, la estabilidad emocional y la autovaloración"), ("ramas", "Ramas", "las relaciones personales (los «brazos» de la persona)"),
        ("follaje", "Follaje o copa", "las ideas y la forma de razonar")])],
    CASA: [("Casa", "el hogar, la figura materna y la convivencia familiar", [
        ("techo", "Techo", "la mente, las inquietudes y la creatividad"), ("ventanas", "Ventanas", "el deseo de contemplar la vida exterior (los ojos de la casa)"),
        ("puerta", "Puerta", "la intimidad de la persona"), ("camino", "Camino", "el acceso a su vida íntima"),
        ("jardin", "Jardín", "cómo se acomoda el mundo exterior con la intimidad"), ("chimenea", "Chimenea y humo", "el afecto en la casa y su expresión")])],
}
MODIFICADORES = [
    ("exagerada", "Exagerada o muy grande", "se le da mucha importancia a lo que representa, o hay conflicto en esa área"),
    ("pequena", "Muy pequeña", "se resta importancia o se inhibe lo que representa"),
    ("omitida", "Omitida", "posible negación o conflicto en lo que representa"),
    ("borrada", "Borrada o retocada", "inseguridad o ansiedad respecto de lo que representa"),
    ("sombreada", "Sombreada o remarcada", "preocupación o tensión en lo que representa"),
    ("desproporcionada", "Desproporcionada o deforme", "conflicto en la zona que representa"),
]
GARABATOS = [
    ("grandes", "Grandes", "energía e imaginación; seguridad aparente, impulsividad y gusto por el riesgo"),
    ("pequenos", "Pequeños", "observación, retención de detalles, paciencia y serenidad"),
    ("confusos", "Confusos", "aburrimiento o liberación de pasiones contenidas; deseo de cambiar una situación monótona"),
    ("simples", "Simples", "comprensión, serenidad, método y gusto por lo planificado"),
    ("oscuros", "Oscuros y sombreados", "tristeza o ansiedad contenida; un momento difícil"),
    ("claros", "Claros", "objetividad y gusto por lo simple; buena actitud ante los problemas"),
    ("curvos", "Curvos", "dulzura, afecto, imaginación y creatividad"),
    ("rectos", "Rectos", "sentido práctico y cálculo; dificultad para mostrar sentimientos"),
    ("flechas", "Flechas", "búsqueda de nuevos horizontes y fuerza para cambiar; según hacia dónde apunte, enojo"),
    ("flechas_curvas", "Flechas curvas", "lucha por el éxito con menos agresividad"),
    ("laberinto", "Laberintos", "búsqueda de una meta en medio de la confusión"),
    ("circulos_marcos", "Círculos y marcos", "introversión y dificultad para comunicar necesidades; con suavidad y color, ganas de vivir"),
    ("geometricas", "Formas geométricas", "análisis y planificación; necesidad de control"),
    ("geometricas_unidas", "Figuras geométricas unidas o intercaladas", "frialdad, autocontrol afectivo, exceso de racionalidad y necesidad de orden"),
    ("geometricas_rellenas", "Figuras geométricas rellenas", "intento de suavizar asperezas; sensibilidad"),
    ("criaturas", "Criaturas", "poca transparencia, desconfianza o miedo al rechazo"),
    ("cuadros", "Cuadros", "búsqueda de orden y respeto por las reglas; incomodidad ante lo imprevisto"),
    ("cuadros_lineas", "Cuadros rellenos de líneas paralelas", "orden, asociación lógica, precisión y concentración"),
    ("cuadriculados", "Cuadriculados", "preocupación o tensión; sensación de estar atrapado"),
    ("cadenas", "Cadenas", "vínculo con la pareja si es continua; deseo de libertad si está rota"),
    ("zigzag", "Zigzag", "enojo; tensión que se acumula y se descarga de golpe"),
    ("blancos_negros", "Cuadros blancos y negros alternados", "ambivalencia; mucho orden"),
    ("espiral_centrifuga", "Espiral del centro hacia afuera", "expansión y deseo de ampliar horizontes; temor a la soledad"),
    ("espiral_centripeta", "Espiral de afuera hacia el centro", "egocentrismo y peso del pasado"),
    ("espirales_s", "Espirales unidas en «s» acostada", "búsqueda de perfección, idealismo, ambivalencia"),
    ("rectangulos", "Rectángulos", "gusto por la disciplina; agresividad contenida"),
    ("triangulo_arriba", "Triángulos hacia arriba", "energía y empuje"), ("triangulo_abajo", "Triángulos hacia abajo", "pasividad o poca ambición"),
    ("puntos", "Puntos", "impulsividad y agresividad mal controlada"), ("rayado", "Rayado intenso", "enojo y descontrol; en niños, mucha actividad"),
    ("mancha", "Manchas de tinta", "descontento de sí o angustia"), ("mancha_explosion", "Mancha en explosión", "excitabilidad y reflejos rápidos"),
    ("aros_sueltos", "Aros sueltos", "introversión y aislamiento"), ("aros_entrelazados", "Aros entrelazados", "deseo de salir del aislamiento y adaptarse"),
]
COLORES = [
    ("azul", "Azul", "calma, serenidad, entendimiento", "si domina, gran control de sí; celeste, tendencia a ser espectador más que actor", "cercanía, equilibrio, sinceridad y lealtad; el azul marino, eficiencia y necesidad de impresionar"),
    ("verde", "Verde", "reposo, equilibrio, esperanza", "si domina, riesgo de pereza o inhibición; con otros indicadores, rebeldía", "deseo de destacar de forma inteligente; adaptabilidad"),
    ("morado", "Morado o violeta", "inquietud, idealismo, pudor", "puede reflejar presión de los padres y miedo a no cumplir sus expectativas", "espiritualidad e imaginación; en exceso, necesidad de mostrarse"),
    ("rojo", "Rojo", "actividad, energía, pasión", "si domina, exuberancia o excitabilidad", "fuerza, deseo de destacar y de ser el centro de atención"),
    ("rosa", "Rosa", "calidez", "superación de problemas recientes", "deseo de no crecer, pasividad o necesidad de atención"),
    ("amarillo", "Amarillo", "adaptación, dinamismo, apertura", "si domina, tensión con la figura paterna o en la familia; también curiosidad y alegría", "alegría, optimismo y deseo de brillar"),
    ("naranja", "Naranja", "comunicación social", "incertidumbre o deseo de atención", "deseo de destacar en la comunicación; calidez"),
    ("cafe", "Café o marrón", "seriedad, prudencia, «pies en la tierra»", "posible responsabilidad prematura o control excesivo de sí", "necesidad de hacerse notar"),
    ("gris", "Gris", "transición", "inseguridad en sus elecciones; influenciable", "deseo de pasar desapercibido o adaptarse"),
    ("negro", "Negro", "vida interior, reserva, melancolía", "conviene atender su emotividad", "formalidad, elegancia y ambición convencional"),
    ("blanco", "Blanco (sin color)", "neutralidad", "en exceso, rechazo de límites", "—"),
]
datos = {
    "fuente": "Resumen del manual de grafología de la persona usuaria (J. Tovar Molina): tests proyectivos gráficos, áreas simbólicas de la hoja, valores gráficos del dibujo, partes de la figura humana, el árbol y la casa, garabatos y colores. Las lecturas de los modificadores de cada parte son principios generales del análisis de dibujos (lectura complementaria).",
    "aviso": "Los tests proyectivos de dibujo son herramientas de exploración, no de diagnóstico. Su interpretación requiere formación en psicología, más de un dibujo y entrevista; con niños, el desarrollo gráfico depende de la edad. No los uses para decidir sobre una persona ni para diagnosticar. El manual incluye algunas lecturas clínicas que aquí no se reproducen.",
    "materiales": MATERIALES,
    "tests": [{"id": i, "nombre": n, "consigna": c, "partes": p} for i, n, c, p in TESTS],
    "valores": [{"id": i, "nombre": n, "opciones": [{"id": a, "nombre": b, "lectura": l} for a, b, l in ops]} for i, n, ops in VALORES],
    "partes": {k: [{"grupo": g, "representa": r, "partes": [{"id": a, "nombre": b, "representa": l} for a, b, l in ps]} for g, r, ps in v] for k, v in PARTES.items()},
    "modificadores": [{"id": a, "nombre": b, "lectura": l} for a, b, l in MODIFICADORES],
    "garabatos": [{"id": a, "nombre": b, "lectura": l} for a, b, l in GARABATOS],
    "colores": [{"id": a, "nombre": b, "clave": c, "ninos": d, "adultos": e} for a, b, c, d, e in COLORES],
}
salida = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "config", "dibujo_proyectivo.json")
with open(salida, "w", encoding="utf-8") as f:
    json.dump(datos, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(len(TESTS), "tests,", sum(len(o) for _, _, o in VALORES), "valores,", sum(len(p) for v in PARTES.values() for _, _, p in v), "partes,", len(GARABATOS), "garabatos")
