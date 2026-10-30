"""Sonda temporal 4: códigos COICOP 2018 de Eurostat y más rangos de INEGI (BISE)."""
import json, os, re, urllib.request
UA = {"User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(url, t=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=t) as r:
        return r.read()
def p(*a): print(*a, flush=True)
d = json.loads(get("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=EU27_2020&unit=RCH_A&format=JSON&lang=en&lastTimePeriod=1", 120))
cat = d["dimension"]["coicop18"]["category"]; idx = cat["index"]; lab = cat["label"]
vals = d.get("value", {})
for code, i in sorted(idx.items(), key=lambda x: x[1]):
    if re.search(r"restaurant|caf|hairdress|personal grooming|cleaning|repair.*cloth|cinema|cultural|recreation.*services|accommodation|package|tobacco|alcoholic", lab[code], re.I):
        p("COICOP18", code, "|", lab[code][:90], "|", vals.get(str(i)))
tok = os.environ.get("INEGI_TOKEN", "")
base = "https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml"
CL = re.compile(r"preparaci[oó]n de alimentos|restaurant|alojamiento|esparcimiento|cerveza|cemento|confianza|turis|viajeros|veh[ií]culos|servicios personales|"
                r"tortilla|indicador global|IGAE|consumo privado|precios al consumidor|salones|lavander|cines", re.I)
for ini, fin in [(721400, 724000), (701800, 702400), (6200000000, 6200000300), (454160, 454200), (6207061350, 6207061450), (6207129600, 6207129700)]:
    n = 0
    for a in range(ini, fin, 10):
        try:
            dd = json.loads(get(f"{base}/CL_INDICATOR/{','.join(str(x) for x in range(a, a + 10))}/es/BISE/2.0/{tok}?type=json", 40))
            for c in dd.get("CODE", []):
                n += 1
                if CL.search(c.get("Description", "")):
                    p(f"  BISE {c['value']} | {c['Description'][:170]}")
        except Exception:
            pass
    p(f"rango {ini}-{fin}: {n}")
