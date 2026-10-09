#!/usr/bin/env python3
"""Red y ciberseguridad por país: cortes de internet, servidores de mando de botnets y avisos de sistemas
industriales. Todo se agrega por PAÍS: nunca se publica una dirección IP, un equipo vulnerable ni una persona.

1. Cortes de internet — IODA (Internet Outage Detection and Analysis, Georgia Tech).
   API pública v2 (sin llave; el host de la API no tiene robots.txt). Se piden los eventos de corte por país
   de las últimas 48 h. IODA los detecta con tres señales independientes: rutas BGP anunciadas, sondeo activo
   a redes /24 y tráfico hacia Google. Las respuestas dicen «Copyright Georgia Tech Research Corporation»:
   aquí solo se publica el hecho (país, señal, inicio, duración) con enlace al tablero de IODA, sin sus series.
2. Servidores de mando y control (C2) de botnets — abuse.ch: ThreatFox (exportación de 48 h) y Feodo Tracker
   (lista recomendada). Datos CC0 según abuse.ch; robots.txt de ambos permite /export/ y /downloads/.
   El país de cada IP sale de la base «IP to Country Lite» de DB-IP (CC BY 4.0, se baja una vez al mes).
   Se publica solo el conteo por país y por familia de malware. Un C2 en un país casi nunca significa que el
   atacante esté ahí: suele ser un servidor rentado en un centro de datos.
3. Avisos de sistemas de control industrial (ICS/OT) — CISA, en formato CSAF desde su repositorio oficial
   de GitHub (cisagov/CSAF, dominio público del gobierno de EUA). Se agrupan por el país SEDE del fabricante
   del equipo afectado (dato del propio aviso). No se mapean equipos expuestos en internet.

Salidas: vivos/red_cortes.geojson (cada corrida), vivos/red_c2.geojson (cada hora) y vivos/red_ics.geojson
(cada 6 h, con la lista de 90 días en vivos/red_ics_estado.json).
"""
import bisect
import csv
import gzip
import io
import ipaddress
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

VIVOS = os.path.join(ROOT, "vivos")
OUT_CORTES = os.path.join(VIVOS, "red_cortes.geojson")
OUT_C2 = os.path.join(VIVOS, "red_c2.geojson")
OUT_ICS = os.path.join(VIVOS, "red_ics.geojson")
ESTADO_ICS = os.path.join(VIVOS, "red_ics_estado.json")

IODA_EVENTOS = "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events?from={desde}&until={hasta}&entityType=country&format=codf&limit=2000"
IODA_TABLERO = "https://ioda.inetintel.cc.gatech.edu/country/{iso2}?from={desde}&until={hasta}"
SENAL_IODA = {"bgp": "Rutas BGP anunciadas", "ping-slash24": "Sondeo activo (ping a redes /24)", "gtr": "Tráfico hacia Google",
              "gtr-norm": "Tráfico hacia Google", "merit-nt": "Telescopio de red (tráfico no solicitado)"}
HORAS_CORTES = 48

THREATFOX = "https://threatfox.abuse.ch/export/json/recent/"
FEODO = "https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json"
DBIP = "https://download.db-ip.com/free/dbip-country-lite-{mes}.csv.gz"
DBIP_DIR = os.environ.get("DBIP_DIR", os.path.expanduser("~/.cache/dbip"))

CSAF_LISTA = "https://api.github.com/repos/cisagov/CSAF/contents/csaf_files/OT/white/{anio}?ref=develop"
CSAF_RAW = "https://raw.githubusercontent.com/cisagov/CSAF/develop/csaf_files/OT/white/{anio}/{nombre}"
DIAS_ICS = 90
CADA_H_C2, CADA_H_ICS = 1, 6


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


def reciente(ruta, horas, ahora):
    """True si el archivo se generó hace menos de `horas` (para no consultar una fuente en cada corrida)."""
    gen = (leer_json(ruta, {}) or {}).get("generado_utc", "")
    try:
        return ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=horas)
    except ValueError:
        return False


class Paises:
    """ISO2 → ISO3, nombre en español y centroide (config/gazetteer.json); nombre en inglés → ISO3."""

    def __init__(self):
        gaz = json.load(open(os.path.join(ROOT, "config", "gazetteer.json"), encoding="utf-8"))
        self.datos = gaz["paises"]
        self.iso2 = {k.upper(): v for k, v in gaz["iso2_a_iso3"].items()}
        self.iso2_de = {v: k for k, v in self.iso2.items()}
        self.por_nombre = {}
        for i3, p in self.datos.items():
            for n in (p.get("en"), p.get("es")):
                if n:
                    self.por_nombre[_clave(n)] = i3
        for n, i3 in ALIAS_PAIS.items():
            self.por_nombre[_clave(n)] = i3

    def de_nombre(self, texto):
        """«Germany», «Taiwan», «United States» → ISO3. Si trae varios («Germany, Switzerland») toma el primero."""
        for parte in re.split(r",|;| and | y |/", texto or ""):
            i3 = self.por_nombre.get(_clave(parte))
            if i3:
                return i3
        return None

    def punto(self, i3):
        p = self.datos.get(i3)
        return (p["lon"], p["lat"]) if p else None

    def nombre(self, i3):
        return (self.datos.get(i3) or {}).get("es", i3)


def _clave(t):
    t = re.sub(r"[^a-z ]", "", (t or "").lower().replace("&", "and"))
    return re.sub(r"^the ", "", re.sub(r" +", " ", t).strip())


# Nombres de sede que usa CISA y que no coinciden con el gazetteer.
ALIAS_PAIS = {"United States": "USA", "USA": "USA", "US": "USA", "United Kingdom": "GBR", "UK": "GBR", "South Korea": "KOR", "Korea": "KOR",
              "Republic of Korea": "KOR", "Taiwan": "TWN", "Czech Republic": "CZE", "Czechia": "CZE", "Russia": "RUS", "Netherlands": "NLD",
              "The Netherlands": "NLD", "Turkey": "TUR", "Türkiye": "TUR", "Vietnam": "VNM", "Iran": "IRN", "UAE": "ARE", "United Arab Emirates": "ARE"}


def punto(p, lonlat, props):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lonlat[0], 3), round(lonlat[1], 3)]}, "properties": props}


# ------------------------------------------------------------------ 1. cortes de internet (IODA)

def cortes(eventos, paises, hasta):
    """Eventos «codf» de IODA → un punto por país con sus señales, inicio, duración y si sigue en curso.
    En curso = la señal seguía caída en la última hora de la ventana."""
    por_pais = defaultdict(list)
    for e in eventos or []:
        loc = str(e.get("location", ""))
        if not loc.startswith("country/"):
            continue
        i2 = loc.split("/", 1)[1].upper()
        ini, dur = int(e.get("start") or 0), int(e.get("duration") or 0)
        por_pais[i2].append({"senal": SENAL_IODA.get(e.get("datasource"), e.get("datasource") or "?"), "fuente": e.get("datasource"),
                             "inicio": ini, "fin": ini + dur, "puntaje": round(float(e.get("score") or 0))})
    out = []
    for i2, evs in por_pais.items():
        i3 = paises.iso2.get(i2)
        pt = paises.punto(i3) if i3 else None
        if not pt:
            continue
        en_curso = [e for e in evs if e["fin"] >= hasta - 3600]
        senales = sorted({e["senal"] for e in (en_curso or evs)})
        ini = min(e["inicio"] for e in evs)
        fin = max(e["fin"] for e in evs)
        out.append(punto(None, pt, {
            "id": f"ioda:{i2}", "pais_iso3": i3, "pais": paises.nombre(i3), "en_curso": bool(en_curso), "senales": senales, "n_senales": len(senales),
            "inicio_utc": iso(datetime.fromtimestamp(ini, timezone.utc)), "fin_utc": None if en_curso else iso(datetime.fromtimestamp(fin, timezone.utc)),
            "horas": round((min(fin, hasta) - ini) / 3600, 1),
            "eventos": [{"senal": e["senal"], "inicio_utc": iso(datetime.fromtimestamp(e["inicio"], timezone.utc)),
                         "horas": round((min(e["fin"], hasta) - e["inicio"]) / 3600, 1)} for e in sorted(evs, key=lambda x: x["inicio"])][:8],
            "fecha_utc": iso(datetime.fromtimestamp(ini, timezone.utc)),
            "url": IODA_TABLERO.format(iso2=i2, desde=hasta - HORAS_CORTES * 3600, hasta=hasta)}))
    return out


def paso_cortes(paises, ahora):
    hasta = int(ahora.timestamp())
    url = IODA_EVENTOS.format(desde=hasta - HORAS_CORTES * 3600, hasta=hasta)
    if not F.permitido_por_robots(url):
        raise PermissionError("robots.txt no lo permite")
    datos = json.loads(F.get(url, timeout=60))
    feats = cortes(datos.get("data"), paises, hasta)
    escribir(OUT_CORTES, {"type": "FeatureCollection", "generado_utc": iso(ahora), "ventana_h": HORAS_CORTES,
                          "fuente": "IODA (Georgia Tech), datos derivados", "features": feats})
    return f"ok ({len(feats)} países, {sum(f['properties']['en_curso'] for f in feats)} en curso)"


# ------------------------------------------------------------------ 2. servidores C2 (abuse.ch + DB-IP)

class GeoIP:
    """País de una IPv4 con la tabla de rangos de DB-IP Lite (búsqueda binaria)."""

    def __init__(self, filas):
        rangos = []
        for ini, fin, cc in filas:
            if ":" in ini:
                continue
            rangos.append((int(ipaddress.IPv4Address(ini)), int(ipaddress.IPv4Address(fin)), cc))
        rangos.sort()
        self.inicios = [r[0] for r in rangos]
        self.rangos = rangos

    def pais(self, ip):
        try:
            n = int(ipaddress.IPv4Address(ip))
        except ValueError:
            return None
        i = bisect.bisect_right(self.inicios, n) - 1
        if i >= 0 and self.rangos[i][0] <= n <= self.rangos[i][1]:
            cc = self.rangos[i][2]
            return None if cc in ("ZZ", "") else cc
        return None


def cargar_dbip(ahora):
    """Archivo del mes (o del anterior, si el del mes aún no se publica). Se guarda en caché fuera de vivos/."""
    os.makedirs(DBIP_DIR, exist_ok=True)
    for mes in (ahora.strftime("%Y-%m"), (ahora.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")):
        ruta = os.path.join(DBIP_DIR, f"dbip-country-lite-{mes}.csv.gz")
        if not os.path.exists(ruta):
            try:
                if not F.permitido_por_robots(DBIP.format(mes=mes)):
                    raise PermissionError("robots.txt no lo permite")
                req = F.urllib.request.Request(DBIP.format(mes=mes), headers={"User-Agent": F.UA})
                with F.urllib.request.urlopen(req, timeout=120) as r:
                    datos = r.read()
                with open(ruta, "wb") as f:
                    f.write(datos)
            except Exception as e:  # noqa: BLE001
                print(f"DB-IP {mes}: {e}")
                continue
        with gzip.open(ruta, "rt", encoding="utf-8") as f:
            return GeoIP(csv.reader(f)), mes
    raise RuntimeError("no se pudo bajar la base de DB-IP")


RX_IP = re.compile(r"^(?:[a-z]+://)?(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:/|$)")


def ips_threatfox(datos):
    """Exportación de ThreatFox ({id: [ioc…]}) → {ip: familia} de los IOC de tipo C2 con IP (ip:port o URL a IP)."""
    out = {}
    for lista in (datos or {}).values():
        for x in lista:
            if x.get("threat_type") != "botnet_cc" or x.get("ioc_type") not in ("ip:port", "url"):
                continue
            m = RX_IP.match(str(x.get("ioc_value", "")).strip())
            if m:
                out.setdefault(m.group(1), x.get("malware_printable") or x.get("malware") or "desconocido")
    return out


def ips_feodo(lista):
    return {x["ip_address"]: x.get("malware") or "desconocido" for x in lista or [] if x.get("ip_address")}


def c2_por_pais(ips, geo, paises):
    """{ip: familia} → (features por país, IPs sin país). Solo conteos: las IP no salen de esta función."""
    por = defaultdict(Counter)
    sin = 0
    for ip, fam in ips.items():
        i3 = paises.iso2.get(geo.pais(ip) or "")
        if not i3:
            sin += 1
            continue
        por[i3][fam] += 1
    feats = []
    for i3, fams in por.items():
        pt = paises.punto(i3)
        if not pt:
            sin += sum(fams.values())
            continue
        n = sum(fams.values())
        feats.append(punto(None, pt, {"id": f"c2:{i3}", "pais_iso3": i3, "pais": paises.nombre(i3), "n": n,
                                      "familias": [[f, c] for f, c in fams.most_common(10)], "n_familias": len(fams)}))
    feats.sort(key=lambda f: -f["properties"]["n"])
    return feats, sin


def paso_c2(paises, ahora):
    geo, mes = cargar_dbip(ahora)
    ips, estado = {}, {}
    for nombre, url, leer in (("threatfox", THREATFOX, ips_threatfox), ("feodo", FEODO, ips_feodo)):
        try:
            if not F.permitido_por_robots(url):
                raise PermissionError("robots.txt no lo permite")
            nuevas = leer(json.loads(F.get(url, timeout=120)))
            for ip, fam in nuevas.items():
                ips.setdefault(ip, fam)
            estado[nombre] = f"ok ({len(nuevas)} IP)"
        except Exception as e:  # noqa: BLE001
            estado[nombre] = f"error: {e}"[:160]
    if not ips:
        raise RuntimeError(f"sin datos: {estado}")
    feats, sin = c2_por_pais(ips, geo, paises)
    escribir(OUT_C2, {"type": "FeatureCollection", "generado_utc": iso(ahora), "ventana_h": 48, "total_ip": len(ips), "sin_pais": sin,
                      "geoip": f"DB-IP IP to Country Lite {mes} (CC BY 4.0)", "fuentes": estado, "features": feats})
    return f"ok ({len(ips)} IP en {len(feats)} países; {estado})"


# ------------------------------------------------------------------ 3. avisos ICS de CISA (CSAF)

RX_NOMBRE = re.compile(r"^(icsa|icsma)-(\d\d)-(\d{3})-(\d\d[a-z]?)\.json$")


def fecha_de_nombre(nombre):
    """icsa-26-281-03.json → fecha del día 281 de 2026 (CISA numera por día del año)."""
    m = RX_NOMBRE.match(nombre)
    if not m:
        return None
    return datetime(2000 + int(m.group(2)), 1, 1, tzinfo=timezone.utc) + timedelta(days=int(m.group(3)) - 1)


def nota(doc, titulo):
    for n in doc.get("document", {}).get("notes", []):
        if (n.get("title") or "").strip().lower() == titulo:
            return (n.get("text") or "").strip()
    return ""


def leer_csaf(doc):
    """Documento CSAF de CISA → resumen compacto (sin el texto del aviso)."""
    d = doc.get("document", {})
    tr = d.get("tracking", {})
    cvss = [s.get(k, {}).get("baseScore") for v in doc.get("vulnerabilities", []) for s in v.get("scores", []) for k in ("cvss_v4", "cvss_v3")]
    cvss = [float(x) for x in cvss if x is not None]
    web = next((r["url"] for r in d.get("references", []) if "Web Version" in (r.get("summary") or "")), None)
    textos = " ".join(n.get("text") or "" for n in d.get("notes", []))
    explotado = bool(re.search(r"(?i)(known|active(ly)?) (public )?exploit\w* .{0,60}(has|have) been reported|is being actively exploited", textos)) \
        and not re.search(r"(?i)no known public exploitation", textos)
    ramas = (doc.get("product_tree") or {}).get("branches") or [{}]
    return {"id": tr.get("id") or "", "titulo": d.get("title") or "", "fabricante": ramas[0].get("name") or (d.get("title") or "").split(" ")[0], "fecha": (tr.get("initial_release_date") or "")[:10],
            "actualizado": (tr.get("current_release_date") or "")[:10], "sede": nota(doc, "company headquarters location"),
            "desplegado": nota(doc, "countries/areas deployed"), "sectores": [s.strip() for s in re.split(r",|;", nota(doc, "critical infrastructure sectors")) if s.strip()],
            "cvss": max(cvss) if cvss else None, "cves": len(doc.get("vulnerabilities", [])), "explotado": explotado, "medico": (tr.get("id") or "").upper().startswith("ICSMA"),
            "url": web or f"https://www.cisa.gov/news-events/ics-advisories/{(tr.get('id') or '').lower()}"}


def ics_por_pais(avisos, paises):
    por = defaultdict(list)
    sin = []
    for a in avisos:
        i3 = paises.de_nombre(a.get("sede"))
        (por[i3] if i3 and paises.punto(i3) else sin).append(a)
    feats = []
    for i3, lista in por.items():
        lista.sort(key=lambda a: a["fecha"], reverse=True)
        cv = [a["cvss"] for a in lista if a["cvss"] is not None]
        sect = Counter(s for a in lista for s in a["sectores"])
        feats.append(punto(None, paises.punto(i3), {
            "id": f"ics:{i3}", "pais_iso3": i3, "pais": paises.nombre(i3), "n": len(lista), "cvss_max": max(cv) if cv else None,
            "criticos": sum(1 for x in cv if x >= 9), "explotados": sum(a["explotado"] for a in lista), "medicos": sum(a["medico"] for a in lista),
            "fabricantes": [[f, c] for f, c in Counter(a.get("fabricante") or "?" for a in lista).most_common(8)], "sectores": [[s, c] for s, c in sect.most_common(6)],
            "fecha_utc": lista[0]["fecha"] + "T00:00:00Z",
            "avisos": [{k: a[k] for k in ("id", "titulo", "fecha", "cvss", "explotado", "url")} for a in lista[:15]]}))
    feats.sort(key=lambda f: -f["properties"]["n"])
    return feats, sin


def get_json_github(url):
    req = F.urllib.request.Request(url, headers={"User-Agent": F.UA, "Accept": "application/vnd.github+json",
                                                 **({"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}"} if os.environ.get("GITHUB_TOKEN") else {})})
    with F.urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def paso_ics(paises, ahora):
    estado = leer_json(ESTADO_ICS, {}) or {}
    avisos = estado.get("avisos", {})
    limite = ahora - timedelta(days=DIAS_ICS)
    nuevos = errores = 0
    for anio in sorted({limite.year, ahora.year}):
        lista = get_json_github(CSAF_LISTA.format(anio=anio))
        for x in lista:
            nombre = x.get("name", "")
            f = fecha_de_nombre(nombre)
            if not f or f < limite or nombre in avisos:
                continue
            try:
                avisos[nombre] = leer_csaf(json.loads(F.get(CSAF_RAW.format(anio=anio, nombre=nombre), timeout=60)))
                nuevos += 1
                time.sleep(0.2)
            except Exception as e:  # noqa: BLE001
                errores += 1
                print(f"CSAF {nombre}: {e}")
    avisos = {k: v for k, v in avisos.items() if (fecha_de_nombre(k) or ahora) >= limite}
    feats, sin = ics_por_pais(list(avisos.values()), paises)
    escribir(ESTADO_ICS, {"generado_utc": iso(ahora), "avisos": avisos})
    escribir(OUT_ICS, {"type": "FeatureCollection", "generado_utc": iso(ahora), "ventana_dias": DIAS_ICS, "total": len(avisos),
                       "sin_pais": [{"id": a["id"], "sede": a["sede"]} for a in sin][:30], "features": feats})
    return f"ok ({len(avisos)} avisos en 90 días, {nuevos} nuevos, {errores} errores, {len(sin)} sin país)"


def main():
    ahora = ahora_utc()
    paises = Paises()
    estado = {}
    pasos = [("cortes", paso_cortes, None, None), ("c2", paso_c2, OUT_C2, CADA_H_C2), ("ics", paso_ics, OUT_ICS, CADA_H_ICS)]
    for nombre, paso, salida, cada_h in pasos:
        if salida and reciente(salida, cada_h, ahora):
            estado[nombre] = "datos recientes"
            continue
        try:
            estado[nombre] = paso(paises, ahora)
        except Exception as e:  # noqa: BLE001  una fuente caída no detiene a las demás; se conserva su archivo anterior
            estado[nombre] = f"error: {e}"[:200]
    print(f"red: {estado}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
