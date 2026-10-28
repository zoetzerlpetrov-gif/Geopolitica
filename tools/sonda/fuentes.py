"""Sonda: fuentes candidatas (C2, feeds de desaparecidos, ComprasMX, GIBS). Solo lectura, con robots.txt."""
import json, os, re, sys, time, urllib.parse, urllib.request, urllib.robotparser
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest")); sys.path.insert(0, os.path.join(ROOT, "tools", "crimen"))
import fuentes as F
import desaparecidos as DS
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"

def pedir(url, data=None, headers=None, t=40):
    t0 = time.time()
    try:
        req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
        with urllib.request.urlopen(req, timeout=t) as r:
            b = r.read()
            return r.status, b, time.time() - t0
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:300], time.time() - t0
    except Exception as e:
        return str(e)[:80], b"", time.time() - t0

def robots(url):
    p = urllib.parse.urlparse(url)
    rp = urllib.robotparser.RobotFileParser(f"{p.scheme}://{p.netloc}/robots.txt")
    try:
        rp.read(); return rp.can_fetch(UA, url)
    except Exception as e:
        return f"robots? {e}"[:40]

print("=== C2")
for u in ["https://threatfox.abuse.ch/export/json/recent/", "https://threatfox.abuse.ch/export/csv/recent/", "https://threatfox.abuse.ch/export/csv/ip-port/recent/",
          "https://threatfox.abuse.ch/export/json/ip-port/recent/",
          "https://feodotracker.abuse.ch/downloads/ipblocklist.json", "https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json",
          "https://sslbl.abuse.ch/blacklist/sslipblacklist.csv",
          "https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/IPC2s-30day.csv",
          "https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/IPC2s.csv",
          "https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/all.txt",
          "https://api.github.com/repos/drb-ra/C2IntelFeeds/license", "https://api.github.com/repos/montysecurity/C2-Tracker/license"]:
    s, b, dt = pedir(u)
    lineas = b.count(b"\n")
    print(f"{s} {dt:.1f}s {len(b)}B {lineas} líneas robots={robots(u)} {u}\n   {b[:200]!r}")
s, b, dt = pedir("https://threatfox-api.abuse.ch/api/v1/", data=json.dumps({"query": "get_iocs", "days": 1}).encode(), headers={"Content-Type": "application/json"})
print(f"threatfox api sin llave: {s} {b[:200]!r}")

print("=== FEEDS desaparecidos")
CAND = [("adondevan", "https://adondevanlosdesaparecidos.org/feed/"), ("piedepagina", "https://piedepagina.mx/feed/"), ("zonadocs", "https://www.zonadocs.mx/feed/"),
        ("quintoelab", "https://quintoelab.org/feed/"), ("elpais_mx", "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/mexico/portada"),
        ("animal_politico2", "https://animalpolitico.com/feed"), ("cronica", "https://www.cronica.com.mx/rss/"), ("lajornada_ultimas", "https://www.jornada.com.mx/rss/ultimas.xml?v=1"),
        ("pagina3", "https://pagina3.mx/feed/"), ("nvinoticias", "https://www.nvinoticias.com/rss.xml"), ("elimparcial", "https://www.elimparcial.com/rss/"),
        ("lavozdemichoacan", "https://www.lavozdemichoacan.com.mx/feed/"), ("zocalo", "https://www.zocalo.com.mx/feed/"), ("elheraldochihuahua", "https://www.elheraldodechihuahua.com.mx/rss.xml"),
        ("elsoldesinaloa", "https://www.elsoldesinaloa.com.mx/rss.xml"), ("noroeste", "https://www.noroeste.com.mx/rss/feed"), ("riodoce", "https://riodoce.mx/feed/"),
        ("lavozdelafrontera", "https://www.lavozdelafrontera.com.mx/rss.xml"), ("elsoldetampico", "https://www.elsoldetampico.com.mx/rss.xml"),
        ("elsoldeirapuato", "https://www.elsoldeirapuato.com.mx/rss.xml"), ("am_leon", "https://www.am.com.mx/rss"), ("elsoldepuebla", "https://www.elsoldepuebla.com.mx/rss.xml"),
        ("elsoldecuernavaca", "https://www.elsoldecuernavaca.com.mx/rss.xml"), ("diariodexalapa", "https://www.diariodexalapa.com.mx/rss.xml"),
        ("elsoldezacatecas", "https://www.elsoldezacatecas.com.mx/rss.xml"), ("elsoldesanluis", "https://www.elsoldesanluis.com.mx/rss.xml"),
        ("milenio2", "https://www.milenio.com/rss/feed.xml"), ("excelsior2", "https://www.excelsior.com.mx/rss/nacional"),
        ("eluniversal_edomex", "https://www.eluniversaledomex.mx/rss.xml"), ("cuartoscuro", "https://cuartoscuro.com.mx/feed/")]
for fid, u in CAND:
    rb = robots(u)
    if rb is not True:
        print(f"{fid}: robots={rb}"); continue
    s, b, dt = pedir(u)
    if s != 200:
        print(f"{fid}: HTTP {s}"); continue
    try:
        cands = F.parsear_rss(b, {"nombre": fid, "tipo": "noticia"})
    except Exception as e:
        try:
            limpio = re.sub(rb"<(/?)([A-Za-z0-9_]+):", rb"<\1\2_", b); limpio = re.sub(rb'\s[A-Za-z0-9_]+:([A-Za-z0-9_]+)="', rb' \1="', limpio)
            cands = F.parsear_rss(limpio, {"nombre": fid, "tipo": "noticia"})
        except Exception as e2:
            print(f"{fid}: parse {e2}"[:120]); continue
    tipos = [DS.clasificar(c["titulo"]) for c in cands]
    fechas = sorted(c["fecha_utc"] for c in cands if c.get("fecha_utc"))
    print(f"{fid}: {len(cands)} notas ({fechas[0][:10] if fechas else '?'}..{fechas[-1][:10] if fechas else '?'}) DS={ {t: tipos.count(t) for t in set(tipos) if t} } ejemplos={[c['titulo'][:70] for c, t in zip(cands, tipos) if t][:3]}")

print("=== ComprasMX")
for u in ["https://comprasmx.buengobierno.gob.mx/robots.txt", "https://comprasmx.buengobierno.gob.mx/sitiopublico/"]:
    s, b, dt = pedir(u)
    print(u, s, len(b), b[:300])
    if u.endswith("/sitiopublico/") and s == 200:
        for js in re.findall(rb'src="([^"]+\.js)"', b)[:8]:
            ju = urllib.parse.urljoin(u, js.decode())
            s2, b2, _ = pedir(ju)
            apis = sorted(set(re.findall(rb'https?://[a-zA-Z0-9./_-]*(?:api|whitney|servicio|service)[a-zA-Z0-9./_-]*', b2)))[:30]
            rutas = sorted(set(re.findall(rb'"(/[a-zA-Z0-9_-]*(?:api|whitney|publico|procedimiento)[a-zA-Z0-9/_-]*)"', b2)))[:40]
            print("  JS", ju, s2, len(b2), apis, rutas)
for u in ["https://api.datos.gob.mx/v2/contratacionesabiertas?pageSize=1", "https://www.datos.gob.mx/busca/api/3/action/package_search?q=compranet&rows=5"]:
    s, b, dt = pedir(u); print(u, s, b[:300])

print("=== GIBS")
fin = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()); ini = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 4 * 3600))
for capa, m in [("Himawari_AHI_Band13_Clean_Infrared", "GoogleMapsCompatible_Level6"), ("GOES-West_ABI_Band13_Clean_Infrared", "GoogleMapsCompatible_Level6"),
                ("GOES-East_ABI_Band13_Clean_Infrared", "GoogleMapsCompatible_Level6"), ("GOES-East_ABI_GeoColor", "GoogleMapsCompatible_Level7"),
                ("IMERG_Precipitation_Rate_30min", "GoogleMapsCompatible_Level6"), ("TEMPO_L3_NO2_Vertical_Column_Troposphere", "GoogleMapsCompatible_Level6")]:
    u = f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/{capa}/default/{m}/all/{ini}--{fin}.xml"
    s, b, dt = pedir(u)
    print(f"dominio {capa}: {s} {dt:.1f}s {b[-400:]!r}")
u = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml"
s, b, dt = pedir(u, t=90)
i = b.find(b"TEMPO_L3_NO2_Vertical_Column_Troposphere")
print("caps", s, f"{dt:.1f}s", b[i-200:i+1800] if i > 0 else "no TEMPO")
