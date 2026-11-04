#!/usr/bin/env python3
"""Ciberataques reportados por la prensa, agrupados por el PAÍS AFECTADO que nombra el titular (30 días).

De dónde salen:
1. Canales RSS de medios especializados en ciberseguridad (FEEDS), solo si su robots.txt lo permite y con una
   pausa entre medios. De cada nota se guarda título, medio, fecha y enlace: nunca el texto (derechos de autor).
2. Las noticias que la ingesta horaria ya clasificó con el subtema «ciberataques» (data/events.json), solo de
   medios de prensa (no GDELT, cuyos títulos son códigos, ni publicaciones de redes sociales).

Cómo se ubica cada nota: países que el titular nombra como lugar («ataque a supermercados de Bélgica»). Un país
nombrado como acusado («Corea del Norte niega…», «hackers rusos», «vinculados a Irán») se guarda como
«señalado» y no pone punto: la atribución de un ciberataque casi nunca se puede confirmar con un titular. Si el
titular no nombra país, la nota de la ingesta conserva el país que le asignó la ingesta, salvo en los medios
mexicanos, que ponen México por omisión.

Qué NO se publica: direcciones IP, dominios, nombres de personas, víctimas que publican los grupos de ransomware
en sus sitios de extorsión (se evitó a propósito ransomware.live y similares) ni muestras de datos filtrados.

Salida: vivos/ciberataques.geojson (un punto por país) y vivos/ciberataques_estado.json (notas de 30 días).
"""
import json
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

_GAZ = json.load(open(os.path.join(ROOT, "config", "gazetteer.json"), encoding="utf-8"))
ISO2_ISO3 = {k.upper(): v for k, v in _GAZ["iso2_a_iso3"].items()}
ISO2_ISO3.update({"UK": "GBR", "KR": "KOR", "JPN": "JPN"})
VIVOS = os.path.join(ROOT, "vivos")
OUT = os.path.join(VIVOS, "ciberataques.geojson")
ESTADO = os.path.join(VIVOS, "ciberataques_estado.json")
EVENTOS = os.path.join(ROOT, "data", "events.json")
DIAS = 30
CADA_H = 1
PAUSA_S = 1.0
MAX_INCIDENTES = 12

# (medio, URL del RSS, idioma). Revisados el 04-nov-2026: su robots.txt permite leer el feed.
FEEDS = [
    ("The Record (Recorded Future News)", "https://therecord.media/feed", "en"),
    ("BleepingComputer", "https://www.bleepingcomputer.com/feed/", "en"),
    ("SecurityWeek", "https://www.securityweek.com/feed/", "en"),
    ("The Hacker News", "https://feeds.feedburner.com/TheHackersNews", "en"),
    ("Dark Reading", "https://www.darkreading.com/rss.xml", "en"),
    ("Cybersecurity Dive", "https://www.cybersecuritydive.com/feeds/news/", "en"),
    ("DataBreaches.net", "https://databreaches.net/feed/", "en"),
    ("WeLiveSecurity (ESET)", "https://www.welivesecurity.com/es/rss/feed/", "es"),
    ("Una al Día (Hispasec)", "https://unaaldia.hispasec.com/feed", "es"),
]

# Debe aparecer alguna para que la nota cuente como incidente (sobre el título normalizado: minúsculas, sin acentos).
RX_ATAQUE = re.compile(
    r"ciberataque|ataque (informatico|cibernetico)|hackeo|hackea|hackers?\b|hacked|\bhack\b|ransomware|ddos|denegacion de servicio|"
    r"denial of service|filtracion|brecha de (datos|seguridad)|data breach|\bbreach|\bleak|cyber ?attack|cyber-attack|ciberespionaje|"
    r"cyber ?espionage|wiper|intrusion|compromised|comprometid|extortion|extorsion|defac|secuestro de datos|robo de datos|stolen data|"
    r"cyber incident|incidente (de ciberseguridad|cibernetico)|hacktivist|hacktivista"
)
# Notas que hablan del tema pero no de un ataque concreto.
RX_RUIDO = re.compile(
    r"\b(webinar|podcast|how to|como (protegerte|evitar)|tips|consejos|guia|guide|review|best|top \d+|report finds|survey|encuesta|"
    r"funding|raises \$|acquire|adquiere|hiring|job|week in review|weekly recap|resumen semanal|nuevo curso|evento|"
    r"arrest|arrested|arresta|detiene|detenid[oa]s?|sentenced|sentencia|condena|extradit|charged|pleads|se declara culpable)\b"
)

TIPOS = [  # (clave, nombre, regex): gana el primero que coincide
    ("ransomware", "Ransomware / extorsión", r"ransomware|extortion|extorsion|secuestro de datos"),
    ("ddos", "Denegación de servicio (DDoS)", r"ddos|denegacion de servicio|denial of service"),
    ("cripto", "Robo de criptomonedas", r"crypto|cripto|bitcoin|binance|blockchain|defi\b|wallet|billetera"),
    ("sabotaje", "Sabotaje de sistemas físicos o industriales", r"scada|\bics\b|\bot\b|industrial|refrigera|freezer|fridge|water (utility|plant)|"
     r"potabilizadora|power grid|red electrica|wiper|sabotage|sabotaje|pipeline|oleoducto|alert app|alerta"),
    ("filtracion", "Filtración o robo de datos", r"breach|leak|filtracion|brecha|exposed|expuest|stolen data|robo de datos|datos de \d"),
    ("espionaje", "Espionaje", r"espionage|espionaje|\bapt ?\d*\b|state-sponsored|nation-state|\bspy|espia"),
    ("fraude", "Phishing o fraude", r"phishing|smishing|scam|fraude|fraud|estafa"),
    ("intrusion", "Intrusión / hackeo", r"."),
]
NOMBRE_TIPO = {k: n for k, n, _ in TIPOS}
_RX_TIPOS = [(k, re.compile(r)) for k, _, r in TIPOS]

SECTORES = [  # (clave, nombre, ícono, regex). Una nota puede tocar varios.
    ("comercio", "Supermercados y comercio", "🛒", r"supermarket|supermercado|grocer|retail|minorist|tienda|store\b|stores\b|carrefour|ikea|lidl|aldi|tesco|walmart|oxxo"),
    ("salud", "Salud", "🏥", r"hospital|health|salud|clinic|medical|medic|pharma|farmac|nhs\b|imss|issste"),
    ("gobierno", "Gobierno", "🏛️", r"government|gobierno|ministry|ministerio|municipal|city of|ciudad de|ayuntamiento|agency|agencia|parliament|parlamento|"
     r"senado|senate|congress|congreso|police|policia|court|tribunal|election|elecci"),
    ("energia", "Energía", "⚡", r"energy|energia|power|electric|oil\b|petrol|gas\b|pipeline|nuclear|pemex|cfe\b"),
    ("finanzas", "Finanzas y cripto", "🏦", r"bank|banco|financ|insur|asegurador|crypto|cripto|binance|exchange|bolsa|payment|pago"),
    ("transporte", "Transporte", "✈️", r"airport|aeropuerto|airline|aerolinea|rail|ferrocarril|tren\b|port\b|puerto|shipping|naviera|logistic|logistica|transit"),
    ("telecom", "Telecomunicaciones", "📡", r"telecom|telco|mobile operator|operador movil|carrier|isp\b|internet provider|satellite|satelite"),
    ("educacion", "Educación", "🎓", r"universit|school|escuela|college|colegio|educa"),
    ("industria", "Industria", "🏭", r"manufactur|factory|fabrica|automaker|automotriz|industrial|planta\b"),
    ("defensa", "Defensa", "🛡️", r"military|militar|defense|defence|defensa|army|ejercito|navy|marina"),
    ("agua", "Agua", "💧", r"water|agua"),
]
_RX_SECT = [(k, re.compile(r)) for k, _, _, r in SECTORES]
ICONO_SECTOR = {k: ic for k, _, ic, _ in SECTORES}
NOMBRE_SECTOR = {k: n for k, n, _, _ in SECTORES}
ICONO_TIPO = {"ransomware": "🔐", "ddos": "📶", "cripto": "🪙", "sabotaje": "🏭", "filtracion": "🗂️", "espionaje": "🕵️", "fraude": "🎣", "intrusion": "💻"}

# País nombrado como acusado: después de estas palabras, junto a «hackers/grupo/APT», o al inicio seguido de «niega».
RX_SENALA = re.compile(r"(acusa a|acusan a|culpa a|accuses|accused|blames|blamed|linked to|tied to|backed by|vinculad[oa]s? (a|con)|"
                       r"atribuid[oa]s? a|respaldad[oa]s? por|patrocinad[oa]s? por|por parte de) $")
RX_ACTOR_DESPUES = re.compile(r"^ ?[a-z]*( ?(aligned|linked|backed|nexus|sponsored|based|state))* ?(hackers?|hacking|hacktivists?|apt|threat actors?|"
                              r"actors?|spies|spy|cyber ?(army|group|unit)|group|grupo|operatives?|intelligence)\b")
RX_ACTOR_ANTES = re.compile(r"(hackers?|hacktivistas?|grupos?|ciberdelincuentes|espias|actores) $")
RX_NIEGA = re.compile(r"^ ?(niega|niegan|denies|deny|denied|rechaza|rechazan|amenaza|amenazan|threatens|warns|advierte)")

# Titulares que solo nombran una región («supermarkets across Europe»): un punto por región.
REGIONES = [
    ("EUR", "Europa (varios países)", 12.0, 52.5, r"europe|europa|european|europeos?|europeas?|union europea"),
    ("LAT", "América Latina (varios países)", -64.0, -12.0, r"latin america|america latina|latinoamerica|latam"),
    ("SAS", "Asia del Sur (varios países)", 78.0, 22.0, r"south asia|asia del sur|sur de asia"),
    ("SEA", "Sudeste asiático (varios países)", 106.0, 8.0, r"southeast asia|sudeste asiatico"),
    ("MEA", "Medio Oriente (varios países)", 45.0, 28.0, r"middle east|medio oriente|oriente medio|gulf states|golfo persico"),
    ("AFR", "África (varios países)", 20.0, 5.0, r"\bafrica\b"),
]
_RX_REG = [(k, n, lon, lat, re.compile(r)) for k, n, lon, lat, r in REGIONES]
# DataBreaches.net antepone el país: «AU: …», «KR: …», «JPN: …».
RX_PREFIJO = re.compile(r"^([A-Z]{2,3}):\s")


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


def es_incidente(titulo):
    t = normalizar(titulo)
    return bool(RX_ATAQUE.search(t)) and not RX_RUIDO.search(t)


def tipo_de(titulo):
    t = normalizar(titulo)
    return next(k for k, rx in _RX_TIPOS if rx.search(t))


def sectores_de(titulo):
    t = normalizar(titulo)
    return [k for k, rx in _RX_SECT if rx.search(t)]


def paises_de(titulo, gaz):
    """(afectados, señalados) en ISO3. «hackers rusos», «China-aligned hackers», «Corea del Norte niega…» = señalado."""
    t = normalizar(titulo)
    afect, senal = [], []
    for i3, pos, _es_lugar, _pos_lugar in gaz.paises_en_texto(titulo, con_posicion=True):
        antes = t[max(0, pos - 26):pos + 1]
        resto = t[pos + 1:]
        clave = max((k for k in gaz._claves if resto.startswith(k + " ")), key=len, default="")
        despues = resto[len(clave):]
        acusado = bool(RX_SENALA.search(antes) or RX_ACTOR_ANTES.search(antes) or RX_ACTOR_DESPUES.match(despues))
        if pos <= 1 and (RX_NIEGA.match(despues) or RX_NIEGA.match(resto[len((resto.split(" niega")[0])):] if " niega" in resto[:30] else "")):
            acusado = True
        if i3 in afect or i3 in senal:
            continue
        (senal if acusado else afect).append(i3)
    m = RX_PREFIJO.match(titulo or "")
    if m:
        cod = m.group(1)
        i3 = cod if cod in gaz.paises else ISO2_ISO3.get(cod)
        if i3 and i3 not in afect:
            afect.insert(0, i3)
    return afect, senal


def region_de(titulo):
    t = normalizar(titulo)
    return next((k for k, _n, _lon, _lat, rx in _RX_REG if rx.search(t)), None)


def nota(titulo, fuente, url, fecha, gaz, pais_ingesta=None):
    """Nota normalizada o None si no es un incidente."""
    if not titulo or not url or not es_incidente(titulo):
        return None
    afect, senal = paises_de(titulo, gaz)
    if not afect and not senal and pais_ingesta:
        afect = [pais_ingesta]
    if not afect and (r := region_de(titulo)):
        afect = [r]
    return {"t": re.sub(r"\s+", " ", titulo)[:220], "f": fuente, "url": url, "fecha": fecha, "tipo": tipo_de(titulo),
            "sectores": sectores_de(titulo), "afectados": afect, "senalados": senal}


def notas_rss(gaz, leer=None, permitido=F.permitido_por_robots, pausa=PAUSA_S):
    out, estado = [], {}
    for medio, url, idioma in FEEDS:
        if not permitido(url):
            estado[medio] = "robots.txt no lo permite"
            continue
        try:
            datos = leer(url) if leer else F.get(url, timeout=40)
            items = F.parsear_rss(datos, {"nombre": medio, "tipo": "noticia", "idioma": idioma})
            nuevas = [n for n in (nota(i["titulo"], medio, i["url"], i["fecha_utc"], gaz) for i in items) if n]
            out += nuevas
            estado[medio] = f"{len(items)} titulares, {len(nuevas)} incidentes"
        except Exception as e:  # noqa: BLE001  un medio caído no detiene a los demás
            estado[medio] = f"error: {type(e).__name__}"
        time.sleep(pausa)
    return out, estado


def medios_con_pais_por_omision():
    cfg = leer_json(os.path.join(ROOT, "config", "fuentes.json"), {}) or {}
    return {f["nombre"] for f in cfg.get("rss", []) if f.get("pais_defecto")}


def notas_ingesta(eventos, gaz):
    omision = medios_con_pais_por_omision()
    out = []
    for e in eventos:
        if "ciberataques" not in (e.get("subtemas") or []) or e.get("tipo_fuente") != "noticia" or e.get("fuente") in ("Mastodon #geopolitics",):
            continue
        pais = None if e.get("fuente") in omision else e.get("pais_iso3")
        n = nota(e.get("titulo"), e.get("fuente"), e.get("url"), e.get("fecha_utc"), gaz, pais)
        if n:
            out.append(n)
    return out


def acumular(nuevas, previas, ahora, dias=DIAS):
    limite = iso(ahora - timedelta(days=dias))
    vistos, out = set(), []
    for n in sorted(nuevas + previas, key=lambda x: x.get("fecha") or "", reverse=True):
        if n["url"] in vistos or (n.get("fecha") or "") < limite:
            continue
        vistos.add(n["url"])
        out.append(n)
    return out


def por_pais(notas, gaz, ahora):
    hace7 = iso(ahora - timedelta(days=7))
    grupos = {}
    for n in notas:
        for i3 in n["afectados"]:
            grupos.setdefault(i3, []).append(n)
    feats = []
    for i3, ns in grupos.items():
        reg = next((r for r in REGIONES if r[0] == i3), None)
        p = {"es": reg[1], "lon": reg[2], "lat": reg[3]} if reg else gaz.paises.get(i3)
        if not p:
            continue
        lon, lat = p["lon"], p["lat"]
        tipos = Counter(n["tipo"] for n in ns)
        sect = Counter(s for n in ns for s in n["sectores"])
        senal = Counter(s for n in ns for s in n["senalados"])
        principal = tipos.most_common(1)[0][0]
        sector_p = sect.most_common(1)[0][0] if sect else None
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3)]}, "properties": {
            "iso3": i3, "pais": p.get("es", i3), "region": bool(reg), "n": len(ns), "n_7d": sum(1 for n in ns if (n["fecha"] or "") >= hace7),
            "ultimo_utc": max(n["fecha"] or "" for n in ns), "tipo": principal, "tipo_nombre": NOMBRE_TIPO[principal],
            "sector": sector_p, "icono": ICONO_SECTOR.get(sector_p) or ICONO_TIPO[principal],
            "tipos": [[NOMBRE_TIPO[k], v] for k, v in tipos.most_common()],
            "sectores": [[NOMBRE_SECTOR[k], v] for k, v in sect.most_common()],
            "senalados": [[(gaz.paises.get(k) or {}).get("es", k), v] for k, v in senal.most_common(5)],
            "medios": sorted({n["f"] for n in ns}),
            "incidentes": [{"t": n["t"], "f": n["f"], "fecha": n["fecha"], "url": n["url"], "tipo": NOMBRE_TIPO[n["tipo"]],
                            "sectores": [NOMBRE_SECTOR[s] for s in n["sectores"]]} for n in ns[:MAX_INCIDENTES]],
        }})
    feats.sort(key=lambda f: -f["properties"]["n"])
    return feats


def construir(ahora=None, leer=None, permitido=F.permitido_por_robots, pausa=PAUSA_S, eventos=None):
    ahora = ahora or ahora_utc()
    gaz = Gazetteer()
    rss, estado = notas_rss(gaz, leer=leer, permitido=permitido, pausa=pausa)
    if eventos is None:
        eventos = (leer_json(EVENTOS, {}) or {}).get("eventos", [])
    ing = notas_ingesta(eventos, gaz)
    previas = (leer_json(ESTADO, {}) or {}).get("notas", [])
    todas = acumular(rss + ing, previas, ahora)
    feats = por_pais(todas, gaz, ahora)
    escribir(ESTADO, {"generado_utc": iso(ahora), "notas": todas})
    escribir(OUT, {"type": "FeatureCollection", "generado_utc": iso(ahora), "ventana_dias": DIAS, "total_notas": len(todas),
                   "sin_pais": sum(1 for n in todas if not n["afectados"]), "fuentes": estado, "features": feats})
    return f"{len(todas)} notas, {len(feats)} países; " + "; ".join(f"{k}: {v}" for k, v in estado.items())


def main():
    ahora = ahora_utc()
    gen = (leer_json(OUT, {}) or {}).get("generado_utc", "")
    try:
        if ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=CADA_H):
            print("ciberataques: datos recientes")
            return 0
    except ValueError:
        pass
    print("ciberataques:", construir(ahora))
    return 0


if __name__ == "__main__":
    sys.exit(main())
