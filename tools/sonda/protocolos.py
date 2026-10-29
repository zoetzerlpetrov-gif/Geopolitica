import urllib.request, sys
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
URLS = [
 "https://travel.state.gov/_res/rss/TAsTWs.xml",
 "https://www.dhs.gov/ntas/1.1/feed.xml",
 "https://www.dhs.gov/ntas/1.0/feed.xml",
 "https://www.mi5.gov.uk/UKThreatLevel/UKThreatLevel.xml",
 "https://www.mi5.gov.uk/rss/threat-level",
 "https://data.international.gc.ca/travel-voyage/index-alpha-eng.json",
 "https://ofac.treasury.gov/recent-actions/rss.xml",
 "https://ofac.treasury.gov/system/files/126/ofac.xml",
 "https://www.cisa.gov/cybersecurity-advisories/all.xml",
 "https://www.sgdsn.gouv.fr/vigipirate",
]
for u in URLS:
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=30) as r:
            b = r.read(400000)
            print("OK", r.status, len(b), r.headers.get("Content-Type"), u)
            print("   ", b[:700].decode("utf-8", "replace").replace("\n", " ")[:700])
    except Exception as e:
        print("ERR", u, type(e).__name__, str(e)[:120])
