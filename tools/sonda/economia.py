"""Sonda temporal 3: identificadores de INEGI (BISE) por rangos y cuadros del INPC en Banxico; HICP nuevo de Eurostat."""
import json, os, re, sys, urllib.request, html
UA = {"User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(url, t=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=t) as r:
        return r.read()
def p(*a): print(*a, flush=True)
tok = os.environ.get("INEGI_TOKEN", "")
base = "https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml"

# ¿Acepta varios identificadores separados por coma?
try:
    b = get(f"{base}/CL_INDICATOR/720066,720069/es/BISE/2.0/{tok}?type=json"); p("multi", b[:300])
    MULTI = b.count(b'"value"') >= 2
except Exception as e:
    p("multi ERROR", e); MULTI = False
CLAVES = re.compile(r"fonda|taquer|loncher|cerveza|cemento|confianza del consumidor|indicador global de la actividad|preparaci[oó]n de alimentos|esparcimiento|"
                    r"tortilla|huevo|cine|alojamiento|hotel|turis|viajeros|veh[ií]culos ligeros|autom[oó]viles|consumo privado|INPC|precios al consumidor|"
                    r"servicios personales|salones|peluquer|lavander", re.I)
def escanear(ini, fin, paso=10):
    n = 0
    for a in range(ini, fin, paso):
        ids = ",".join(str(x) for x in range(a, a + paso)) if MULTI else str(a)
        try:
            d = json.loads(get(f"{base}/CL_INDICATOR/{ids}/es/BISE/2.0/{tok}?type=json", t=40))
            for c in d.get("CODE", []):
                n += 1
                if CLAVES.search(c.get("Description", "")):
                    p(f"  BISE {c['value']} | {c['Description'][:160]}")
        except Exception:
            pass
    p(f"rango {ini}-{fin}: {n} indicadores con nombre")
if MULTI:
    for ini, fin in [(719800, 721400), (628100, 628400), (910300, 910500), (454000, 454300), (736800, 737300), (6207000000, 6207000200)]:
        escanear(ini, fin)

# Banxico: lista de cuadros del sector precios (8) y el que tenga genéricos del INPC
try:
    h = get("https://www.banxico.org.mx/SieInternet/consultarDirectorioInternetAction.do?accion=consultarDirectorioCuadros&sector=8&sectorDescripcion=Precios&locale=es", 90).decode("utf-8", "replace")
    cuadros = sorted(set(re.findall(r"idCuadro=(CP\d+)", h)))
    p("Banxico cuadros precios:", cuadros[:80])
    for m in re.finditer(r"idCuadro=(CP\d+)[^>]*>([^<]{3,140})", h):
        p("  ", m.group(1), html.unescape(m.group(2)).strip()[:120])
except Exception as e:
    p("Banxico directorio ERROR", type(e).__name__, str(e)[:120])
for cp in ["CP154", "CP155", "CP156", "CP157", "CP158", "CP160", "CP161", "CP162", "CP163", "CP164"]:
    try:
        h = html.unescape(get(f"https://www.banxico.org.mx/SieInternet/consultarDirectorioInternetAction.do?sector=8&accion=consultarCuadro&idCuadro={cp}&locale=es", 90).decode("utf-8", "replace"))
        t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h))
        tit = re.search(r"(Índice[^|]{0,120})", t)
        hits = [(m.group(0), re.findall(r"SP\d{3,6}", h[max(0, m.start()-600):m.end()+50])[-1:] ) for m in re.finditer(r"fondas|taquer|cerveza|tortilla|huevo|cine|corte de cabello|tintorer", h, re.I)]
        p(cp, len(h), (tit.group(1)[:100] if tit else ""), hits[:12])
    except Exception as e:
        p(cp, "ERROR", type(e).__name__)

# Eurostat: HICP después de 2025
for q in ["prc_hicp_manr?geo=EU27_2020&coicop=CP00&unit=RCH_A", "prc_hicp_minr?geo=EU27_2020&coicop18=TOTAL&unit=RCH_A", "prc_hicp_minr?geo=EU27_2020",
          "prc_hicp_manr?geo=EU27_2020&coicop18=TOTAL", "prc_hicp_mmor?geo=EU27_2020&coicop=CP00", "ei_cphi_m?geo=EU27_2020&indic=CP-HI00&unit=RT12"]:
    try:
        d = json.loads(get("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/" + q + "&format=JSON&lang=en&lastTimePeriod=1"))
        dims = {k: list(d["dimension"][k]["category"]["index"].keys())[:6] for k in d.get("id", []) if k != "time"}
        p("EU", q[:60], list(d["dimension"]["time"]["category"]["index"].keys()), list(d.get("value", {}).values())[:3], dims)
    except Exception as e:
        p("EU", q[:60], "ERROR", type(e).__name__, str(e)[:80])
