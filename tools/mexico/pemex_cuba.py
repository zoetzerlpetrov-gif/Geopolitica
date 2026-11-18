#!/usr/bin/env python3
"""Petróleo de Pemex a Cuba según lo que la propia Pemex reporta a la SEC de EUA (formas 20-F y 6-K).

Por qué esta fuente: México reporta a la ONU (Comtrade) la mayor parte de sus exportaciones de crudo con el país de
destino reservado («Rest of America, nes», «Areas, nes»), así que Cuba aparece en cero; el Cubo de Comercio Exterior de
Banxico solo es consulta manual. Pemex, en cambio, informa en sus reportes a la SEC (documentos públicos, dominio
público en EUA) cuánto exporta a Cuba su filial Gasolinas Bienestar, S.A. de C.V. (renombrada en 2026 Servicios
Logísticos Integrales Mumiya y luego Servicios Logísticos y Recursos Estratégicos): barriles diarios de crudo y de
petrolíferos, monto en pesos y en dólares, y su peso en el total exportado.

Cómo: búsqueda de texto completo de EDGAR (efts.sec.gov) de «Republic of Cuba» en las formas de Pemex (CIK 932782),
lectura del documento principal y extracción de las frases «In 2025, … exported … amounting to …». Se guarda solo el
número, el periodo y el enlace al documento (sin texto completo). Cifras tal como las reporta Pemex: no son una
auditoría independiente; hay investigaciones periodísticas (p. ej. MCCI, enero de 2026) que estiman montos mayores.

Reglas de la SEC: identificarse con User-Agent (secreto SEC_USER_AGENT) y no más de 10 consultas por segundo.
Salida: vivos/pemex_cuba.json (una vez a la semana; si falla se conserva el anterior).
"""
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "vivos", "pemex_cuba.json")
CIK = "932782"
AGENTE = os.environ.get("SEC_USER_AGENT", "").strip() or "DOMINUS-OSINT mexico (github.com/zoetzerlpetrov-gif/Geopolitica)"
CADA_DIAS = 7
DESDE = "2023-06-01"
MESES = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August", "September",
                                      "October", "November", "December"], 1)}

PERIODO = (r"(?P<per>From [A-Z][a-z]+ \d{4} through [A-Z][a-z]+ \d{1,2}, \d{4}"
           r"|In \d{4}|In the (?:three|six|nine|twelve) months ended [A-Z][a-z]+ \d{1,2}, \d{4})")
FRASE = re.compile(PERIODO + r", .{0,160}?exported (?P<cuerpo>.{0,420}?)Such sales represented (?P<rep>.{0,260}?)(?:respectively|export sales|sales)\.")


def a_numero(txt):
    return float(txt.replace(",", ""))


def escala(n, unidad):
    return n * (1000 if unidad.lower().startswith("billion") else 1)   # → millones


def periodo(per):
    """Texto del periodo → (clave ordenable, inicio, fin, etiqueta en español)."""
    m = re.fullmatch(r"In (\d{4})", per)
    if m:
        a = m.group(1)
        return f"{a}-12", f"{a}-01", f"{a}-12", f"Año {a}"
    m = re.fullmatch(r"From ([A-Z][a-z]+) (\d{4}) through ([A-Z][a-z]+) \d{1,2}, (\d{4})", per)
    if m:
        ini, fin = f"{m.group(2)}-{MESES[m.group(1)]:02d}", f"{m.group(4)}-{MESES[m.group(3)]:02d}"
        return fin, ini, fin, f"{ini} a {fin}"
    m = re.fullmatch(r"In the (three|six|nine|twelve) months ended ([A-Z][a-z]+) \d{1,2}, (\d{4})", per)
    if m:
        n = {"three": 3, "six": 6, "nine": 9, "twelve": 12}[m.group(1)]
        mes_fin, anio = MESES[m.group(2)], int(m.group(3))
        mes_ini = mes_fin - n + 1
        a_ini = anio if mes_ini >= 1 else anio - 1
        mes_ini = mes_ini if mes_ini >= 1 else mes_ini + 12
        fin = f"{anio}-{mes_fin:02d}"
        return fin, f"{a_ini}-{mes_ini:02d}", fin, f"{n} meses a {fin}"
    return per, "", "", per


def extraer(texto):
    """Texto plano de un reporte → lista de periodos con barriles, montos y participación."""
    out = []
    for m in FRASE.finditer(texto):
        c, rep = m.group("cuerpo"), m.group(0)[m.start("rep") - m.start():]
        crudo = re.search(r"([\d.]+) thousand barrels(?: per day)? of crude oil", c)
        prod = re.search(r"([\d.]+) thousand barrels(?: per day)? of petroleum products", c)
        mxn = re.search(r"Ps\.\s?([\d.,]+) (billion|million)", c)
        usd = re.search(r"U\.S\.\$\s?([\d.,]+) (billion|million)", c)
        clave, ini, fin, etiqueta = periodo(m.group("per"))
        out.append({
            "clave": clave, "inicio": ini, "fin": fin, "periodo": etiqueta,
            "crudo_kbd": a_numero(crudo.group(1)) if crudo else 0.0,
            "petroliferos_kbd": a_numero(prod.group(1)) if prod else 0.0,
            "mxn_millones": round(escala(a_numero(mxn.group(1)), mxn.group(2)), 1) if mxn else None,
            "usd_millones": round(escala(a_numero(usd.group(1)), usd.group(2)), 1) if usd else None,
            "pct_crudo_exportado": next((a_numero(x) for x in re.findall(r"([\d.]+)% of (?:our )?total exports of crude oil", rep)), None),
            "pct_petroliferos": next((a_numero(x) for x in re.findall(r"([\d.]+)% of (?:our )?total sales of petroleum products", rep)), None),
            "pct_exportaciones": next((a_numero(x) for x in re.findall(r"([\d.]+)% of (?:our )?total export sales", rep)), None),
        })
    return out


def texto_plano(crudo_html):
    t = re.sub(r"<[^>]+>", " ", crudo_html)
    return re.sub(r"\s+", " ", html.unescape(t))


def pedir(url, abrir=urllib.request.urlopen):
    req = urllib.request.Request(url, headers={"User-Agent": AGENTE, "Accept-Encoding": "identity"})
    with abrir(req, timeout=90) as r:
        return r.read().decode("utf-8", "ignore")


def buscar(abrir=urllib.request.urlopen, hasta=None):
    """Documentos principales (no traducciones) de Pemex que mencionan «Republic of Cuba»."""
    hasta = hasta or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    q = urllib.parse.urlencode({"q": '"Republic of Cuba"', "ciks": CIK.zfill(10), "forms": "20-F,6-K",
                                "dateRange": "custom", "startdt": DESDE, "enddt": hasta})
    d = json.loads(pedir(f"https://efts.sec.gov/LATEST/search-index?{q}", abrir))
    docs = []
    for h in d.get("hits", {}).get("hits", []):
        s = h.get("_source", {})
        if s.get("file_type", s.get("form")) not in ("20-F", "6-K") and not str(s.get("file_description", "")).startswith(("20-F", "6-K")):
            continue
        acc, archivo = h["_id"].split(":", 1)
        docs.append({"forma": s.get("form"), "fecha": s.get("file_date"), "periodo_reporte": s.get("period_ending"),
                     "url": f"https://www.sec.gov/Archives/edgar/data/{CIK}/{acc.replace('-', '')}/{archivo}"})
    return sorted(docs, key=lambda x: x["fecha"] or "")


def combinar(por_doc):
    """[(doc, [periodos])] en orden de fecha → un periodo por clave; el reporte más reciente manda (corrige al anterior)."""
    final = {}
    for doc, filas in por_doc:
        for f in filas:
            final[f["clave"]] = {**f, "forma": doc["forma"], "presentado": doc["fecha"], "fuente": doc["url"]}
    return [final[k] for k in sorted(final)]


def main():
    if os.path.exists(OUT):
        try:
            gen = json.load(open(OUT, encoding="utf-8")).get("generado_utc", "")
            if gen and datetime.now(timezone.utc) - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(days=CADA_DIAS):
                print("Pemex-Cuba: datos recientes; se conservan")
                return 0
        except ValueError:
            pass
    errores, por_doc = [], []
    try:
        docs = buscar()
    except Exception as e:  # noqa: BLE001
        print(f"Pemex-Cuba: búsqueda en EDGAR falló ({e}); se conserva lo anterior")
        return 0
    for d in docs:
        try:
            por_doc.append((d, extraer(texto_plano(pedir(d["url"])))))
        except Exception as e:  # noqa: BLE001
            errores.append(f"{d['url']}: {e}"[:200])
        time.sleep(0.3)
    periodos = combinar(por_doc)
    if not periodos:
        print("Pemex-Cuba: no se encontraron cifras; se conserva lo anterior. " + "; ".join(errores))
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "fuente": "Petróleos Mexicanos, reportes 20-F y 6-K a la SEC de EUA (EDGAR)",
               "nota": "Cifras reportadas por Pemex sobre su filial que exporta a Cuba (Gasolinas Bienestar, después Servicios Logísticos "
                       "Integrales Mumiya y Servicios Logísticos y Recursos Estratégicos). kbd = miles de barriles diarios. "
                       "Los periodos parciales (3, 6 o 9 meses) son acumulados del año.",
               "documentos": [d["url"] for d, _ in por_doc], "periodos": periodos, "errores": errores},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"Pemex-Cuba: {len(periodos)} periodos de {len(por_doc)} reportes: " + "; ".join(f"{p['periodo']} {p['crudo_kbd']}+{p['petroliferos_kbd']} kbd" for p in periodos))
    return 0


if __name__ == "__main__":
    sys.exit(main())
