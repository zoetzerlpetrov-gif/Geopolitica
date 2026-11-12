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


def para_voz(texto):
    """Ajusta números para que el sintetizador en español los lea bien: 18.67 → «18 punto 67»; 11 000 → 11000."""
    t = re.sub(r"(\d)[   ](\d{3})\b", r"\1\2", str(texto))
    t = re.sub(r"(\d)\.(\d)", r"\1 punto \2", t)
    t = t.replace("%", " por ciento").replace("‑", "-")
    return re.sub(r"\s+", " ", t).strip()


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
ORDEN = ["politica_mx", "geopolitica", "economia", "indicadores", "forex", "bonos", "oro", "metales", "energia",
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
         "belleza_moda": "Belleza y moda", "infantil": "Niñas y niños", "conspiracion": "Teorías de conspiración (verificación)"}
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
        idx = sorted((i for i, n in enumerate(notas) if sec in (n.get("s") or [])), key=lambda i: (eco[i], notas[i].get("f") or ""), reverse=True)
        lista, vistos = [], set()
        for i in idx:
            if notas[i].get("u") in vistos or any(_parecidas(cl[i], x["_c"], pr[i], x["_p"]) for x in lista):
                continue  # dentro de la sección, una sola nota por tema
            vistos.add(notas[i].get("u"))
            lista.append({"seccion": sec, "seccion_nombre": CORTO.get(sec, sec), "titulo": notas[i]["t"].strip(), "medio": notas[i].get("m", ""),
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


def con_resumen(notas, resumenes=None):
    """Asigna a cada nota su resumen propio (de la IA) o, sin él, la cita como titular del medio si está en español.
    Las notas en otro idioma sin resumen se omiten (no se leen títulos en inglés)."""
    out = []
    for n in notas:
        n = {k: v for k, v in n.items() if not k.startswith("_")}  # las claves internas (conjuntos) no van al guion
        r = (resumenes or {}).get(n["url"])
        if r:
            out.append({**n, "resumen": r, "voz": para_voz(r) + f" Fuente: {n['medio']}."})
        elif en_espanol(n["titulo"]):
            out.append({**n, "resumen": f"Titular de {n['medio']}: «{n['titulo']}»", "voz": f"{n['medio']} publica: {para_voz(n['titulo'])}."})
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
    props = {f["properties"]["name"]: f["properties"] for f in (calor or {}).get("features", []) if f.get("properties", {}).get("name")}
    def filas(lista):
        out = []
        for clave, nombre in lista:
            t = _dia(props.get(clave, {}), fecha)
            if t:
                out.append((nombre, t[0], t[1]))
        return out
    mx, mundo = filas(CIUDADES_MX), filas(CIUDADES_MUNDO)
    calor_c = sorted((p for p in props.values() if p.get("onda_calor")), key=lambda p: -(p.get("calor_nivel") or 0))
    frio_c = sorted((p for p in props.values() if p.get("ola_frio")), key=lambda p: -(p.get("frio_nivel") or 0))
    alertas = []
    if calor_c:
        alertas.append("Onda de calor: " + ", ".join(p["name"] for p in calor_c[:5]))
    if frio_c:
        alertas.append("Ola de frío: " + ", ".join(p["name"] for p in frio_c[:5]))
    nombres = []
    for f in (ciclones or {}).get("features", []):
        n = (f.get("properties") or {}).get("storm_name") or ""
        n = re.sub(r"-\d+$", "", n).strip().title()
        if n and n not in nombres:
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
        filas.append({"etiqueta": etiqueta, "valor": valor, "fecha": f, "voz": voz.format(v=valor.split(" ")[0]) + f", dato del {fecha_larga(f[:10])}."})
    return filas


def guion(fecha, elegidas, indicadores=None, portafolio=None, clima=None):
    """Devuelve {fecha, titulo, escenas: [{tipo, encabezado, texto, medio, voz}], descripcion, notas}.
    elegidas: notas del Noticiero ya elegidas (redactar.py con IA, o elegir_sin_ia), con «resumen» propio si lo hay.
    clima: {"calor": calor_frio.geojson, "ciclones": ciclones_mundo.geojson}."""
    larga = fecha_larga(fecha)
    notas = con_resumen(elegidas, {n["url"]: n["resumen"] for n in elegidas if n.get("resumen")})
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
        esc.append({"tipo": "nota", "encabezado": n["seccion_nombre"], "seccion": n["seccion"], "texto": n["resumen"], "medio": n["medio"], "url": n["url"],
                    "voz": (f"{n['seccion_nombre']}. " if not esc or esc[-1].get("seccion") != n["seccion"] else "") + n["voz"]})
    if bloque_c:
        esc.append({"tipo": "clima", "encabezado": "El clima", **{k: bloque_c[k] for k in ("mx", "mundo", "alertas", "ciclones")}, "texto": "", "voz": para_voz(bloque_c["voz"])})
    eco = bloque_economia(indicadores)
    if eco:
        esc.append({"tipo": "economia", "encabezado": "Indicadores", "filas": eco, "texto": "", "voz": "Los indicadores del día. " + " ".join(para_voz(f["voz"]) for f in eco)})
    n_inst = ((portafolio or {}).get("noticias") or {}).get("instrumentos_con_noticias")
    if n_inst:
        esc.append({"tipo": "portafolio", "encabezado": "Mercados", "texto": f"{n_inst} instrumentos del portafolio de seguimiento tuvieron noticias en el día.\n{AVISO_PORTAFOLIO}",
                    "voz": f"En los mercados, {n_inst} instrumentos del portafolio de seguimiento tuvieron noticias en el día. {AVISO_PORTAFOLIO}"})
    esc.append({"tipo": "cierre", "encabezado": "Gracias por ver", "texto": "Fuentes y enlaces en la descripción.\n" + AVISO_VOZ,
                "voz": "Las fuentes y los enlaces de cada nota están en la descripción del video. Hasta mañana."})
    descripcion = "\n".join([
        f"Brújula Diaria · {larga}.",
        "Resúmenes propios de las noticias del día; la voz es sintética.",
        "",
        "Fuentes de las notas:",
        *[f"• {x['seccion_nombre']} — {x['medio']}: {x['url']}" for x in notas],
        "",
        "Clima: pronóstico de MET Norway (CC BY 4.0) con reglas propias, no es aviso oficial; ciclones: GDACS.",
        "Datos económicos: Banco de México, INEGI y Reserva Federal (FRED). Los mercados se mencionan solo como información; no es asesoría de inversión.",
    ])
    titulo = f"Brújula Diaria · {larga[0].upper() + larga[1:]} · México y el mundo"
    return {"fecha": fecha, "titulo": titulo[:100], "escenas": esc, "descripcion": descripcion[:4900], "notas": len(notas)}
