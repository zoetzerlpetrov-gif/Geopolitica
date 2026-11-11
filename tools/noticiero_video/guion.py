"""Guion del noticiero diario en video (Noticiero DOMINUS en YouTube).

Solo usa lo que el proyecto ya genera y puede publicarse:
  - data/reportes/mexico/<fecha>.json y data/reportes/global/<fecha>.json → «destacados»: resumen PROPIO de cada
    nota (nunca el texto del medio), nombre del medio, fecha y enlace.
  - data/economia/indicadores.json → tipo de cambio FIX, tasa de Banxico, inflación de México y EUA, tasa de la Fed.
  - daily_report.json del Portafolio → solo cuántos instrumentos tuvieron noticias (sin señales de compra o venta:
    el video no da asesoría de inversión).
Funciones puras: reciben los JSON ya leídos y devuelven escenas, título y descripción.
"""
import re
from datetime import date

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

AVISO_VOZ = "Voz sintética. Resúmenes propios de DOMINUS a partir de notas de los medios citados; consulta cada nota en su fuente."
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


def guion(fecha, rep_mx, rep_global, indicadores=None, portafolio=None, n_mx=5, n_mundo=5):
    """Devuelve {fecha, titulo, escenas: [{tipo, encabezado, texto, medio, voz}], descripcion}."""
    larga = fecha_larga(fecha)
    vistos = []
    mx = elegir(candidatos(rep_mx), n_mx, vistos=vistos)
    mundo = elegir(candidatos(rep_global), n_mundo, excluir_pais="MEX", vistos=vistos)
    esc = [{"tipo": "portada", "encabezado": "Noticiero DOMINUS", "texto": larga[0].upper() + larga[1:],
            "voz": f"Buenos días. Este es el Noticiero DOMINUS del {larga}. Las noticias de México y del mundo, la economía y los mercados, en unos minutos."}]
    if mx:
        esc.append({"tipo": "seccion", "encabezado": "México", "texto": "", "voz": "Empezamos con México."})
        for x in mx:
            esc.append({"tipo": "nota", "encabezado": "México", "texto": x["resumen"], "medio": x.get("fuente", ""), "url": x.get("url", ""), "voz": para_voz(x["resumen"]) + f" Fuente: {x.get('fuente', '')}."})
    if mundo:
        esc.append({"tipo": "seccion", "encabezado": "El mundo", "texto": "", "voz": "Ahora, el mundo."})
        for x in mundo:
            esc.append({"tipo": "nota", "encabezado": "El mundo", "texto": x["resumen"], "medio": x.get("fuente", ""), "url": x.get("url", ""), "voz": para_voz(x["resumen"]) + f" Fuente: {x.get('fuente', '')}."})
    eco = bloque_economia(indicadores)
    if eco:
        esc.append({"tipo": "economia", "encabezado": "Economía", "filas": eco, "texto": "", "voz": "En economía. " + " ".join(para_voz(f["voz"]) for f in eco)})
    n_inst = ((portafolio or {}).get("noticias") or {}).get("instrumentos_con_noticias")
    if n_inst:
        esc.append({"tipo": "portafolio", "encabezado": "Mercados", "texto": f"{n_inst} instrumentos del portafolio de seguimiento tuvieron noticias en el día.\n{AVISO_PORTAFOLIO}",
                    "voz": f"En los mercados, {n_inst} instrumentos del portafolio de seguimiento tuvieron noticias en el día. {AVISO_PORTAFOLIO}"})
    esc.append({"tipo": "cierre", "encabezado": "Gracias por ver", "texto": "Fuentes y enlaces en la descripción.\n" + AVISO_VOZ,
                "voz": "Las fuentes y los enlaces de cada nota están en la descripción del video. Hasta mañana."})
    notas = mx + mundo
    descripcion = "\n".join([
        f"Noticiero DOMINUS · {larga}.",
        "Resúmenes propios de DOMINUS OSINT; la voz es sintética.",
        "",
        "Fuentes de las notas:",
        *[f"• {x.get('fuente', '')}: {x.get('url', '')}" for x in notas],
        "",
        "Datos económicos: Banco de México, INEGI y Reserva Federal (FRED). Los mercados se mencionan solo como información; no es asesoría de inversión.",
    ])
    titulo = f"Noticiero DOMINUS · {larga[0].upper() + larga[1:]} · México y el mundo"
    return {"fecha": fecha, "titulo": titulo[:100], "escenas": esc, "descripcion": descripcion[:4900], "notas": len(notas)}
