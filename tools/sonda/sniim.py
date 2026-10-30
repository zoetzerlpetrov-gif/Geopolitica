"""Sonda temporal: cómo pide resultados el SNIIM (no se fusiona)."""
import re, sys, urllib.parse, urllib.request
sys.path.insert(0, "ingest")
import fuentes as F
UA = {"User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(url, t=90):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=t) as r:
        return r.read().decode("utf-8", "replace")
def p(*a): print(*a, flush=True)
base = "https://www.economia-sniim.gob.mx/nuevo/Consultas/MercadosNacionales/PreciosDeMercado/Agricolas/"
for pag in ["ConsultaFrutasYHortalizas.aspx", "ConsultaGranos.aspx"]:
    h = get(base + pag)
    for m in re.finditer(r"Resultado[A-Za-z]*\.aspx[^\"'<>]{0,300}", h):
        p(pag, "URL:", m.group(0)[:320])
    p(pag, "destinos:", re.findall(r'<option[^>]*value="([^"]*)"[^>]*>([^<]*(?:Iztapalapa|Abasto|Distrito|Ciudad de M)[^<]*)</option>', h)[:8])
    p(pag, "precios por:", re.findall(r'id="ddlPrecios".*?</select>', h, re.S)[:1][0][:400] if 'ddlPrecios' in h else "")
    js = re.findall(r'<script[^>]*>(.*?)</script>', h, re.S)
    for s in js:
        if "Resultado" in s or "window.open" in s or "location" in s:
            p(pag, "SCRIPT:", re.sub(r"\s+", " ", s)[:1500])
# intento con el formato que usan otros proyectos públicos
for url in [base + "ResultadosConsultaFechaFrutasYHortalizas.aspx?fechaInicio=01/10/2026&fechaFinal=29/10/2026&ProductoId=183&OrigenId=-1&Origen=Todos&DestinoId=100&Destino=DF&PreciosPorId=2&RegistrosPorPagina=500",
            base + "ResultadosConsultaFechaFrutasYHortalizas.aspx?fechaInicio=01/10/2026&fechaFinal=29/10/2026&ProductoId=183&OrigenId=-1&Origen=Todos&DestinoId=-1&Destino=Todos&PreciosPorId=2&RegistrosPorPagina=500"]:
    try:
        p("ROBOTS", F.permitido_por_robots(url))
        t = get(url)
        txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " | ", t))
        p("RES", len(t), txt[txt.find("Fecha"):txt.find("Fecha") + 900])
    except Exception as e:
        p("RES ERROR", type(e).__name__, str(e)[:120])
