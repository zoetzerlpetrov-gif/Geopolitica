"""Estados financieros de las emisoras mexicanas del Portafolio (acciones de la BMV/BIVA y FIBRAs).

Fuente: los reportes trimestrales en XBRL que cada emisora entrega a la CNBV (taxonomía IFRS-MX), publicados por la
Bolsa Institucional de Valores (BIVA) en su banco de información. Es información pública que la Ley del Mercado de
Valores obliga a divulgar; su robots.txt permite /emisoras y /storage. Se consulta una vez por semana, con pausa entre
consultas, y solo se guardan cifras agregadas y enlaces a los documentos originales.

Por emisora:
  - el último reporte trimestral: cifras de los últimos 12 meses (UDM) que trae el reporte, balance más reciente y,
    en FIBRAs, el índice de cobertura del servicio de la deuda (ICD) y el nivel de endeudamiento que reporta a la CNBV;
  - los dos últimos reportes del cuarto trimestre (4D, dictaminado, o 4): hasta 4 ejercicios anuales.
Reutiliza razones, puntajes y diagnóstico de edgar.py; las FIBRAs tienen su propio diagnóstico (ICD, LTV, margen,
crecimiento y distribuciones frente al flujo de la operación). Actualiza finanzas/indice.json en su lugar.
"""
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
import edgar as E  # noqa: E402

BIVA = "https://www.biva.mx"
AGENTE = "DOMINUS-OSINT finanzas (github.com/zoetzerlpetrov-gif/Geopolitica)"
PAUSA = 1.0
XI = "{http://www.xbrl.org/2003/instance}"

# Concepto propio → etiquetas (sin prefijo) en orden de preferencia: IFRS completo y extensiones de la CNBV/BMV.
CONCEPTOS = {
    "ingresos": ("flujo", ["Revenue"]),
    "costo_ventas": ("flujo", ["CostOfSales"]),
    "utilidad_bruta": ("flujo", ["GrossProfit"]),
    "utilidad_operativa": ("flujo", ["ProfitLossFromOperatingActivities"]),
    "utilidad_neta": ("flujo", ["ProfitLossAttributableToOwnersOfParent", "ProfitLoss"]),
    "intereses": ("flujo", ["InterestExpense", "FinanceCosts"]),
    "depreciacion": ("flujo", ["AdjustmentsForDepreciationAndAmortisationExpense", "DepreciationAndAmortisationExpense",
                               "DepreciacionYAmortizacionOperativa", "DepreciacionYAmortizacion"]),
    "flujo_operativo": ("flujo", ["CashFlowsFromUsedInOperatingActivities"]),
    "capex": ("flujo", ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"]),
    "dividendos_pagados": ("flujo", ["DividendsPaidClassifiedAsFinancingActivities", "DividendsPaid"]),
    "recompras": ("flujo", ["PaymentsToAcquireOrRedeemEntitysShares"]),
    "uxa_diluida": ("flujo", ["DilutedEarningsLossPerShare", "BasicEarningsLossPerShare"]),
    "acciones_promedio": ("flujo", []),
    "activos": ("saldo", ["Assets"]),
    "activo_circulante": ("saldo", ["CurrentAssets"]),
    "efectivo": ("saldo", ["CashAndCashEquivalents"]),
    "inventarios": ("saldo", ["Inventories"]),
    "pasivos": ("saldo", ["Liabilities"]),
    "pasivo_circulante": ("saldo", ["CurrentLiabilities"]),
    "deuda_largo_plazo": ("saldo", [("CreditosBancariosALargoPlazo", "CreditosBursatilesALargoPlazo"), "NoncurrentPortionOfNoncurrentBorrowings",
                                    "LongtermBorrowings"]),
    "deuda_corto_plazo": ("saldo", [("CreditosBancariosACortoPlazo", "CreditosBursatilesACortoPlazo"), "CurrentPortionOfNoncurrentBorrowings",
                                    "ShorttermBorrowings"]),
    "capital_contable": ("saldo", ["EquityAttributableToOwnersOfParent", "Equity"]),
    "utilidades_retenidas": ("saldo", ["RetainedEarnings"]),
    "acciones": ("saldo", ["NumberOfSharesOutstanding"]),
}


def pedir(url, binario=False, abrir=urllib.request.urlopen, intentos=3):
    for i in range(intentos):
        try:
            with abrir(urllib.request.Request(url, headers={"User-Agent": AGENTE, "Accept": "application/json"}), timeout=120) as r:
                datos = r.read()
            return datos if binario else json.loads(datos)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None  # clave inexistente: la búsqueda responde 404
            if e.code in (429, 503) and i < intentos - 1:
                time.sleep(10 * (i + 1))
                continue
            raise


def clave_de(ticker):
    """FUNO11.MX → FUNO · FIBRAPL14.MX → FIBRAPL · GMEXICOB.MX → GMEXICO · WALMEX.MX → WALMEX (candidatas en orden)."""
    base = re.sub(r"\.MX$", "", (ticker or "").upper())
    sin_serie = re.sub(r"\d+$", "", base)
    out = [base, sin_serie]
    if re.search(r"[ABL]$", sin_serie) and len(sin_serie) > 3:
        out.append(sin_serie[:-1])
    if sin_serie.endswith("CPO"):
        out.append(sin_serie[:-3])
    return list(dict.fromkeys(x for x in out if x))


def leer_xbrl(datos):
    """{concepto: {periodo: valor}} solo con hechos sin dimensiones (totales de la emisora) en moneda o número puro.
    Periodo: «AAAA-MM-DD/AAAA-MM-DD» para flujos o «AAAA-MM-DD» para saldos. También devuelve la moneda y si es FIBRA."""
    ctx, unidades, hechos, esquema = {}, {}, [], ""
    for _, el in ET.iterparse(io.BytesIO(datos), events=("end",)):
        tag = el.tag
        if tag == XI + "context":
            per = el.find(XI + "period")
            ini, fin, inst = (per.findtext(XI + "startDate"), per.findtext(XI + "endDate"), per.findtext(XI + "instant")) if per is not None else (None, None, None)
            dim = el.find(XI + "scenario") is not None or el.find(XI + "entity/" + XI + "segment") is not None
            ctx[el.get("id")] = (f"{ini}/{fin}" if ini else inst, dim)
            el.clear()
        elif tag == XI + "unit":
            m = el.findtext(XI + "measure") or ""
            unidades[el.get("id")] = m.split(":")[-1]
            el.clear()
        elif tag.endswith("schemaRef"):
            esquema = el.get("{http://www.w3.org/1999/xlink}href") or ""
        elif el.get("contextRef") and el.get("unitRef") and el.text and el.text.strip():
            hechos.append((tag.split("}")[-1], el.get("contextRef"), el.text.strip(), el.get("unitRef")))
            el.clear()
    out, monedas = {}, {}
    for nombre, c, v, u in hechos:
        periodo, dim = ctx.get(c, (None, True))
        if dim or not periodo:
            continue
        try:
            num = float(v)
        except ValueError:
            continue
        unidad = unidades.get(u, "")
        if re.fullmatch(r"[A-Z]{3}", unidad):
            monedas[unidad] = monedas.get(unidad, 0) + 1
        out.setdefault(nombre, {}).setdefault(periodo, num)
    moneda = max(monedas, key=monedas.get) if monedas else "MXN"
    return {"hechos": out, "moneda": moneda, "fibra": "fibra" in esquema.lower()}


def _valor(hechos, etiquetas, periodo):
    for et in etiquetas:
        if isinstance(et, tuple):  # suma de partes (créditos bancarios + bursátiles)
            partes = [hechos.get(x, {}).get(periodo) for x in et]
            if any(p is not None for p in partes):
                return sum(p for p in partes if p is not None)
        elif periodo in hechos.get(et, {}):
            return hechos[et][periodo]
    return None


def anuales(reportes_q4):
    """Ejercicios (enero-diciembre) de los reportes del cuarto trimestre → tabla en el formato de edgar.estados."""
    tabla = {c: {} for c in CONCEPTOS}
    tabla["_fin"] = {}
    anios = set()
    for r in reportes_q4:
        h = r["hechos"]
        for periodo in h.get("Revenue", {}) | h.get("ProfitLoss", {}):
            m = re.fullmatch(r"(\d{4})-01-01/(\d{4})-12-31", periodo)
            if m and m.group(1) == m.group(2):
                anios.add(m.group(1))
    for a in sorted(anios):
        flujo, saldo = f"{a}-01-01/{a}-12-31", f"{a}-12-31"
        for r in reportes_q4:
            h = r["hechos"]
            if flujo not in h.get("Revenue", {}) and flujo not in h.get("ProfitLoss", {}):
                continue
            for c, (tipo, etiquetas) in CONCEPTOS.items():
                if tabla[c].get(a) is None:
                    tabla[c][a] = _valor(h, etiquetas, flujo if tipo == "flujo" else saldo)
            tabla["_fin"][a] = saldo
    anios_l = sorted(anios)[-E.ANIOS:]
    moneda = next((r["moneda"] for r in reportes_q4), "MXN")
    return {"moneda": moneda, "anios": anios_l, "tabla": tabla}


def ultimo_trimestre(rep, nombre_periodo):
    """Resumen del último reporte: UDM (últimos 12 meses) cuando el reporte los trae, balance al cierre e indicadores
    regulatorios de FIBRA (ICD y nivel de endeudamiento reportados a la CNBV)."""
    h = rep["hechos"]
    fin = max((p for p in h.get("Assets", {}) if re.fullmatch(r"\d{4}-\d{2}-\d{2}", p)), default=None)
    if not fin:
        return None
    def udm(et):
        for p, v in h.get(et, {}).items():
            ini, _, f = p.partition("/")
            if f == fin and ini and (datetime.fromisoformat(f) - datetime.fromisoformat(ini)).days in range(360, 370):
                return v
        return None
    deuda = (_valor(h, CONCEPTOS["deuda_largo_plazo"][1], fin) or 0) + (_valor(h, CONCEPTOS["deuda_corto_plazo"][1], fin) or 0)
    activos = _valor(h, ["Assets"], fin)
    return {
        "periodo": nombre_periodo, "cierre": fin,
        "ingresos_udm": udm("Revenue"), "utilidad_operativa_udm": udm("ProfitLossFromOperatingActivities"), "utilidad_neta_udm": udm("ProfitLoss"),
        "activos": activos, "efectivo": _valor(h, ["CashAndCashEquivalents"], fin), "deuda": deuda or None,
        "ltv": (deuda / activos) if deuda and activos else None,
        "icd": next(iter(h.get("CoverageRateDebtService", {}).values()), None),
        "moneda": rep["moneda"],
    }


def diagnostico_fibra(est, rz, ut):
    """FIBRAs: reparten al menos 95 % de su resultado fiscal (Ley del ISR) y la CNBV les fija un ICD mínimo de 1.0 y un
    nivel de endeudamiento máximo de 50 %; por eso se miden con estas reglas y no con Piotroski ni Altman."""
    out = []

    def add(tema, color, texto):
        out.append({"tema": tema, "semaforo": color, "texto": texto})

    if ut and ut.get("icd") is not None:
        icd = ut["icd"]
        add("Cobertura del servicio de la deuda (ICD)", "verde" if icd >= 1.5 else "ambar" if icd >= 1.0 else "rojo",
            f"ICD de {icd:.2f} reportado a la CNBV al {ut['cierre']}: el flujo esperado cubre {icd:.2f} veces el servicio de la deuda (mínimo regulatorio 1.0).")
    if ut and ut.get("ltv") is not None:
        ltv = ut["ltv"]
        add("Endeudamiento (LTV)", "verde" if ltv < 0.35 else "ambar" if ltv <= 0.50 else "rojo",
            f"Créditos bancarios y bursátiles equivalen a {ltv * 100:.1f} % de sus activos (máximo regulatorio 50 %).")
    a = est["anios"][-1] if est["anios"] else None
    if a:
        r = rz[a]
        crec = [rz[x]["crecimiento_ingresos"] for x in est["anios"][-3:] if rz[x]["crecimiento_ingresos"] is not None]
        if crec:
            prom = sum(crec) / len(crec)
            add("Crecimiento de rentas", "verde" if prom > 0.05 else "ambar" if prom >= 0 else "rojo",
                f"Ingresos {'crecen' if prom >= 0 else 'caen'} en promedio {abs(prom) * 100:.1f} % al año (en pesos corrientes; compárelo con la inflación).")
        if r["margen_operativo"] is not None:
            mo = r["margen_operativo"]
            add("Margen operativo", "verde" if mo > 0.55 else "ambar" if mo > 0.35 else "rojo",
                f"Margen operativo de {mo * 100:.1f} % (cercano al margen NOI: rentas menos gastos de los inmuebles y de administración).")
        t = est["tabla"]
        cfo, div = t["flujo_operativo"].get(a), t["dividendos_pagados"].get(a)
        if cfo and div:
            p = abs(div) / cfo
            add("Distribuciones frente al flujo", "verde" if p <= 0.9 else "ambar" if p <= 1.1 else "rojo",
                f"Las distribuciones pagadas equivalen a {p * 100:.0f} % del flujo de la operación del ejercicio {a}.")
    return out


def analizar(inst, clave, q4s, ultimo, docs):
    est = anuales(q4s)
    ut = ultimo_trimestre(ultimo["xbrl"], ultimo["nombre"]) if ultimo else None
    if not est["anios"] and not ut:
        return None
    rz = E.razones(est) if est["anios"] else {}
    fibra = any(r["fibra"] for r in q4s + ([ultimo["xbrl"]] if ultimo else [])) or "FIBRA" in (inst.get("sector") or "").upper()
    if fibra:
        f, z = None, {"aplica": False, "motivo": "No aplica a FIBRAs (bienes raíces); se usan ICD y LTV."}
        diag = diagnostico_fibra(est, rz, ut)
    else:
        f = E.piotroski(est, rz) if len(est["anios"]) >= 2 else None
        z = E.altman(est, inst.get("current_price"), inst.get("currency") or "MXN", inst.get("sector")) if est["anios"] else None
        diag = E.diagnostico(est, rz, f, z, bool(inst.get("pays_dividend")), inst.get("sector") or "") if est["anios"] else []
    return {"ticker": inst["ticker"], "nombre": inst.get("name") or clave, "empresa_sec": f"Clave de pizarra {clave}",
            "sector": inst.get("sector"), "moneda": est["moneda"] or "MXN", "anios": est["anios"], "cierres": est["tabla"].get("_fin", {}),
            "estados": {c: est["tabla"][c] for c in CONCEPTOS}, "razones": rz, "piotroski": f, "altman": z,
            "diagnostico": diag, "calificacion": E.calificacion(diag), "documentos": docs, "ultimo_trimestre": ut,
            "perfil": "fibra" if fibra else "empresa",
            "fuente": "Reportes trimestrales XBRL entregados a la CNBV, publicados por BIVA (información pública de emisoras)"}


def reportes(clave):
    d = pedir(f"{BIVA}/emisoras/banco-informacion?size=16&page=0&tipoInformacion=17&clave={urllib.parse.quote(clave)}")
    out = []
    for x in (d or {}).get("content", []):
        if x.get("clave") != clave:
            continue
        m = re.search(r"(\d)(D?)-(\d{4})", x.get("tipoDocumento", ""))
        xbrl = next((a["url"] for a in x.get("archivosXbrl", []) if a.get("extension") == "XBRL"), None)
        pdf = next((a["url"] for a in x.get("archivosXbrl", []) if a.get("extension") == "PDF"), None)
        if m and xbrl:
            out.append({"trimestre": int(m.group(1)), "dictaminado": bool(m.group(2)), "anio": int(m.group(3)),
                        "nombre": x["tipoDocumento"], "xbrl": BIVA + xbrl, "pdf": BIVA + pdf if pdf else None,
                        "fecha": datetime.fromtimestamp(x.get("fechaPublicacion", 0) / 1000, timezone.utc).strftime("%Y-%m-%d")})
    return out


def elegir(lista):
    """Último reporte y los dos últimos cierres anuales (prefiere el 4D dictaminado sobre el 4 del mismo año)."""
    if not lista:
        return None, []
    orden = sorted(lista, key=lambda r: (r["anio"], r["trimestre"], r["dictaminado"]), reverse=True)
    q4, vistos = [], set()
    for r in orden:
        if r["trimestre"] == 4 and r["anio"] not in vistos:
            vistos.add(r["anio"])
            q4.append(r)
        if len(q4) == 2:
            break
    return orden[0], q4


def main(salida="finanzas"):
    port = E.pedir(E.PORTAFOLIO) or []
    ruta_ind = os.path.join(salida, "indice.json")
    try:
        indice = json.load(open(ruta_ind, encoding="utf-8"))
    except (OSError, ValueError):
        indice = {"generado_utc": "", "empresas": []}
    por_ticker = {e["ticker"]: e for e in indice.get("empresas", [])}
    ok = 0
    for inst in port:
        t = (inst.get("ticker") or "").upper()
        if not t.endswith(".MX") or "ETF" in (inst.get("sector") or ""):
            continue
        fila = por_ticker.setdefault(t, {"ticker": t, "nombre": inst.get("name", ""), "sector": inst.get("sector")})
        try:
            clave = None
            for c in clave_de(t):
                r = pedir(f"{BIVA}/emisoras/empresas/busqueda/{urllib.parse.quote(c)}") or []
                time.sleep(PAUSA)
                if any(x.get("clave") == c for x in r):
                    clave = c
                    break
            if not clave:
                fila.update(estado="sin_datos", motivo="No se encontró la clave de pizarra en BIVA.")
                continue
            lista = reportes(clave)
            time.sleep(PAUSA)
            ultimo, q4 = elegir(lista)
            if not ultimo:
                fila.update(estado="sin_datos", motivo="BIVA no tiene reportes trimestrales XBRL de esta emisora.")
                continue
            cache = {}
            for r in [ultimo] + q4:
                if r["xbrl"] not in cache:
                    cache[r["xbrl"]] = leer_xbrl(pedir(r["xbrl"], binario=True))
                    time.sleep(PAUSA)
            docs = [{"forma": r["nombre"], "fecha": r["fecha"], "periodo": "", "url": r["pdf"] or r["xbrl"]} for r in sorted(lista, key=lambda r: (r["anio"], r["trimestre"]), reverse=True)[:8]]
            res = analizar(inst, clave, [cache[r["xbrl"]] for r in q4], {"xbrl": cache[ultimo["xbrl"]], "nombre": ultimo["nombre"]}, docs)
        except Exception as e:  # noqa: BLE001  una emisora con error no detiene a las demás
            fila.update(estado="error", motivo=f"{type(e).__name__}"[:80])
            continue
        if not res:
            fila.update(estado="sin_datos", motivo="El reporte no trae estados financieros comparables.")
            continue
        with open(os.path.join(salida, re.sub(r"[^A-Z0-9.-]", "_", t) + ".json"), "w", encoding="utf-8") as fh:
            json.dump(res, fh, ensure_ascii=False, separators=(",", ":"))
        fila.update(estado="ok", motivo="", calificacion=res["calificacion"], moneda=res["moneda"],
                    ultimo=res["anios"][-1] if res["anios"] else (res["ultimo_trimestre"] or {}).get("periodo", ""))
        ok += 1
    indice["empresas"] = list(por_ticker.values())
    indice["generado_utc"] = indice.get("generado_utc") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    indice["fuente"] = "SEC EDGAR y reportes CNBV publicados por BIVA"
    with open(ruta_ind, "w", encoding="utf-8") as fh:
        json.dump(indice, fh, ensure_ascii=False, indent=0)
    print(f"finanzas BMV: {ok} emisoras mexicanas con estados financieros")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "finanzas"))
