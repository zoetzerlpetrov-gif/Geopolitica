import html, re, urllib.request
UA = "Mozilla/5.0 (compatible; Geopolitica-monitor/1.0; +https://github.com/zoetzerlpetrov-gif/Geopolitica)"
URLS = ["https://www.fortinet.com/lat/resources/cyberglossary/types-of-phishing-attacks",
        "https://www.trendmicro.com/es_es/what-is/phishing/types-of-phishing.html",
        "https://www.conekta.com/blog/fraudes-por-internet",
        "https://www.gob.mx/gncertmx/articulos/y-tu-conoces-los-tipos-de-fraudes-en-linea",
        "https://www.condusef.gob.mx/?p=tipos-de-fraude",
        "https://www.unir.net/revista/ciencias-seguridad/fraudes-internet/",
        "https://www.bbva.com/es/innovacion/phishing-vishing-smishing-que-son-y-como-protegerse-de-estas-amenazas/",
        "https://www.davibank.com/sala-de-prensa/educacion-financiera/modalidades-fraude",
        "https://unamglobal.unam.mx/global_revista/fraudes-digitales-ciberseguridad-proteccion-redes-apps-correos/"]
for u in URLS:
    try:
        x = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept-Language": "es-MX,es"}), timeout=40).read().decode("utf-8", "replace")
        x = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", x)
        tit = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", t))).strip() for t in re.findall(r"<h[2-4][^>]*>([\s\S]*?)</h[2-4]>", x)]
        strong = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", t))).strip() for t in re.findall(r"<(?:strong|b)>([\s\S]{3,80}?)</(?:strong|b)>", x)]
        print("=====", u, len(x))
        print("  H:", [t for t in tit if 2 < len(t) < 120][:45])
        print("  B:", [t for t in strong if 2 < len(t) < 80][:40])
    except Exception as e:
        print("=====", u, "ERR", e)
