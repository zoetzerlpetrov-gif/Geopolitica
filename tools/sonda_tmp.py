import json, subprocess, time, urllib.parse, urllib.request
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica; sonda)"
titulos = json.loads(subprocess.check_output(["node", "--input-type=module", "-e",
  "import('./js/imagen_tipo.js').then(m=>console.log(JSON.stringify(m.todosLosArticulos())))"]))
print(len(titulos), "artículos")
for t in titulos:
    url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(t.replace(" ", "_"), safe="")
    try:
        d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30))
        src = (d.get("thumbnail") or {}).get("source", "")
        ok = "/wikipedia/commons/" in src
        print(("OK  " if ok else "MAL ") + t, "→", d.get("title"), d.get("type"), src[-70:] if src else "SIN IMAGEN")
    except Exception as e:
        print("ERR", t, e)
    time.sleep(0.3)
