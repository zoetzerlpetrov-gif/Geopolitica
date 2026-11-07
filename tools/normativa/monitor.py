#!/usr/bin/env python3
"""Monitor diario de cambios normativos: lee diarios oficiales, los cruza con el catálogo de normativa y escribe una
bitácora histórica (nunca se borra) con lo que cada publicación afecta: leyes, sectores, trámites y preguntas de auditoría.

Fuentes automáticas (verificadas el 7-nov-2026; cada una respeta su robots.txt y se consulta una vez al día):
  MEX  Diario Oficial de la Federación: vivos/dof.json (lo descarga tools/investigacion/dof.py) y la fecha de última
       reforma de cada ley federal de la Cámara de Diputados (vivos/leyes_federales.json).
  USA  Federal Register API (federalregister.gov/api/v1): reglas finales y documentos presidenciales.
  CAN  Canada Gazette, Parte II (RSS oficial de reglamentos).
  EUR  Oficina de Publicaciones de la UE (punto SPARQL de Cellar): reglamentos, directivas y decisiones.
  JPN  e-Gov, API de leyes v2 (laws.e-gov.go.jp/api/2): leyes y órdenes promulgadas.
  RUS  Portal oficial de publicación de actos jurídicos (publication.pravo.gov.ru/api).
Sin fuente automática (los revisa la tarea diaria de Claude con búsqueda web en las fuentes oficiales del catálogo):
  CHN (el robots.txt de flk.npc.gov.cn prohíbe todo acceso automatizado), CHL (el Diario Oficial niega el robots.txt),
  BRA (el robots.txt de in.gov.br responde 403 a bots: se trata como prohibido), ARG (el Boletín Oficial no respondió
  desde los servidores de prueba; se intenta cada día) y Medio Oriente.

Solo se guarda el título oficial de cada publicación (texto del Estado), la fecha, el emisor y el enlace al original.
El texto de cada nota del DOF (nota_detalle.php) está vedado a bots en el robots.txt de dof.gob.mx: solo se usa el sumario.
Nunca el texto completo.

Salidas (directorio dado como argumento, por omisión «normativa/»):
  bitacora.json  entradas de toda la historia, la más nueva primero; una entrada nunca se borra ni se reescribe
                 (solo se le agregan datos si la misma publicación vuelve a aparecer).
  estado.json    estado de cada fuente, leyes del catálogo con reforma más reciente que la registrada y resumen por país.
"""
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

CATALOGO = os.path.join(ROOT, "config", "normativa")
MAX_TITULO = 300
DIAS_PRIMERA_VEZ = 30
PAUSA_S = 2

SIN_FUENTE = {
    "CHN": "El robots.txt de la base nacional de leyes (flk.npc.gov.cn) prohíbe el acceso automatizado: revisión semanal manual.",
    "CHL": "El Diario Oficial niega el acceso a su robots.txt: revisión semanal manual en Ley Chile (bcn.cl).",
    "ARG": "Boletín Oficial: se intenta cada día; si no responde, revisión semanal manual.",
    "BRA": "El robots.txt del Diário Oficial da União (in.gov.br) responde 403 a bots: revisión semanal manual en Planalto y el DOU.",
    "SAU": "Sin fuente automática abierta: revisión semanal manual.", "ARE": "Sin fuente automática abierta: revisión semanal manual.",
    "QAT": "Sin fuente automática abierta: revisión semanal manual.", "KWT": "Sin fuente automática abierta: revisión semanal manual.",
    "BHR": "Sin fuente automática abierta: revisión semanal manual.", "OMN": "Sin fuente automática abierta: revisión semanal manual.",
    "ISR": "Sin fuente automática abierta: revisión semanal manual.", "TUR": "Sin fuente automática abierta: revisión semanal manual.",
    "EGY": "Sin fuente automática abierta: revisión semanal manual.", "JOR": "Sin fuente automática abierta: revisión semanal manual.",
    "MDO": "Sanciones: revisión semanal manual en OFAC, el mapa de sanciones de la UE y la ONU.",
}

# Palabras que delatan un sector (español, inglés, portugués, japonés y ruso). Se buscan en el título normalizado.
SECTOR_CLAVES = {
    "hidrocarburos": ["hidrocarburo", "petrolifer", "petroleo", "gas natural", "gas licuado", "gas lp", "combustible", "gasolin", "diesel", "ducto",
                      "petroleum", "natural gas", "pipeline", "crude oil", "lng", "petroleo e gas", "combustiveis", "石油", "ガス事業", "нефт", "природного газа", "газоснабжен"],
    "energia_electrica": ["energia electrica", "sector electrico", "electricidad", "generacion de energia", "transmision electrica", "electric", "electricity",
                          "power plant", "renewable", "energia eletrica", "電気事業", "электроэнерг"],
    "mineria": ["minera", "mineria", "minerales", "mining", "mineral resources", "mineracao", "鉱業", "недр"],
    "bancos": ["instituciones de credito", "banca multiple", "bancari", "sistema financiero", "banking", "credit union", "instituicoes financeiras", "銀行", "банков", "кредитных организаций"],
    "seguros": ["instituciones de seguros", "aseguradora", "contrato de seguro", "fianzas", "insurance compan", "reinsurance", "seguros privados", "保険業", "страховой деятельност", "страховых организаций"],
    "farmaceutico": ["medicamento", "farmac", "insumos para la salud", "dispositivo medico", "drug", "pharmac", "medical device", "medicamentos", "医薬品", "лекарств"],
    "alimentos": ["alimento", "bebida", "inocuidad", "food additive", "food safety", "beverage", "alimentos", "食品", "пищев"],
    "telecom": ["telecomunicacion", "radiodifusion", "espectro", "telecommunication", "spectrum", "broadcast", "telecomunicacoes", "電気通信", "электросвяз", "массовых коммуникаций"],
    "ti_digital": ["ciberseguridad", "datos personales", "inteligencia artificial", "comercio electronico", "cybersecurity", "artificial intelligence",
                   "personal data", "dados pessoais", "個人情報", "персональных данных", "информационн"],
    "logistica": ["autotransporte", "transporte de carga", "aduan", "importador", "importer of record", "importers of record", "logistic", "freight", "motor carrier", "customs", "aduaneir", "貨物自動車", "таможен"],
    "automotriz": ["vehiculo", "automotri", "autopartes", "motor vehicle", "automotive", "veiculos", "自動車", "транспортных средств"],
    "aeronautico": ["aeronautic", "aviacion", "aeropuerto", "aviation", "aircraft", "aviacao", "航空", "воздушн"],
    "construccion": ["construccion", "obra publica", "edificacion", "construction", "building code", "obras publicas", "建設業", "строител"],
    "defensa": ["armas de fuego", "explosivo", "uso dual", "defense", "munitions", "dual-use", "defesa", "防衛", "оборон"],
}
SECTOR_NOMBRE = {k: v for k, v in [("automotriz", "Automotriz"), ("energia_electrica", "Energía eléctrica"), ("hidrocarburos", "Hidrocarburos"),
                                   ("aeronautico", "Aeronáutico"), ("farmaceutico", "Farmacéutico"), ("construccion", "Construcción"), ("defensa", "Defensa y uso dual"),
                                   ("seguros", "Seguros"), ("bancos", "Bancos y finanzas"), ("mineria", "Minería"), ("alimentos", "Alimentos y bebidas"),
                                   ("telecom", "Telecomunicaciones"), ("ti_digital", "Tecnología y datos"), ("logistica", "Transporte y logística")]}

# Publicaciones de rutina que no cambian obligaciones de una empresa (EUA publica decenas al día).
RUTINA_USA = re.compile(r"^(airworthiness directives|safety zone|drawbridge operation|special local regulation|security zone|air plan approval|"
                        r"anchorage|regulated navigation area|(modification|amendment|establishment|revocation) of .{0,80}(class [a-e]|airspace|airway|route)|"
                        r"standard instrument approach|pesticide tolerance|.*; correction$|.*technical amendments?$)", re.I)
FEDERAL_RUS = re.compile(r"^(Федеральный (конституционный )?закон|Указ Президента Российской Федерации|Постановление Правительства Российской Федерации|"
                         r"Распоряжение Правительства Российской Федерации|Постановление Конституционного Суда Российской Федерации|.{0,120}Российской Федерации от)")
# Autoridades por sigla (como aparecen en el catálogo) y su nombre oficial (como aparece en los títulos del DOF).
AUTORIDADES = {"MEX": {
    "SAT": "servicio de administracion tributaria", "SENER": "secretaria de energia", "CNE": "comision nacional de energia",
    "ASEA": "agencia nacional de seguridad industrial", "CENACE": "centro nacional de control de energia", "COFEPRIS": "comision federal para la proteccion contra riesgos sanitarios",
    "CNBV": "comision nacional bancaria y de valores", "CNSF": "comision nacional de seguros y fianzas", "STPS": "secretaria del trabajo y prevision social",
    "IMSS": "instituto mexicano del seguro social", "SEMARNAT": "secretaria de medio ambiente y recursos naturales", "PROFEPA": "procuraduria federal de proteccion al ambiente",
    "ANAM": "agencia nacional de aduanas", "SICT": "secretaria de infraestructura, comunicaciones y transportes", "AFAC": "agencia federal de aviacion civil",
    "CONAGUA": "comision nacional del agua", "PROFECO": "procuraduria federal del consumidor", "SENASICA": "servicio nacional de sanidad, inocuidad y calidad agroalimentaria",
    "CONSAR": "comision nacional del sistema de ahorro para el retiro", "BANXICO": "banco de mexico", "SE": "secretaria de economia", "SHCP": "secretaria de hacienda y credito publico",
    "CRT": "comision reguladora de telecomunicaciones", "ATDT": "agencia de transformacion digital y telecomunicaciones", "SADER": "secretaria de agricultura y desarrollo rural",
}}
REGULACION_MEX = re.compile(r"expide[n]? (las|los|la|el) (disposiciones|lineamientos|reglas|criterios|manual)|disposiciones administrativas de caracter general|"
                            r"modifica[n]? (las|los) (disposiciones|lineamientos|reglas)|norma oficial mexicana|resolucion miscelanea|reglas generales de comercio exterior|simplificacion .{0,40}tramites|"
                            r"(requisitos|formatos|plazos) .{0,30}(tramite|permiso|autorizacion)")
SALTAR_MEX = {"Indicador financiero", "Aviso, convocatoria o edicto", "Convenio", "Otro"}


def norm(s):
    """Minúsculas, sin acentos ni espacios repetidos. Igual para el catálogo y para los títulos (también en japonés y ruso)."""
    s = "".join(c for c in unicodedata.normalize("NFD", str(s or "")) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.lower()).strip()


def limpiar(t):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t or ""))).strip()


# ------------------------------------------------------------------ catálogo → índice de claves
def cargar_catalogo(dir_=CATALOGO):
    cats = {}
    for f in sorted(os.listdir(dir_)):
        m = re.fullmatch(r"([A-Z]{3})\.json", f)
        if m:
            cats[m.group(1)] = json.load(open(os.path.join(dir_, f), encoding="utf-8"))
    extra = os.path.join(dir_, "MEX_sectores.json")
    if "MEX" in cats and os.path.exists(extra):
        cats["MEX"].setdefault("sectores", {}).update(json.load(open(extra, encoding="utf-8")).get("sectores", {}))
    claves = {}
    if os.path.exists(os.path.join(dir_, "claves.json")):
        claves = json.load(open(os.path.join(dir_, "claves.json"), encoding="utf-8"))
    return cats, claves


_FRASE = re.compile(r"\b((?:ley|codigo|reglamento|constitucion|norma oficial mexicana|disposiciones administrativas de caracter general|lineamientos|reglas generales)\b[^,;:()«»\"]{6,120})")
# Frases que por sí solas no identifican una ley concreta.
GENERICAS = {"ley federal", "ley general", "ley organica", "ley nacional", "ley reglamentaria", "reglamento interior", "reglamento interno", "reglamento de ejecucion", "reglamento delegado", "ley de proteccion", "ley federal de", "ley general de", "reglamento de la ley"}


def claves_de_ley(jur, ley):
    """Frases y números que identifican la ley en un título oficial (en minúsculas y sin acentos)."""
    nombre = ley.get("nombre", "")
    n = norm(nombre)
    ks = set()
    for m in _FRASE.finditer(n):
        completa = m.group(1).strip(" .-")
        f = re.split(r"\s(?:y|e|and)\s(?=(?:la |el |su |sus |los |las )?(?:ley|codigo|reglamento|norma|nom|disposicion|lineamiento|acuerdo|decreto|directiva|regla))"
                     r"|\s(?:de \d|n\.o|no\.)", completa)[0].strip(" .-")
        f = " ".join(f.split()[:9])
        minimo = 3 if f == completa else 4
        if f == completa and len(f.split()) == 2 and len(f.split()[1]) >= 6:  # «Ley Aduanera», «Ley Agraria», «Ley Minera»
            minimo = 2
        if len(f.split()) >= minimo and f not in GENERICAS:
            ks.add(f)
    for nom in re.findall(r"NOM-\d{3}-[A-Z0-9]+-\d{4}", nombre):
        ks.add(norm(nom.rsplit("-", 1)[0]))
    if jur == "EUR":
        ks.update(re.findall(r"\b\d{4}/\d{1,4}\b|\b\d{1,4}/\d{4}\b", nombre))
    if jur == "RUS":
        ks.update(f"{x}-фз" for x in re.findall(r"(\d+)-FZ", nombre + " " + ley.get("sigla", "")))
    if jur in ("ARG", "BRA", "CHL"):
        ks.update(re.findall(r"\b\d{1,2}\.\d{3}\b", nombre))
    return ks


def sigla_de(ley):
    """Sigla en mayúsculas (p. ej. «LGSM», «GDPR»): se busca respetando mayúsculas en el texto original."""
    s = (ley.get("sigla") or "").strip()
    return s if 3 <= len(s) <= 12 and re.fullmatch(r"[A-Z][A-Z0-9\-]+", s) else None


def indice(cats, claves):
    """{jur: [(clave, info_ley)]} con info_ley = {id, sigla, nombre, sector, area, preguntas, tramites}."""
    out = {}
    for jur, c in cats.items():
        filas = []
        def agregar(ley, area, sector):
            info = {"id": ley["id"], "sigla": ley.get("sigla", ""), "nombre": ley.get("nombre", ""), "area": area, "sector": sector, "autoridad": ley.get("autoridad", ""),
                    "preguntas": len(ley.get("preguntas") or []), "tramites": len(ley.get("tramites") or [])}
            for k in claves_de_ley(jur, ley) | {norm(x) for x in claves.get(jur, {}).get(ley["id"], [])}:
                filas.append((k, info))
            if sigla_de(ley):
                filas.append(("=" + sigla_de(ley), info))
            filas.append(("\x00" + ley["id"], info))  # toda ley entra al índice (para el vínculo por autoridad)
        for g in c.get("generales", []):
            for l in g.get("leyes", []):
                agregar(l, g.get("area", ""), None)
        for sk, s in (c.get("sectores") or {}).items():
            for l in s.get("leyes", []):
                agregar(l, "Específicas del sector", sk)
        out[jur] = filas
    return out


def _contiene(texto, clave):
    if re.fullmatch(r"[a-z0-9\-./ ]+", clave) and (len(clave) <= 5 or " " not in clave):
        return re.search(rf"(?<![\w]){re.escape(clave)}(?![\w])", texto) is not None
    return clave in texto


def cruzar(jur, texto, idx, cats, emisor=""):
    """Leyes del catálogo (en título y emisor) y sectores (solo en el título) que menciona una publicación."""
    t = norm(f"{texto} {emisor}")
    leyes, vistos = [], set()
    crudo = f"{texto} {emisor}"
    for k, info in idx.get(jur, []):
        if info["id"] in vistos:
            continue
        if k.startswith("\x00"):
            continue
        if k.startswith("="):
            hit = re.search(rf"(?<![A-Za-z0-9]){re.escape(k[1:])}(?![A-Za-z0-9])", crudo) is not None
        else:
            hit = _contiene(t, k)
        if hit:
            vistos.add(info["id"])
            leyes.append({**info, "por": "mencion"})
    sectores = {l["sector"] for l in leyes if l["sector"]}
    tt = norm(texto)
    for s, ps in SECTOR_CLAVES.items():
        if any(norm(p) in tt for p in ps):
            sectores.add(s)
    # Leyes del sector cuya autoridad emite la publicación (p. ej. un acuerdo de la CNE sobre petrolíferos → Ley del Sector Hidrocarburos).
    emisoras = {sig for sig, nom in AUTORIDADES.get(jur, {}).items() if nom in t}
    if emisoras and sectores:
        for _, info in idx.get(jur, []):
            if info["id"] in vistos or info["sector"] not in sectores:
                continue
            if emisoras & set(re.findall(r"[A-Z]{2,}", info.get("autoridad", ""))):
                vistos.add(info["id"])
                leyes.append({**info, "por": "autoridad"})
    return leyes, sorted(sectores)


# ------------------------------------------------------------------ afectaciones e impacto
NIVEL = {"ley": "Ley o reforma legal", "decreto": "Decreto", "reglamento": "Reglamento, regla o disposición", "norma": "Norma técnica",
         "acuerdo": "Acuerdo o resolución administrativa", "sentencia": "Sentencia o resolución judicial", "reforma_detectada": "Reforma publicada (compilación oficial)"}


def plural(n, palabra):
    return f"{n} {palabra}" + ("" if n == 1 else "s")


def afectaciones(nivel, leyes, sectores, pais_nombre, cats_jur):
    a = []
    for l in leyes[:6]:
        donde = f"sector {SECTOR_NOMBRE.get(l['sector'], l['sector'])}" if l["sector"] else "toda empresa"
        rel = "la emite su autoridad; posible cambio en" if l.get("por") == "autoridad" else "revisar"
        a.append(f"{l['sigla'] or l['nombre'][:60]} ({donde}): {rel} obligaciones, {plural(l['tramites'], 'trámite')} y "
                 f"{plural(l['preguntas'], 'pregunta')} de auditoría del catálogo.")
    if nivel in ("ley", "decreto", "reforma_detectada"):
        a.append("Puede cambiar obligaciones legales: confirmar fecha de entrada en vigor, artículos transitorios y plazos de adecuación.")
    elif nivel == "norma":
        a.append("Cambio técnico: revisar procedimientos, certificaciones, especificaciones y evidencia de cumplimiento.")
    elif nivel == "sentencia":
        a.append("Puede invalidar o reinterpretar artículos: verificar qué preceptos dejan de aplicar.")
    nombres_sector = (cats_jur or {}).get("sectores", {})
    sin_ley = [s for s in sectores if not any(l["sector"] == s for l in leyes)]
    for s in sin_ley[:4]:
        n = SECTOR_NOMBRE.get(s) or nombres_sector.get(s, {}).get("nombre", s)
        a.append(f"Sector {n}: evaluar si cambia permisos, trámites, reportes o tarifas.")
    if not leyes and not sectores:
        a.append(f"Norma nueva o reforma general en {pais_nombre}: revisar si aplica a la operación.")
    return a


def impacto(nivel, leyes, sectores):
    directas = [l for l in leyes if l.get("por") != "autoridad"]
    if directas and nivel in ("ley", "decreto", "reforma_detectada", "sentencia"):
        return "alto"
    if directas or (leyes and nivel in ("reglamento", "norma", "ley", "decreto")) or (sectores and nivel in ("ley", "decreto", "norma")):
        return "medio"
    return "bajo"


def entrada(jur, pais_nombre, fuente, id_, fecha, nivel, titulo, emisor, url, idx, cats, hoy):
    leyes, sectores = cruzar(jur, titulo, idx, cats, emisor)
    if not leyes and not sectores and nivel not in ("ley",):
        return None
    imp = impacto(nivel, leyes, sectores)
    return {"id": id_, "pais": jur, "fecha": fecha, "detectado": hoy, "fuente": fuente, "tipo": NIVEL.get(nivel, nivel), "nivel": nivel,
            "titulo": limpiar(titulo)[:MAX_TITULO], "emisor": limpiar(emisor)[:160], "url": url,
            "leyes": [{k: l.get(k) for k in ("id", "sigla", "nombre", "sector", "area", "preguntas", "por")} for l in leyes[:8]],
            "sectores": sectores, "preguntas": sum(l["preguntas"] for l in leyes[:8]), "impacto": imp,
            "afectaciones": afectaciones(nivel, leyes, sectores, pais_nombre, cats.get(jur)), "estado": "por revisar"}


# ------------------------------------------------------------------ fuentes
def leer_json(url, leer, timeout=60):
    return json.loads(leer(url, timeout).decode("utf-8", "replace"))


def mex_dof(dof, desde):
    """vivos/dof.json → (id, fecha, nivel, título, emisor, url)."""
    nivel = {"Ley o reforma legal": "ley", "Decreto": "decreto", "Norma Oficial Mexicana": "norma", "Sentencia o resolución judicial": "sentencia",
             "Reglamento, lineamientos o reglas": "reglamento", "Acuerdo": "acuerdo"}
    for f, items in sorted((dof or {}).get("dias", {}).items()):
        if f < desde:
            continue
        for cod, tipo, dep, texto in items:
            if tipo in SALTAR_MEX:
                continue
            n = nivel.get(tipo, "acuerdo")
            if n == "acuerdo" and REGULACION_MEX.search(norm(texto)):
                n = "reglamento"
            yield (f"MEX:dof:{cod}", f, n, texto, dep,
                   f"https://dof.gob.mx/nota_detalle.php?codigo={cod}&fecha={f[8:10]}/{f[5:7]}/{f[:4]}")


def mex_reformas(cats, leyes_fed):
    """Leyes del catálogo de México cuya última reforma oficial (Cámara de Diputados) es posterior a la registrada."""
    oficiales = [(norm(re.sub(r"^(LEY|CÓDIGO|REGLAMENTO)", lambda m: m.group(1).capitalize(), x["n"])), x) for x in (leyes_fed or {}).get("leyes", []) if x.get("ult")]
    out = []
    c = cats.get("MEX", {})
    todas = [l for g in c.get("generales", []) for l in g.get("leyes", [])] + [l for s in (c.get("sectores") or {}).values() for l in s.get("leyes", [])]
    for l in todas:
        n = norm(l.get("nombre", ""))
        for on, x in oficiales:
            if len(on) >= 10 and (n.startswith(on) or on in n.split(" (")[0] and len(on) >= len(n.split(" (")[0]) - 3):
                reg = max(re.findall(r"\d{4}-\d{2}-\d{2}", l.get("ultima_reforma") or "") or [None], key=lambda x: x or "")
                if not reg or x["ult"] > reg:
                    out.append({"pais": "MEX", "ley_id": l["id"], "sigla": l.get("sigla", ""), "nombre": l["nombre"], "catalogo": l.get("ultima_reforma") or "verificar",
                                "oficial": x["ult"], "url": x.get("ref") or x.get("pdf")})
                break
    return out


def usa(leer, desde, hasta):
    base = "https://www.federalregister.gov/api/v1/documents.json"
    q = [("conditions[publication_date][gte]", desde), ("conditions[publication_date][lte]", hasta), ("conditions[type][]", "RULE"),
         ("conditions[type][]", "PRESDOCU"), ("per_page", "200"), ("order", "newest")]
    for k in ("title", "document_number", "html_url", "publication_date", "type", "agencies", "cfr_references"):
        q.append(("fields[]", k))
    url = base + "?" + urllib.parse.urlencode(q)
    for pagina in range(1, 11):
        datos = leer_json(f"{url}&page={pagina}", leer)
        for d in datos.get("results", []):
            t = d.get("title") or ""
            if RUTINA_USA.search(t):
                continue
            ag = "; ".join(a.get("name", "") for a in d.get("agencies") or [] if a.get("name"))
            cfr = " ".join(f"{c.get('title')} CFR {c.get('part')}" for c in d.get("cfr_references") or [])
            yield (f"USA:fr:{d['document_number']}", d.get("publication_date"), "decreto" if d.get("type") == "Presidential Document" else "reglamento",
                   t, f"{ag} {cfr}".strip(), d.get("html_url"))
        if not datos.get("next_page_url"):
            break
        time.sleep(PAUSA_S)


def can(leer, desde, hasta):
    xml = leer("https://gazette.gc.ca/rss/p2-eng.xml", 60).decode("utf-8", "replace")
    for it in re.findall(r"<item>(.*?)</item>", xml, re.S):
        t = limpiar((re.search(r"<title>(.*?)</title>", it, re.S) or [None, ""])[1].replace("<![CDATA[", "").replace("]]>", ""))
        u = limpiar((re.search(r"<link>(.*?)</link>", it, re.S) or [None, ""])[1])
        p = (re.search(r"<pubDate>(.*?)</pubDate>", it, re.S) or [None, ""])[1]
        try:
            f = datetime.strptime(p.strip()[:16], "%a, %d %b %Y").date().isoformat()
        except ValueError:
            f = hasta
        if desde <= f <= hasta and t:
            yield (f"CAN:g2:{urllib.parse.urlparse(u).path.strip('/').replace('/', '-')[-80:]}", f, "reglamento", t, "Canada Gazette, Part II", u)


def eur(leer, desde, hasta):
    q = f"""PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?celex ?fecha ?titulo ?tipo WHERE {{
  ?w cdm:resource_legal_id_celex ?celex ; cdm:work_date_document ?fecha ; cdm:work_has_resource-type ?tipo .
  FILTER(?fecha >= "{desde}"^^xsd:date && ?fecha <= "{hasta}"^^xsd:date)
  FILTER(?tipo IN (<http://publications.europa.eu/resource/authority/resource-type/REG>, <http://publications.europa.eu/resource/authority/resource-type/DIR>,
    <http://publications.europa.eu/resource/authority/resource-type/REG_IMPL>, <http://publications.europa.eu/resource/authority/resource-type/REG_DEL>,
    <http://publications.europa.eu/resource/authority/resource-type/DIR_IMPL>, <http://publications.europa.eu/resource/authority/resource-type/DIR_DEL>,
    <http://publications.europa.eu/resource/authority/resource-type/DEC>))
  ?e cdm:expression_belongs_to_work ?w ; cdm:expression_title ?titulo ;
     cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/SPA> .
}} LIMIT 400"""
    url = "https://publications.europa.eu/webapi/rdf/sparql?" + urllib.parse.urlencode({"query": q, "format": "application/sparql-results+json"})
    for b in leer_json(url, leer, 90).get("results", {}).get("bindings", []):
        celex, tipo = b["celex"]["value"], b["tipo"]["value"].rsplit("/", 1)[-1]
        if re.search(r"compatibilidad de una operación de concentración|^Decisión de Ejecución .{0,80}(autoriza|concede)", b["titulo"]["value"]):
            continue
        nivel = "ley" if tipo in ("REG", "DIR") else "reglamento" if tipo.startswith(("REG_", "DIR_")) else "acuerdo"
        yield (f"EUR:{celex}", b["fecha"]["value"][:10], nivel, b["titulo"]["value"], "Diario Oficial de la UE",
               f"https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:{celex}")


def jpn(leer, desde, hasta):
    url = f"https://laws.e-gov.go.jp/api/2/laws?promulgation_date_from={desde}&promulgation_date_to={hasta}&limit=200&response_format=json"
    nivel = {"Act": "ley", "CabinetOrder": "decreto", "ImperialOrder": "decreto", "MinisterialOrdinance": "reglamento", "Rule": "reglamento"}
    for x in leer_json(url, leer).get("laws", []):
        li, ri = x.get("law_info", {}), x.get("revision_info", {})
        yield (f"JPN:{li.get('law_id')}", li.get("promulgation_date"), nivel.get(li.get("law_type"), "reglamento"),
               f"{ri.get('law_title', '')} ({li.get('law_num', '')})", ri.get("category", ""), f"https://laws.e-gov.go.jp/law/{li.get('law_id')}")


def rus(leer, desde, hasta):
    for pagina in range(1, 6):
        url = f"http://publication.pravo.gov.ru/api/Documents?PageSize=100&Index={pagina}&PeriodType=range&DateFrom={desde}&DateTo={hasta}"
        items = leer_json(url, leer).get("items", [])
        for x in items:
            t = x.get("complexName") or ""
            if not FEDERAL_RUS.search(t):  # los actos de regiones y municipios no cambian el marco federal
                continue
            n = "ley" if t.startswith(("Федеральный закон", "Федеральный конституционный закон")) else "decreto" if t.startswith("Указ") else "reglamento"
            f = (x.get("publishDateShort") or hasta)[:10]
            if desde <= f <= hasta:
                yield (f"RUS:{x.get('eoNumber')}", f, n, t, "", f"http://publication.pravo.gov.ru/document/{x.get('eoNumber')}")
        if len(items) < 100:
            break
        time.sleep(PAUSA_S)


def arg(leer, desde, hasta):
    h = leer("https://www.boletinoficial.gob.ar/seccion/primera", 60).decode("utf-8", "replace")
    nivel = {"ley": "ley", "decreto": "decreto", "resolución": "reglamento", "resolucion": "reglamento", "disposición": "acuerdo", "disposicion": "acuerdo"}
    for m in re.finditer(r'href="(/detalleAviso/primera/(\d+)/(\d{8}))"[^>]*>(.*?)</a>', h, re.S):
        u, id_, f, t = m.group(1), m.group(2), m.group(3), limpiar(m.group(4))
        fecha = f"{f[:4]}-{f[4:6]}-{f[6:]}"
        primera = norm(t.split()[0]) if t else ""
        if desde <= fecha <= hasta and primera in nivel:
            yield (f"ARG:bo:{id_}", fecha, nivel[primera], t, "Boletín Oficial", "https://www.boletinoficial.gob.ar" + u)


FUENTES = [
    ("USA", "Federal Register (API oficial)", "https://www.federalregister.gov/api/v1/documents.json", usa),
    ("CAN", "Canada Gazette, Parte II", "https://gazette.gc.ca/rss/p2-eng.xml", can),
    ("EUR", "Oficina de Publicaciones de la UE (Cellar)", "https://publications.europa.eu/webapi/rdf/sparql", eur),
    ("JPN", "e-Gov, API de leyes v2", "https://laws.e-gov.go.jp/api/2/laws", jpn),
    ("RUS", "Portal oficial de publicación de actos jurídicos", "http://publication.pravo.gov.ru/api/Documents", rus),
    ("ARG", "Boletín Oficial, primera sección", "https://www.boletinoficial.gob.ar/seccion/primera", arg),
]


# ------------------------------------------------------------------ bitácora (solo se agrega)
def fusionar(previa, nuevas):
    """Agrega las entradas nuevas; las que ya existían se conservan tal cual (solo se completan campos vacíos)."""
    por_id = {e["id"]: e for e in previa}
    agregadas = 0
    for e in nuevas:
        if e["id"] in por_id:
            v = por_id[e["id"]]
            for k, x in e.items():
                if k not in v or v[k] in (None, "", []):
                    v[k] = x
        else:
            por_id[e["id"]] = e
            agregadas += 1
    lista = sorted(por_id.values(), key=lambda e: (e.get("fecha") or "", e["id"]), reverse=True)
    return lista, agregadas


def leer_red(url, timeout=60):
    return F.get(url, timeout=timeout)


def construir(salida, ahora=None, leer=leer_red, permitido=F.permitido_por_robots, dof=None, leyes_fed=None, fuentes=FUENTES, pausa=PAUSA_S):
    ahora = ahora or datetime.now(timezone.utc)
    hoy = ahora.date().isoformat()
    cats, claves = cargar_catalogo()
    idx = indice(cats, claves)
    os.makedirs(salida, exist_ok=True)
    rb, re_ = os.path.join(salida, "bitacora.json"), os.path.join(salida, "estado.json")
    previa = json.load(open(rb, encoding="utf-8")).get("entradas", []) if os.path.exists(rb) else []
    estado_prev = json.load(open(re_, encoding="utf-8")) if os.path.exists(re_) else {}
    ultima = estado_prev.get("ultima_fecha", {})
    nuevas, estado = [], {}

    def desde_de(jur, dias=DIAS_PRIMERA_VEZ):
        u = ultima.get(jur)
        d = (date.fromisoformat(u) - timedelta(days=2)) if u else ahora.date() - timedelta(days=dias)
        return d.isoformat()

    nombre = {iso: c.get("nombre", iso) for iso, c in cats.items()}
    # México: todo el historial del DOF disponible la primera vez (es local, no consulta la red).
    n0 = len(nuevas)
    for id_, f, niv, t, dep, u in mex_dof(dof, desde_de("MEX", 3650)):
        e = entrada("MEX", nombre.get("MEX", "México"), "Diario Oficial de la Federación", id_, f, niv, t, dep, u, idx, cats, hoy)
        if e:
            nuevas.append(e)
    desact = mex_reformas(cats, leyes_fed)
    for d in desact:
        e = entrada("MEX", "México", "Cámara de Diputados (Leyes Federales Vigentes)", f"MEX:cd:{d['ley_id']}:{d['oficial']}", d["oficial"], "reforma_detectada",
                    f"Reforma publicada a: {d['nombre']}", "Cámara de Diputados", d["url"], idx, cats, hoy)
        if e:
            e["afectaciones"].insert(0, f"El catálogo registra la última reforma como «{d['catalogo']}»; la compilación oficial indica {d['oficial']}. Actualizar la ficha.")
            nuevas.append(e)
    estado["MEX"] = {"fuente": "Diario Oficial de la Federación y Cámara de Diputados", "ok": bool(dof), "estado": "ok" if dof else "error", "nuevas": len(nuevas) - n0,
                     "error": "" if dof else "sin vivos/dof.json", "hasta": max((dof or {}).get("dias") or [""]) or None}
    for jur, fuente, url_r, fn in fuentes:
        desde = desde_de(jur)
        n0 = len(nuevas)
        try:
            if not permitido(url_r):
                raise PermissionError("robots.txt no lo permite")
            for id_, f, niv, t, emi, u in fn(leer, desde, hoy):
                e = entrada(jur, nombre.get(jur, jur), fuente, id_, f, niv, t, emi, u, idx, cats, hoy)
                if e:
                    nuevas.append(e)
            estado[jur] = {"fuente": fuente, "ok": True, "estado": "ok", "nuevas": len(nuevas) - n0, "error": "", "hasta": hoy}
            ultima[jur] = hoy
        except Exception as ex:  # noqa: BLE001  una fuente caída no detiene a las demás
            estado[jur] = {"fuente": fuente, "ok": False, "estado": "error", "nuevas": 0, "error": f"{type(ex).__name__}: {ex}"[:200], "hasta": ultima.get(jur)}
        time.sleep(pausa)
    if dof:
        ultima["MEX"] = max(dof.get("dias", {}) or [hoy])
    lista, agregadas = fusionar(previa, nuevas)
    gen = ahora.strftime("%Y-%m-%dT%H:%M:%SZ")
    json.dump({"generado_utc": gen, "nota": "Bitácora histórica: ninguna entrada se borra. Solo título oficial, fecha, emisor y enlace al original.",
               "total": len(lista), "entradas": lista}, open(rb, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    por_pais = {}
    for e in lista:
        p = por_pais.setdefault(e["pais"], {"total": 0, "alto": 0, "ultimos_30d": 0})
        p["total"] += 1
        p["alto"] += e.get("impacto") == "alto"
        p["ultimos_30d"] += (e.get("fecha") or "") >= (ahora.date() - timedelta(days=30)).isoformat()
    json.dump({"generado_utc": gen, "fuentes": estado, "sin_fuente": {k: v for k, v in SIN_FUENTE.items() if k not in estado or not estado[k]["ok"]},
               "ultima_fecha": ultima, "desactualizadas": desact, "por_pais": por_pais, "agregadas_hoy": agregadas},
              open(re_, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return {"agregadas": agregadas, "total": len(lista), "fuentes": estado, "desactualizadas": len(desact)}


def main():
    salida = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "normativa")
    vivos = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "vivos")
    cargar = lambda n: json.load(open(os.path.join(vivos, n), encoding="utf-8")) if os.path.exists(os.path.join(vivos, n)) else None  # noqa: E731
    r = construir(salida, dof=cargar("dof.json"), leyes_fed=cargar("leyes_federales.json"))
    print(f"normativa: {r['agregadas']} entradas nuevas, {r['total']} en la bitácora, {r['desactualizadas']} leyes con reforma más reciente que el catálogo")
    for k, v in r["fuentes"].items():
        print(f"  {k}: {'ok' if v['ok'] else 'ERROR'} {v['nuevas']} nuevas {v['error']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
