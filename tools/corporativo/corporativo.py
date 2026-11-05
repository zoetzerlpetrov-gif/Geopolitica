#!/usr/bin/env python3
"""Mundo corporativo: noticias de empresas de todos los sectores, por categoría y por país (30 días).

De dónde salen: canales RSS de medios de negocios (FEEDS), solo si su robots.txt lo permite y con una pausa entre
medios. De cada nota se guarda título, medio, fecha y enlace: nunca el texto (derechos de autor).

Qué cuenta: titulares que caen en alguna de las CATEGORIAS (despidos, quiebras, fraude, competencia, demandas,
multas, directivos, consejos y accionistas, fusiones, inversiones, resultados, bolsa y deuda, precios, huelgas,
plantas y cierres, marcas, ciberincidentes, ambiente y derechos humanos). Un titular puede tener varias; la primera
de la lista es la principal.

Dónde va cada nota (campo «ubic»):
1. «titular»: el país que nombra el titular («Nissan cierra planta en México» → México).
2. «sede»: si no nombra país pero sí una empresa del catálogo de directivos (vivos/corporativo_empresas.json, de
   Wikidata), el país de su sede.
3. «medio»: los medios nacionales (Expansión México, Handelsblatt…) dan su país cuando no hay otro dato.
Sin ninguno de los tres, la nota queda en la lista del panel pero no pone punto.

En el mapa: un punto por país y categoría, alrededor del centro del país (cada categoría en su posición del círculo
para que no se encimen).

Salida: vivos/corporativo.geojson y vivos/corporativo_estado.json (notas de 30 días, para la lista del panel).
"""
import html
import json
import math
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402
from classify import normalizar  # noqa: E402
from geo import Gazetteer  # noqa: E402

VIVOS = os.path.join(ROOT, "vivos")
OUT = os.path.join(VIVOS, "corporativo.geojson")
ESTADO = os.path.join(VIVOS, "corporativo_estado.json")
EMPRESAS = os.path.join(VIVOS, "corporativo_empresas.json")
DIAS = 30
CADA_H = 1
PAUSA_S = 1.0
MAX_NOTAS = 15
RADIO_GRADOS = 1.4

# (medio, URL del RSS, idioma, país del medio o None). Revisados el 05-nov-2026: su robots.txt permite leer el feed.
# Sin CNBC, MarketWatch, Cinco Días ni Mining.com: su robots.txt no lo permite.
FEEDS = [
    ("BBC Business", "https://feeds.bbci.co.uk/news/business/rss.xml", "en", None),
    ("The Guardian (Business)", "https://www.theguardian.com/uk/business/rss", "en", None),
    ("NPR Business", "https://feeds.npr.org/1006/rss.xml", "en", "USA"),
    ("DW Business", "https://rss.dw.com/rdf/rss-en-bus", "en", None),
    ("France 24 (Business)", "https://www.france24.com/en/business-tech/rss", "en", None),
    ("Fortune", "https://fortune.com/feed/", "en", None),
    ("Forbes (Business)", "https://www.forbes.com/business/feed/", "en", None),
    ("Business Insider", "https://feeds.businessinsider.com/custom/all", "en", None),
    ("TechCrunch", "https://techcrunch.com/feed/", "en", None),
    ("Nikkei Asia", "https://asia.nikkei.com/rss/feed/nar", "en", None),
    ("South China Morning Post (Business)", "https://www.scmp.com/rss/92/feed", "en", None),
    ("The Economic Times (Companies)", "https://economictimes.indiatimes.com/news/company/rssfeeds/2143429.cms", "en", "IND"),
    ("Expansión (México)", "https://expansion.mx/rss", "es", "MEX"),
    ("El Financiero", "https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml", "es", "MEX"),
    ("Expansión (España, Empresas)", "https://e00-expansion.uecdn.es/rss/empresas.xml", "es", "ESP"),
    ("Infobae (Economía)", "https://www.infobae.com/arc/outboundfeeds/rss/category/economia/", "es", None),
    ("Folha de S.Paulo (Mercado)", "https://feeds.folha.uol.com.br/mercado/rss091.xml", "pt", "BRA"),
    ("Handelsblatt (Unternehmen)", "https://www.handelsblatt.com/contentexport/feed/unternehmen", "de", "DEU"),
    ("FreightWaves", "https://www.freightwaves.com/feed", "en", "USA"),
    ("Retail Dive", "https://www.retaildive.com/feeds/news/", "en", "USA"),
    ("HR Dive", "https://www.hrdive.com/feeds/news/", "en", "USA"),
    ("Banking Dive", "https://www.bankingdive.com/feeds/news/", "en", "USA"),
    ("CFO Dive", "https://www.cfodive.com/feeds/news/", "en", "USA"),
    ("Marketing Dive", "https://www.marketingdive.com/feeds/news/", "en", "USA"),
    ("Food Dive", "https://www.fooddive.com/feeds/news/", "en", "USA"),
    ("Manufacturing Dive", "https://www.manufacturingdive.com/feeds/news/", "en", "USA"),
    ("BioPharma Dive", "https://www.biopharmadive.com/feeds/news/", "en", "USA"),
    ("Utility Dive", "https://www.utilitydive.com/feeds/news/", "en", "USA"),
    ("Construction Dive", "https://www.constructiondive.com/feeds/news/", "en", "USA"),
    ("Supply Chain Dive", "https://www.supplychaindive.com/feeds/news/", "en", "USA"),
]

# (clave, nombre, ícono, grupo del panel, regex sobre el título normalizado: minúsculas, sin acentos, solo letras y números).
# El orden decide la categoría principal: lo más grave primero.
CATEGORIAS = [
    ("quiebra", "Quiebras, insolvencias e impagos", "💥", "Finanzas y mercados",
     r"bankrupt|chapter (11|7)\b|insolven|quiebra|concurso (mercantil|de acreedores)|suspension de pagos|liquidat|liquidacion|"
     r"(goes|enters|placed) into administration|administradores concursales|falencia|recuperacao judicial|default(s|ed)? on|impago|"
     r"incumple (el )?pago|zahlungsunfahig|pleite"),
    ("fraude", "Fraude, corrupción y lavado de dinero", "🚨", "Legal y cumplimiento",
     r"fraud|fraude|embezzl|malversa|desfalco|brib|soborno|money laundering|lavado de (dinero|activos)|blanqueo|ponzi|piramide financiera|"
     r"accounting scandal|escandalo contable|insider trading|informacion privilegiada|corrupt|kickback|moches|betrug|geldwasche|lavagem"),
    ("despidos", "Despidos y recortes de personal", "✂️", "Personas y gobierno corporativo",
     r"layoff|lay(s|ing)? off|laid off|job cuts|cut(s|ting)? (\d+ )?jobs|slash(es|ing)? (\d+ )?jobs|eliminat(es|ing) (\d+ )?(jobs|roles|positions)|"
     r"workforce reduction|reduce (its )?workforce|headcount|redundanc|despid|recorte(s)? de (personal|empleos|plantilla|puestos)|"
     r"\bere\b|\bertes?\b|reduccion de plantilla|demissoes|demite|stellenabbau|entlass|stellen streichen|streicht \d+ stellen"),
    ("competencia", "Competencia y antimonopolio", "⚔️", "Legal y cumplimiento",
     r"antitrust|anti trust|monopol|competition (authority|regulator|watchdog|commission|law|probe)|cofece|comision (federal )?de competencia|"
     r"\bcnmc\b|\bftc\b|price fixing|colusion|collusion|competencia economica|kartell|\bcade\b|abuse of dominance|"
     r"posicion dominante|dominant position|\bcartel\b (de|of) (precios|prices)|practicas monopolicas"),
    ("litigio", "Demandas, juicios y arbitrajes", "⚖️", "Legal y cumplimiento",
     r"lawsuit|\bsues?\b|\bsued\b|suing|demanda (a|contra|colectiva)|demandan|class action|accion colectiva|settle(s|ment|d)? (with|over|lawsuit|case|claims)|"
     r"acuerdo extrajudicial|court (rules|ruling|orders|blocks)|tribunal (falla|ordena|condena)|juez (ordena|falla)|judge (rules|orders|blocks)|"
     r"verdict|veredicto|litig|arbitra|patent infringement|infraccion de patente|klage|processo judicial"),
    ("regulacion", "Multas, sanciones de reguladores y retiros de producto", "📜", "Legal y cumplimiento",
     r"\bfined?\b|fines \d|multa|multado|penalt|sancion(a|ada|ado|es)? (a|para|contra)|regulator|regulador|watchdog|probe|"
     r"investigacion (de|contra|a) |investiga a|recall|retira del mercado|retiro (de|del) (productos|vehiculos|mercado)|alerta sanitaria|"
     r"licen(s|c)e (revoked|suspended)|licencia (revocada|suspendida)|\bcnbv\b|condusef|profeco|cofepris|\bsec\b (charges|sues|fines|probe)|"
     r"\bfca\b|\besma\b|bafin|\bcnmv\b|\bcvm\b|strafe|bussgeld"),
    ("directivos", "Cambios de CEO y alta dirección", "👔", "Personas y gobierno corporativo",
     r"\bceo\b|chief executive|chief (financial|operating|technology|marketing|people) officer|\bcfo\b|\bcoo\b|\bcto\b|director general|"
     r"director ejecutivo|directora (general|ejecutiva)|presidente ejecutivo|presidenta ejecutiva|consejero delegado|steps? down|stepping down|"
     r"resign|renuncia|dimite|dimision|appoint|nombra (a|nuevo|nueva)|nuevo (director|presidente)|nueva (directora|presidenta)|successor|sucesor|"
     r"ousted|destituid|fired as|despide a su|vorstandschef|konzernchef|chefwechsel|presidente executivo|executive shake ?up"),
    ("consejo", "Consejos, accionistas y gobierno corporativo", "🪑", "Personas y gobierno corporativo",
     r"board of directors|board seat|boardroom|\bboard\b (approves|ousts|backs|names|rejects)|consejo de administracion|consejeros?\b|"
     r"shareholder|accionista|activist (investor|fund|hedge)|inversor activista|proxy (fight|battle|vote)|annual (general )?meeting|"
     r"\bagm\b|asamblea (de accionistas|general)|junta (de accionistas|general)|chairman|chairwoman|\bchair\b|presidente del consejo|"
     r"aufsichtsrat|hauptversammlung|governance|gobierno corporativo|family feud|pugna familiar|succession plan|plan de sucesion"),
    ("fusiones", "Fusiones, adquisiciones y ventas de negocios", "🤝", "Finanzas y mercados",
     r"merger|\bmerge\b|acquisition|acquir(e|es|ed|ing)|takeover|buyout|\bbuys?\b|to buy|deal to buy|agrees to buy|bid for|"
     r"\bcompra (de|a|el|la|del)\b|compraria|adquiere|adquirir|adquisicion|fusion(a|an|ar)?\b|absorbe|oferta (publica|de compra)|\bopa\b|"
     r"tender offer|stake in|participacion (en|de)|ubernahme|fusao|aquisicao|spin ?off|escision|divest|desinversion|"
     r"sell(s|ing)? (its |a )?(unit|business|division|stake)|to sell (its |a )?(unit|business|division|stake)|"
     r"vende (su|la|el|una) (unidad|negocio|division|filial|participacion)|venta de (su|la) (unidad|filial|division)|puja por"),
    ("inversion", "Inversiones, rondas y salidas a bolsa", "💰", "Finanzas y mercados",
     r"\bipo\b|salida a bolsa|initial public offering|goes public|go public|listing|raises \d|raised \d|funding round|"
     r"ronda (de )?(financiamiento|inversion|serie)|series [abcde]\b|venture capital|private equity|capital privado|capital de riesgo|"
     r"invest(s|ing|ment)? \d|to invest|investira|invertira|inversion de \d|anuncia inversion|nueva inversion|unicorn|unicornio|"
     r"valuation|valuacion|valoracion|investimento|investition|nearshoring|new (plant|factory) in"),
    ("resultados", "Resultados financieros y contabilidad", "📊", "Finanzas y mercados",
     r"earnings|quarterly|quarter (results|profit|loss|sales)|\bq[1-4]\b|\bprofit|net loss|loss widens|revenue|sales (rise|fall|drop|jump|slump|surge)|"
     r"ganancia|utilidad(es)?|perdida(s)? (neta|de)|ingresos|resultados (trimestrales|financieros|del (primer|segundo|tercer|cuarto) trimestre)|"
     r"trimestre|guidance|outlook|forecast|pronostico de (ventas|ganancias)|beats? (estimates|expectations)|miss(es)? (estimates|expectations)|"
     r"dividend|dividendo|buyback|recompra de acciones|lucro|prejuizo|gewinn|umsatz|prognose|write ?down|impairment|deterioro|"
     r"restat|reexpres|auditor|auditoria|contable|accounting|balance sheet|estados financieros"),
    ("bolsa", "Bolsa, deuda y calificación crediticia", "📉", "Finanzas y mercados",
     r"shares (fall|drop|plunge|sink|tumble|slide|soar|jump|surge|rise|rally)|stock (falls|drops|plunges|sinks|soars|jumps|surges|tumbles)|"
     r"acciones (de \w+ )?(caen|suben|se desploman|se disparan|bajan|repuntan)|desplome|se desploma|market (value|cap)|valor de mercado|"
     r"downgrade|upgrade|credit rating|calificacion (crediticia|de deuda)|moody s|\bfitch\b|standard poor|\bs p (cuts|lowers|raises)|"
     r"debt (offering|sale|deal|restructuring|load|pile|refinancing)|bond (sale|offering|issue|deal)|corporate (bonds?|debt)|"
     r"reestructura(cion)? (de )?(su )?deuda|emision de (deuda|bonos)|colocacion de (deuda|bonos)|refinancia|acoes (caem|sobem|disparam)|aktie"),
    ("precios", "Precios, tarifas y aranceles", "🏷️", "Mercado y clientes",
     r"price (hike|hikes|increase|increases|rise|cut|cuts|war)|prices? (up|higher|lower)|raise(s|d)? prices|hike(s|d)? prices|cut(s)? prices|"
     r"lower(s|ed)? prices|guerra de precios|alza de precios|aumento de precios|incremento de precios|"
     r"(sube|suben|aumenta|aumentan|baja|bajan|eleva|elevan|recorta|recortan) (sus |los |el )?precio|precio (de|del) .* (sube|baja)|"
     r"tarifa|tariff|arancel|precos|preise|preiserhohung"),
    ("laboral", "Huelgas, sindicatos y conflictos laborales", "✊", "Personas y gobierno corporativo",
     r"\bstrike\b|strikes|striking|huelga|walkout|\bunion\b|unions|sindicat|paro (laboral|nacional|de labores)|labor dispute|labour dispute|"
     r"conflicto laboral|collective bargaining|contrato colectivo|negociacion salarial|wage (deal|talks|dispute)|greve|streik|gewerkschaft"),
    ("operaciones", "Plantas, cierres, expansión y cadena de suministro", "🏭", "Mercado y clientes",
     r"\bplant\b|plants\b|planta\b|plantas\b|factory|factories|fabrica|store closures|closing (stores|locations)|cierre de (tiendas|sucursales|planta|operaciones)|"
     r"cierra (su|la|sus|el) |closes (its |a )?|shut(s|ting)? down|shutters|halts production|para (la )?produccion|suspende operaciones|"
     r"opens (new|first|its)|abre (su|nueva|nuevo|la primera)|expansion|expande|relocat|reubica|supply chain|cadena de suministro|"
     r"shortage|escasez|desabasto|outage|werk\b|fabrik|warehouse|centro de distribucion"),
    ("ciber", "Ciberataques y filtraciones de datos en empresas", "💻", "Mercado y clientes",
     r"ciberataque|cyber ?attack|ransomware|data breach|hackeo|hacked|filtracion de datos|brecha de (datos|seguridad)|security incident"),
    ("esg", "Ambiente, derechos humanos y sostenibilidad", "🌱", "Mercado y clientes",
     r"emission|emisiones|sustainab|sostenib|sustentab|\besg\b|climate (goal|target|pledge)|derrame|oil spill|\bspill\b|contamina|pollution|"
     r"greenwashing|human rights|derechos humanos|trabajo (forzoso|infantil)|forced labou?r|child labou?r|deforest"),
    ("marca", "Marcas, marketing y productos", "📣", "Mercado y clientes",
     r"\bbrand\b|brands\b|\bmarca\b|\bmarcas\b|marketing|ad campaign|campana publicitaria|advertis|publicidad|rebrand|boycott|boicot|sponsorship|"
     r"patrocin|launch(es|ed|ing)? (a |its |new |first )+(\w+ )?(brand|product|line|campaign|model|phone|car|service|app)|new product|nuevo producto|"
     r"(lanza|lanzan|presenta) (su |una |un )?(nueva|nuevo) (marca|producto|linea|campana|modelo|servicio)|lanzamiento de (su |la |una )?(marca|producto|linea|modelo)|"
     r"influencer|super bowl ad|holiday (ads|marketing)"),
]
NOMBRE_CAT = {k: n for k, n, _, _, _ in CATEGORIAS}
ICONO_CAT = {k: ic for k, _, ic, _, _ in CATEGORIAS}
_RX_CAT = [(k, re.compile(r)) for k, _, _, _, r in CATEGORIAS]

# Titulares de medios de negocios que no son de empresas (o no aportan): columnas, obituarios, podcasts, listas.
RX_RUIDO = re.compile(
    r"\b(podcast|webinar|newsletter|opinion|op ed|editorial|column|columna|how to|como (invertir|ahorrar)|tips|consejos|horoscop|"
    r"dies at|muere|fallece|obituar|recipe|receta|quiz|crossword|live updates|en vivo|minuto a minuto|best (stocks|deals)|top \d+ |"
    r"\d+ (best|things|ways)|deals of the day|review:|resena)\b")

SECTORES = [  # (clave, nombre, ícono, regex sobre el título o la industria de la empresa del catálogo)
    ("finanzas", "Bancos y servicios financieros", "🏦", r"\bbank|banco|banca|financ|fintech|lender|credit card|tarjeta|asset manag|gestora|broker|casa de bolsa|afore|payment|pagos"),
    ("seguros", "Seguros", "☂️", r"insur|asegurador|seguros|reinsur"),
    ("tecnologia", "Tecnología y software", "💻", r"tech|software|\bai\b|artificial intelligence|inteligencia artificial|chip|semiconductor|cloud|nube|app\b|"
     r"internet|platform|plataforma|data center|centro de datos|computer|computadora|smartphone|celular|gaming|videojuego"),
    ("telecom", "Telecomunicaciones", "📡", r"telecom|telco|wireless|mobile operator|operador|5g|broadband|cable operator|satellite|satelit|america movil|telcel"),
    ("energia", "Energía, petróleo y gas", "⚡", r"energy|energia|oil|petrol|\bgas\b|crude|crudo|refin|power|electric|utilit|solar|wind|eolic|nuclear|pemex|\bcfe\b|lng|gnl"),
    ("mineria", "Minería y metales", "⛏️", r"mining|minera|mineria|\bmine\b|copper|cobre|gold|oro\b|silver|plata\b|lithium|litio|iron ore|steel|acero|alumin|metal"),
    ("automotriz", "Automotriz", "🚗", r"\bauto|automaker|automotriz|car(maker)?s?\b|vehicle|vehiculo|\bev\b|electric vehicle|armadora|tesla|nissan|toyota|"
     r"volkswagen|\bgm\b|general motors|ford|stellantis|bmw|mercedes|byd|honda|hyundai|kia"),
    ("aviacion", "Aerolíneas y aeroespacial", "✈️", r"airline|aerolinea|aerospace|aeroespacial|aircraft|avion|airport|aeropuerto|boeing|airbus|embraer|aeromexico|volaris|vivaaerobus"),
    ("transporte", "Transporte, logística y puertos", "🚚", r"logistic|logistica|shipping|naviera|freight|carga|trucking|transporte|rail|ferrocarril|port\b|puerto|parcel|paqueteria|delivery|courier"),
    ("farma", "Farmacéutica y biotecnología", "💊", r"pharma|farmac|drug|medicamento|biotech|vaccine|vacuna|\bfda\b|cofepris|clinical trial|ensayo clinico"),
    ("salud", "Salud y hospitales", "🏥", r"health|salud|hospital|clinic|clinica|medical|medico|insurer health"),
    ("comercio", "Comercio minorista y consumo", "🛒", r"retail|minorist|retailer|store|tienda|supermarket|supermercado|grocer|walmart|oxxo|femsa|amazon|e ?commerce|comercio electronico|consumer|consumo"),
    ("alimentos", "Alimentos y bebidas", "🍔", r"food|aliment|beverage|bebida|beer|cerveza|coffee|cafe\b|restaurant|restaurante|snack|dairy|lacteo|meat|carne|bimbo|nestle|coca cola|pepsi"),
    ("agro", "Agro y pesca", "🌾", r"farm|agri|agro|crop|cosecha|grain|grano|fertiliz|pesca|fishing|ganad|livestock"),
    ("construccion", "Construcción, inmobiliario y cemento", "🏗️", r"construct|construc|real estate|inmobiliar|housing|vivienda|homebuilder|cement|cemento|cemex|reit|fibra\b|desarrolladora"),
    ("medios", "Medios, entretenimiento y deporte", "🎬", r"media|medios|streaming|netflix|disney|film|cine|music|musica|entertainment|entretenimiento|publisher|editorial|television|sports|deporte|futbol"),
    ("turismo", "Turismo y hotelería", "🏨", r"hotel|tourism|turismo|travel|viaje|cruise|crucero|casino|resort"),
    ("moda", "Moda, lujo y belleza", "👜", r"fashion|moda|luxury|lujo|apparel|ropa|cosmetic|cosmetico|beauty|belleza|lvmh|nike|adidas|inditex|zara"),
    ("quimica", "Química y materiales", "🧪", r"chemic|quimic|plastic|plastico|petrochemical|petroquimic|materials|materiales"),
    ("industria", "Manufactura e industria", "🏭", r"manufactur|manufactura|industrial|machinery|maquinaria|maquiladora|conglomerate|conglomerado"),
    ("defensa", "Defensa y seguridad", "🛡️", r"defense|defence|defensa|weapons|armas|military contractor|contratista militar|lockheed|raytheon|rheinmetall|bae systems"),
    ("cripto", "Cripto y activos digitales", "🪙", r"crypto|cripto|bitcoin|blockchain|stablecoin|token|binance|coinbase"),
    ("servicios", "Consultoría y servicios profesionales", "💼", r"consult|consultor|accounting firm|despacho|law firm|outsourc|staffing|recruit|reclutamiento|advertising agency|agencia"),
]
_RX_SECT = [(k, re.compile(r)) for k, _, _, r in SECTORES]
NOMBRE_SECTOR = {k: n for k, n, _, _ in SECTORES}

# Nombres de empresas que también son palabras comunes en titulares: no se usan para detectar la empresa.
NOMBRES_AMBIGUOS = {"next", "target", "visa", "shell", "meta", "square", "block", "sky", "fox", "line", "post", "sun", "star", "global", "general",
                    "united", "national", "international", "first", "american", "energy", "bank", "group", "capital", "holdings", "trust", "gap",
                    "orange", "apple", "amazon", "oracle", "alphabet", "unity", "snap", "match", "zoom", "uber", "via", "mercury", "jupiter",
                    "eni", "abc", "cbs", "ing", "dsv", "bp", "ge", "hp", "3m", "kb", "sk", "lg", "ups", "aes", "cme", "ppl", "pg", "ab", "ana", "dia", "sol",
                    "plus", "life", "one", "air", "data", "media", "nova", "alpha", "vale", "elisa", "aena", "sap", "crh", "rio", "telus"}
# Estas sí se buscan, pero solo con mayúscula inicial y no al inicio del titular (en inglés los títulos van con mayúsculas).
NOMBRES_MAYUSCULA = {"apple", "amazon", "oracle", "alphabet", "uber", "shell", "meta", "target", "visa", "zoom", "snap", "vale", "sap", "orange", "gap"}
SUFIJOS = re.compile(r",?\s+(inc\.?|corp\.?|corporation|company|co\.?|ltd\.?|limited|plc|ag|se|sa|s\.a\.?|s\.a\.b\. de c\.v\.|sab de cv|s\.a\. de c\.v\.|"
                     r"n\.v\.|nv|ab|asa|oyj|spa|s\.p\.a\.|holdings?|group|grupo)$", re.I)


def ahora_utc():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def leer_json(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def escribir(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, separators=(",", ":"))


def categorias_de(titulo):
    t = normalizar(titulo)
    if RX_RUIDO.search(t):
        return []
    return [k for k, rx in _RX_CAT if rx.search(t)]


def sectores_de(texto):
    t = normalizar(texto or "")
    return [k for k, rx in _RX_SECT if rx.search(t)]


def nombre_corto(n):
    """«Grupo Bimbo, S.A.B. de C.V.» → «Grupo Bimbo»; «Apple Inc.» → «Apple»."""
    n = (n or "").strip()
    for _ in range(2):
        n = SUFIJOS.sub("", n).strip()
    return n


class Empresas:
    """Detecta empresas del catálogo (vivos/corporativo_empresas.json) en un titular: nombre, nombre en inglés y alias («Disney»)."""

    def __init__(self, catalogo):
        self.por_id = {e["id"]: e for e in (catalogo or {}).get("empresas", [])}
        pares = []
        for e in self.por_id.values():
            for n in {nombre_corto(e.get("n")), nombre_corto(e.get("en")), *(e.get("al") or [])} - {""}:
                k = normalizar(n).strip()
                if len(k) < 3 or (k in NOMBRES_AMBIGUOS and k not in NOMBRES_MAYUSCULA):
                    continue
                pares.append((k, n, e["id"]))
        pares.sort(key=lambda x: -len(x[0]))  # «Grupo México» antes que «México»
        self.pares = pares

    def en(self, titulo):
        """[(qid, nombre)] de las empresas nombradas en el titular, sin repetir."""
        if not self.pares or not titulo:
            return []
        t = normalizar(titulo)
        usados, out = [], []
        for k, n, qid in self.pares:
            pos = t.find(f" {k} ")
            if pos < 0 or any(a <= pos < b for a, b in usados) or qid in (q for q, _ in out):
                continue
            if k in NOMBRES_MAYUSCULA and not re.search(rf"(?<!^)(?<![.:!?] )\b{re.escape(n)}\b", titulo.strip()):
                continue
            usados.append((pos, pos + len(k) + 1))
            out.append((qid, self.por_id[qid].get("n") or n))
            if len(out) >= 4:
                break
        return out


def nota(titulo, fuente, url, fecha, gaz, empresas, pais_medio=None):
    """Nota normalizada o None si el titular no cae en ninguna categoría."""
    if not titulo or not url:
        return None
    titulo = html.unescape(html.unescape(titulo))
    cats = categorias_de(titulo)
    if not cats:
        return None
    emp = empresas.en(titulo) if empresas else []
    paises = [i3 for i3 in gaz.paises_en_texto(titulo)][:3]
    ubic = "titular" if paises else ""
    if not paises and emp:
        sede = next((empresas.por_id[q].get("pais") for q, _ in emp if empresas.por_id[q].get("pais")), None)
        if sede:
            paises, ubic = [sede], "sede"
    if not paises and pais_medio:
        paises, ubic = [pais_medio], "medio"
    sect = sectores_de(titulo)
    if not sect and emp:  # sin palabras de sector: la industria de la empresa (Wikidata)
        sect = sectores_de(" ".join(empresas.por_id[q].get("ind_en", "") for q, _ in emp))
    return {"t": re.sub(r"\s+", " ", titulo)[:220], "f": fuente, "url": url, "fecha": fecha, "cats": cats, "sectores": sect[:3],
            "empresas": [[n, q] for q, n in emp], "paises": paises, "ubic": ubic}


def notas_rss(gaz, empresas, leer=None, permitido=F.permitido_por_robots, pausa=PAUSA_S, feeds=None):
    out, estado = [], {}
    for medio, url, idioma, pais in feeds or FEEDS:
        if not permitido(url):
            estado[medio] = "robots.txt no lo permite"
            continue
        try:
            datos = leer(url) if leer else F.get(url, timeout=40)
            items = F.parsear_rss(datos, {"nombre": medio, "tipo": "noticia", "idioma": idioma})
            nuevas = [n for n in (nota(i["titulo"], medio, i["url"], i["fecha_utc"], gaz, empresas, pais) for i in items) if n]
            out += nuevas
            estado[medio] = f"{len(items)} titulares, {len(nuevas)} corporativas"
        except Exception as e:  # noqa: BLE001  un medio caído no detiene a los demás
            estado[medio] = f"error: {type(e).__name__}"
        time.sleep(pausa)
    return out, estado


def acumular(nuevas, previas, ahora, dias=DIAS):
    limite = iso(ahora - timedelta(days=dias))
    vistos, out = set(), []
    for n in sorted(nuevas + previas, key=lambda x: x.get("fecha") or "", reverse=True):
        if n["url"] in vistos or (n.get("fecha") or "") < limite:
            continue
        vistos.add(n["url"])
        out.append(n)
    return out


def posicion(lon, lat, cat):
    """Cada categoría en su lugar de un círculo alrededor del centro del país (no se enciman)."""
    k = [c[0] for c in CATEGORIAS].index(cat)
    ang = 2 * math.pi * k / len(CATEGORIAS)
    dlat = RADIO_GRADOS * math.sin(ang)
    dlon = RADIO_GRADOS * math.cos(ang) / max(0.35, math.cos(math.radians(lat)))
    return round(lon + dlon, 3), round(max(-85, min(85, lat + dlat)), 3)


def por_pais_y_categoria(notas, gaz, ahora):
    hace7 = iso(ahora - timedelta(days=7))
    grupos = {}
    for n in notas:
        for i3 in n["paises"][:1]:  # el primer país del titular (o la sede, o el medio)
            for c in n["cats"]:
                grupos.setdefault((i3, c), []).append(n)
    feats = []
    for (i3, c), ns in grupos.items():
        p = gaz.paises.get(i3)
        if not p:
            continue
        lon, lat = posicion(p["lon"], p["lat"], c)
        sect = Counter(s for n in ns for s in n["sectores"])
        emp = Counter((e[0], e[1]) for n in ns for e in n["empresas"])
        ubic = Counter(n["ubic"] for n in ns)
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": {
            "iso3": i3, "pais": p.get("es", i3), "cat": c, "cat_nombre": NOMBRE_CAT[c], "icono": ICONO_CAT[c],
            "n": len(ns), "n_7d": sum(1 for n in ns if (n["fecha"] or "") >= hace7), "ultimo_utc": max(n["fecha"] or "" for n in ns),
            "sectores": [[NOMBRE_SECTOR[k], v] for k, v in sect.most_common(6)],
            "empresas": [[n, q, v] for (n, q), v in emp.most_common(8)],
            "medios": sorted({n["f"] for n in ns}),
            "por_medio": ubic.get("medio", 0), "por_sede": ubic.get("sede", 0),
            "notas": [{"t": n["t"], "f": n["f"], "fecha": n["fecha"], "url": n["url"], "ubic": n["ubic"],
                       "sectores": [NOMBRE_SECTOR[s] for s in n["sectores"]], "empresas": n["empresas"],
                       "otras": [NOMBRE_CAT[x] for x in n["cats"] if x != c]} for n in ns[:MAX_NOTAS]],
        }})
    feats.sort(key=lambda f: -f["properties"]["n"])
    return feats


def construir(ahora=None, leer=None, permitido=F.permitido_por_robots, pausa=PAUSA_S, feeds=None):
    ahora = ahora or ahora_utc()
    gaz = Gazetteer()
    empresas = Empresas(leer_json(EMPRESAS, {}))
    rss, estado = notas_rss(gaz, empresas, leer=leer, permitido=permitido, pausa=pausa, feeds=feeds)
    previas = (leer_json(ESTADO, {}) or {}).get("notas", [])
    todas = acumular(rss, previas, ahora)
    feats = por_pais_y_categoria(todas, gaz, ahora)
    cats = Counter(c for n in todas for c in n["cats"])
    escribir(ESTADO, {"generado_utc": iso(ahora), "ventana_dias": DIAS, "categorias": {k: NOMBRE_CAT[k] for k in NOMBRE_CAT},
                      "sectores": NOMBRE_SECTOR, "notas": todas})
    escribir(OUT, {"type": "FeatureCollection", "generado_utc": iso(ahora), "ventana_dias": DIAS, "total_notas": len(todas),
                   "sin_pais": sum(1 for n in todas if not n["paises"]), "por_categoria": dict(cats.most_common()),
                   "empresas_en_catalogo": len(empresas.por_id), "fuentes": estado, "features": feats})
    return f"{len(todas)} notas, {len(feats)} puntos; " + "; ".join(f"{k}: {v}" for k, v in estado.items())


def main():
    ahora = ahora_utc()
    gen = (leer_json(OUT, {}) or {}).get("generado_utc", "")
    try:
        if ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=CADA_H):
            print("corporativo: datos recientes")
            return 0
    except ValueError:
        pass
    print("corporativo:", construir(ahora))
    return 0


if __name__ == "__main__":
    sys.exit(main())
