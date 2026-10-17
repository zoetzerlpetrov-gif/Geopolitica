import subprocess
U = ["https://www.theblackvault.com/documentarchive/?s=roswell", "https://www.cia.gov/readingroom/search/site/roswell",
     "https://vault.fbi.gov/search?SearchableText=roswell", "https://catalog.archives.gov/search?q=roswell",
     "https://search.wikileaks.org/?query=mexico", "https://www.documentcloud.org/app?q=roswell", "https://archive.org/search?query=roswell&sin=TXT",
     "https://nsarchive.gwu.edu/search?search_api_fulltext=mexico", "https://www.theblackvault.com/robots.txt", "https://www.cia.gov/robots.txt"]
for u in U:
    r = subprocess.run(["curl", "-s", "-L", "-m", "30", "-A", "Mozilla/5.0", "-o", "/tmp/x", "-w", "%{http_code} %{size_download} %{url_effective}", u], capture_output=True, text=True)
    t = open("/tmp/x", errors="ignore").read()
    import re
    m = re.search(r"<title>(.*?)</title>", t, re.S)
    print("==", u, "->", r.stdout, "|", (m.group(1).strip()[:90] if m else ""), "| roswell" if "oswell" in t else "")
