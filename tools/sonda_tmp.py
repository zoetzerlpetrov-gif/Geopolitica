import json, time, urllib.request
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def pedir(u):
    r = urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json, text/csv, */*"})
    with urllib.request.urlopen(r, timeout=90) as x:
        return x.status, x.headers.get("Content-Type"), x.read()
for u in ["https://api.unhcr.org/robots.txt",
          "https://api.unhcr.org/population/v1/population/?limit=5&year=2024&coa_all=true",
          "https://api.unhcr.org/population/v1/population/?limit=5&year=2024&coo_all=true",
          "https://fdw.fews.net/robots.txt",
          "https://fdw.fews.net/api/ipcphase/?format=json&country_code=SO&collection_schedule=ML1&limit=3",
          "https://fdw.fews.net/api/ipcpopulationsize/?format=json&limit=3",
          "https://api.ember-energy.org/robots.txt",
          "https://rsf.org/robots.txt",
          "https://www.ipcinfo.org/robots.txt"]:
    try:
        s, ct, b = pedir(u)
        print("==", u, s, ct, len(b)); print(b[:700].decode("utf-8", "replace").replace("\n", " | "))
    except Exception as e:
        print("==", u, e)
    time.sleep(2)
