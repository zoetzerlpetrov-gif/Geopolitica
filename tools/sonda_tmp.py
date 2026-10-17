import subprocess, json
def c(u, n=500, h=None):
    a = ["curl", "-s", "-L", "-m", "40", "-A", "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)", "-w", "\n[HTTP %{http_code} %{size_download}B]"]
    if h: a += ["-H", h]
    r = subprocess.run(a + [u], capture_output=True, text=True)
    print("==", u, "\n", r.stdout[:n].replace("\n", " | "), "...", r.stdout[-40:].replace("\n", " "))
c("https://tie.digitraffic.fi/api/weathercam/v1/stations", 700, "Digitraffic-User: Geopolitica-monitor")
c("https://cwwp2.dot.ca.gov/data/d7/cctv/cctvStatusD07.json", 900)
c("https://webcams.nyctmc.org/api/cameras", 600)
c("https://webcams.nyctmc.org/robots.txt", 300)
c("https://infocar.dgt.es/datex2/dgt/CCTVSiteTablePublication/all/content.xml", 700)
c("https://511on.ca/api/v2/get/cameras?format=json", 600)
c("https://511on.ca/robots.txt", 300)
c("https://cwwp2.dot.ca.gov/robots.txt", 300)
