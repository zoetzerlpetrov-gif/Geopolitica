"""Sonda temporal: descubre y verifica series para la sección de economía (no se fusiona)."""
import csv, io, json, os, re, urllib.request

UA = {"User-Agent": "DOMINUS-OSINT/1.0 (investigacion; contacto via github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(url, headers=None, t=60):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=t) as r:
        return r.read()

def p(*a): print(*a, flush=True)

# 1) INEGI: catálogo completo del BIE y BISE, filtrado por palabras clave
tok = os.environ.get("INEGI_TOKEN", "")
p("INEGI token presente:", bool(tok))
claves = ["fondas", "taquer", "loncher", "cerveza", "cemento", "confianza del consumidor", "indicador global de la actividad",
          "índice general", "indice general", "restaurantes", "esparcimiento", "viajeros internacionales", "ocupación hotelera",
          "vehículos ligeros", "tortilla", "huevo", "corte de cabello", "tintorer", "lavander", "cine", "canasta", "producto interno bruto",
          "inflación", "papel", "cartón", "carton", "servicios personales", "autoservicio", "producción industrial", "actividad industrial"]
for fuente in ("BIE", "BISE"):
    try:
        raw = get(f"https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/CL_INDICATOR//es/{fuente}/2.0/{tok}?type=json", t=180)
        d = json.loads(raw)
        cods = d.get("CODE", [])
        p(f"INEGI {fuente}: {len(cods)} indicadores en el catálogo")
        for c in cods:
            desc = str(c.get("Description", ""))
            dl = desc.lower()
            if any(k in dl for k in claves):
                p(f"  {fuente} {c.get('value')} | {desc[:170]}")
    except Exception as e:
        p(f"INEGI {fuente} ERROR {type(e).__name__}: {str(e)[:200]}")

# 2) BLS: lista de artículos del INPC de EUA (para armar IDs de FRED CUSR0000/CUUR0000)
try:
    t = get("https://download.bls.gov/pub/time.series/cu/cu.item", {"User-Agent": "DOMINUS-OSINT investigacion zoetzerl.research@users.noreply.github.com"}).decode("utf-8", "replace")
    for l in t.splitlines():
        if re.search(r"cosmetic|haircut|dry clean|laundry|underwear|admission to movies|eggs|men's apparel|personal care", l, re.I):
            p("  BLS", l.strip()[:150])
except Exception as e:
    p("BLS ERROR", type(e).__name__, str(e)[:200])

# 3) FRED: verifica candidatos (último dato)
fred = ["T10Y2Y", "SAHMREALTIME", "PCOPPUSDM", "IPG32221S", "IPN32221N", "RAILFRTCARLOADSD11", "RAILFRTINTERMODAL", "TRUCKD11",
        "APU0000708111", "IPG336214S", "IPN336214N", "IPG336213S", "CUSR0000SEGB", "CUSR0000SEGB02", "CUSR0000SEGD01", "CUSR0000SEGD03",
        "CUSR0000SERF02", "CUSR0000SAA1", "CUSR0000SEAA03", "CUSR0000SEAA", "MRTSSM722USS", "MRTSSM4451USS", "GDPC1", "A191RL1Q225SBEA",
        "FEDFUNDS", "DFF", "INDPRO", "DEXMXUS", "CSCICP03MXM665S", "MEXCPIALLMINMEI", "MEXRGDPEXP"]
for s in fred:
    try:
        rows = list(csv.reader(io.StringIO(get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={s}").decode())))
        p(f"  FRED {s}: {len(rows)-1} filas, último {rows[-1]}")
    except Exception as e:
        p(f"  FRED {s} ERROR {type(e).__name__} {str(e)[:80]}")

# 4) Eurostat: candidatos
eu = {
    "hicp_rest": "prc_hicp_manr?geo=EU27_2020&coicop=CP1111&unit=RCH_A",
    "hicp_pelu": "prc_hicp_manr?geo=EU27_2020&coicop=CP1211&unit=RCH_A",
    "hicp_tinto": "prc_hicp_manr?geo=EU27_2020&coicop=CP0314&unit=RCH_A",
    "hicp_cine": "prc_hicp_manr?geo=EU27_2020&coicop=CP0942&unit=RCH_A",
    "hicp_total": "prc_hicp_manr?geo=EU27_2020&coicop=CP00&unit=RCH_A",
    "papel": "sts_inpr_m?geo=EU27_2020&nace_r2=C17&s_adj=SCA&unit=I21&indic_bt=PRD",
    "papel2": "sts_inpr_m?geo=EU27_2020&nace_r2=C17&s_adj=SCA&unit=I15&indic_bt=PROD",
    "indprod": "sts_inpr_m?geo=EU27_2020&nace_r2=B-D&s_adj=SCA&unit=I21&indic_bt=PRD",
    "noches": "tour_occ_nim?geo=EU27_2020&c_resid=TOTAL&nace_r2=I551-I553&unit=NR",
    "pib": "namq_10_gdp?geo=EU27_2020&na_item=B1GQ&unit=CLV_PCH_PRE&s_adj=SCA",
    "esi": "ei_bssi_m_r2?geo=EU27_2020&indic=BS-ESI-I&s_adj=SA",
    "tren": "rail_go_qnatint?geo=EU27_2020",
}
for k, q in eu.items():
    try:
        d = json.loads(get("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/" + q + "&format=JSON&lang=en&lastTimePeriod=2"))
        times = list(d["dimension"]["time"]["category"]["index"].keys())
        p(f"  EU {k}: tiempos {times[-2:]} valores {list(d.get('value', {}).values())[-2:]} dims {d.get('id')}")
    except Exception as e:
        p(f"  EU {k} ERROR {type(e).__name__} {str(e)[:120]}")

# 5) GSCPI (Fed de NY)
for u in ["https://www.newyorkfed.org/medialibrary/research/interactives/gscpi/downloads/gscpi_data.xlsx",
          "https://www.newyorkfed.org/medialibrary/research/interactives/gscpi/downloads/gscpi_data.csv"]:
    try:
        b = get(u); p("  GSCPI", u[-20:], len(b), b[:60])
    except Exception as e:
        p("  GSCPI ERROR", u[-20:], type(e).__name__, str(e)[:100])

# 6) Banxico: candidatos
bk = os.environ.get("BANXICO_API_KEY", "")
for s in ["SF43718", "SF61745", "SE27803", "SL11298", "SG193", "SE5208", "SE5207"]:
    try:
        d = json.loads(get(f"https://www.banxico.org.mx/SieAPIRest/service/v1/series/{s}/datos/oportuno", {"Bmx-Token": bk, "Accept": "application/json"}))
        se = d["bmx"]["series"][0]
        p(f"  BANXICO {s}: {se.get('titulo','')[:110]} | {se.get('datos')}")
    except Exception as e:
        p(f"  BANXICO {s} ERROR {type(e).__name__} {str(e)[:80]}")
