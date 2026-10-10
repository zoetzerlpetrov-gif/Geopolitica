"""Sonda temporal: feeds de medios y dependencias mexicanas (robots.txt, respuesta, títulos)."""
import os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ingest"))
import fuentes as F
C = [
 ("La Jornada política", "https://www.jornada.com.mx/rss/politica.xml?v=1"),
 ("La Jornada economía", "https://www.jornada.com.mx/rss/economia.xml?v=1"),
 ("La Jornada estados", "https://www.jornada.com.mx/rss/estados.xml?v=1"),
 ("La Jornada sociedad", "https://www.jornada.com.mx/rss/sociedad.xml?v=1"),
 ("Infobae México", "https://www.infobae.com/arc/outboundfeeds/rss/category/mexico/"),
 ("Aristegui", "https://aristeguinoticias.com/feed/"),
 ("El Economista", "https://www.eleconomista.com.mx/rss/ultimas-noticias"),
 ("El Economista 2", "https://www.eleconomista.com.mx/rss/"),
 ("El Financiero", "https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml"),
 ("Expansión", "https://expansion.mx/rss"),
 ("Expansión política", "https://politica.expansion.mx/rss"),
 ("Forbes México", "https://www.forbes.com.mx/feed/"),
 ("El Sol de México", "https://www.elsoldemexico.com.mx/rss.xml"),
 ("Milenio", "https://www.milenio.com/rss"),
 ("Animal Político", "https://www.animalpolitico.com/feed/"),
 ("Proceso", "https://www.proceso.com.mx/rss/"),
 ("SinEmbargo", "https://www.sinembargo.mx/feed"),
 ("Latinus", "https://latinus.us/feed/"),
 ("Reporte Índigo", "https://www.reporteindigo.com/feed/"),
 ("Zeta Tijuana", "https://zetatijuana.com/feed/"),
 ("Noroeste", "https://www.noroeste.com.mx/rss"),
 ("Ríodoce", "https://riodoce.mx/feed/"),
 ("Pie de Página", "https://piedepagina.mx/feed/"),
 ("El Heraldo de México", "https://heraldodemexico.com.mx/rss/feed.html?r=1"),
 ("Banxico comunicados", "https://www.banxico.org.mx/rsscb/rss?BMXC_canal=pressRelease&BMXC_idioma=es"),
 ("Banxico tipo de cambio", "https://www.banxico.org.mx/rsscb/rss?BMXC_canal=fix&BMXC_idioma=es"),
 ("gob.mx Presidencia prensa", "https://www.gob.mx/presidencia/es/archivo/prensa.rss"),
 ("gob.mx Pemex prensa", "https://www.gob.mx/pemex/es/archivo/prensa.rss"),
 ("gob.mx SSPC prensa", "https://www.gob.mx/sspc/es/archivo/prensa.rss"),
 ("gob.mx SHCP prensa", "https://www.gob.mx/shcp/es/archivo/prensa.rss"),
 ("gob.mx SENER prensa", "https://www.gob.mx/sener/es/archivo/prensa.rss"),
 ("Google Noticias MX (no usar, solo referencia)", "https://news.google.com/rss?hl=es-419&gl=MX&ceid=MX:es-419"),
]
for nombre, url in C:
    t = time.time()
    try:
        ok = F.permitido_por_robots(url)
        if not ok:
            print(f"ROBOTS_NO | {nombre} | {url}"); continue
        items = F.parsear_rss(F.get(url, timeout=30), {"nombre": nombre, "tipo": "noticia", "idioma": "es"})
        print(f"OK {len(items):3d} | {nombre} | {url} | {time.time()-t:.1f}s | " + " || ".join(i['titulo'][:70] + ' @' + i['fecha_utc'] for i in items[:2]))
    except Exception as e:
        print(f"ERROR | {nombre} | {url} | {type(e).__name__}: {str(e)[:120]}")
