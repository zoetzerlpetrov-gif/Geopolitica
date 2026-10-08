"""Resumen propio por reglas (sin IA), de unas 30 palabras y en español.

El texto del medio (título y descripción del feed) se lee SOLO en memoria para extraer HECHOS:
países, organismos, cifras (muertos, heridos, desplazados, porcentajes, montos) y el tipo de hecho
(subtema y área del clasificador). Con esos hechos el sistema redacta su propia frase; no copia
oraciones del medio. Ejemplo:

  «Seguridad · Conflictos activos en Arabia Saudita (Medio Oriente): 3 muertos. Involucra a Arabia
   Saudita y Yemen. Nota en inglés de Al Jazeera; abre el enlace para el detalle.»

Uso: resumen_noticia(...) para RSS y ReliefWeb; resumen_gdelt(...) para eventos codificados de GDELT.
"""
import re

from classify import SOLO_MAYUSCULAS, normalizar

NUMEROS_EN = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
              "ten": 10, "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20, "dozens": "decenas", "hundreds": "cientos",
              "thousands": "miles", "millions": "millones"}
NUMEROS_ES = {"un": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8,
              "nueve": 9, "diez": 10, "doce": 12, "quince": 15, "veinte": 20, "decenas": "decenas", "cientos": "cientos",
              "miles": "miles", "millones": "millones"}

# Unidad (normalizada) -> forma en español para el resumen.
UNIDADES = {
    "muerto": "muertos", "muerta": "muertos", "herido": "heridos", "herida": "heridos", "fallecido": "muertos",
    "desaparecido": "desaparecidos", "detenido": "detenidos", "rehen": "rehenes",
    "muertos": "muertos", "muertas": "muertos", "fallecidos": "muertos", "dead": "muertos", "killed": "muertos",
    "deaths": "muertos", "people killed": "muertos", "victimas": "víctimas", "victims": "víctimas",
    "heridos": "heridos", "injured": "heridos", "wounded": "heridos",
    "desaparecidos": "desaparecidos", "missing": "desaparecidos",
    "desplazados": "desplazados", "displaced": "desplazados", "refugiados": "refugiados", "refugees": "refugiados",
    "detenidos": "detenidos", "arrestados": "detenidos", "arrested": "detenidos", "detained": "detenidos",
    "rehenes": "rehenes", "hostages": "rehenes", "evacuados": "evacuados", "evacuated": "evacuados",
    "drones": "drones", "misiles": "misiles", "missiles": "misiles", "cohetes": "cohetes", "rockets": "cohetes",
    "hogares": "hogares afectados", "homes": "hogares afectados", "households": "hogares afectados",
    "soldados": "soldados", "soldiers": "soldados", "troops": "soldados", "tropas": "soldados",
}
# Verbo antes de la cifra: «killing three people», «injuring 12», «matando a 5».
VERBOS = {"killing": "muertos", "kill": "muertos", "kills": "muertos", "matando a": "muertos", "mato a": "muertos", "mataron a": "muertos",
          "injuring": "heridos", "wounding": "heridos", "hiriendo a": "heridos", "hirio a": "heridos",
          "displacing": "desplazados", "desplazando a": "desplazados"}
_NUM = r"(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?|" + "|".join(sorted(set(NUMEROS_EN) | set(NUMEROS_ES), key=len, reverse=True)) + r")"
_UNI = "|".join(sorted(UNIDADES, key=len, reverse=True))
RX_CIFRA = re.compile(rf"\b{_NUM}\s+(?:people\s+|personas\s+)?({_UNI})\b")
RX_PORC = re.compile(r"\b(\d+(?:[.,]\d+)?)\s?(?:%|por ciento|percent)")
RX_MONTO = re.compile(r"(?:\$|usd\s?|us\$|€|eur\s?)\s?(\d+(?:[.,]\d+)?)\s?(mil millones|millones|billion|million|bn|m)\b")
RX_MONTO2 = re.compile(r"\b(\d+(?:[.,]\d+)?)\s?(mil millones|millones|billion|million)\s(?:de\s)?(dollars?|dolares|euros?|usd|eur)\b")
RX_VERBO = re.compile(rf"\b({'|'.join(sorted(VERBOS, key=len, reverse=True))})\s+{_NUM}\b")

ORGANISMOS = [  # (patrón sobre el texto normalizado, nombre en español)
    (" onu ", "la ONU"), (" naciones unidas ", "la ONU"), (" united nations ", "la ONU"), (" consejo de seguridad ", "el Consejo de Seguridad de la ONU"),
    (" security council ", "el Consejo de Seguridad de la ONU"), (" otan ", "la OTAN"), (" nato ", "la OTAN"),
    (" union europea ", "la Unión Europea"), (" european union ", "la Unión Europea"), (" ue ", "la Unión Europea"), (" eu ", "la Unión Europea"),
    (" oms ", "la OMS"), (" fmi ", "el FMI"), (" imf ", "el FMI"), (" banco mundial ", "el Banco Mundial"), (" world bank ", "el Banco Mundial"),
    (" opep ", "la OPEP"), (" opec ", "la OPEP"), (" omc ", "la OMC"), (" wto ", "la OMC"), (" g7 ", "el G7"), (" g20 ", "el G20"),
    (" brics ", "los BRICS"), (" oiea ", "el OIEA"), (" iaea ", "el OIEA"), (" cpi ", "la Corte Penal Internacional"),
    (" icc ", "la Corte Penal Internacional"), (" cij ", "la Corte Internacional de Justicia"), (" icj ", "la Corte Internacional de Justicia"),
    (" acnur ", "ACNUR"), (" unhcr ", "ACNUR"), (" unicef ", "UNICEF"), (" hamas ", "Hamás"), (" hezbollah ", "Hezbolá"),
    (" hutiés ", "los hutíes"), (" huties ", "los hutíes"), (" houthi ", "los hutíes"), (" houthis ", "los hutíes"), (" taliban ", "los talibanes"),
]
SIGLA_DE = {" un ": "un", " who ": "who"}  # siglas ambiguas: requieren mayúsculas en el original
ORGANISMOS += [(" un ", "la ONU"), (" who ", "la OMS")]

REGION_ES = {
    "norteamerica": "Norteamérica", "centroamerica_caribe": "Centroamérica y Caribe", "sudamerica": "Sudamérica",
    "europa_occidental": "Europa Occidental", "europa_este_rusia": "Europa del Este y Rusia", "medio_oriente": "Medio Oriente",
    "africa_norte_sahel": "África del Norte y Sahel", "africa_subsahariana": "África Subsahariana", "asia_central": "Asia Central",
    "asia_sur": "Asia del Sur", "indopacifico_taiwan": "Indo-Pacífico", "artico": "Ártico",
}
IDIOMA = {"en": "en inglés", "es": "en español", "fr": "en francés", "pt": "en portugués", "de": "en alemán", "ar": "en árabe"}


def _num(txt):
    v = NUMEROS_EN.get(txt, NUMEROS_ES.get(txt))
    if v is None:
        return txt
    return str(v)


def cifras(texto, maximo=3):
    """Cifras con unidad, en español y sin repetir unidad: ['3 muertos', '12 heridos', '5 %']."""
    t = normalizar(texto)
    out, vistas = [], set()
    hallazgos = [(m.start(), m.group(1), UNIDADES[m.group(2)]) for m in RX_CIFRA.finditer(t)]
    hallazgos += [(m.start(), m.group(2), VERBOS[m.group(1)]) for m in RX_VERBO.finditer(t)]
    for _, num, unidad in sorted(hallazgos):
        if unidad in vistas:
            continue
        vistas.add(unidad)
        n = _num(num)
        if n == "1":
            unidad = {"muertos": "muerto", "heridos": "herido", "desaparecidos": "desaparecido", "detenidos": "detenido",
                      "desplazados": "desplazado", "refugiados": "refugiado", "rehenes": "rehén", "víctimas": "víctima",
                      "evacuados": "evacuado"}.get(unidad, unidad)
        out.append(f"{n} {unidad}")
    escalas = {"billion": "mil millones", "bn": "mil millones", "million": "millones", "m": "millones"}
    m = RX_MONTO.search(t)
    if m:
        out.append(f"{m.group(1)} {escalas.get(m.group(2), m.group(2))} de {'euros' if 'eur' in m.group(0) or '€' in m.group(0) else 'dólares'}")
    elif (m := RX_MONTO2.search(t)):
        out.append(f"{m.group(1)} {escalas.get(m.group(2), m.group(2))} de {'euros' if m.group(3).startswith('eur') else 'dólares'}")
    for m in RX_PORC.finditer(texto.lower()):
        out.append(f"{m.group(1)} %")
        break
    return out[:maximo]


def organismos(texto, maximo=2):
    t = normalizar(texto)
    hallados = {}
    for patron, nombre in ORGANISMOS:
        sigla = SIGLA_DE.get(patron)
        if sigla and not SOLO_MAYUSCULAS[sigla].search(texto):
            continue
        i = t.find(patron)
        if i >= 0:
            hallados[nombre] = min(i, hallados.get(nombre, i))
    return [n for n, _ in sorted(hallados.items(), key=lambda x: x[1])][:maximo]  # en orden de aparición


def _lista(nombres):
    nombres = [n for n in nombres if n]
    if len(nombres) <= 1:
        return "".join(nombres)
    return ", ".join(nombres[:-1]) + " y " + nombres[-1]


def recortar(texto, palabras=40):
    p = texto.split()
    return texto if len(p) <= palabras else " ".join(p[:palabras]).rstrip(",;:") + "…"


def resumen_noticia(c, cls, gaz, nombre_subtema):
    """Resumen propio de ~30 palabras para una nota de RSS o ReliefWeb.

    c: candidato (titulo, texto_clasificar, fuente, idioma, pais_iso3, region opcional)
    cls: {area_principal, nombre_area, subtemas}
    nombre_subtema: dict id -> nombre en español
    """
    texto = c["texto_clasificar"]
    paises = [gaz.paises[i]["es"] for i in gaz.paises_en_texto(texto) if i in gaz.paises][:3]
    pais = gaz.paises.get(c.get("pais_iso3") or "", {}).get("es")
    region = REGION_ES.get(gaz.region(c["pais_iso3"])) if c.get("pais_iso3") else None
    tema = nombre_subtema.get(cls["subtemas"][0]) if cls.get("subtemas") else None
    if tema:
        tema = re.sub(r"\s*\([^)]*\)", "", tema)  # «Actores no estatales (milicias, …)» → «Actores no estatales»
    que = f"{cls['nombre_area']}" + (f" · {tema}" if tema else "")
    donde = f" en {pais}" + (f" ({region})" if region else "") if pais else ""
    datos = cifras(texto)
    partes = [f"{que}{donde}" + (f": {_lista(datos)}." if datos else ".")]
    actores = paises + organismos(texto)
    otros = [a for a in actores if a != pais]
    if otros:
        partes.append(f"Involucra a {_lista(([pais] if pais else []) + otros[:3])}.")
    idioma = IDIOMA.get(c.get("idioma") or "", "")
    if c.get("tipo_fuente") == "red_social":
        partes.append(f"Publicación de una persona usuaria en {c['fuente']}; abre el enlace para leerla.")
    else:
        partes.append(f"Nota {idioma + ' ' if idioma else ''}de {c['fuente']}.")
    return recortar(" ".join(partes))[:400]


def nombre_actor(actor, gaz):
    """Actor de GDELT en español si es un país («RUSSIA» → «Rusia»); si no, en mayúsculas iniciales."""
    if not actor:
        return None
    iso = gaz.pais_en_texto(actor)
    if iso in gaz.paises and len(normalizar(actor).split()) <= 2:
        return gaz.paises[iso]["es"]
    return actor.title()


def titulo_gdelt(g, gaz, pais_iso3):
    """«Combate: Rusia → Ucrania (Kyiv, Ucrania)»: título del sistema con países traducidos."""
    a1 = nombre_actor(g["a1"], gaz) or "Actor no identificado"
    a2 = nombre_actor(g["a2"], gaz)
    sitio = g["lugar"].split(",")[0].strip() if g["lugar"] else "lugar no identificado"
    pais = gaz.paises.get(pais_iso3 or "", {}).get("es")
    lugar = f"{sitio}, {pais}" if pais and pais.lower() != sitio.lower() else sitio
    return f"{g['desc']}: {a1}{' → ' + a2 if a2 and a2 != a1 else ''} ({lugar})"[:300]


def resumen_gdelt(c, gaz, articulos, fuentes, goldstein, desc, a1, a2, lugar, slug=""):
    """Resumen de un evento codificado por GDELT, en español y con los países traducidos."""
    quien = nombre_actor(a1, gaz)
    contra = nombre_actor(a2, gaz)
    pais = gaz.paises.get(c.get("pais_iso3") or "", {}).get("es")
    sitio = (lugar.split(",")[0].strip() if lugar else "")
    donde = f" en {sitio}" + (f" ({pais})" if pais and pais.lower() != sitio.lower() else "") if sitio else (f" en {pais}" if pais else "")
    rel = f" de {quien}" + (f" hacia {contra}" if contra and contra != quien else "") if quien else ""
    tono = "conflicto alto" if goldstein <= -7 else "conflicto moderado" if goldstein <= -3 else "tensión baja"
    tema = " ".join(slug.split()[:10])
    texto = (f"{desc}{rel}{donde}, reportado en {articulos} artículos de {fuentes} medios. "
             + (f"El enlace de origen habla de: «{tema}». " if len(slug.split()) >= 3 else "")
             + f"Escala Goldstein {goldstein:+.1f} ({tono}). Detectado por GDELT.")
    return recortar(texto)[:400]
