import subprocess
def c(u, n=900):
    r = subprocess.run(["curl", "-s", "-L", "-m", "40", "-A", "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)", "-w", "\n[HTTP %{http_code}]", u], capture_output=True, text=True)
    print("==", u, "\n", r.stdout[:n].replace("\n", " | "))
c("https://www.who.int/api/news/diseaseoutbreaknews?sf_culture=en&$orderby=PublicationDateAndTime%20desc&$top=3&$select=Title,PublicationDateAndTime,UrlName", 1200)
c("https://wwwnc.cdc.gov/robots.txt", 500)
c("https://wwwnc.cdc.gov/travel/rss/notices.xml", 1500)
c("https://www.ecdc.europa.eu/robots.txt", 400)
c("https://www.ecdc.europa.eu/en/taxonomy/term/1310/feed", 800)
c("https://www.ecdc.europa.eu/en/rss.xml", 600)
