"""Sonda temporal: fuentes abiertas de cámaras de tráfico y clima (sin llave)."""
import json
import urllib.request
import urllib.robotparser
import urllib.parse

UA = "Geopolitica-monitor (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
FUENTES = {
    "drivebc": "https://images.drivebc.ca/webcam/api/v1/webcams/",
    "singapur": "https://api.data.gov.sg/v1/transport/traffic-images",
    "hongkong": "https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml",
    "nz": "https://www.trafficnz.info/service/traffic/rest/4/cameras/all",
    "ontario": "https://511on.ca/api/v2/get/cameras",
    "alberta": "https://511.alberta.ca/api/v2/get/cameras",
    "quebec": "https://www.quebec511.info/Diffusion/Rss/GenererRss.aspx?type=cam",
    "wsdot": "https://data.wsdot.wa.gov/arcgis/rest/services/TravelCenter/TravelCenterCameras/FeatureServer/0/query?where=1%3D1&outFields=*&f=json&resultRecordCount=3",
    "iowa": "https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/Traffic_Cameras_View/FeatureServer/0/query?where=1%3D1&outFields=*&f=json&resultRecordCount=3",
    "nvroads": "https://www.nvroads.com/api/v2/get/cameras",
    "511ga": "https://511ga.org/api/v2/get/cameras",
    "chicago": "https://data.cityofchicago.org/resource/kxdb-9xfx.json?$limit=3",
    "irlanda_tii": "https://data.tii.ie/Datasets/TrafficCameras/trafficcameras.json",
    "noruega": "https://webkamera.atlas.vegvesen.no/public/kamera?id=0",
    "islandia": "https://gagnaveita.vegagerdin.is/api/vefmyndavelar2014_1",
    "eslovenia": "https://opendata.si/promet/cameras/",
    "taiwan": "https://tisvcloud.freeway.gov.tw/history/motc20/CCTV.xml",
    "windy_doc": "https://api.windy.com/webcams/api/v3/webcams",
}
for k, u in FUENTES.items():
    p = urllib.parse.urlparse(u)
    rp = urllib.robotparser.RobotFileParser()
    try:
        rp.parse(urllib.request.urlopen(urllib.request.Request(f"{p.scheme}://{p.netloc}/robots.txt", headers={"User-Agent": UA}), timeout=12).read().decode("utf-8", "replace").splitlines())
        rob = rp.can_fetch("Geopolitica-monitor", u)
    except Exception as e:
        rob = f"sin robots ({getattr(e, 'code', type(e).__name__)})"
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json, */*"}), timeout=12)
        b = r.read(3_000_000)
        print(k, r.status, r.headers.get("content-type"), len(b), "robots:", rob, "|", b[:500].decode("utf-8", "replace").replace("\n", " "))
    except Exception as e:
        print(k, "ERROR", getattr(e, "code", ""), str(e)[:120], "robots:", rob)
