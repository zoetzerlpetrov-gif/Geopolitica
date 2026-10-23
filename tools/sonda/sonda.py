"""Sonda temporal: datos públicos de las páginas de desarrolladoras (se borra antes del PR). Respeta robots.txt."""
import html, re, time, urllib.parse, urllib.request, urllib.robotparser
UA = "DOMINUS-OSINT/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
URLS = ['https://www.elements.com.mx/elements-contacto.php', 'https://www.elements.com.mx/elements-proyecto.php', 'https://risetower.mx/', 'https://www.ametria.mx/property/heroes-47-centro', 'https://www.grupobinder.com/property/estrena-departamento-en-torre-una-en-el-corazon-de-monterrey', 'https://century21mexico.com/es_ar/propiedad/457930_departamento-en-es_arventa-en-desarrollo-urbano-reforma-monterrey-nuevo-leon-mexico', 'https://www.jmgrouprealestate.com/property/torre-rise-departamento-en-preventa', 'https://century21mexico.com/en_us/propiedad/528615_casa-en-en_usventa-en-contry-las-aguilas-guadalupe-nuevo-leon-mexico', 'https://aeinl.easybroker.com/property/residencial-las-aguilas-contry-sol', 'https://d7-bienes-raices.easybroker.com/properties/mexico/nuevo-leon/monterrey', 'https://www.jmgrouprealestate.com/property/departamentos-venta-nuevo-sur-monterrey', 'https://century21mexico.com/propiedad/576686_departamento-en-venta-en-nuevo-sur-monterrey-nuevo-leon', 'https://www.realtyworld.com.mx/property/53200', 'https://monterreyskyline.com/property/invierte-cerca-del-tec-de-monterrey/', 'https://monterreyskyline.com/property/departamentos-en-preventa-cerca-del-tec-de-monterrey-2/', 'https://www.jmgrouprealestate.com/property/departamento-en-renta-panta-baja-en-nuevo-sur-monterrey-n-l', 'https://www.realtyworld.com.mx/property/46064', 'https://century21mexico.com/en-us/property/601914', 'https://aeinl.easybroker.com/property/las-yucas-apodaca', 'https://www.jmgrouprealestate.com/property/departamentos-en-venta-zona-valle-oriente-san-pedro-garza-garcia-n-l', 'https://www.ametria.mx/property/departamentos-valle-oriente-zona-valle-oriente-san-pedro-garza-garcia', 'https://www.realtyworld.com.mx/property/47336', 'https://www.jmgrouprealestate.com/property/casa-en-renta-sierra-del-valle-san-pedro-garza-garcia', 'https://www.ametria.mx/property/colonial-de-la-sierra-9295e7c6-ec13-49d4-967e-0a46e6869831', 'https://www.ametria.mx/property/casa-residencial-san-mateo', 'https://www.jmgrouprealestate.com/property/departamento-en-venta-torre-shiro-eugenio-garza-sada-monterrey-n-l', 'https://www.ametria.mx/property/pre-venta-departamento-zona-tec-carretera-nacional', 'https://javer.com.mx/fraccionamientos/nuevo-leon/valle-condesa-sector-frances', 'https://javer.com.mx/desarrollos/el-jaral', 'https://www.javer.com.mx/fraccionamiento.php?fid=20', 'https://javer.com.mx/fraccionamientos/nuevo-leon']
CLAVES = r"(calle|av\.|avenida|col\.|colonia|calz|alcald|municipio|c\.p\.|cp |\$\s?[\d,.]+|desde|m2|m²|rec[aá]mara|entrega|preventa|ubicad|direcci)"


def bajar(u):
    req = urllib.request.Request(u, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace"), r.geturl()


for u in URLS:
    time.sleep(2)
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
        if len(vistas) > 30:
            break
    for m in re.findall(r'(?:"lat(?:itude)?"\s*:\s*"?(-?\d+\.\d+)"?\s*,\s*"(?:lng|lon|longitude)"\s*:\s*"?(-?\d+\.\d+))', h)[:3]:
        print("  latlng:", m)
    for m in re.findall(r'data-lat="(-?[\d.]+)"[^>]*data-l(?:ng|on)="(-?[\d.]+)"', h)[:3]:
        print("  data-latlng:", m)
    if "javer.com.mx/fraccionamientos/nuevo-leon" == u.split("//")[1].replace("www.", "")[:len("javer.com.mx/fraccionamientos/nuevo-leon")] or u.endswith("nuevo-leon"):
        for m in sorted(set(re.findall(r'href="([^"]*(?:desarrollos|fraccionamientos)/[^"]+)"', h)))[:60]:
            print("  link:", m[:150])
