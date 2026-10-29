"""Sonda temporal: ¿responden los sustitutos comerciales sin llave ni pago?"""
import json, urllib.request, urllib.error, datetime
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
hoy = datetime.datetime.utcnow() - datetime.timedelta(hours=8)
d = hoy.strftime("%Y%m%d")
OV = "https://overpass-api.de/api/interpreter?data=" + urllib.parse.quote('[out:json][timeout:60];way["submarine"="yes"]["communication"="line"](10,-100,32,-60);out count;') if False else None
import urllib.parse
P = [
 ("feodo", "https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json", None),
 ("threatfox_sin_llave", "https://threatfox-api.abuse.ch/api/v1/", json.dumps({"query": "get_iocs", "days": 1}).encode()),
 ("overpass_cables", "https://overpass-api.de/api/interpreter?data=" + urllib.parse.quote('[out:json][timeout:60];way["submarine"="yes"]["communication"="line"](10,-100,32,-60);out count;'), None),
 ("overpass_cables_mundo", "https://overpass-api.de/api/interpreter?data=" + urllib.parse.quote('[out:json][timeout:120];way["submarine"="yes"]["communication"="line"];out count;'), None),
 ("ofac_sdn", "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV", None),
 ("onu", "https://scsanctions.un.org/resources/xml/en/consolidated.xml", None),
 ("ue", "https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw", None),
 ("adsblol_mil", "https://api.adsb.lol/v2/mil", None),
 ("adsblol_punto", "https://api.adsb.lol/v2/point/21.0/-89.6/100", None),
 ("gibs_caps", "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml", None),
 ("cdse_catalogo", "https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$top=1&$filter=" + urllib.parse.quote("Collection/Name eq 'SENTINEL-2'"), None),
 ("cdse_wms_sin_llave", "https://sh.dataspace.copernicus.eu/ogc/wms/x?SERVICE=WMS&REQUEST=GetCapabilities", None),
 ("metno_pronostico", "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=21.28&lon=-89.66", None),
 ("metno_oceano_yucatan", "https://api.met.no/weatherapi/oceanforecast/2.0/complete?lat=21.4&lon=-89.7", None),
 ("nomads_gfs", f"https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl?dir=%2Fgfs.{d}%2F00%2Fatmos&file=gfs.t00z.pgrb2.0p25.f003&var_UGRD=on&var_VGRD=on&lev_10_m_above_ground=on&subregion=&toplat=22&leftlon=269&rightlon=272&bottomlat=20", None),
 ("nomads_olas", f"https://nomads.ncep.noaa.gov/cgi-bin/filter_gfswave.pl?dir=%2Fgfs.{d}%2F00%2Fwave%2Fgridded&file=gfswave.t00z.global.0p25.f003.grib2&var_HTSGW=on&var_PERPW=on&subregion=&toplat=22&leftlon=269&rightlon=272&bottomlat=20", None),
 ("geonames_dump", "https://download.geonames.org/export/dump/MX.zip", None),
 ("openaq_sin_llave", "https://api.openaq.org/v3/locations?limit=1", None),
 ("cams_ads", "https://ads.atmosphere.copernicus.eu/api/catalogue/v1/collections", None),
 ("eox_2016", "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/3/3/2.jpg", None),
 ("gfw_visor", "https://globalfishingwatch.org/map", None),
]
for n, u, body in P:
    try:
        r = urllib.request.Request(u, data=body, headers={"User-Agent": UA, "Accept": "*/*"})
        with urllib.request.urlopen(r, timeout=90) as x:
            b = x.read(400000 if n != "geonames_dump" else 2000)
            print(f"OK {n} {x.status} {x.headers.get('Content-Type')} {len(b)}B :: {b[:220]!r}")
    except urllib.error.HTTPError as e:
        print(f"HTTP {n} {e.code} :: {e.read(300)!r}")
    except Exception as e:
        print(f"ERR {n} {type(e).__name__} {e}")
