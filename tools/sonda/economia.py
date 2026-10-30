"""Sonda temporal 2: identificadores de INEGI y Banxico (INPC por genérico), FRED de precios y robots.txt."""
import csv, io, json, os, re, sys, urllib.request
sys.path.insert(0, "ingest")
import fuentes as F

UA = {"User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(url, headers=None, t=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers={**UA, **(headers or {})}), timeout=t) as r:
        return r.read()
def p(*a): print(*a, flush=True)

for u in ["https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE", "https://fred.stlouisfed.org/searchresults/?st=haircut",
          "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_m",
          "https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR/1/es/0/false/BISE/2.0/x",
          "https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos",
          "https://www.banxico.org.mx/SieInternet/consultarDirectorioInternetAction.do?sector=8&accion=consultarCuadro&idCuadro=CP151&locale=es",
          "https://www.newyorkfed.org/medialibrary/research/interactives/gscpi/downloads/gscpi_data.xlsx",
          "https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/output-data/big-mac-full-index.csv"]:
    p("ROBOTS", F.permitido_por_robots(u), u[:110])

tok = os.environ.get("INEGI_TOKEN", "")
base = "https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml"
for url in [f"{base}/CL_INDICATOR/720066/es/BISE/2.0/{tok}?type=json", f"{base}/CL_INDICATOR/628194/es/BIE/2.0/{tok}?type=json",
            f"{base}/CL_INDICATOR//es/BIE/2.0/{tok}?type=json"]:
    try:
        b = get(url, t=120); p("INEGI CL", url.split("/CL_INDICATOR/")[1][:25], len(b), b[:400])
    except Exception as e:
        p("INEGI CL ERROR", url.split("/CL_INDICATOR/")[1][:25], type(e).__name__, str(e)[:100])

def inegi(i, fuente):
    try:
        d = json.loads(get(f"{base}/INDICATOR/{i}/es/0/true/{fuente}/2.0/{tok}?type=json", t=60))
        s = d["Series"][0]; o = s.get("OBSERVATIONS") or []
        meta = ""
        try:
            m = json.loads(get(f"{base}/CL_INDICATOR/{i}/es/{fuente}/2.0/{tok}?type=json", t=60)); meta = m["CODE"][0]["Description"]
        except Exception as e:
            meta = f"(sin nombre: {type(e).__name__})"
        p(f"  INEGI {fuente} {i}: {meta[:120]} | {s.get('LASTUPDATE')} | {o[0] if o else None}")
    except Exception as e:
        p(f"  INEGI {fuente} {i} ERROR {type(e).__name__} {str(e)[:60]}")
for i in ["628194", "910392", "910399", "454168", "454186", "737121", "736939", "735879", "494098", "720066", "6200093709", "214308", "216064", "702094", "444570"]:
    for f in ("BIE", "BISE"):
        inegi(i, f)

try:
    h = get("https://www.banxico.org.mx/SieInternet/consultarDirectorioInternetAction.do?sector=8&accion=consultarCuadro&idCuadro=CP151&locale=es", t=90).decode("latin-1", "replace")
    p("BANXICO CP151", len(h))
    for m in re.finditer(r"(fonda|taquer|loncher|cerveza|tortilla|huevo|corte de cabello|tintorer|cine|restaurant|pollo|refresco)", h, re.I):
        seg = h[max(0, m.start() - 400): m.end() + 100]
        ids = re.findall(r"SP\d{3,6}", seg)
        p("  BX", m.group(0), ids[-3:], re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", seg))[-160:])
except Exception as e:
    p("BANXICO CP151 ERROR", type(e).__name__, str(e)[:100])

for s in ["CUUR0000SEGB02", "CUUR0000SEGB", "CUSR0000SEGD02", "CUUR0000SEGD02", "CUUR0000SERF02", "CUUR0000SEAA04", "CUSR0000SEAA04", "CUUR0000SEGD03",
          "CUSR0000SEFV", "CUSR0000SAF11", "CUSR0000SEFV01", "CUUR0000SERF01", "CUSR0000SERF01", "IPG322S", "IPG3222S", "IPN3222N", "PCU322211322211",
          "WPU091403", "PCU3222113222110", "MEXPRCNTO01GPSAM", "MEXLOLITONOSTSAM", "IRLTLT01MXM156N", "INTDSRMXM193N", "CPALTT01MXM659N", "MEXCPICORMINMEI"]:
    try:
        rows = list(csv.reader(io.StringIO(get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={s}").decode())))
        p(f"  FRED {s}: {len(rows)-1} filas, último {rows[-1]}")
    except Exception as e:
        p(f"  FRED {s} ERROR {type(e).__name__}")
