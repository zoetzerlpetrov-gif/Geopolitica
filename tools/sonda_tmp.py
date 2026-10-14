import json, subprocess, time, urllib.parse, urllib.request
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica; sonda)"
titulos = ["IE 22000 Class", "Rail transport in Norway", "Vy (transport company)", "GLONASS-M", "GLONASS-K", "BeiDou-3", "Workboat", "Ship's tender",
  "VIP aircraft", "Boeing VC-25", "Airbus A220", "Boeing 737 MAX", "Boeing 737 Next Generation", "Airbus A320 family", "Airbus A320neo family", "Boeing 787 Dreamliner",
  "Boeing 777", "Boeing 747-400", "Boeing 747-8", "Airbus A350", "Airbus A380", "Airbus A330", "Embraer E-Jet family", "Bombardier CRJ700 series"]
print(len(titulos), "artículos")
for t in titulos:
    url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(t.replace(" ", "_"), safe="")
    try:
        d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30))
        src = (d.get("thumbnail") or {}).get("source", "")
        ok = "/wikipedia/commons/" in src
        print(("OK  " if ok else "MAL ") + t, "→", d.get("title"), src[:150] if src else "SIN IMAGEN")
    except Exception as e:
        print("ERR", t, e)
    time.sleep(0.3)
