"""Guion del noticiero diario en video (Brújula Diaria en YouTube).

Solo usa lo que el proyecto ya genera y puede publicarse:
  - data/vivos/noticiero.json (las 30 secciones del Noticiero) → por sección, las notas más recientes: título, medio,
    fecha y enlace. La voz y la pantalla usan un resumen PROPIO de una frase (redactar.py, con la IA local); sin IA,
    solo las notas con título en español, citadas como titular del medio.
  - data/vivos/calor_frio.geojson (pronóstico de MET Norway por ciudad) y data/vivos/ciclones_mundo.geojson (GDACS)
    → bloque del clima: ciudades de México y del mundo, ondas de calor, olas de frío y ciclones activos.
  - data/economia/indicadores.json → tipo de cambio FIX, tasa de Banxico, inflación de México y EUA, tasa de la Fed.
  - daily_report.json del Portafolio → solo cuántos instrumentos tuvieron noticias (sin señales de compra o venta:
    el video no da asesoría de inversión).
Funciones puras: reciben los JSON ya leídos y devuelven escenas, título y descripción.
"""
import re
from datetime import date

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

AVISO_VOZ = "Voz sintética. Resúmenes propios a partir de notas de los medios citados; consulta cada nota en su fuente."
AVISO_PORTAFOLIO = "No es asesoría de inversión."


def fecha_larga(f):
    d = date.fromisoformat(f)
    return f"{DIAS[d.weekday()]} {d.day} de {MESES[d.month - 1]} de {d.year}"


PAUSA = " ‖ "  # media pausa en la voz (render.py la convierte en 0.5 s de silencio)
_TLD = {"mx": "eme equis", "com": "com", "org": "org", "net": "net", "co": "co", "es": "e ese", "ar": "a erre", "cl": "ce ele",
        "pe": "pe e", "br": "be erre", "lat": "lat", "gob": "gob", "gov": "gov", "int": "int", "io": "i o", "uk": "iu ke", "us": "iu ese"}
# Convención numérica por dominio del medio: en España y gran parte de Sudamérica «3.830» son tres mil ochocientos treinta
# y «3,5» es tres punto cinco; en México y en inglés es al revés.
_PUNTO_MILES = {"es", "ar", "co", "cl", "pe", "uy", "ve", "py", "bo", "ec", "br", "de", "fr", "it", "pt", "nl", "ru", "tr"}


def convencion(url_o_medio):
    """«mx» (punto decimal, coma de miles: México e inglés) o «eu» (punto de miles, coma decimal)."""
    dominio = re.sub(r"^https?://", "", (url_o_medio or "").lower()).split("/")[0].split("?")[0]
    return "eu" if " " not in dominio and "." in dominio and dominio.rsplit(".", 1)[1] in _PUNTO_MILES else "mx"


def normalizar_numeros(texto, conv="mx"):
    """Lleva cifras a la convención mexicana (coma de miles, punto decimal) para que la voz no confunda 3.830 millones
    (España: tres mil ochocientos treinta) con 3.830 (México: tres punto ocho tres cero)."""
    t = str(texto or "")
    if conv == "eu":
        t = re.sub(r"\b\d{1,3}(?:\.\d{3})+(?![\d,])", lambda m: m.group(0).replace(".", ","), t)   # 3.830 → 3,830
        t = re.sub(r"(\d),(\d{1,2})\b(?!,\d)", r"\1.\2", t)                                       # 3,5 → 3.5
    return t


def _pronunciacion():
    import json
    import os
    try:
        p = os.path.join(os.path.dirname(__file__), "..", "..", "config", "pronunciacion.json")
        return json.load(open(p, encoding="utf-8")).get("palabras", {})
    except (OSError, ValueError):
        return {}


PRONUNCIACION = _pronunciacion()


def pronunciar(texto, dic=None):
    """Palabras de otro idioma como suenan en su origen (config/pronunciacion.json); solo afecta la voz."""
    dic = PRONUNCIACION if dic is None else dic
    for k in sorted(dic, key=len, reverse=True):
        texto = re.sub(r"(?<![\w&])" + re.escape(k) + r"(?![\w&])", dic[k], texto)
    return texto


def medio_para_voz(medio):
    """«razon.com.mx» → «razon punto com punto eme equis»; los nombres de medios en otro idioma, según la pronunciación."""
    m = (medio or "").strip()
    if " " not in m and "." in m:
        partes = m.lower().replace("www.", "").split(".")
        m = " punto ".join([partes[0]] + [_TLD.get(x, x) for x in partes[1:]])
    return pronunciar(m)


# Secciones con precios que pueden llevar 3 decimales (1.108 dólares por euro): ahí el punto solo se toma como miles
# cuando sigue «mil», «millones» o «billones» («14.200 millones de dólares»).
SECCIONES_PRECIO = {"forex", "cripto", "blockchain", "cbdc"}
_MILES = r"\b[1-9]\d{0,2}(?:\.\d{3})+(?![\d,]|\.\d)"


def miles_redaccion(texto, seccion=None):
    """La IA y algunos medios escriben miles con punto (formato de España: «4.000 dólares», «7.300 millones»). Un número
    de 1 a 3 cifras seguido de grupos exactos de 3 cifras con punto es de miles: se lleva a coma (4,000) para que la
    pantalla siga la norma mexicana y la voz no diga «4 punto 000». En divisas y cripto, solo antes de mil/millones."""
    patron = _MILES + (r"(?=\s*(?:mil\b|millones|mill[oó]n|billones|mdd|mdp))" if seccion in SECCIONES_PRECIO else "")
    return re.sub(patron, lambda m: m.group(0).replace(".", ","), str(texto or ""))


def para_voz(texto):
    """Ajusta números para que el sintetizador en español los lea bien: 18.67 → «18 punto 67»; 11 000 y 3,830 → 11000 y 3830."""
    t = re.sub(r"(\d)[ \u00a0\u202f](\d{3})\b", r"\1\2", str(texto))
    t = re.sub(r"\b(\d{1,3})((?:,\d{3})+)\b(?!\.\d)", lambda m: m.group(1) + m.group(2).replace(",", ""), t)
    t = re.sub(r"\b(\d{1,3})((?:,\d{3})+)(\.\d+)", lambda m: m.group(1) + m.group(2).replace(",", "") + m.group(3), t)
    t = re.sub(r"(\d)\.(\d)", r"\1 punto \2", t)
    t = t.replace("%", " por ciento").replace("‑", "-")
    return pronunciar(re.sub(r"\s+", " ", t).strip())


def cierre_frase(t):
    """Termina la frase con punto (los titulares no siempre lo traen) para que la voz haga la pausa."""
    t = (t or "").strip()
    return t if t[-1:] in ".!?…»\"" else t + "."


def _palabras(t):
    return {w for w in re.findall(r"[a-záéíóúñü0-9]{4,}", t.lower())}


def _nombres(t):
    """Nombres propios (palabras con mayúscula que no abren la oración): países, ciudades, personas."""
    return {w.lower() for w in re.findall(r"(?<![.!?]\s)(?<!^)\b[A-ZÁÉÍÓÚÑ][a-záéíóúñü]{3,}", t)}


def _repetida(x, y):
    """Misma noticia con otras palabras: casi todo el vocabulario en común, o al menos 3 palabras en común y además
    un nombre propio o el mismo país (fuera de México, donde casi todo comparte país)."""
    a, b = x.get("resumen", ""), y.get("resumen", "")
    pa, pb = _palabras(a), _palabras(b)
    comunes = len(pa & pb)
    mismo_pais = bool(x.get("pais_iso3")) and x.get("pais_iso3") == y.get("pais_iso3") and x.get("pais_iso3") != "MEX"
    return comunes / max(1, min(len(pa), len(pb))) >= 0.45 or (comunes >= 3 and (mismo_pais or bool(_nombres(a) & _nombres(b))))


def candidatos(rep):
    """Notas del reporte del día: destacadas primero y después las de cada sección (sin repetir id)."""
    vistos, out = set(), []
    for x in [*(rep or {}).get("destacados", []), *(e for s in (rep or {}).get("secciones", []) for e in s.get("eventos", []))]:
        if x.get("id") in vistos:
            continue
        vistos.add(x.get("id"))
        out.append(x)
    return out


def resumen_util(x):
    """Resumen propio redactado (no la plantilla «Tema · Lugar. Nota en español de …» de las notas sin resumen)."""
    r = (x.get("resumen") or "").strip()
    return bool(r) and len(r) >= 60 and not re.search(r"\bNota en [a-záéíóúñ]+ de ", r) and " · " not in r[:80]


def elegir(destacados, n=5, excluir_pais=None, vistos=None):
    """Las n notas con mayor severidad: sin señales automáticas, con resumen propio, sin repetidas (mismo tema con
    otras palabras, o mismo país y misma área)."""
    vistos = vistos if vistos is not None else []
    temas = set()
    out = []
    for x in sorted(destacados or [], key=lambda x: (-int(x.get("severidad") or 0), x.get("fecha_utc") or "")):
        if x.get("automatico") or not resumen_util(x):
            continue
        if excluir_pais and x.get("pais_iso3") == excluir_pais:
            continue
        tema = (x.get("pais_iso3"), x.get("area"))
        if any(_repetida(x, v) for v in vistos) or (tema[0] and tema[0] != "MEX" and tema in temas):
            continue
        vistos.append(x)
        temas.add(tema)
        out.append(x)
        if len(out) >= n:
            break
    return out


def _ultimo(ind, id_):
    for i in ind.get("indicadores", []):
        if i.get("id") == id_ and i.get("puntos"):
            return i["puntos"][-1]
    return None


# Orden del noticiero y nombre corto de cada sección del Noticiero (data/vivos/noticiero.json).
ORDEN = ["politica_mx", "politica_mx_critica", "geopolitica", "economia", "indicadores", "forex", "bonos", "oro", "metales", "energia",
         "crisis_energetica", "empresas", "sectores", "nearshoring", "inmobiliario", "cripto", "blockchain", "cbdc",
         "tecnologia", "organismos", "salud", "nutricion", "agenda2030", "clima", "eventos_impacto", "cultura",
         "espectaculos", "gastronomia_viajes", "belleza_moda", "infantil", "conspiracion"]
CORTO = {"politica_mx": "Política en México", "geopolitica": "Geopolítica", "economia": "Economía", "indicadores": "Indicadores",
         "forex": "Divisas", "bonos": "Bonos y CETES", "oro": "Oro y bancos centrales", "metales": "Metales y materias primas",
         "energia": "Energía", "crisis_energetica": "Crisis energética", "empresas": "Empresas", "sectores": "Sectores",
         "nearshoring": "Nearshoring", "inmobiliario": "Bienes raíces", "cripto": "Criptomonedas", "blockchain": "Blockchain",
         "cbdc": "Monedas digitales", "tecnologia": "Tecnología", "organismos": "Organismos internacionales", "salud": "Salud",
         "nutricion": "Nutrición", "agenda2030": "Agenda 2030", "clima": "Clima y desastres", "eventos_impacto": "Clima y economía",
         "cultura": "Cultura", "espectaculos": "Espectáculos", "gastronomia_viajes": "Gastronomía y viajes",
         "belleza_moda": "Belleza y moda", "infantil": "Niñas y niños", "conspiracion": "Teorías de conspiración",
         "politica_mx_critica": "Política en México", "dof": "Diario Oficial de la Federación"}
# Lo que la IA debe buscar en la sección cuando el nombre corto no basta.
TEMA = {
    "politica_mx_critica": "Política en México: señalamientos de corrupción, sobornos, empresas fantasma, desvíos, conflictos de "
                           "interés, investigaciones, auditorías o críticas a funcionarios o al gobierno de México",
    "infantil": "Niñas y niños: noticias sobre la infancia (derechos, escuela, salud, seguridad) o actividades para niñas y "
                "niños (eventos, películas, museos, parques). Una nota de ciencia o animales que no hable de niñas o niños no es de esta sección",
    "conspiracion": "Teorías de conspiración: qué afirmación falsa o engañosa circula y qué comprobó la verificación",
}
# Rendición de cuentas: además de las notas más repetidas de Política en México, una sobre lo que se le señala al gobierno.
CRITICA = re.compile(r"corrup|soborn|moches|desv[ií]o|empresas? fantasma|factureras?|lavado de dinero|huachicol|nepotismo|"
                     r"conflicto de inter|malversa|peculado|enriquecimiento il|auditor[ií]a superior|\bASF\b|irregularidad|"
                     r"vinculad[oa] a proceso|orden de aprehensi|sobrecosto|opacidad|adjudicaci[oó]n directa|fraude|colusi[oó]n|"
                     r"narcopol|esc[aá]ndalo|inhabilit|(acusan|investigan|denuncian|señalan|critican|cuestionan) a", re.I)
GOBIERNO_MX = re.compile(r"sheinbaum|gobierno (de m[eé]xico|federal)|morena\b|secretar[ií]a de|funcionari|diputad|senador|"
                         r"gobernador|alcald|pemex|cfe\b|imss|issste|segalmex|conagua|sedena|guardia nacional|fiscal[ií]a|\bFGR\b", re.I)
INFANTIL = re.compile(r"ni[nñ]as?\b|ni[nñ]os?\b|infan|menores|adolescen|escuela|escolar|alumn|primaria|secundaria|kínder|"
                      r"preescolar|unicef|juguete|kids?\b|children|child\b|students?|pupils?|schools?|toys?|teens?|"
                      r"para ni[nñ]os|familia|family|parque|museo|zool[oó]gico|zoo\b|pel[ií]cula|teatro|disney|pixar", re.I)
POR_SECCION = {"politica_mx": 2, "geopolitica": 2}  # las demás: solo la nota más relevante
VACIOS = re.compile(r"no (tropical )?cyclones|no hay ciclones|sin (avisos|actividad)", re.I)
ES = re.compile(r"\b(el|la|los|las|de|del|que|en|por|para|con|una?|se|su|sus|al)\b", re.I)


def en_espanol(t):
    """Heurística: al menos 3 palabras funcionales del español en el título."""
    return len(ES.findall(t or "")) >= 3


VACIAS = {"para", "como", "sobre", "entre", "tras", "ante", "desde", "hasta", "este", "esta", "estos", "estas", "with",
          "from", "that", "this", "after", "over", "into", "will", "have", "more", "what", "dice", "según", "años"}


def _clave(t):
    return {w for w in re.findall(r"[a-záéíóúñü0-9]{4,}", (t or "").lower()) if w not in VACIAS}


def _propios(t):
    """Nombres propios del título (palabras con mayúscula que no abren el título): Nvidia, Huang, Banxico…"""
    return {w.lower() for w in re.findall(r"(?<!^)(?<![¿¡\"«“])\b[A-ZÁÉÍÓÚÑ][A-Za-záéíóúñü]{2,}", (t or "").strip())}


def _parecidas(a, b, pa=frozenset(), pb=frozenset()):
    """Mismo tema: 3 palabras clave en común, la mitad de las del título más corto, o 2 nombres propios en común
    (esto último junta títulos de idiomas distintos: «Nvidia… Huang» en inglés y en español)."""
    comunes = len(a & b)
    return comunes >= 3 or (comunes >= 2 and comunes >= 0.5 * min(len(a), len(b))) or len(pa & pb) >= 2


def candidatos_seccion(noti, ahora_iso=None, horas=36, maximo=6):
    """{sección: [notas]} en ORDEN: por sección, las que más medios repiten en las últimas `horas` (desempate: la más
    reciente). Cada nota: titulo, medio, url, fecha, eco (cuántos medios cuentan lo mismo) y sus claves."""
    notas = (noti or {}).get("notas") or []
    corte = ahora_iso or (noti or {}).get("generado_utc") or ""
    if corte:
        from datetime import datetime, timedelta
        lim = (datetime.fromisoformat(corte.replace("Z", "+00:00")) - timedelta(hours=horas)).strftime("%Y-%m-%dT%H:%M:%SZ")
        notas = [n for n in notas if (n.get("f") or "") >= lim]
    notas = [n for n in notas if (n.get("t") or "").strip() and not VACIOS.search(n["t"])]
    cl = [_clave(n["t"]) for n in notas]
    pr = [_propios(n["t"]) for n in notas]
    eco = [1 + sum(1 for j, o in enumerate(notas) if j != i and o.get("m") != n.get("m") and _parecidas(cl[i], cl[j], pr[i], pr[j]))
           for i, n in enumerate(notas)]
    out = {}
    for sec in ORDEN:
        if sec == "politica_mx_critica":
            def es(n):
                return GOBIERNO_MX.search(n["t"]) and CRITICA.search(n["t"])  # del gobierno o sus funcionarios, no nota roja
        elif sec == "infantil":
            def es(n):
                return "infantil" in (n.get("s") or []) and INFANTIL.search(n["t"])  # tortugas o planetas sin niños: fuera
        else:
            def es(n, sec=sec):
                return sec in (n.get("s") or [])
        idx = sorted((i for i, n in enumerate(notas) if es(n)), key=lambda i: (eco[i], notas[i].get("f") or ""), reverse=True)
        lista, vistos = [], set()
        for i in idx:
            if notas[i].get("u") in vistos or any(_parecidas(cl[i], x["_c"], pr[i], x["_p"]) for x in lista):
                continue  # dentro de la sección, una sola nota por tema
            vistos.add(notas[i].get("u"))
            lista.append({"seccion": sec, "seccion_nombre": CORTO.get(sec, sec), "tema": TEMA.get(sec, CORTO.get(sec, sec)),
                          "titulo": notas[i]["t"].strip(), "medio": notas[i].get("m", ""),
                          "url": notas[i].get("u", ""), "fecha": notas[i].get("f", ""), "eco": eco[i], "_c": cl[i], "_p": pr[i]})
            if len(lista) >= maximo:
                break
        if lista:
            out[sec] = lista
    return out


def ya_contada(nota, elegidas):
    return any(_parecidas(nota["_c"], e["_c"], nota["_p"], e["_p"]) for e in elegidas)


def elegir_sin_ia(cands):
    """Sin IA: por sección, la candidata más repetida con título en español que no repita un tema ya elegido."""
    elegidas = []
    for sec, lista in cands.items():
        k = 0
        for n in lista:
            if en_espanol(n["titulo"]) and not ya_contada(n, elegidas):
                elegidas.append(n)
                k += 1
                if k >= POR_SECCION.get(sec, 1):
                    break
    return elegidas


def notas_noticiero(noti, ahora_iso=None, horas=36):
    """Compatibilidad: candidatas y elección sin IA."""
    return elegir_sin_ia(candidatos_seccion(noti, ahora_iso, horas))


def con_resumen(notas, resumenes=None, datos=None):
    """Asigna a cada nota su resumen propio (de la IA) o, sin él, su titular si está en español (en pantalla entre
    comillas y marcado como titular del medio). Las notas en otro idioma sin resumen se omiten. Entre la nota y el
    dato del día va una pausa de medio segundo. La fuente solo se muestra en pantalla y en la descripción: no se lee,
    para ahorrar tiempo. Cada cifra se dice una sola vez en todo el noticiero (el bitcoin no se repite en tres secciones)."""
    out, usados = [], set()
    for n in notas:
        n = {k: v for k, v in n.items() if not k.startswith("_")}  # las claves internas (conjuntos) no van al guion
        sec = n.get("seccion")
        r = (resumenes or {}).get(n["url"])
        r = miles_redaccion(r, sec) if r else r
        d = (datos or {}).get(sec)
        partes = [p for p in (d or {}).get("partes", []) if p[0] not in usados] if d and "partes" in d else None
        if partes is not None:
            usados.update(p[0] for p in partes)
            dato = {"texto": "\n".join(p[1] for p in partes), "voz": "Dato del día: " + "; ".join(p[2] for p in partes) + "."} if partes else None
        else:
            dato = d if d and d["texto"] not in usados else None
            if dato:
                usados.add(dato["texto"])
        extra = (PAUSA + para_voz(dato["voz"])) if dato else ""
        if r:
            out.append({**n, "resumen": r, "dato": dato and dato["texto"], "voz": cierre_frase(para_voz(r)) + extra})
        elif en_espanol(n["titulo"]):
            titulo = miles_redaccion(normalizar_numeros(n["titulo"], convencion(n.get("url") or n["medio"])), sec)
            out.append({**n, "resumen": f"«{titulo}»", "titular": True, "dato": dato and dato["texto"],
                        "voz": cierre_frase(para_voz(titulo)) + extra})
    return out


CIUDADES_MX = [("Ciudad de Mexico", "Ciudad de México"), ("Guadalajara", "Guadalajara"), ("Monterrey", "Monterrey"),
               ("Puebla", "Puebla"), ("Tijuana", "Tijuana"), ("Merida", "Mérida"), ("Cancun", "Cancún")]
CIUDADES_MUNDO = [("Nueva York", "Nueva York"), ("Los Angeles", "Los Ángeles"), ("Toronto", "Toronto"), ("Bogota", "Bogotá"),
                  ("Sao Paulo", "São Paulo"), ("Buenos Aires", "Buenos Aires"), ("Madrid", "Madrid"), ("Londres", "Londres"),
                  ("Paris", "París"), ("Berlin", "Berlín"), ("Moscú", "Moscú"), ("El Cairo", "El Cairo"), ("Mumbai", "Bombay"),
                  ("Pekin", "Pekín"), ("Tokio", "Tokio")]


def _dia(props, fecha):
    serie = props.get("serie") or []
    fila = next((x for x in serie if x[0] == fecha), serie[0] if serie else None)
    return (round(fila[1]), round(fila[2])) if fila and fila[1] is not None and fila[2] is not None else None


def bloque_clima(calor, ciclones, fecha):
    """{mx: [(ciudad, máx, mín)], mundo: [...], alertas: [frases], ciclones: [nombres], voz} o None sin datos."""
    props, en_mx = {}, set()
    for f in (calor or {}).get("features", []):
        p = f.get("properties") or {}
        if not p.get("name"):
            continue
        props[p["name"]] = p
        lon, lat = ((f.get("geometry") or {}).get("coordinates") or [None, None])[:2]
        if lat is not None and 14.5 <= lat <= 32.7 and -118.5 <= lon <= -86.7:  # rectángulo de México (aproximado)
            en_mx.add(p["name"])
    def filas(lista):
        out = []
        for clave, nombre in lista:
            t = _dia(props.get(clave, {}), fecha)
            if t:
                out.append((nombre, t[0], t[1]))
        return out
    mx, mundo = filas(CIUDADES_MX), filas(CIUDADES_MUNDO)
    # Alertas solo de las ciudades del bloque o de lugares de México, para no leer pueblos lejanos poco conocidos.
    nombres_bloque = {c for c, _ in CIUDADES_MX + CIUDADES_MUNDO}
    visible = dict(CIUDADES_MX + CIUDADES_MUNDO)
    relevante = lambda p, nivel: p["name"] in nombres_bloque or (p["name"] in en_mx and (p.get(nivel) or 0) >= 1)  # noqa: E731
    calor_c = sorted((p for p in props.values() if p.get("onda_calor") and relevante(p, "calor_nivel")), key=lambda p: -(p.get("calor_nivel") or 0))
    frio_c = sorted((p for p in props.values() if p.get("ola_frio") and relevante(p, "frio_nivel")), key=lambda p: -(p.get("frio_nivel") or 0))
    alertas = []
    if calor_c:
        alertas.append("Onda de calor: " + ", ".join(visible.get(p["name"], p["name"]) for p in calor_c[:4]))
    if frio_c:
        alertas.append("Ola de frío: " + ", ".join(visible.get(p["name"], p["name"]) for p in frio_c[:4]))
    nombres = []
    for f in (ciclones or {}).get("features", []):
        n = (f.get("properties") or {}).get("storm_name") or ""
        n = re.sub(r"-\d+$", "", n).strip().title()
        if n and n.lower() not in ("unnamed", "invest", "sin nombre") and n not in nombres:
            nombres.append(n)
    if not (mx or mundo or alertas or nombres):
        return None
    voz = []
    if mx:
        voz.append("El clima en México. " + " ".join(f"{c}, máxima de {a} y mínima de {b} grados." for c, a, b in mx[:4]))
    if mundo:
        voz.append("En el mundo, " + "; ".join(f"{c}, {a} grados" for c, a, _ in mundo[:6]) + " de máxima.")
    if alertas:
        voz.append("Según el pronóstico, que no es un aviso oficial: " + ". ".join(alertas) + ".")
    if nombres:
        voz.append("Ciclones activos: " + ", ".join(nombres[:5]) + ".")
    return {"mx": mx, "mundo": mundo, "alertas": alertas, "ciclones": nombres[:5], "voz": " ".join(voz)}


# ------------------------------------------------------------------ cifras del día por sección (vivos/indicadores.json)
_CIFRAS = {  # sección → ids de indicadores (Banxico, BCE, Tesoro de EUA, Kraken) que se dicen junto a la nota
    "forex": ["SF43718", "EURUSD"], "economia": ["SF43718"], "indicadores": ["SP30578", "SF61745"],
    "bonos": ["SF43936", "UST10Yr"], "cripto": ["XBT"], "blockchain": ["XBT"], "cbdc": ["XBT"],
}
_NOMBRE_VOZ = {"SF43718": "el dólar FIX", "EURUSD": "el euro", "SP30578": "la inflación anual en México",
               "SF61745": "la tasa objetivo de Banxico", "SF43936": "los CETES a 28 días", "UST10Yr": "el bono del Tesoro de EUA a 10 años",
               "XBT": "el bitcoin"}


def _fmt(v, dec=2):
    return f"{v:,.{dec}f}"


def datos_por_seccion(ind):
    """{sección: {texto, voz}} con el valor más reciente y su cambio frente al dato anterior (no es asesoría)."""
    por_id = {x["id"]: x for g in (ind or {}).get("grupos", []) for x in g.get("datos", []) if x.get("valor") is not None}
    out = {}
    for sec, ids in _CIFRAS.items():
        textos, voces, partes = [], [], []
        for i in ids:
            x = por_id.get(i)
            if not x:
                continue
            v, p, u = float(x["valor"]), x.get("previo"), x.get("unidad", "")
            es_tasa = u.strip() == "%"
            if i == "XBT":
                valor_t, valor_v = f"{_fmt(v, 0)} USD", f"{_fmt(v, 0)} dólares"
            elif es_tasa:
                valor_t = valor_v = f"{v:.2f} %"
            elif i == "EURUSD":
                valor_t, valor_v = f"{v:.4f} USD", f"{v:.4f} dólares por euro"
            else:
                valor_t, valor_v = f"{v:.4f} MXN", f"{v:.2f} pesos"
            cambio_t = cambio_v = ""
            if p not in (None, 0):
                p = float(p)
                if es_tasa:
                    d = round(v - p, 2)
                    cambio_t = f" ({d:+.2f} pts)" if d else " (sin cambio)"
                    cambio_v = (f", {'sube' if d > 0 else 'baja'} {abs(d):.2f} puntos" if d else ", sin cambio") + " frente al dato anterior"
                else:
                    pct = round((v / p - 1) * 100, 2)
                    cambio_t = f" ({pct:+.2f} %)" if pct else " (sin cambio)"   # nunca «-0.00 %»
                    cambio_v = (f", {'sube' if pct > 0 else 'baja'} {abs(pct):.2f} %" if pct else ", sin cambio") + " frente al dato anterior"
            fecha = str(x.get("fecha", ""))[:10]
            try:
                fecha = f"{int(fecha[8:10])} {MESES[int(fecha[5:7]) - 1][:3]}"   # 2026-11-10 → 10 nov
            except (ValueError, IndexError):
                pass
            textos.append(f"{x.get('corto', i)}: {valor_t}{cambio_t} · {fecha}")
            nombre = _NOMBRE_VOZ.get(i, x.get('corto', i))
            voces.append(f"{nombre} {'están' if nombre.startswith('los ') else 'está'} en {valor_v}{cambio_v}")
            partes.append((i, textos[-1], voces[-1]))
        if textos:
            out[sec] = {"texto": "\n".join(textos), "voz": "Dato del día: " + "; ".join(voces) + ".", "partes": partes}
    return out


# ------------------------------------------------------------------ Mercados (Portafolio de seguimiento)
def mercados(portafolio_data, ahora_iso=None, maximo=6, horas=48):
    """Hasta `maximo` instrumentos del Portafolio con noticia reciente, los de mayor movimiento del día primero:
    nombre, precio, % del día (último cierre frente al anterior) y su titular. Sin señales de compra o venta."""
    from datetime import datetime, timedelta, timezone
    ahora = datetime.fromisoformat(ahora_iso.replace("Z", "+00:00")) if ahora_iso else datetime.now(timezone.utc)
    lim = (ahora - timedelta(hours=horas)).isoformat()
    filas = []
    for x in portafolio_data or []:
        if not x.get("ok") or not x.get("news") or x.get("current_price") is None:
            continue
        n = max(x["news"], key=lambda z: z.get("date") or "")
        if (n.get("date") or "") < lim:
            continue
        sp = [v for v in (x.get("sparkline_12m") or []) if v]
        if len(sp) < 2:
            continue
        pct = round((sp[-1] / sp[-2] - 1) * 100, 2)
        filas.append({"nombre": x.get("name") or x["ticker"], "ticker": x["ticker"], "precio": float(x["current_price"]),
                      "moneda": x.get("currency") or "", "pct": pct, "titulo": n.get("title", ""), "medio": n.get("publisher", ""),
                      "url": n.get("link", "")})
    filas.sort(key=lambda f: abs(f["pct"]), reverse=True)
    return filas[:maximo]


def voz_mercados(filas, frases=None):
    partes = []
    for f in filas:
        mov = "sin cambio" if not f["pct"] else f"{'sube' if f['pct'] > 0 else 'baja'} {abs(f['pct']):.2f} %"
        moneda = {"USD": "dólares", "MXN": "pesos", "EUR": "euros"}.get(f["moneda"], f["moneda"])
        frase = (frases or {}).get(f["url"]) or (f["titulo"] if en_espanol(f["titulo"]) else "")
        precio = f"{f['precio']:,.4f}" if f["precio"] < 1 else f"{f['precio']:,.2f}"
        partes.append(f"{f['nombre']}: {precio} {moneda}, {mov}." + (f"{PAUSA}{cierre_frase(frase)}" if frase else ""))
    return para_voz(PAUSA.join(partes))


# ------------------------------------------------------------------ hashtags para YouTube
_HASH_SECCION = {"politica_mx": "#PolíticaMX", "geopolitica": "#Geopolítica", "economia": "#Economía", "forex": "#TipoDeCambio",
                 "bonos": "#CETES", "cripto": "#Criptomonedas", "blockchain": "#Blockchain", "energia": "#Energía",
                 "nearshoring": "#Nearshoring", "tecnologia": "#Tecnología", "salud": "#Salud", "clima": "#Clima",
                 "cultura": "#Cultura", "espectaculos": "#Espectáculos", "inmobiliario": "#BienesRaíces",
                 "dof": "#DOF", "politica_mx_critica": "#PolíticaMX"}


# ------------------------------------------------------------------ Diario Oficial de la Federación
_NIVEL = {"ley": 0, "decreto": 1, "reglamento": 2, "norma": 3, "acuerdo": 4}
_IMPACTO = {"alto": 0, "medio": 1, "bajo": 2}
# Actos particulares o de trámite que no cambian reglas para la población: un predio, un edicto, una convocatoria.
_DOF_PARTICULAR = re.compile(r"ocupaci[oó]n temporal|expropia|deslinde|edicto|convocatoria|licitaci|declaratoria de (libertad|"
                             r"desincorporaci)|se da a conocer (el|la) (nombre|domicilio)|aviso de (t[eé]rmino|cancelaci)|"
                             r"\bfe de erratas\b|tasas? de recargos|valor de la unidad de inversi|tipo de cambio para solventar", re.I)


def notas_dof(bitacora, fecha, dias=3, maximo=3):
    """Hasta `maximo` publicaciones del DOF de los últimos `dias` (bitácora normativa del sitio), primero leyes y decretos
    y las de mayor impacto; sin actos particulares y sin repetir el mismo tipo de acuerdo (p. ej. los estímulos a la
    gasolina, que salen cada semana). Solo título, dependencia y enlace: el texto de la norma no se guarda."""
    from datetime import date, timedelta
    try:
        lim = (date.fromisoformat(fecha) - timedelta(days=dias)).isoformat()
    except ValueError:
        return []
    ents = [e for e in (bitacora or {}).get("entradas", []) if e.get("pais") == "MEX" and "dof" in str(e.get("id", ""))
            and lim <= str(e.get("fecha", "")) <= fecha and e.get("titulo") and not _DOF_PARTICULAR.search(e["titulo"])]
    ents.sort(key=lambda e: e.get("fecha", ""), reverse=True)  # la más reciente primero dentro de cada nivel (orden estable)
    ents.sort(key=lambda e: (_NIVEL.get(e.get("nivel"), 5), _IMPACTO.get(e.get("impacto"), 3)))
    out, vistos = [], set()
    for e in ents:
        clave = " ".join(e["titulo"].lower().split()[:9])
        if clave in vistos:
            continue
        vistos.add(clave)
        titulo = e["titulo"].strip()
        if len(titulo) > 220:
            titulo = titulo[:220].rsplit(" ", 1)[0] + "…"
        out.append({"seccion": "dof", "seccion_nombre": CORTO["dof"], "tema": CORTO["dof"], "titulo": titulo,
                    "emisor": re.sub(r"^PODER EJECUTIVO\s+", "", (e.get("emisor") or "").strip(), flags=re.I), "medio": "Diario Oficial de la Federación", "url": e.get("url", ""),
                    "fecha": e.get("fecha", "")})
        if len(out) >= maximo:
            break
    return out


def con_dof(elegidas, dof):
    """Inserta las notas del DOF después de las de Política en México (o al inicio si no hay)."""
    pos = max((i + 1 for i, n in enumerate(elegidas) if str(n.get("seccion", "")).startswith("politica_mx")), default=0)
    return elegidas[:pos] + list(dof) + elegidas[pos:]


def hashtags(notas, maximo=12):
    """Los 3 primeros los muestra YouTube sobre el título; YouTube ignora todos si hay más de 15."""
    base = ["#BrújulaDiaria", "#NoticiasMéxico", "#NoticiasHoy", "#México", "#Mercados", "#ClimaHoy"]
    extra = [_HASH_SECCION[n["seccion"]] for n in notas if n.get("seccion") in _HASH_SECCION]
    out = []
    for h in base + extra + ["#Noticias", "#Resumen"]:
        if h not in out:
            out.append(h)
    return " ".join(out[:maximo])


def bloque_economia(indicadores):
    """Filas (etiqueta, valor en pantalla, frase para la voz) con el dato y su fecha."""
    filas = []
    defs = [
        ("mx_fix", "Tipo de cambio FIX", lambda v: f"{v:.2f} pesos por dólar", "El tipo de cambio FIX quedó en {v} pesos por dólar"),
        ("mx_tasa", "Tasa objetivo de Banxico", lambda v: f"{v:.2f} %", "La tasa objetivo del Banco de México está en {v} por ciento"),
        ("mx_inflacion", "Inflación anual en México", lambda v: f"{v:.2f} %", "La inflación anual en México fue de {v} por ciento"),
        ("us_tasa", "Tasa de la Reserva Federal", lambda v: f"{v:.2f} %", "La tasa de la Reserva Federal de Estados Unidos está en {v} por ciento"),
        ("us_inflacion", "Inflación anual en EUA", lambda v: f"{v:.1f} %", "La inflación anual en Estados Unidos fue de {v} por ciento"),
    ]
    for id_, etiqueta, fmt, voz in defs:
        p = _ultimo(indicadores or {}, id_)
        if not p or p[1] is None:
            continue
        f, v = p
        valor = fmt(float(v))
        # Series mensuales (fecha el día 1, como la inflación): «dato de octubre de 2026», no «del jueves 1 de octubre».
        cuando = f"de {MESES[int(f[5:7]) - 1]} de {f[:4]}" if f[8:10] == "01" else f"del {fecha_larga(f[:10])}"
        filas.append({"etiqueta": etiqueta, "valor": valor, "fecha": f, "voz": voz.format(v=valor.split(" ")[0]) + f", dato {cuando}."})
    return filas


# Renglón de la pantalla de indicadores → texto del dato del día que ya lo dijo (no se repite en voz).
_YA_DICHO = {"Tipo de cambio FIX": "FIX", "Tasa objetivo de Banxico": "Tasa objetivo", "Inflación anual en México": "INPC"}


def guion(fecha, elegidas, indicadores=None, portafolio=None, clima=None, cifras=None, frases_mercado=None):
    """Devuelve {fecha, titulo, escenas: [{tipo, encabezado, texto, medio, voz}], descripcion, notas}.
    elegidas: notas del Noticiero ya elegidas (redactar.py con IA, o elegir_sin_ia), con «resumen» propio si lo hay.
    clima: {"calor": calor_frio.geojson, "ciclones": ciclones_mundo.geojson}."""
    larga = fecha_larga(fecha)
    notas = con_resumen(elegidas, {n["url"]: n["resumen"] for n in elegidas if n.get("resumen")}, datos_por_seccion(cifras))
    esc = [{"tipo": "portada", "encabezado": "Brújula Diaria", "texto": larga[0].upper() + larga[1:],
            "voz": f"Buenos días. Esto es Brújula Diaria, {larga}. Las noticias de México y del mundo, la economía, el clima y más, en unos minutos."}]
    anterior = None
    bloque_c = bloque_clima((clima or {}).get("calor"), (clima or {}).get("ciclones"), fecha)
    for n in notas:
        if n["seccion"] != anterior:
            if anterior in ("clima", "eventos_impacto") and bloque_c:
                esc.append({"tipo": "clima", "encabezado": "El clima", **{k: bloque_c[k] for k in ("mx", "mundo", "alertas", "ciclones")}, "texto": "", "voz": para_voz(bloque_c["voz"])})
                bloque_c = None
            anterior = n["seccion"]
        esc.append({"tipo": "nota", "encabezado": n["seccion_nombre"], "seccion": n["seccion"], "texto": n["resumen"], "medio": n["medio"], "url": n["url"], "dato": n.get("dato"),
                    "titular": bool(n.get("titular")),
                    "voz": (f"{n['seccion_nombre']}. " if not esc or esc[-1].get("encabezado") != n["seccion_nombre"] else "") + n["voz"]})
    if bloque_c:
        esc.append({"tipo": "clima", "encabezado": "El clima", **{k: bloque_c[k] for k in ("mx", "mundo", "alertas", "ciclones")}, "texto": "", "voz": para_voz(bloque_c["voz"])})
    eco = bloque_economia(indicadores)
    if eco:
        dichos = " ".join(n.get("dato") or "" for n in notas)
        nuevas = [f for f in eco if not (_YA_DICHO.get(f["etiqueta"]) and _YA_DICHO[f["etiqueta"]] in dichos)]
        voz_eco = ("Los indicadores del día. " + " ".join(para_voz(f["voz"]) for f in nuevas)) if nuevas else "Los indicadores del día, en pantalla."
        esc.append({"tipo": "economia", "encabezado": "Indicadores", "filas": eco, "texto": "", "voz": voz_eco})
    filas_m = mercados(portafolio) if isinstance(portafolio, list) else []
    if filas_m:
        esc.append({"tipo": "mercados", "encabezado": "Mercados", "seccion": "economia",
                    "filas": [{**f, "frase": (frases_mercado or {}).get(f["url"]) or (f["titulo"] if en_espanol(f["titulo"]) else "")} for f in filas_m],
                    "texto": AVISO_PORTAFOLIO,
                    "voz": "En los mercados, instrumentos del portafolio de seguimiento con noticias recientes." + PAUSA
                           + voz_mercados(filas_m, frases_mercado) + PAUSA + AVISO_PORTAFOLIO})
    esc.append({"tipo": "cierre", "encabezado": "Gracias por ver", "texto": "Fuentes y enlaces en la descripción.\n" + AVISO_VOZ,
                "voz": "Las fuentes y los enlaces de cada nota están en la descripción del video. Hasta mañana."})
    descripcion = "\n".join([
        f"Brújula Diaria · {larga}.",
        "Resúmenes propios de las noticias del día; la voz es sintética.",
        "",
        "Fuentes de las notas:",
        *[f"• {x['seccion_nombre']} — {x['medio']}: {x['url']}" for x in notas],
        "",
        *([""] + ["Mercados (precio y titular de cada instrumento):"] + [f"• {f['nombre']} ({f['ticker']}) — {f['medio']}: {f['url']}" for f in filas_m] if filas_m else []),
        "",
        "Clima: pronóstico de MET Norway (CC BY 4.0) con reglas propias, no es aviso oficial; ciclones: GDACS.",
        "Cifras del día: Banco de México, Banco Central Europeo, Departamento del Tesoro de EUA y Kraken (cripto).",
        "Datos económicos: Banco de México, INEGI y Reserva Federal (FRED). Los mercados se mencionan solo como información; no es asesoría de inversión.",
        "Contenido con apoyo de inteligencia artificial: resúmenes propios redactados por un modelo de lenguaje y voz sintética.",
        "",
        hashtags(notas),
    ])
    titulo = f"Brújula Diaria · {larga[0].upper() + larga[1:]} · México y el mundo"
    return {"fecha": fecha, "titulo": titulo[:100], "escenas": esc, "descripcion": descripcion[:4900], "notas": len(notas)}
