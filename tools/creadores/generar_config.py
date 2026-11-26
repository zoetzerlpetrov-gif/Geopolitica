"""Genera config/creadores.json: nichos, plataformas, monetización, normativa para creadores, set de grabación y planes.

Uso: python3 tools/creadores/generar_config.py
El contenido es una guía práctica; lo que dice «verificar» cambia seguido y debe confirmarse en la página oficial enlazada.
"""
import json
import os

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")


def nicho(nombre, icono, subs, ideas, formatos, monetiza, cuidado):
    return {"nombre": nombre, "icono": icono, "subnichos": subs, "ideas": ideas, "formatos": formatos, "monetizacion": monetiza, "cuidado": cuidado}


NICHOS = {
    "gastronomia": nicho("Gastronomía y recetas", "🍳", ["Recetas saludables", "Cocina vegana", "Cocina mexicana", "Cocina italiana", "Repostería", "Comida rápida casera", "Comida económica", "Reseñas de restaurantes"],
        ["Receta de {sub} en 60 segundos", "3 errores comunes al preparar {sub}", "{sub} con menos de 100 pesos", "Probé la receta viral de {sub}", "Menú de la semana: {sub}"],
        ["Video corto vertical con manos y tabla (sin mostrar la cara)", "Receta paso a paso en carrusel", "Video largo con la receta completa"],
        ["Marcas de utensilios e ingredientes", "Recetarios digitales", "Clases en línea"], ["Alergias e información nutricional: no prometas beneficios de salud sin sustento", "Si reseñas un restaurante, separa hechos de opiniones"]),
    "viajes": nicho("Viajes y turismo", "✈️", ["Playas", "Lugares culturales y pueblos mágicos", "Viajar con poco dinero", "Viajes de lujo", "Viajar en familia", "Viajes de aventura"],
        ["Qué hacer en {sub} en un día", "Cuánto cuesta realmente {sub}", "5 errores al viajar a {sub}", "Lo que nadie te dice de {sub}", "Itinerario de 3 días: {sub}"],
        ["Video vertical con tomas del lugar y texto en pantalla", "Video largo con itinerario y costos", "Carrusel con mapa y presupuesto"],
        ["Afiliados de hoteles y vuelos", "Colaboraciones con oficinas de turismo", "Guías descargables"], ["Zonas arqueológicas, museos y parques pueden pedir permiso para grabar con fines comerciales (verificar en cada sitio)", "Drones: revisa las reglas de aviación civil del país"]),
    "belleza": nicho("Belleza y cuidado personal", "💄", ["Maquillaje", "Cuidado de la piel", "Cabello", "Uñas", "Belleza natural", "Belleza para hombres"],
        ["Rutina de {sub} en 5 minutos", "{sub}: barato vs. caro", "3 mitos de {sub}", "Probé {sub} durante 7 días", "Tutorial de {sub} para principiantes"],
        ["Video vertical frente a cámara o solo manos", "Antes y después con la misma luz", "Reseña honesta de producto"],
        ["Programas de afiliados de tiendas", "Colaboraciones con marcas", "Productos propios"], ["Si una marca te paga o regala el producto, indícalo (publicidad)", "No prometas resultados médicos ni de salud"]),
    "moda": nicho("Moda y estilo", "👗", ["Ropa casual", "Ropa de oficina", "Moda sostenible y de segunda mano", "Moda talla extra", "Moda masculina", "Accesorios"],
        ["5 formas de combinar {sub}", "Armario cápsula: {sub}", "{sub} con poco presupuesto", "Lo que está de moda en {sub} esta temporada", "Errores al vestir {sub}"],
        ["Video de transición de outfits", "Carrusel de combinaciones", "Haul (compras) con precios"], ["Afiliados de tiendas", "Colaboraciones", "Asesoría de imagen"], ["Indica publicidad y regalos de marca", "Fotos de otras personas o de catálogos: pide permiso o usa material propio"]),
    "fitness": nicho("Fitness y deporte", "🏋️", ["Ejercicio en casa", "Gimnasio", "Correr", "Yoga y movilidad", "Nutrición deportiva", "Deporte para adultos mayores"],
        ["Rutina de {sub} de 10 minutos", "3 errores en {sub} que causan lesiones", "Cómo empezar en {sub} desde cero", "Mi progreso en {sub} después de 30 días", "Mito o verdad: {sub}"],
        ["Video vertical con la rutina y el conteo en pantalla", "Video largo con explicación técnica", "Reto de 30 días"], ["Planes de entrenamiento", "Marcas deportivas", "Clases en línea"], ["No des consejos médicos; invita a consultar a un profesional", "Suplementos: solo afirmaciones permitidas por la autoridad sanitaria"]),
    "finanzas": nicho("Finanzas personales", "💰", ["Ahorro", "Presupuesto", "Inversión para principiantes", "Deudas y crédito", "Impuestos de personas físicas", "Emprender con poco"],
        ["3 errores al {sub} que casi nadie nota", "{sub} explicado en 60 segundos", "Cómo empecé con {sub}", "Mitos de {sub}", "Herramientas gratis para {sub}"],
        ["Video vertical con texto grande y un dato", "Carrusel con cálculo de ejemplo", "Video largo con caso práctico"], ["Cursos", "Afiliados de bancos o plataformas (revisa las reglas de publicidad financiera)", "Asesorías"],
        ["No prometas rendimientos; aclara que no es asesoría financiera", "Publicidad de productos financieros tiene reglas propias (verificar con la autoridad de tu país)"]),
    "tecnologia": nicho("Tecnología", "💻", ["Celulares", "Inteligencia artificial", "Apps útiles", "Computadoras", "Videojuegos y consolas", "Ciberseguridad para todos"],
        ["{sub}: 5 trucos que no conocías", "Vale la pena {sub} en este año", "{sub} explicado fácil", "Comparativa: {sub}", "Configura {sub} en 3 pasos"],
        ["Video de pantalla grabada con voz o texto (sin cara)", "Unboxing y reseña", "Tutorial largo"], ["Afiliados", "Patrocinios", "Cursos"], ["Reseñas: di si te prestaron el equipo", "No muestres datos personales en pantallas grabadas"]),
    "videojuegos": nicho("Videojuegos", "🎮", ["Partidas en vivo", "Guías y trucos", "Noticias de juegos", "Juegos retro", "Juegos de móvil"],
        ["Cómo pasar {sub} fácil", "Top 5 momentos de {sub}", "Lo que nadie te dice de {sub}", "{sub} en 60 segundos", "Reto: {sub}"],
        ["Clips cortos de jugadas", "Transmisiones en vivo", "Guías largas"], ["Suscripciones y regalos en vivo", "Patrocinios", "Afiliados"], ["Revisa la política de cada estudio sobre uso de su juego en video", "Música del juego puede tener derechos aparte"]),
    "educacion": nicho("Educación y aprendizaje", "📚", ["Idiomas", "Matemáticas", "Historia", "Ciencia", "Técnicas de estudio", "Preparación para exámenes"],
        ["{sub} explicado en 60 segundos", "3 trucos para aprender {sub}", "El error más común en {sub}", "Pregunta de examen: {sub}", "Curiosidades de {sub}"],
        ["Video con pizarra o texto en pantalla (sin cara)", "Carrusel tipo resumen", "Clase larga"], ["Cursos y tutorías", "Material descargable", "Membresías"], ["Cita tus fuentes", "Imágenes de libros o cursos de otros: revisa sus derechos"]),
    "mascotas": nicho("Mascotas", "🐶", ["Perros", "Gatos", "Adopción", "Entrenamiento", "Alimentación", "Mascotas exóticas"],
        ["3 señales de que tu {sub} está estresado", "Rutina diaria con {sub}", "Truco fácil para {sub}", "Mitos sobre {sub}", "Antes y después: adoptar {sub}"],
        ["Video vertical del día a día", "Tutorial de entrenamiento", "Historias de adopción"], ["Marcas de alimento y accesorios", "Afiliados", "Donaciones a refugios"], ["No recomiendes medicamentos; invita a ir al veterinario", "Especies protegidas: revisa la ley antes de mostrarlas"]),
    "familia": nicho("Familia y crianza", "👨‍👩‍👧", ["Embarazo", "Bebés", "Niños en edad escolar", "Adolescentes", "Familia con poco presupuesto"],
        ["Lo que me hubiera gustado saber de {sub}", "Rutina de {sub}", "3 errores comunes en {sub}", "Ideas baratas para {sub}", "Preguntas frecuentes de {sub}"],
        ["Video vertical con voz y sin mostrar a los niños", "Carrusel de consejos", "Video largo de experiencia"], ["Marcas de productos para bebé", "Afiliados", "Guías descargables"],
        ["Evita mostrar el rostro, la escuela o la ubicación de menores; piensa en su privacidad futura", "La ley protege la imagen de niñas, niños y adolescentes"]),
    "hogar": nicho("Hogar, decoración y hazlo tú", "🏠", ["Decoración con poco dinero", "Organización", "Limpieza", "Plantas", "Reparaciones", "Manualidades"],
        ["Antes y después: {sub}", "{sub} con menos de 500 pesos", "3 trucos de {sub}", "{sub} en un fin de semana", "Errores en {sub}"],
        ["Video de transformación (antes y después)", "Tutorial con manos", "Carrusel de pasos"], ["Afiliados de tiendas de hogar", "Colaboraciones", "Tutoriales de pago"], ["Seguridad: usa equipo de protección en reparaciones", "Productos químicos: no mezcles limpiadores"]),
    "musica": nicho("Música", "🎵", ["Covers", "Música original", "Clases de instrumento", "Producción musical", "Reseñas de música"],
        ["Cómo tocar {sub} en 60 segundos", "Cover de {sub}", "Detrás de cámaras de {sub}", "Error común al aprender {sub}", "Reto musical: {sub}"],
        ["Video vertical tocando", "Clase larga", "Transmisión en vivo"], ["Regalías por plataformas", "Clases", "Presentaciones"], ["Un cover usa música ajena: la plataforma puede monetizarla para el autor", "No uses pistas de otros sin licencia"]),
    "humor": nicho("Humor y entretenimiento", "😂", ["Sketches", "Parodias", "Situaciones cotidianas", "Reacciones", "Retos"],
        ["Cuando {sub}...", "Tipos de personas en {sub}", "Expectativa vs. realidad: {sub}", "Lo que pasa cuando {sub}", "Reacciono a {sub}"],
        ["Sketch corto vertical", "Serie con personajes recurrentes", "Reacciones (con permiso del contenido original)"], ["Fondos de creadores de las plataformas", "Patrocinios", "Mercancía"], ["Reacciones a videos de otros: aporta comentario propio y revisa los derechos", "Bromas a desconocidos: pide permiso antes de publicar"]),
    "motor": nicho("Autos y motos", "🚗", ["Mantenimiento", "Reseñas de autos", "Motos", "Autos clásicos", "Autos eléctricos"],
        ["3 errores de mantenimiento en {sub}", "{sub}: vale la pena comprarlo", "Cuánto cuesta mantener {sub}", "{sub} en 60 segundos", "Mitos de {sub}"],
        ["Video vertical en el taller", "Reseña larga", "Comparativa"], ["Afiliados de refacciones", "Patrocinios", "Talleres"], ["No grabes manejando", "Placas de otros autos: difumínalas"]),
    "noticias": nicho("Noticias, geopolítica y actualidad", "🌎", ["Geopolítica", "Economía", "Política local", "Ciencia y tecnología", "Seguridad"],
        ["{sub}: qué pasó y por qué importa", "{sub} en 60 segundos", "3 datos para entender {sub}", "Mapa: {sub}", "Lo que viene en {sub}"],
        ["Video con mapa o gráfica y voz (sin cara)", "Hilo o carrusel con fuentes", "Análisis largo"], ["Membresías", "Patrocinios", "Boletines de pago"], ["Cita la fuente de cada dato", "Distingue hecho de opinión; corrige si te equivocas", "Cuidado con la difamación"]),
    "salud_mental": nicho("Bienestar y salud mental", "🧠", ["Ansiedad y estrés", "Hábitos", "Productividad", "Relaciones", "Meditación"],
        ["3 hábitos para {sub}", "Lo que me ayudó con {sub}", "Mitos de {sub}", "Ejercicio de 1 minuto para {sub}", "Señales de alerta en {sub}"],
        ["Video vertical con voz calmada y texto", "Carrusel de ejercicios", "Audio o pódcast"], ["Cursos", "Membresías", "Colaboraciones con profesionales"], ["No sustituyas atención profesional; comparte líneas de ayuda de tu país", "No diagnostiques"]),
    "emprendimiento": nicho("Emprendimiento y negocios", "🚀", ["Primer negocio", "Ventas en redes", "Marca personal", "Comercio electrónico", "Herramientas para pymes"],
        ["Cómo empecé {sub} con poco dinero", "3 errores al {sub}", "Herramientas gratis para {sub}", "Caso real: {sub}", "{sub} explicado en 60 segundos"],
        ["Video vertical con un consejo por video", "Caso de estudio largo", "Carrusel con pasos"], ["Asesorías y cursos", "Afiliados de herramientas", "Comunidad de pago"], ["No prometas ganancias", "Si muestras ventas, que sean reales y comprobables"]),
}

PLATAFORMAS = [
    {"id": "youtube", "nombre": "YouTube", "fuente": "https://www.youtube.com/howyoutubeworks/product-features/recommendations/",
     "como": "Recomienda según lo que cada persona ve, cuánto tiempo lo ve, si lo comparte o lo marca como «no me interesa» y encuestas de satisfacción. Los Shorts tienen su propio feed.",
     "consejos": ["Título y miniatura claros: definen si alguien hace clic", "Los primeros 30 segundos deciden si se quedan", "Publica con constancia y en series"]},
    {"id": "tiktok", "nombre": "TikTok", "fuente": "https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you",
     "como": "El feed «Para ti» usa tus interacciones (videos que ves completos, que compartes o comentas), la información del video (texto, sonidos, etiquetas) y ajustes del dispositivo. Seguidores no es requisito para llegar a muchas personas.",
     "consejos": ["Gancho en los primeros 2-3 segundos", "Texto en pantalla para quien ve sin sonido", "Sonidos y temas del momento, si encajan con tu nicho"]},
    {"id": "instagram", "nombre": "Instagram", "fuente": "https://about.instagram.com/blog/announcements/instagram-ranking-explained",
     "como": "Cada sección (feed, historias, Explorar, Reels) tiene su propio orden. En Reels pesan las veces que se ve completo, los «me gusta», los compartidos y si a la persona le interesa ese tipo de contenido.",
     "consejos": ["Reels de 15 a 60 segundos", "Carruseles para contenido que se guarda", "Evita marcas de agua de otras apps"]},
    {"id": "facebook", "nombre": "Facebook", "fuente": "https://transparency.meta.com/features/explaining-ranking/",
     "como": "El orden depende de con quién interactúas, qué tipo de contenido te interesa y señales como comentarios y compartidos. Meta publica qué señales usa en su centro de transparencia.",
     "consejos": ["Reels y videos con texto en pantalla", "Preguntas que inviten a comentar (sin pedir «comenta» de forma engañosa)", "Comparte en grupos solo si las reglas del grupo lo permiten"]},
    {"id": "linkedin", "nombre": "LinkedIn", "fuente": "https://www.linkedin.com/help/linkedin/answer/a564400",
     "como": "Muestra primero lo que considera relevante para tu red profesional; las conversaciones (comentarios con contenido) pesan más que los «me gusta».",
     "consejos": ["Texto con experiencia propia y un dato", "Documentos (carrusel PDF) para guías", "Responde los comentarios la primera hora"]},
]

MONETIZACION = [
    {"plataforma": "YouTube", "fuente": "https://support.google.com/youtube/answer/72851",
     "requisitos": ["Programa de socios: desde 500 suscriptores, 3 videos públicos en 90 días y 3,000 horas de reproducción en 12 meses o 3 millones de vistas de Shorts en 90 días (funciones de fans) (verificar)",
                    "Ingresos por anuncios: 1,000 suscriptores y 4,000 horas en 12 meses o 10 millones de vistas de Shorts en 90 días (verificar)", "Cumplir las políticas de monetización y tener cuenta de AdSense"],
     "formas": ["Anuncios", "Membresías del canal", "Super Chat y Super Thanks", "YouTube Shopping"]},
    {"plataforma": "TikTok", "fuente": "https://www.tiktok.com/creator-academy/es",
     "requisitos": ["Programa de recompensas para creadores: mayor de 18 años, 10,000 seguidores, 100,000 vistas en 30 días y videos de más de 1 minuto (verificar disponibilidad en tu país)",
                    "Regalos en transmisiones en vivo (LIVE) y suscripciones: requisitos propios (verificar)", "Cumplir las normas de la comunidad"],
     "formas": ["Recompensas por videos largos", "Regalos en LIVE", "Suscripciones", "TikTok Shop (afiliados)", "Colaboraciones con marcas (Creator Marketplace)"]},
    {"plataforma": "Facebook", "fuente": "https://www.facebook.com/business/help/1979004249170733",
     "requisitos": ["Monetización de contenido de Meta: por invitación o solicitud desde el panel profesional; requisitos y países cambian (verificar)", "Cumplir las políticas de monetización de socios y de contenido"],
     "formas": ["Monetización de reels y videos", "Estrellas", "Suscripciones", "Contenido de marca"]},
    {"plataforma": "Instagram", "fuente": "https://creators.instagram.com",
     "requisitos": ["Cuenta profesional", "Funciones como regalos, suscripciones y bonos dependen del país y del tamaño de la cuenta (verificar)"],
     "formas": ["Contenido de marca", "Suscripciones", "Regalos en reels", "Afiliados"]},
]

LEGAL = [
    {"tema": "Grabar a otras personas (derecho a la propia imagen)", "pais": "México",
     "regla": "Para publicar el retrato o la imagen reconocible de una persona necesitas su consentimiento, salvo excepciones como figuras públicas en actos públicos o personas que aparecen de forma incidental en un lugar público. Si alguien te pide quitar su imagen, hazlo.",
     "hacer": ["Pide permiso (de preferencia por escrito o grabado) a quien sale de forma principal", "Difumina rostros y placas de desconocidos", "No grabes en lugares privados (casas, baños, consultorios) sin autorización"],
     "fuente": ["Ley Federal del Derecho de Autor, art. 87", "https://www.diputados.gob.mx/LeyesBiblio/pdf/LFDA.pdf"]},
    {"tema": "Niñas, niños y adolescentes", "pais": "México",
     "regla": "La ley protege su intimidad y su imagen: no se puede difundir información o imágenes que los pongan en riesgo o afecten su honra o reputación. Se necesita el consentimiento de quien ejerce la patria potestad y considerar la opinión del menor.",
     "hacer": ["No muestres escuela, uniforme, domicilio ni rutina", "Evita mostrar el rostro de menores que no son tus hijos", "Pregúntate si el menor estaría de acuerdo de adulto"],
     "fuente": ["Ley General de los Derechos de Niñas, Niños y Adolescentes, arts. 76 a 80", "https://www.diputados.gob.mx/LeyesBiblio/pdf/LGDNNA.pdf"]},
    {"tema": "Contenido íntimo o sexual", "pais": "México",
     "regla": "Difundir, compartir o exhibir imágenes, audio o video de contenido íntimo sexual de una persona sin su consentimiento es delito («Ley Olimpia»). Las plataformas además lo prohíben o lo restringen.",
     "hacer": ["Nunca publiques contenido íntimo de otra persona", "Si alguien comparte el tuyo sin permiso, denuncia en la plataforma y ante el Ministerio Público"],
     "fuente": ["Código Penal Federal, arts. 199 Octies a 199 Decies", "https://www.diputados.gob.mx/LeyesBiblio/pdf/CPF.pdf"]},
    {"tema": "Música, imágenes y videos que no son tuyos", "pais": "General",
     "regla": "Usar obras ajenas requiere licencia o autorización. Las plataformas detectan música con derechos (por ejemplo, Content ID de YouTube) y pueden silenciar, bloquear o darle el dinero al dueño.",
     "hacer": ["Usa la biblioteca de audio de cada plataforma o música con licencia libre", "Con imágenes Creative Commons, respeta la licencia y da crédito (autor, licencia y fuente)", "Guarda la prueba de tus licencias"],
     "fuente": ["Licencias Creative Commons", "https://creativecommons.org/licenses/?lang=es"]},
    {"tema": "Publicidad, regalos y colaboraciones pagadas", "pais": "México",
     "regla": "La publicidad debe ser veraz y comprobable, y el público debe poder distinguir cuando algo es publicidad. Si una marca te paga o te regala el producto, indícalo con la herramienta de «contenido de marca» de la red y con una etiqueta clara (#publicidad).",
     "hacer": ["Activa la etiqueta de colaboración pagada de cada red", "No afirmes beneficios que no puedes probar", "Productos de salud, alcohol, apuestas y finanzas tienen reglas extra (verificar)"],
     "fuente": ["Ley Federal de Protección al Consumidor, art. 32", "https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf"]},
    {"tema": "Dónde puedo grabar", "pais": "México",
     "regla": "En la calle puedes grabar, pero respetando la imagen de las personas. Museos, zonas arqueológicas, plazas comerciales y transporte pueden pedir permiso o cobro para grabación con fines comerciales. Los drones tienen reglas de aviación civil.",
     "hacer": ["Pregunta las reglas del lugar antes de grabar", "En zonas arqueológicas y monumentos federales consulta al INAH (verificar trámite)", "Drones: respeta zonas restringidas y altura máxima (NOM-107-SCT3-2019, verificar)"],
     "fuente": ["Agencia Federal de Aviación Civil", "https://www.gob.mx/afac"]},
    {"tema": "Historias que involucran a otras personas", "pais": "México",
     "regla": "Contar hechos que dañen la reputación de alguien identificable puede generar responsabilidad civil por daño moral. Opinar es válido; afirmar hechos falsos no.",
     "hacer": ["Cambia nombres y detalles que permitan identificar a la persona", "Separa lo que sabes de lo que opinas", "Ten pruebas de lo que afirmas"],
     "fuente": ["Código Civil Federal, art. 1916", "https://www.diputados.gob.mx/LeyesBiblio/pdf/CCF.pdf"]},
    {"tema": "Contenido hecho con inteligencia artificial", "pais": "General",
     "regla": "YouTube y TikTok piden etiquetar el contenido realista hecho o alterado con IA (personas que dicen o hacen algo que no ocurrió, lugares o hechos falsos). No uses la voz o el rostro de alguien sin permiso.",
     "hacer": ["Activa la etiqueta de contenido alterado o sintético", "No imites a personas reales", "Revisa los términos de la herramienta de IA que usas"],
     "fuente": ["YouTube: divulgación de contenido alterado o sintético", "https://support.google.com/youtube/answer/14328491"]},
    {"tema": "Datos personales de tu audiencia", "pais": "México",
     "regla": "Si juntas correos o teléfonos (boletín, sorteos, ventas), necesitas un aviso de privacidad y usar esos datos solo para lo que dijiste.",
     "hacer": ["Publica tu aviso de privacidad", "No compartas listas de contactos", "Los sorteos con premios pueden requerir permiso (verificar)"],
     "fuente": ["Ley Federal de Protección de Datos Personales en Posesión de los Particulares", "https://www.diputados.gob.mx/LeyesBiblio/index.htm"]},
]

SET = {
    "con_cara": ["Luz de frente (ventana o aro de luz), nunca a tus espaldas", "Micrófono de solapa: el audio importa más que la imagen", "Cámara a la altura de los ojos, celular en vertical para cortos",
                 "Fondo ordenado con un elemento de tu nicho", "Graba en tomas cortas de una idea cada una", "Revisa que no se vean datos personales (direcciones, pantallas, documentos)"],
    "sin_cara": ["Manos y objetos (cocina, manualidades, tecnología)", "Pantalla grabada con tu voz o con texto", "Tus fotos o clips en secuencia con transiciones (paso 5)",
                 "Imágenes y videos libres de bibliotecas con licencia (paso 5)", "Texto grande en pantalla y música libre si no quieres usar tu voz", "Voz grabada por ti sin mostrarte, o solo texto"],
}

EVALUACION = {
    "semanas": [
        {"n": 1, "meta": "Publicar 3 piezas y medir el gancho", "revisar": ["¿Cuál retuvo más en los primeros 3 segundos?", "¿Qué formato te costó menos hacer?"]},
        {"n": 2, "meta": "Repetir el formato que mejor funcionó con 2 ideas nuevas", "revisar": ["¿Subieron las vistas promedio?", "¿Llegaron comentarios con preguntas? Son tus próximas ideas"]},
        {"n": 3, "meta": "Probar un horario y un llamado a la acción distintos", "revisar": ["¿Ganaste seguidores en las piezas con llamado a la acción?", "¿Qué horario dio más vistas en las primeras 24 horas?"]},
        {"n": 4, "meta": "Hacer una serie (3 piezas del mismo tema) y decidir qué sigue", "revisar": ["¿Qué 3 piezas repetirías?", "¿Qué dejarías de hacer?", "¿Tu nicho tiene suficiente interés o conviene ajustarlo?"]},
    ],
}

PLANES = [
    {"id": "demo", "nombre": "Demo", "precio_usd": 0, "dias": 7, "incluye": ["Todo el estudio por 7 días", "Video con tus fotos y clips", "Guiones, textos y calendario"]},
    {"id": "inicial", "nombre": "Creador inicial", "precio_usd": 5, "incluye": ["Estudio completo", "Videos de hasta 60 segundos", "Guardado en el servidor de tus ideas, guiones y métricas"]},
    {"id": "creador", "nombre": "Creador", "precio_usd": 10, "incluye": ["Todo lo del plan inicial", "Videos de hasta 3 minutos", "Evaluación de 30 días con recomendaciones", "Biblioteca libre de imágenes y videos"]},
]

OBJETIVOS = [["audiencia", "Crecer mi audiencia"], ["vender", "Vender un producto o servicio"], ["monetizar", "Ganar dinero con las plataformas"], ["marca", "Construir mi marca personal"],
             ["educar", "Enseñar lo que sé"], ["comunidad", "Crear una comunidad"], ["diversion", "Compartir un pasatiempo"]]

cfg = {"_nota": "Generado por tools/creadores/generar_config.py. Guía práctica para creadores; lo marcado «verificar» cambia seguido: confírmalo en la fuente oficial enlazada.",
       "revisado": "2026-11", "objetivos": OBJETIVOS, "nichos": NICHOS, "plataformas": PLATAFORMAS, "monetizacion": MONETIZACION, "legal": LEGAL, "set": SET, "evaluacion": EVALUACION, "planes": PLANES}
with open(os.path.join(RAIZ, "config", "creadores.json"), "w", encoding="utf-8") as f:
    json.dump(cfg, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(f"{len(NICHOS)} nichos, {len(LEGAL)} temas legales")
