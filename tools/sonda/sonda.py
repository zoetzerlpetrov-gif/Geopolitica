"""Sonda temporal: APIs de cámaras que respondieron 400/403 (¿parámetros o llave?)."""
import urllib.request
UA = "Geopolitica-monitor (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
for u in [
    "https://511on.ca/api/v2/get/cameras?format=json&lang=en",
    "https://511.alberta.ca/api/v2/get/cameras?format=json&lang=en",
    "https://www.nvroads.com/api/v2/get/cameras?format=json",
    "https://511ga.org/api/v2/get/cameras?format=json",
    "https://511ny.org/api/getcameras?format=json",
    "https://www.az511.com/api/v2/get/cameras?format=json",
    "https://www.quebec511.info/Carte/Fonctions/Cameras.ashx",
    "https://www.donneesquebec.ca/recherche/api/3/action/package_search?q=camera%20trafic",
    "https://wsdot.wa.gov/Traffic/api/HighwayCameras/HighwayCamerasREST.svc/GetCamerasAsJson",
    "https://api.windy.com/webcams/api/v3/webcams?limit=1",
]:
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json"}), timeout=15)
        print("OK", r.status, u, r.read(300).decode("utf-8", "replace").replace("\n", " "))
    except Exception as e:
        cuerpo = ""
        try:
            cuerpo = e.read(300).decode("utf-8", "replace").replace("\n", " ")
        except Exception:
            pass
        print("ERR", getattr(e, "code", ""), u, cuerpo or str(e)[:120])
