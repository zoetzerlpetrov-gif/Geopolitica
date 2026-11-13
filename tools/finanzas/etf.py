"""ETF del Portafolio: qué tienen dentro y qué tan sanas son esas empresas según nuestro propio análisis.

Un ETF no tiene estados financieros de empresa: es una canasta. Los fondos registrados en EUA reportan sus posiciones
cada trimestre a la SEC en el formulario N-PORT (dominio público). Para cada ETF del Portafolio:
  1. company_tickers_mf.json da su serie (S000…); el último N-PORT-P de esa serie trae todas sus posiciones;
  2. cada posición se liga por nombre a las empresas que ya analizamos (finanzas/indice.json);
  3. se calcula qué parte del fondo está en empresas 🟢/🟡/🔴, la concentración (10 mayores posiciones) y el reparto
     por país, con un diagnóstico de reglas fijas.
Los ETF fuera de EUA (p. ej. NAFTRAC, en la BMV) no reportan N-PORT y quedan con su motivo.
"""
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(__file__))
import edgar as E  # noqa: E402

MF = "https://www.sec.gov/files/company_tickers_mf.json"
SERIE = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={serie}&type=NPORT-P&dateb=&owner=include&count=5&output=atom"
SUFIJOS = r"\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|sa|ag|nv|se|holdings?|group|class [a-c]|cl [a-c]|the|ord|adr|reit|lp|llc)\b"


def bajar(url, abrir=urllib.request.urlopen, intentos=4, dormir=time.sleep):
    for i in range(intentos):
        try:
            with abrir(urllib.request.Request(url, headers={"User-Agent": E.AGENTE, "Accept-Encoding": "identity"}), timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (429, 503) and i < intentos - 1:
                dormir(10 * 2 ** i)
                continue
            raise
    return None


def normal(nombre):
    """«Apple Inc.» → «apple»; «Alphabet Inc Class A» → «alphabet»; sin acentos ni signos."""
    t = unicodedata.normalize("NFD", str(nombre or "")).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    t = re.sub(r"\b([a-z]) (?=[a-z]\b)", r"\1", t)  # «s a» (de S.A.) → «sa»; «n v» → «nv»
    t = re.sub(SUFIJOS, " ", t)
    return re.sub(r"\s+", " ", t).strip()


def posiciones(xml):
    """N-PORT (primary_doc.xml) → (fecha del reporte, activos netos, [posiciones])."""
    raiz = ET.fromstring(xml)
    ns = {"n": raiz.tag.split("}")[0][1:]} if raiz.tag.startswith("{") else {"n": ""}
    q = (lambda p: p.replace("n:", "")) if not ns["n"] else (lambda p: p)
    def txt(el, p):
        x = el.find(q(p), ns)
        return (x.text or "").strip() if x is not None and x.text else ""
    out = []
    for x in raiz.iterfind(q(".//n:invstOrSec"), ns):
        try:
            pct = float(txt(x, "n:pctVal") or 0)
        except ValueError:
            pct = 0.0
        out.append({"nombre": txt(x, "n:name") or txt(x, "n:title"), "peso": pct, "pais": txt(x, "n:invCountry"),
                    "clase": txt(x, "n:assetCat"), "lei": txt(x, "n:lei")})
    try:
        neto = float(txt(raiz, ".//n:netAssets") or 0)
    except ValueError:
        neto = 0.0
    return txt(raiz, ".//n:repPdDate"), neto, out


def ligar(pos, empresas):
    """Liga cada posición con una empresa analizada (por nombre normalizado de la SEC o del Portafolio)."""
    por_nombre = {}
    for e in empresas:
        for n in (e.get("empresa_sec"), e.get("nombre")):
            if n and normal(n):
                por_nombre.setdefault(normal(n), e)
    for p in pos:
        e = por_nombre.get(normal(p["nombre"]))
        if e:
            p["ticker"], p["calificacion"] = e["ticker"], e.get("calificacion")
    return pos


def resumen(pos):
    total = sum(max(p["peso"], 0) for p in pos) or 1
    por_sem = {"verde": 0.0, "ambar": 0.0, "rojo": 0.0}
    for p in pos:
        if p.get("calificacion") in por_sem:
            por_sem[p["calificacion"]] += max(p["peso"], 0)
    cubierto = sum(por_sem.values())
    paises = {}
    for p in pos:
        paises[p["pais"] or "—"] = paises.get(p["pais"] or "—", 0) + max(p["peso"], 0)
    orden = sorted(pos, key=lambda p: p["peso"], reverse=True)
    return {"posiciones": len(pos), "top10": sum(p["peso"] for p in orden[:10]) / total * 100,
            "cobertura": cubierto / total * 100, "semaforo": {k: (v / cubierto * 100 if cubierto else 0) for k, v in por_sem.items()},
            "paises": sorted(([k, v / total * 100] for k, v in paises.items()), key=lambda x: -x[1])[:10],
            "principales": [{k: p.get(k) for k in ("nombre", "peso", "pais", "ticker", "calificacion")} for p in orden[:20]]}


def diagnostico(r):
    out = []

    def add(tema, color, texto):
        out.append({"tema": tema, "semaforo": color, "texto": texto})

    add("Diversificación", "verde" if r["posiciones"] >= 100 else "ambar" if r["posiciones"] >= 30 else "rojo",
        f"{r['posiciones']} posiciones en el fondo.")
    t10 = r["top10"]
    add("Concentración", "verde" if t10 < 30 else "ambar" if t10 <= 50 else "rojo",
        f"Las 10 posiciones más grandes suman {t10:.1f} % del fondo.")
    if r["cobertura"] >= 40:
        rojo = r["semaforo"]["rojo"]
        add("Salud de las empresas dentro", "verde" if rojo < 15 else "ambar" if rojo <= 30 else "rojo",
            f"De lo que pudimos analizar ({r['cobertura']:.0f} % del fondo), {r['semaforo']['verde']:.0f} % está en empresas sólidas, "
            f"{r['semaforo']['ambar']:.0f} % en mixtas y {rojo:.0f} % en empresas con alertas.")
    return out


def main(salida="finanzas"):
    port = [i for i in (E.pedir(E.PORTAFOLIO) or []) if "ETF" in (i.get("sector") or "")]
    ruta = os.path.join(salida, "indice.json")
    indice = json.load(open(ruta, encoding="utf-8")) if os.path.exists(ruta) else {"empresas": []}
    por = {e["ticker"]: e for e in indice.get("empresas", [])}
    analizadas = []
    for e in indice.get("empresas", []):
        if e.get("estado") == "ok":
            try:
                d = json.load(open(os.path.join(salida, re.sub(r"[^A-Z0-9.-]", "_", e["ticker"]) + ".json"), encoding="utf-8"))
                analizadas.append({"ticker": e["ticker"], "nombre": e.get("nombre"), "empresa_sec": d.get("empresa_sec"), "calificacion": e.get("calificacion")})
            except (OSError, ValueError):
                pass
    series = {r[3]: r for r in (E.pedir(MF) or {}).get("data", [])}
    ok = 0
    for inst in port:
        t = inst["ticker"].upper()
        fila = por.setdefault(t, {"ticker": t, "nombre": inst.get("name", ""), "sector": inst.get("sector")})
        s = series.get(t)
        if not s:
            fila.update(estado="sin_datos", motivo="ETF sin reporte N-PORT a la SEC (fondo fuera de EUA o fideicomiso de inversión).")
            continue
        try:
            atom = (bajar(SERIE.format(serie=s[1])) or b"").decode("utf-8", "replace")
            time.sleep(E.PAUSA)
            m = re.search(r"<filing-href>([^<]+)-index\.htm", atom)
            if not m:
                fila.update(estado="sin_datos", motivo="No se encontró su N-PORT reciente.")
                continue
            base = m.group(1).rsplit("/", 1)[0]
            xml = bajar(base + "/primary_doc.xml")
            time.sleep(E.PAUSA)
            fecha, neto, pos = posiciones(xml)
        except Exception as e:  # noqa: BLE001
            fila.update(estado="error", motivo=f"{type(e).__name__}"[:80])
            continue
        r = resumen(ligar(pos, analizadas))
        diag = diagnostico(r)
        sem = {"verde": "🟢 Sólida", "ambar": "🟡 Mixta", "rojo": "🔴 Con alertas"}
        bloques = [
            {"titulo": f"Resumen del fondo (N-PORT al {fecha})", "columnas": ["Dato", "Valor"],
             "filas": [["Activos netos", f"{neto / 1e6:,.0f} millones de USD"], ["Posiciones", f"{r['posiciones']:,}"],
                       ["Peso de las 10 mayores", f"{r['top10']:.1f} %"], ["Parte del fondo que analizamos", f"{r['cobertura']:.0f} %"]]},
            {"titulo": "Salud de las empresas dentro (ponderada por su peso)", "columnas": ["Semáforo", "% de lo analizado"],
             "filas": [[sem[k], f"{v:.1f} %"] for k, v in r["semaforo"].items()],
             "nota": "Cada empresa lleva el semáforo de su propio análisis; el porcentaje se pondera por su peso en el fondo."},
            {"titulo": "Principales posiciones", "columnas": ["Empresa", "Peso", "País", "Semáforo"],
             "filas": [[p["nombre"] + (f" ({p['ticker']})" if p.get("ticker") else ""), f"{p['peso']:.2f} %", p["pais"] or "—",
                        sem.get(p.get("calificacion"), "Sin análisis")] for p in r["principales"]]},
            {"titulo": "Países", "columnas": ["País", "Peso"], "filas": [[k, f"{v:.1f} %"] for k, v in r["paises"]]},
        ]
        res = {"bloques": bloques, "ticker": t, "nombre": inst.get("name") or t, "empresa_sec": f"Serie {s[1]}", "sector": inst.get("sector"), "perfil": "etf",
               "moneda": "USD", "anios": [], "estados": {}, "razones": {}, "piotroski": None, "altman": None,
               "etf": {**r, "fecha": fecha, "activos_netos": neto}, "diagnostico": diag, "calificacion": E.calificacion(diag),
               "documentos": [{"forma": "N-PORT-P", "fecha": fecha, "periodo": fecha, "url": base + "/primary_doc.xml"}],
               "fuente": "SEC EDGAR, formulario N-PORT (posiciones del fondo; dominio público) y nuestro análisis de cada empresa"}
        with open(os.path.join(salida, re.sub(r"[^A-Z0-9.-]", "_", t) + ".json"), "w", encoding="utf-8") as fh:
            json.dump(res, fh, ensure_ascii=False, separators=(",", ":"))
        fila.update(estado="ok", motivo="", calificacion=res["calificacion"], moneda="USD", ultimo=fecha[:7])
        ok += 1
    indice["empresas"] = list(por.values())
    with open(ruta, "w", encoding="utf-8") as fh:
        json.dump(indice, fh, ensure_ascii=False, indent=0)
    print(f"finanzas ETF: {ok} ETF con posiciones")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "finanzas"))
