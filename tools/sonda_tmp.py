import json, re, urllib.request
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica; sonda)"
def get(url, timeout=60, h=None):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, **(h or {})}), timeout=timeout) as r:
        return r.read(), dict(r.headers)
x, _ = get("https://gibs.earthdata.nasa.gov/colormaps/v1.3/OMPS_SO2_Planetary_Boundary_Layer.xml")
x = x.decode()
print("ColorMaps:", re.findall(r"<ColorMap[^E>][^>]*>", x))
ents = re.findall(r'rgb="([^"]+)"[^>]*?(?:value="([^"]*)")?[^>]*?/>', x)
print(len(ents))
for i, e in enumerate(re.findall(r'<ColorMapEntry[^>]*>', x)):
    if i < 20 or i % 12 == 0: print(i, e)
print("Legend:", re.findall(r'<Legend[^E][^>]*>', x), re.findall(r'<LegendEntry[^>]*>', x)[::10])
print("===== WP REST")
for u in ["https://webcamsdemexico.com/wp-json/wp/v2/webcam_category?per_page=100&_fields=id,name,slug,count,parent",
          "https://webcamsdemexico.com/wp-json/wp/v2/webcam_localidad?per_page=100&_fields=id,name,slug,count,parent",
          "https://webcamsdemexico.com/wp-json/wp/v2/webcammx?per_page=3"]:
    try:
        b, h = get(u, h={"Origin": "https://zoetzerlpetrov-gif.github.io"})
        print("--", u, len(b), "CORS:", h.get("Access-Control-Allow-Origin"), "total:", h.get("X-WP-Total"))
        d = json.loads(b)
        if "webcammx" in u:
            for c in d:
                print(json.dumps({k: (v if k not in ("content", "excerpt", "yoast_head", "yoast_head_json") else str(v)[:300]) for k, v in c.items()}, ensure_ascii=False)[:2500])
                print("   yt en content:", re.findall(r'youtube\.com/embed/([\w-]+)|youtu\.be/([\w-]+)|"([\w-]{11})"', json.dumps(c))[:5])
        else:
            print(json.dumps(d, ensure_ascii=False)[:3000])
    except Exception as e:
        print("--", u, "ERR", e)
