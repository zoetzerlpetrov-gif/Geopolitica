#!/usr/bin/env python3
"""Agenda regulatoria de México: lo que el gobierno y el Congreso planean cambiar ANTES de que se publique en el DOF.

Fuentes (todas ya disponibles en el proyecto y permitidas):
  1. Sumario del DOF (vivos/dof.json): proyectos de Norma Oficial Mexicana (PROY-NOM) en consulta pública, avisos de
     consulta, programas de normalización y de mejora regulatoria. Son reglas que todavía no están vigentes.
  2. Titulares del monitor de noticias (vivos/noticiero.json, con su sección «Reformas y leyes en México»): iniciativas,
     dictámenes, aprobaciones en comisiones o en una cámara, minutas y reformas que entran en vigor más adelante.
     Solo título, enlace, medio y fecha (nunca el texto de la nota).
  3. Búsqueda de GDELT (api.gdeltproject.org/api/v2/doc, permitida por su robots.txt): titulares de medios mexicanos de los
     últimos 3 meses la primera vez y de los últimos 2 días después, con pausa de 12 s entre consultas. Si GDELT limita
     las consultas, se omite sin fallar (con --gdelt).
  4. Verificadores de datos del monitor (Maldita, Newtral, Snopes…) y titulares que desmienten («es falso que…»): marcan
     las señales como desmentidas o matizadas; un rumor desmentido también aparece, para no difundirlo como hecho.
La Gaceta Parlamentaria (gaceta.diputados.gob.mx) responde 403 a su robots.txt: por la regla del proyecto se trata como
prohibida y NO se consulta. SIL y CONAMER quedan como fuentes por incorporar cuando se verifique su acceso.

Cada señal se clasifica por etapa del proceso y lleva una probabilidad de publicación en el DOF que es una ESTIMACIÓN
heurística (etapa + origen), no un pronóstico oficial. La agenda conserva su historial (nunca borra): cuando una ley de la
agenda aparece después publicada en la bitácora normativa, la señal se marca «publicada» para medir el acierto.
Uso: python3 tools/normativa/agenda.py normativa vivos
"""
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
import monitor as M  # noqa: E402  (catálogo, índice de leyes y sectores, normalización)

# Etapas, de la más temprana a la más cercana al DOF, con su probabilidad estimada de publicarse y el horizonte típico.
ETAPAS = {
    "consulta": {"nombre": "Proyecto en consulta pública", "prob": 0.75, "meses": "1–6"},
    "iniciativa": {"nombre": "Iniciativa presentada", "prob": 0.15, "meses": "3–18"},
    "iniciativa_ejecutivo": {"nombre": "Iniciativa del Ejecutivo federal", "prob": 0.7, "meses": "1–6"},
    "dictamen": {"nombre": "Dictamen en comisiones", "prob": 0.6, "meses": "1–4"},
    "aprobada_camara": {"nombre": "Aprobada en una cámara (minuta)", "prob": 0.8, "meses": "1–3"},
    "aprobada_congreso": {"nombre": "Aprobada por el Congreso; falta publicar en el DOF", "prob": 0.93, "meses": "0–1"},
    "programa": {"nombre": "Programa de normalización o mejora regulatoria", "prob": 0.5, "meses": "3–12"},
    "anunciada": {"nombre": "Ley o reforma nueva en discusión pública", "prob": 0.45, "meses": "1–9"},
    "por_entrar_en_vigor": {"nombre": "Ya aprobada o publicada; entra en vigor más adelante", "prob": 0.97, "meses": "según la fecha"},
    "desmentida": {"nombre": "Rumor o versión desmentida por un verificador o por la autoridad", "prob": 0.02, "meses": "—"},
}
# Orden del proceso (para que la etapa de una señal solo avance).
ORDEN = ["desmentida", "programa", "iniciativa", "anunciada", "consulta", "iniciativa_ejecutivo", "dictamen", "aprobada_camara",
         "aprobada_congreso", "por_entrar_en_vigor"]
# Periodos ordinarios de sesiones del Congreso de la Unión (arts. 65 y 66 de la Constitución): 1 de septiembre al 15 de
# diciembre y 1 de febrero al 30 de abril. Fuera de ellos solo sesiona la Comisión Permanente (o un periodo extraordinario).
PERIODOS = [((9, 1), (12, 15)), ((2, 1), (4, 30))]
MESES = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8, "septiembre": 9,
         "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12}
EN_VIGOR = re.compile(r"(entra(?:r[aá]n?)?|entrar[aá]n?|entran) en vigor|ser[aá]n? obligatori[oa]s?|a partir de(?:l)?", re.I)
FECHA_TXT = re.compile(r"\b(?:(\d{1,2}) de )?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: de(?:l)? (\d{4}))?|\b(20\d{2})\b", re.I)
DESMIENTE = re.compile(r"\b(es falso|falso que|bulo|desmiente|desmienten|no es cierto|no existe (ninguna|tal)|fake|enga[ñn]oso|sin sustento|aclara que no)\b", re.I)
# Temas de la agenda (todas las áreas de la vida pública, no solo los sectores de auditoría). Una señal puede tener varios.
TEMAS = {
    "familia_civil": ("Familia, matrimonio, divorcio y herencias", r"divorci|matrimoni|c[oó]nyuge|concubin|pensi[oó]n alimenticia|custodia|herencia|testament|patria potestad|bienes (mancomunados|separados|del matrimonio)|registro civil|adopci"),
    "ninez": ("Niñas, niños y adolescentes", r"ni[ñn]as?|ni[ñn]os?|menores de edad|infancia|infantil|adolescente|escolar|guarder[ií]a|estancias? infantil"),
    "mujeres_igualdad": ("Mujeres, igualdad y género", r"mujer|igualdad|g[eé]nero|paridad|violencia (contra|de g[eé]nero|vicaria|digital)|feminicid|acoso|madres? (trabajadora|soltera)|cuidados"),
    "trabajo": ("Trabajo, empleo y salarios", r"laboral|trabajador|empleo|empresas? (deber[aá]n|tendr[aá]n) (contratar|pagar)|contrataci[oó]n|salario|aguinaldo|vacaciones|jornada|40 horas|imss|infonavit|outsourcing|subcontrataci|sindica|despido|ley federal del trabajo|\blft\b|cuota de contrataci"),
    "empresas": ("Empresas y comercio", r"empresa|negocio|pyme|mipyme|sociedades? mercantil|comercio|emprende|inversi[oó]n extranjera|competencia econ[oó]mica|consumidor|profeco|publicidad enga[ñn]osa"),
    "impuestos_dinero": ("Impuestos, dinero y finanzas públicas", r"impuesto|\bisr\b|\biva\b|\bieps\b|\bsat\b|fiscal|tributari|paquete econ[oó]mico|presupuesto|deuda p[uú]blica|aranceles?|aduana|derechos? por"),
    "bancos_pagos": ("Bancos, pagos y transferencias", r"banc[ao]|transferencia|\bspei\b|\bcodi\b|\bdimo\b|pagos? (digital|electr[oó]nic)|efectivo|tarjeta|cr[eé]dito|fintech|criptomoneda|remesa|afore|ahorro (para el retiro|bancario)|cnbv|condusef|lavado de dinero"),
    "telecom_internet": ("Telecomunicaciones, internet y datos", r"telecomunicaci|telefon[ií]a|celular|l[ií]nea|\bsim\b|internet|plataformas? digital|redes sociales|ciberseguridad|inteligencia artificial|\bia\b|datos personales|privacidad|streaming|radiodifusi|\bcrt\b|\bift\b|curp biom"),
    "seguridad_justicia": ("Seguridad, justicia y delitos", r"seguridad (p[uú]blica|nacional|ciudadana)|inseguridad|delito|penal|c[oó]digo nacional de procedimientos|prisi[oó]n|c[aá]rcel|polic[ií]a|guardia nacional|extorsi|secuestr|narco|armas?|amparo|poder judicial|jueces|tribunal|fiscal[ií]a"),
    "salud": ("Salud y medicamentos", r"salud|m[eé]dic|medicamento|hospital|imss-bienestar|vacuna|cofepris|tabaco|vapeador|cannabis|alcohol|obesidad|comida chatarra|discapacidad"),
    "educacion": ("Educación", r"educaci|escuela|maestr|docente|universidad|\bsep\b|libros de texto|becas?"),
    "alimentos": ("Alimentos y consumo", r"aliment|comida|tortilla|ma[ií]z|frijol|huevo|leche|az[uú]car|canasta b[aá]sica|transg[eé]nic|glifosato|etiquetado frontal|bebidas azucaradas"),
    "agricultura": ("Agricultura y campo", r"agr[ií]col|agricult|campo|campesin|cosecha|semilla|fertilizante|riego|ejid|tierras?|sader|precios? de garant"),
    "ganaderia_pesca": ("Ganadería y pesca", r"ganad|bovino|porcin|av[ií]cola|gusano barrenador|rastro|pesca|acuicultura|senasica"),
    "agua": ("Agua", r"\bagua\b|h[ií]dric|conagua|concesiones de agua|acu[ií]fero|presa|sequ[ií]a|drenaje|saneamiento"),
    "medio_ambiente": ("Medio ambiente y clima", r"ambiental|medio ambiente|clima|emisiones|contaminaci|residuos|pl[aá]stico|bosque|deforestaci|biodiversidad|miner[ií]a a cielo abierto|semarnat|profepa"),
    "animales": ("Animales", r"animal|mascota|perro|gato|maltrato|fauna|tauromaquia|corridas de toros|peleas de gallos|zool[oó]gico|seres sintientes"),
    "energia": ("Energía, gasolina y luz", r"energ[ií]a|energ[eé]tic|el[eé]ctric|\bcfe\b|pemex|radiactiv|nuclear|gasolina|di[eé]sel|gas lp|hidrocarburo|petr[oó]le|renovable|litio|tarifa"),
    "vivienda": ("Vivienda y propiedad", r"vivienda|renta|arrendamiento|inquilin|predial|hipoteca|propiedad|inmueble|desarrollo urbano|condominio"),
    "transporte": ("Transporte y movilidad", r"transporte|movilidad|veh[ií]cul|autom[oó]vil|licencia de conducir|placas|carretera|tren|aeropuerto|aviaci|uber|didi|motocicleta|tr[aá]nsito"),
    "migracion": ("Migración y nacionalidad", r"migra|migrante|trabajadores extranjeros|extranjeros (en m[eé]xico|residentes)|nacionalidad|visa|pasaporte|refugi|frontera"),
    "derechos_sociales": ("Programas sociales, pensiones y derechos", r"programas? (social|del bienestar)|pensi[oó]n del bienestar|pensi[oó]n (para|de) (adultos|el bienestar)|jubilaci|adultos mayores|ind[ií]gena|afromexican|discriminaci|lgbt|personas con discapacidad"),
    "politica_electoral": ("Política, elecciones y gobierno", r"electoral|elecci[oó]n|\bine\b|partido|plurinominal|reelecci|revocaci[oó]n|consulta popular|nepotismo|organismos aut[oó]nomos|transparencia|\binai\b"),
    "cultura_deporte": ("Cultura, deporte y entretenimiento", r"cultur|patrimonio|arte|museo|deporte|f[uú]tbol|mundial|espect[aá]culo|derechos de autor|apuestas|casinos?|sorteos"),
    "turismo": ("Turismo", r"turis|hotel|airbnb|hospedaje|cruceros?"),
    "salud_mental_adicciones": ("Adicciones y salud mental", r"adicci|drogas?|fentanilo|salud mental|suicidio"),
}
TEMAS_RX = {k: re.compile(v[1], re.I) for k, v in TEMAS.items()}
# Tema según la dependencia que emite un PROY-NOM (ENER, NUCL → energía; SICT → transporte; SADER/SENASICA → campo…).
TEMA_DEPENDENCIA = {"ENER": "energia", "NUCL": "energia", "ASEA": "energia", "SESH": "energia", "SECRE": "energia", "CRE": "energia",
                    "SICT": "transporte", "SCT": "transporte", "SCFI": "empresas", "SSA": "salud", "SSA1": "salud", "SSA2": "salud",
                    "SEMARNAT": "medio_ambiente", "CONAGUA": "agua", "SAG": "agricultura", "FITO": "agricultura", "ZOO": "ganaderia_pesca",
                    "PESC": "ganaderia_pesca", "SEDATU": "vivienda", "STPS": "trabajo", "IFT": "telecom_internet", "CNBV": "bancos_pagos"}
ESTADOS_MX = r"aguascalientes|baja california( sur)?|campeche|chiapas|chihuahua|coahuila|colima|durango|guanajuato|guerrero|hidalgo|jalisco|(estado de )?m[eé]xico|edomex|michoac[aá]n|morelos|nayarit|nuevo le[oó]n|oaxaca|puebla|quer[eé]taro|quintana roo|san luis potos[ií]|sinaloa|sonora|tabasco|tamaulipas|tlaxcala|veracruz|yucat[aá]n|zacatecas|la ciudad de m[eé]xico|cdmx"
ESTATAL = re.compile(rf"congreso (de|del) ({ESTADOS_MX})\b|congreso (local|estatal|capitalino|mexiquense|jalisciense|poblano)", re.I)
LEY_NOMBRE = re.compile(r"\b(ley(?: general| federal| nacional| org[aá]nica)? (?:de|del|para|contra|sobre)(?: la| los| las| el)? [A-ZÁÉÍÓÚÑa-záéíóúñ]+(?: [A-ZÁÉÍÓÚÑa-záéíóúñ]+){0,2})", re.I)
# Sector de un PROY-NOM según la dependencia que lo emite (la clave va después del número: PROY-NOM-041-ENER/SE-2025).
SECTOR_DEPENDENCIA = {"ENER": ["energia_electrica"], "NUCL": ["energia_electrica"], "CRE": ["energia_electrica"], "ASEA": ["hidrocarburos"],
                      "SESH": ["hidrocarburos"], "SECRE": ["energia_electrica"], "SICT": ["logistica", "transporte_pasajeros"], "SCT": ["logistica", "transporte_pasajeros"],
                      "SCFI": ["comercio_minorista"], "SSA": ["salud_hospitales", "farmaceutico"], "SSA1": ["farmaceutico", "alimentos"], "SSA2": ["salud_hospitales"],
                      "SEMARNAT": ["residuos_reciclaje"], "CONAGUA": ["agua_saneamiento"], "SAG": ["agropecuario"], "FITO": ["agropecuario"],
                      "ZOO": ["agropecuario"], "PESC": ["pesca_acuicultura"], "SEDATU": ["inmobiliario_desarrollo", "construccion"], "STPS": ["manufactura_immex"],
                      "SEGOB": [], "SE": ["manufactura_immex"], "IFT": ["telecom"], "CNBV": ["bancos"]}
PALABRAS_VACIAS = set("para por con sin sobre entre ante tras desde hasta como cual cuando donde este esta estos estas todo toda todos todas nueva nuevo nuevas nuevos ley leyes reforma reformas iniciativa senado congreso diputados camara aprueba aprueban avala avalan mexico tendras estos cambios contempla establece".split())
VERIFICADOR = re.compile(r"verificador", re.I)
DOF_CONSULTA = re.compile(r"proyecto de norma oficial mexicana|proy-nom|consulta p[uú]blica|anteproyecto", re.I)
DOF_PROGRAMA = re.compile(r"programa nacional de infraestructura de la calidad|programa (anual )?de mejora regulatoria|suplemento del programa", re.I)
DOF_RESPUESTAS = re.compile(r"respuestas? a los comentarios", re.I)

LEGISLATIVO = re.compile(r"\b(ley|leyes|constituci[oó]n|constitucional|c[oó]digo|reforma|decreto)\b", re.I)
NO_LEGISLATIVO = re.compile(r"banxico|banco de m[eé]xico|minutas? de (pol[ií]tica monetaria|la fed|banxico)|fed\b|tasa de inter[eé]s", re.I)
ETAPA_NOTICIA = [
    ("anunciada", None),  # se resuelve abajo: «nueva ley …» sin verbo de etapa
    ("aprobada_congreso", re.compile(r"(congreso|senado|c[aá]mara de diputados|diputados|senadores)\s+(aprueba|aprueban|avala|avalan)n?\b.*\b(en lo general y en lo particular|env[ií]a al ejecutivo|para su publicaci[oó]n)|turna(n|da)? al ejecutivo|declaratoria de validez", re.I)),
    ("aprobada_camara", re.compile(r"(senado|c[aá]mara de diputados|diputados|senadores|pleno|congreso)\s+(aprueba|aprueban|avala|avalan)|minuta|aprobad[ao] en el (pleno|senado)", re.I)),
    ("dictamen", re.compile(r"dictamen|comisi[oó]n(es)? (aprueba|aprueban|avala|avalan)|aprueban? en comisi", re.I)),
    ("iniciativa_ejecutivo", re.compile(r"(sheinbaum|presidenta|ejecutivo federal|el gobierno federal)\b.{0,60}\b(env[ií]a|presenta|propone|enviar[aá]|presentar[aá])\b.{0,40}\b(iniciativa|reforma|ley)|iniciativa (de|del) (la presidenta|ejecutivo)", re.I)),
    ("iniciativa", re.compile(r"iniciativa|propone(n)? (una )?(reforma|ley)|presenta(n)? (una )?(reforma|propuesta de ley)|buscan? reformar", re.I)),
]


def _id(*partes):
    return "AG:" + hashlib.sha1("|".join(partes).encode("utf-8")).hexdigest()[:12]


def clave_tema(titulo, url):
    """Las notas sobre la misma ley se agrupan en una sola señal (p. ej. cinco titulares de la Ley de Bienestar Animal)."""
    m = LEY_NOMBRE.search(titulo or "")
    return M.norm(m.group(1)) if m else (url or M.norm(titulo))


def sectores_nom(titulo):
    out = set()
    for deps in re.findall(r"NOM-\d{3}(?:-\d)?-([A-Z0-9/]+)", titulo or ""):
        for d in deps.split("/"):
            out.update(SECTOR_DEPENDENCIA.get(re.sub(r"\d+$", "", d), SECTOR_DEPENDENCIA.get(d, [])))
    return out


def temas_de(texto):
    t = texto or ""
    out = [k for k, rx in TEMAS_RX.items() if rx.search(t)]
    for deps in re.findall(r"NOM-\d{3}(?:-\d)?-([A-Z0-9/]+)", t):
        for d in deps.split("/"):
            k = TEMA_DEPENDENCIA.get(re.sub(r"\d+$", "", d)) or TEMA_DEPENDENCIA.get(d)
            if k and k not in out:
                out.insert(0, k)
    return out


def fecha_vigor(titulo, base):
    """Fecha (aaaa-mm) en que entra en vigor según el titular («entrará en vigor en enero de 2027»); None si no la dice."""
    m = EN_VIGOR.search(titulo or "")
    if not m:
        return None
    for f in FECHA_TXT.finditer(titulo[m.start():]):
        dia, mes, anio, solo_anio = f.groups()
        if mes:
            a = int(anio) if anio else (base.year + (1 if MESES[mes.lower()] < base.month else 0))
            return f"{a:04d}-{MESES[mes.lower()]:02d}"
        if solo_anio and int(solo_anio) >= base.year:
            return f"{int(solo_anio):04d}-01"
    return None


def ventana(s, base):
    """Ventana estimada de publicación o de entrada en vigor (aaaa-mm a aaaa-mm), para la vista de los próximos 12 meses."""
    if s.get("vigor_desde"):
        return [s["vigor_desde"], s["vigor_desde"]]
    m = re.findall(r"\d+", str(s.get("horizonte_meses") or ""))
    if len(m) < 2:
        return None
    d = datetime.strptime(s["detectado"], "%Y-%m-%d").replace(tzinfo=base.tzinfo)
    ini, fin = d + timedelta(days=30 * int(m[0])), d + timedelta(days=30 * int(m[1]))
    return [max(ini, base).strftime("%Y-%m"), max(fin, base).strftime("%Y-%m")]


def proximo_periodo(base):
    """Próximo periodo ordinario de sesiones del Congreso (o el que está en curso)."""
    for anio in (base.year, base.year + 1):
        for (mi, di), (mf, df) in sorted(PERIODOS, key=lambda p: p[0]):
            ini, fin = datetime(anio, mi, di, tzinfo=base.tzinfo), datetime(anio, mf, df, 23, 59, tzinfo=base.tzinfo)
            if fin >= base:
                return {"inicio": ini.strftime("%Y-%m-%d"), "fin": fin.strftime("%Y-%m-%d"), "en_curso": ini <= base}
    return None


def confirmacion(s):
    if s.get("etapa") == "desmentida" or s.get("verificaciones"):
        return "desmentida o matizada por un verificador"
    if s["fuente"].startswith("Diario Oficial"):
        return "oficial (DOF)"
    medios = {n.get("m") for n in s.get("notas", []) if n.get("m")}
    return "varios medios" if len(medios) >= 2 else "un solo medio (sin confirmar)"


def palabras(titulo):
    return {w for w in re.findall(r"[a-zñ]{5,}", M.norm(titulo)) if w not in PALABRAS_VACIAS}


def senal(fecha, fuente, etapa, titulo, url, medio, cats, idx, ambito="federal"):
    leyes, sectores = M.cruzar("MEX", titulo, idx, cats)
    sectores = sorted(set(sectores) | sectores_nom(titulo))
    e = ETAPAS[etapa]
    tema = clave_tema(titulo, url) if fuente.startswith("Monitor") else (url + "|" + M.norm(titulo)[:80])
    return {"id": _id(ambito, tema), "detectado": fecha, "actualizado": fecha, "fuente": fuente, "ambito": ambito, "etapa": etapa,
            "etapa_nombre": e["nombre"], "probabilidad": e["prob"], "horizonte_meses": e["meses"], "titulo": M.limpiar(titulo)[:300],
            "url": url, "medio": medio, "leyes": [l["nombre"] for l in leyes[:5]], "sectores": sectores, "temas": temas_de(titulo),
            "estado": "desmentida" if etapa == "desmentida" else "en curso",
            "notas": [{"t": M.limpiar(titulo)[:300], "u": url, "m": medio, "f": fecha}]}


def desde_dof(dof, desde, cats, idx):
    for f, items in sorted((dof or {}).get("dias", {}).items()):
        if f < desde:
            continue
        for cod, _tipo, _dep, texto in items:
            if DOF_RESPUESTAS.search(texto):
                continue  # respuesta a comentarios: la norma definitiva viene después, ya está en curso
            etapa = "consulta" if DOF_CONSULTA.search(texto) else "programa" if DOF_PROGRAMA.search(texto) else None
            if etapa:
                yield senal(f, "Diario Oficial de la Federación (sumario)", etapa, texto,
                            f"https://dof.gob.mx/index.php?year={f[:4]}&month={f[5:7]}&day={f[8:10]}", "DOF", cats, idx)


def es_de_mexico(n):
    """Solo medios o secciones de México (evita leyes de otros países con el mismo nombre)."""
    medio, secs = str(n.get("m") or ""), [str(x) for x in (n.get("s") or [])]
    return (medio.endswith(".mx") or "méxico" in medio.lower() or "mexico" in medio.lower() or any(x.endswith("_mx") for x in secs)
            or "méxico" in str(n.get("t") or "").lower())


def es_verificacion(n):
    return bool(VERIFICADOR.search(str(n.get("tipo") or "")) or "conspiracion" in (n.get("s") or []) or DESMIENTE.search(n.get("t") or ""))


def desde_noticias(noticiero, cats, idx, ahora=None):
    ahora = ahora or datetime.now(timezone.utc)
    for n in (noticiero or {}).get("notas", []):
        t = n.get("t") or ""
        verif = es_verificacion(n)
        if not LEGISLATIVO.search(t) or NO_LEGISLATIVO.search(t) or (not es_de_mexico(n) and not verif):
            continue
        fecha = str(n.get("f") or "")[:10] or ahora.strftime("%Y-%m-%d")
        if verif:
            # Un desmentido sobre una ley o reforma de México: aparece como «desmentida» (y matiza la señal del mismo tema).
            if re.search(r"m[eé]xic|mexican|senado|diputad|sheinbaum|\bsat\b|imss|cdmx", t, re.I) or es_de_mexico(n):
                yield senal(fecha, "Monitor de noticias (verificación)", "desmentida", t, n.get("u") or "", n.get("m") or "", cats, idx)
            continue
        vigor = fecha_vigor(t, ahora)
        etapa = "por_entrar_en_vigor" if vigor and vigor >= ahora.strftime("%Y-%m") else next((k for k, rx in ETAPA_NOTICIA if rx and rx.search(t)), None)
        if not etapa and re.search(r"\bnueva ley\b|\breforma (a|al|de) la (ley|constituci)|\bnuevas? (reglas|normas?|obligaci)", t, re.I):
            etapa = "anunciada"
        if not etapa:
            continue
        s = senal(fecha, "Monitor de noticias (titular)", etapa, t, n.get("u") or "", n.get("m") or "", cats, idx,
                  "estatal" if ESTATAL.search(t) else "federal")
        if vigor and etapa == "por_entrar_en_vigor":
            s["vigor_desde"] = vigor
        yield s


# Búsquedas en GDELT (titulares de medios de México). Una por familia de temas para cubrir todas las áreas.
CONSULTAS_GDELT = [
    '(iniciativa OR dictamen OR "reforma a la ley" OR "nueva ley") sourcecountry:mexico sourcelang:spanish',
    '("entrará en vigor" OR "entra en vigor" OR "será obligatorio") sourcecountry:mexico sourcelang:spanish',
    '(Senado OR diputados) (aprueba OR avala) reforma sourcecountry:mexico sourcelang:spanish',
    '(reforma OR iniciativa) (mujeres OR niñas OR niños OR divorcio OR pensión OR custodia) sourcecountry:mexico sourcelang:spanish',
    '(reforma OR iniciativa) (laboral OR trabajadores OR empresas OR salario OR impuestos OR SAT) sourcecountry:mexico sourcelang:spanish',
    '(reforma OR iniciativa) (bancos OR transferencias OR pagos OR telecomunicaciones OR internet OR celulares) sourcecountry:mexico sourcelang:spanish',
    '(reforma OR iniciativa) (agua OR alimentos OR maíz OR ganadería OR agricultura OR animales) sourcecountry:mexico sourcelang:spanish',
    '(falso OR desmiente) (ley OR reforma) México',
]
GDELT_API = "https://api.gdeltproject.org/api/v2/doc/doc"


def desde_gdelt(leer, timespan, pausa=12.0, dormir=None):
    """Notas con forma del Noticiero (t, u, m, f, s) a partir de la búsqueda de GDELT. Devuelve (notas, error o None)."""
    import time
    import urllib.parse
    dormir = dormir or time.sleep
    notas, error = [], None
    for i, q in enumerate(CONSULTAS_GDELT):
        if i:
            dormir(pausa)
        url = GDELT_API + "?" + urllib.parse.urlencode({"query": q, "mode": "artlist", "format": "json", "maxrecords": 250, "timespan": timespan, "sort": "datedesc"})
        try:
            texto = leer(url).decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            error = f"GDELT: {type(e).__name__}"
            break
        if not texto.strip().startswith("{"):
            error = "GDELT limitó las consultas desde este servidor; se usará el Noticiero"
            break
        for a in json.loads(texto).get("articles", []):
            sd = str(a.get("seendate") or "")
            if len(sd) >= 8 and a.get("title") and a.get("url"):
                notas.append({"t": a["title"], "u": a["url"], "m": a.get("domain") or "", "f": f"{sd[:4]}-{sd[4:6]}-{sd[6:8]}",
                              "s": ["gdelt_mx"] if a.get("sourcecountry") in ("Mexico", "MX") or str(a.get("domain", "")).endswith(".mx") else []})
    return notas, error


def marcar_publicadas(agenda, bitacora, ventana_dias=540):
    """Una señal en curso pasa a «publicada» si después aparece en la bitácora del DOF una publicación de la misma ley."""
    pub = [(e.get("fecha") or "", set(e.get("leyes_nombres") or [l.get("nombre") for l in e.get("leyes", []) if isinstance(l, dict)] or []))
           for e in (bitacora or {}).get("entradas", []) if str(e.get("id", "")).startswith("MEX:dof:")]
    for s in agenda:
        if s.get("estado") != "en curso" or not s.get("leyes"):
            continue
        limite = (datetime.strptime(s["detectado"], "%Y-%m-%d") + timedelta(days=ventana_dias)).strftime("%Y-%m-%d")
        for fecha, leyes in pub:
            if s["detectado"] <= fecha <= limite and leyes & set(s["leyes"]):
                s["estado"], s["publicada_el"] = "publicada", fecha
                break


def resumen(agenda):
    curso = [s for s in agenda if s["estado"] == "en curso"]
    por_sector, por_tema = {}, {}
    for s in curso:
        for sec in s["sectores"] or ["sin sector"]:
            por_sector[sec] = por_sector.get(sec, 0) + 1
        for t in s.get("temas") or ["otros"]:
            por_tema[t] = por_tema.get(t, 0) + 1
    return {"en_curso": len(curso), "federal": sum(1 for s in curso if s.get("ambito") != "estatal"),
            "estatal": sum(1 for s in curso if s.get("ambito") == "estatal"), "publicadas": sum(1 for s in agenda if s["estado"] == "publicada"),
            "alta_probabilidad": sum(1 for s in curso if s["probabilidad"] >= 0.7), "por_sector": dict(sorted(por_sector.items(), key=lambda x: -x[1])),
            "por_tema": dict(sorted(por_tema.items(), key=lambda x: -x[1])), "desmentidas": sum(1 for s in agenda if s["estado"] == "desmentida")}


def nombres_sectores():
    try:
        sec = json.load(open(os.path.join(M.ROOT, "config", "auditorias.json"), encoding="utf-8"))["sectores"]
        return {k: v.get("nombre", k) for k, v in sec.items()}
    except (OSError, ValueError, KeyError):
        return {}


def construir(salida, vivos, ahora=None, gdelt=None):
    """gdelt: función leer(url) → bytes para consultar GDELT (None: sin GDELT)."""
    ahora = ahora or datetime.now(timezone.utc)
    leer = lambda p: json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None
    anterior = leer(os.path.join(salida, "agenda.json")) or {}
    previa = anterior.get("senales", [])
    estado_gdelt = "no consultado"
    notas_gdelt = []
    if gdelt:
        notas_gdelt, err = desde_gdelt(gdelt, "2d" if anterior.get("gdelt_historico") else "3months")
        estado_gdelt = err or f"ok ({len(notas_gdelt)} titulares)"
    cats, claves = M.cargar_catalogo()
    idx = M.indice(cats, claves)
    desde = (ahora - timedelta(days=45 if previa else 180)).strftime("%Y-%m-%d")
    noti = leer(os.path.join(vivos, "noticiero.json")) or {}
    noti = {"notas": list(noti.get("notas", [])) + notas_gdelt}
    nuevas = list(desde_dof(leer(os.path.join(vivos, "dof.json")), desde, cats, idx)) + list(desde_noticias(noti, cats, idx, ahora))
    por_id = {s["id"]: s for s in previa}
    agregadas = 0
    for s in nuevas:
        if s["id"] not in por_id and s["fuente"].startswith("Monitor"):
            # Mismo tema con otro titular (≥2 palabras significativas en común, mismo ámbito, ≤30 días): se agrupa.
            ps = palabras(s["titulo"])
            for v in por_id.values():
                if (v["fuente"].startswith("Monitor") and v.get("estado") in ("en curso", "desmentida") and v.get("ambito") == s["ambito"]
                        and abs((datetime.strptime(v.get("actualizado") or v["detectado"], "%Y-%m-%d") - datetime.strptime(s["detectado"], "%Y-%m-%d")).days) <= 30
                        and len(ps & set().union(*[palabras(n["t"]) for n in v.get("notas", [])] or [set()])) >= 2):
                    s["id"] = v["id"]
                    break
        if s["id"] in por_id:
            v = por_id[s["id"]]
            urls = {x.get("u") for x in v.setdefault("notas", [])}
            if s["url"] not in urls:
                v["notas"] = (v["notas"] + s["notas"])[-8:]
                v["actualizado"] = max(v.get("actualizado") or v["detectado"], s["detectado"])
            if s["etapa"] == "desmentida" and v["etapa"] != "desmentida":
                # Un verificador desmiente o matiza una señal existente: se anota, sin borrar la señal.
                v.setdefault("verificaciones", [])
                if s["url"] not in {x.get("u") for x in v["verificaciones"]}:
                    v["verificaciones"] = (v["verificaciones"] + s["notas"])[-5:]
                continue
            # La etapa solo avanza (una nota posterior puede decir que ya se aprobó).
            if ORDEN.index(s["etapa"]) > ORDEN.index(v["etapa"]) and v.get("estado") == "en curso":
                v.update({k: s[k] for k in ("etapa", "etapa_nombre", "probabilidad", "horizonte_meses", "titulo", "url", "medio")})
                if s.get("vigor_desde"):
                    v["vigor_desde"] = s["vigor_desde"]
            for k in ("leyes", "sectores", "temas"):
                v[k] = sorted(set(v.get(k) or []) | set(s[k]))[:8]
        else:
            por_id[s["id"]] = s
            agregadas += 1
    agenda = sorted(por_id.values(), key=lambda s: (s.get("actualizado") or s["detectado"], s["probabilidad"]), reverse=True)
    marcar_publicadas(agenda, leer(os.path.join(salida, "bitacora.json")))
    for x in agenda:
        x.setdefault("temas", temas_de(" ".join(n.get("t", "") for n in x.get("notas", [])) or x["titulo"]))
        x["confirmacion"] = confirmacion(x)
        x["ventana"] = ventana(x, ahora) if x["estado"] == "en curso" else None
    datos = {"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "agregadas_hoy": agregadas, "resumen": resumen(agenda),
             "gdelt_historico": bool(anterior.get("gdelt_historico") or (gdelt and estado_gdelt.startswith("ok"))),
             "proximo_periodo": proximo_periodo(ahora), "temas": {k: v[0] for k, v in TEMAS.items()},
             "fuentes": {"DOF (sumario)": "ok" if os.path.exists(os.path.join(vivos, "dof.json")) else "sin datos",
                         "Monitor de noticias": "ok" if os.path.exists(os.path.join(vivos, "noticiero.json")) else "sin datos",
                         "Búsqueda de GDELT (3 meses la primera vez)": estado_gdelt,
                         "Gaceta Parlamentaria": "omitida: su robots.txt responde 403 (se trata como prohibido)",
                         "SIL (Segob) y CONAMER": "por incorporar: verificar acceso desde GitHub Actions"},
             "nota": "La probabilidad es una estimación por etapa del proceso y origen, no un pronóstico oficial. Confirma siempre en la fuente.",
             "etapas": ETAPAS, "sectores_nombres": nombres_sectores(), "senales": agenda}
    os.makedirs(salida, exist_ok=True)
    with open(os.path.join(salida, "agenda.json"), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    return datos


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    con_gdelt = None
    if "--gdelt" in sys.argv and M.F.permitido_por_robots(GDELT_API + "?query=x"):
        con_gdelt = lambda url: M.F.get(url, timeout=60)  # noqa: E731
    d = construir(args[0] if args else "normativa", args[1] if len(args) > 1 else "vivos", gdelt=con_gdelt)
    print("Fuentes:", d["fuentes"])
    print(f"Agenda regulatoria: {d['resumen']['en_curso']} señales en curso ({d['agregadas_hoy']} nuevas hoy), "
          f"{d['resumen']['alta_probabilidad']} con probabilidad alta, {d['resumen']['publicadas']} ya publicadas en el DOF.")
