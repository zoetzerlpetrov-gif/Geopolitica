"""Sonda temporal: datos públicos de las páginas de desarrolladoras (se borra antes del PR). Respeta robots.txt."""
import html, re, urllib.parse, urllib.request, urllib.robotparser
UA = "DOMINUS-OSINT/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
URLS = ["https://granjas300residencial.grupocorintio.com/", "https://www.elements.com.mx/elements-departamentos.php",
        "https://javer.com.mx/desarrollos/fiore-residencial", "https://kanat.mx/"]
CLAVES = r"(calle|av\.|avenida|col\.|colonia|calz|alcald|municipio|c\.p\.|cp |\$\s?[\d,.]+|desde|m2|m²|rec[aá]mara|entrega|preventa|ubicad|direcci)"


def bajar(u):
    req = urllib.request.Request(u, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace"), r.geturl()


for u in URLS:
    print("==", u)
    p = urllib.parse.urlparse(u)
    rp = urllib.robotparser.RobotFileParser(f"{p.scheme}://{p.netloc}/robots.txt")
    try:
        rp.read()
        if not rp.can_fetch(UA, u):
            print("  robots.txt no lo permite"); continue
    except Exception as e:
        print("  robots:", e)
    try:
        h, final = bajar(u)
    except Exception as e:
        print("  ERROR", e); continue
    print("  final:", final, len(h))
    for m in re.findall(r"(?:@|q=|ll=|center=|daddr=|destination=)(-?\d{1,2}\.\d{3,}),\s?(-?\d{2,3}\.\d{3,})", h)[:5]:
        print("  coord:", m)
    for m in re.findall(r"maps\.google[^\"' ]{0,200}|google\.com/maps[^\"' ]{0,200}|goo\.gl/maps[^\"' ]{0,60}|maps\.app\.goo\.gl[^\"' ]{0,40}", h)[:6]:
        print("  mapa:", html.unescape(m)[:200])
    t = html.unescape(re.sub(r"<[^>]+>", "\n", re.sub(r"(?s)<(script|style)[^>]*>.*?</\1>", " ", h)))
    lineas = [re.sub(r"\s+", " ", l).strip() for l in t.splitlines()]
    vistas = set()
    for l in lineas:
        if 4 < len(l) < 160 and re.search(CLAVES, l, re.I) and l not in vistas:
            vistas.add(l); print("  ·", l)
        if len(vistas) > 45:
            break
    for m in re.findall(r'href="([^"]+)"', h):
        if re.search(r"desarroll|proyecto|torre|ubica|contact|precio|modelo", m, re.I) and len(vistas) < 200:
            print("  link:", m[:150]); vistas.add(m)
