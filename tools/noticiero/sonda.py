"""Sonda temporal (se borra antes del PR): fuentes candidatas y clasificación de GDELT."""
import json, os, sys, urllib.request, urllib.error
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F

CAND = [("oro", "BullionVault", "https://www.bullionvault.com/gold-news/rss.do"), ("oro", "Gold.org", "https://www.gold.org/rss.xml"),
        ("metales", "Mining Technology", "https://www.mining-technology.com/feed/"), ("metales", "Northern Miner", "https://www.northernminer.com/feed/"),
        ("metales", "Rumbo Minero", "https://www.rumbominero.com/feed/"), ("metales", "Mining Weekly", "https://www.miningweekly.com/page/rss"),
        ("inmobiliario", "Real Estate Market", "https://realestatemarket.com.mx/feed"), ("inmobiliario", "The Real Deal", "https://therealdeal.com/feed/"),
        ("organismos", "Banco Mundial", "https://www.worldbank.org/en/news/all?format=rss"), ("organismos", "OMC", "https://www.wto.org/library/rss/latest_news_e.xml"),
        ("salud", "CIDRAP", "https://www.cidrap.umn.edu/rss.xml"), ("salud", "OPS", "https://www.paho.org/es/rss.xml"),
        ("politica_mx", "Animal Político", "https://animalpolitico.com/feed"), ("politica_mx", "Milenio", "https://www.milenio.com/rss"),
        ("politica_mx", "SinEmbargo", "https://www.sinembargo.mx/feed"), ("politica_mx", "Nexos", "https://www.nexos.com.mx/?feed=rss2"),
        ("politica_mx", "El Sol de México", "https://www.elsoldemexico.com.mx/rss.xml"), ("politica_mx", "El Economista política", "https://www.eleconomista.com.mx/rss/politica"),
        ("politica_mx", "Aristegui", "https://aristeguinoticias.com/feed"), ("politica_mx", "Latinus", "https://latinus.us/feed/"),
        ("politica_mx", "Letras Libres", "https://letraslibres.com/feed/"), ("politica_mx", "Excélsior", "https://www.excelsior.com.mx/rss.xml"),
        ("sectores", "T21", "https://t21.com.mx/feed/"), ("sectores", "Automotive News", "https://www.autonews.com/rss.xml"),
        ("sectores", "AgroSíntesis", "https://www.agrosintesis.com/feed/"), ("clima", "Meteored", "https://www.meteored.mx/noticias/rss.xml"),
        ("nearshoring", "México Industry", "https://mexicoindustry.com/feed/"), ("cbdc", "Atlantic Council", "https://www.atlanticcouncil.org/feed/"),
        ("bonos", "Banxico comunicados", "https://www.banxico.org.mx/rss/comunicados-prensa.xml"), ("indicadores", "INEGI", "https://www.inegi.org.mx/rss/novedades.xml")]
for sec, nom, url in CAND:
    try:
        if not F.permitido_por_robots(url):
            print(f"ROBOTS {sec} {nom}"); continue
        its = F.parsear_rss(F.get(url, timeout=30), {"nombre": nom, "tipo": "x"})
        print(f"OK {len(its)} {sec} {nom} | {its[0]['fecha_utc'] if its else ''} {its[0]['titulo'][:70] if its else ''}")
    except Exception as e:
        print(f"FALLA {sec} {nom} {str(e)[:100]}")

print("=== Cripto")
for u in ["https://api.bitso.com/v3/ticker/?book=btc_mxn", "https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,XRPUSD,XLMUSD",
          "https://api.coinbase.com/v2/prices/BTC-USD/spot", "https://api.exchange.coinbase.com/products/BTC-USD/stats"]:
    ok = F.permitido_por_robots(u)
    try:
        print(u, ok, F.get(u, timeout=20)[:400])
    except Exception as e:
        print(u, ok, e)

print("=== Noticiero (GDELT)")
sys.path.insert(0, os.path.dirname(__file__))
import noticiero as N
cfg = json.load(open(N.CONF))
reglas = N.reglas_de(cfg)
notas, err = N.de_gkg(reglas, 6)
print(len(notas), "notas", err)
for s in cfg["secciones"]:
    ns = [n for n in notas if s["id"] in n["s"]]
    print(f"## {s['id']} {len(ns)}")
    for n in ns[:7]:
        print("    ", n["m"], "|", n["t"][:110])
