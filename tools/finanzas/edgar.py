"""Estados financieros de las empresas del Portafolio desde SEC EDGAR (datos XBRL; dominio público en EUA).

Para cada instrumento del Portafolio que presenta reportes a la SEC (10-K, 20-F, 40-F) escribe finanzas/<TICKER>.json:
  - estado de resultados, balance y flujo de efectivo anuales (hasta 6 ejercicios), en la moneda del reporte;
  - razones (márgenes, crecimiento, liquidez, apalancamiento, rentabilidad, flujo libre, sostenibilidad del dividendo);
  - puntajes: Piotroski F (0-9), Altman Z (solo industriales que reportan en la moneda de su precio) y cobertura de
    intereses;
  - diagnóstico con semáforo y explicación en español, generado con reglas fijas (no con IA, para que sea verificable);
  - enlaces a los documentos originales (10-K, 10-Q, 20-F, 8-K, informe a accionistas).
y finanzas/indice.json con el estado de cada instrumento (incluye por qué no hay datos: ETF, cripto, emisora de la BMV
o ADR que no reporta a la SEC).

Reglas de la SEC: identificarse con «User-Agent» (secreto SEC_USER_AGENT: «Nombre correo@dominio») y no pasar de
10 consultas por segundo. Nada de esto es asesoría de inversión.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

PORTAFOLIO = "https://zoetzerlpetrov-gif.github.io/portafolio/portfolio_data.json"
TICKERS = "https://www.sec.gov/files/company_tickers.json"
FACTS = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
SUBS = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
AGENTE = os.environ.get("SEC_USER_AGENT", "").strip() or "DOMINUS-OSINT finanzas (github.com/zoetzerlpetrov-gif/Geopolitica)"
PAUSA = 0.25  # ≤ 4 consultas por segundo (límite de la SEC: 10; con margen porque GitHub comparte IP)
ANIOS = 6

# Concepto → etiquetas XBRL en orden de preferencia (US GAAP e IFRS). «flujo» = periodo anual; «saldo» = al cierre.
CONCEPTOS = {
    "ingresos": ("flujo", ["us-gaap:Revenues", "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
                           "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax", "us-gaap:SalesRevenueNet",
                           "us-gaap:RevenuesNetOfInterestExpense", "ifrs-full:Revenue",
                           "ifrs-full:RevenueFromContractsWithCustomers"]),
    "costo_ventas": ("flujo", ["us-gaap:CostOfRevenue", "us-gaap:CostOfGoodsAndServicesSold", "ifrs-full:CostOfSales"]),
    "utilidad_bruta": ("flujo", ["us-gaap:GrossProfit", "ifrs-full:GrossProfit"]),
    "utilidad_operativa": ("flujo", ["us-gaap:OperatingIncomeLoss", "ifrs-full:ProfitLossFromOperatingActivities"]),
    "utilidad_neta": ("flujo", ["us-gaap:NetIncomeLoss", "us-gaap:ProfitLoss", "ifrs-full:ProfitLossAttributableToOwnersOfParent",
                                "ifrs-full:ProfitLoss"]),
    "intereses": ("flujo", ["us-gaap:InterestExpense", "us-gaap:InterestExpenseNonoperating", "us-gaap:InterestExpenseDebt",
                            "us-gaap:InterestAndDebtExpense",
                            "ifrs-full:FinanceCosts", "ifrs-full:InterestExpense"]),
    "depreciacion": ("flujo", ["us-gaap:DepreciationDepletionAndAmortization", "us-gaap:DepreciationAndAmortization",
                               "us-gaap:DepreciationAmortizationAndAccretionNet", "us-gaap:Depreciation",
                               "ifrs-full:DepreciationAndAmortisationExpense",
                               "ifrs-full:DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss"]),
    "flujo_operativo": ("flujo", ["us-gaap:NetCashProvidedByUsedInOperatingActivities",
                                  "us-gaap:NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
                                  "ifrs-full:CashFlowsFromUsedInOperatingActivities"]),
    "capex": ("flujo", ["us-gaap:PaymentsToAcquirePropertyPlantAndEquipment", "us-gaap:PaymentsToAcquireProductiveAssets",
                        "ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
                        "ifrs-full:PurchaseOfPropertyPlantAndEquipment"]),
    "dividendos_pagados": ("flujo", ["us-gaap:PaymentsOfDividends", "us-gaap:PaymentsOfDividendsCommonStock", "us-gaap:PaymentsOfOrdinaryDividends",
                                     "ifrs-full:DividendsPaidClassifiedAsFinancingActivities", "ifrs-full:DividendsPaid"]),
    "recompras": ("flujo", ["us-gaap:PaymentsForRepurchaseOfCommonStock"]),
    "uxa_diluida": ("flujo", ["us-gaap:EarningsPerShareDiluted", "ifrs-full:DilutedEarningsLossPerShare"]),
    "acciones_promedio": ("flujo", ["us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding",
                                    "ifrs-full:AdjustedWeightedAverageShares", "ifrs-full:WeightedAverageShares"]),
    "activos": ("saldo", ["us-gaap:Assets", "ifrs-full:Assets"]),
    "activo_circulante": ("saldo", ["us-gaap:AssetsCurrent", "ifrs-full:CurrentAssets"]),
    "efectivo": ("saldo", ["us-gaap:CashAndCashEquivalentsAtCarryingValue",
                           "us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "ifrs-full:CashAndCashEquivalents"]),
    "inventarios": ("saldo", ["us-gaap:InventoryNet", "ifrs-full:Inventories"]),
    "pasivos": ("saldo", ["us-gaap:Liabilities", "ifrs-full:Liabilities"]),
    "pasivo_circulante": ("saldo", ["us-gaap:LiabilitiesCurrent", "ifrs-full:CurrentLiabilities"]),
    "deuda_largo_plazo": ("saldo", ["us-gaap:LongTermDebtNoncurrent", "us-gaap:LongTermDebt",
                                    "us-gaap:LongTermDebtAndCapitalLeaseObligations", "ifrs-full:NoncurrentPortionOfNoncurrentBorrowings",
                                    "ifrs-full:LongtermBorrowings", "ifrs-full:Borrowings"]),
    "deuda_corto_plazo": ("saldo", ["us-gaap:LongTermDebtCurrent", "us-gaap:DebtCurrent", "us-gaap:ShortTermBorrowings",
                                    "ifrs-full:CurrentPortionOfNoncurrentBorrowings", "ifrs-full:ShorttermBorrowings",
                                    "ifrs-full:CurrentBorrowings"]),
    "capital_contable": ("saldo", ["us-gaap:StockholdersEquity",
                                   "us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
                                   "ifrs-full:EquityAttributableToOwnersOfParent", "ifrs-full:Equity"]),
    "utilidades_retenidas": ("saldo", ["us-gaap:RetainedEarningsAccumulatedDeficit", "ifrs-full:RetainedEarnings"]),
    "acciones": ("saldo", ["dei:EntityCommonStockSharesOutstanding", "us-gaap:CommonStockSharesOutstanding"]),
}

SECTORES_SIN_ESTADOS = ("ETFs", "Criptomonedas")
SECTORES_FINANCIEROS = ("financ", "banco", "seguro", "reit", "fibra", "bienes raíces", "pagos")


class Limite(RuntimeError):
    """La SEC siguió respondiendo 429/503 tras los reintentos (límite de consultas): no es «sin datos»."""


def pedir(url, abrir=urllib.request.urlopen, intentos=4, dormir=time.sleep):
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": AGENTE, "Accept-Encoding": "identity"})
            with abrir(req, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (429, 503):
                if i < intentos - 1:
                    espera = (e.headers or {}).get("Retry-After") if hasattr(e, "headers") else None
                    dormir(int(espera) if str(espera or "").isdigit() else 10 * 2 ** i)  # 10, 20, 40 s
                    continue
                raise Limite(f"HTTP {e.code}") from e
            raise
    return None


def _unidad(conc):
    """Unidad monetaria (la que tenga más datos), acciones o «USD/shares» según el concepto."""
    unidades = conc.get("units", {})
    if not unidades:
        return None, []
    k = max(unidades, key=lambda u: len(unidades[u]))
    return k, unidades[k]


def anuales(facts, etiquetas, tipo):
    """{año: {"v": valor, "fin": AAAA-MM-DD}} con los marcos de la SEC: CY2024 para flujos anuales; para saldos, el
    valor al cierre de cada ejercicio se toma después (al_cierre), aquí se devuelven todos los saldos por fecha."""
    out, unidad = {}, None
    for et in etiquetas:
        tax, nombre = et.split(":")
        conc = facts.get(tax, {}).get(nombre)
        if not conc:
            continue
        u, filas = _unidad(conc)
        if not u:
            continue  # concepto sin unidades (sin datos)
        if unidad and u != unidad and "/" not in u and u != "shares":
            continue  # no mezclar monedas entre etiquetas
        for x in filas:
            fr = x.get("frame", "")
            if tipo == "flujo":
                m = re.fullmatch(r"CY(\d{4})", fr)
                if m and m.group(1) not in out:
                    out[m.group(1)] = {"v": x["val"], "fin": x.get("end", "")}
            else:
                if fr.endswith("I") and x.get("end") and x["end"] not in out:
                    out[x["end"]] = {"v": x["val"], "fin": x["end"]}
        unidad = unidad or u
    return out, unidad


def al_cierre(saldos, fin, dias=15):
    """Saldo a la fecha de cierre del ejercicio (o el más cercano dentro de `dias`)."""
    if fin in saldos:
        return saldos[fin]["v"]
    try:
        f = datetime.fromisoformat(fin)
    except ValueError:
        return None
    cerca = [(abs((datetime.fromisoformat(k) - f).days), v["v"]) for k, v in saldos.items() if re.fullmatch(r"\d{4}-\d{2}-\d{2}", k)]
    cerca = [c for c in cerca if c[0] <= dias]
    return min(cerca)[1] if cerca else None


def estados(companyfacts, anios=ANIOS):
    """Tablas anuales {concepto: {año: valor}}, la moneda y los años (del más antiguo al más reciente)."""
    facts = companyfacts.get("facts", {})
    flujos, saldos, moneda = {}, {}, None
    for c, (tipo, etiquetas) in CONCEPTOS.items():
        datos, u = anuales(facts, etiquetas, tipo)
        if tipo == "flujo":
            flujos[c] = datos
            if c == "ingresos" and datos:
                moneda = u
        else:
            saldos[c] = datos
        if not moneda and c in ("activos",) and datos:
            moneda = u
    base = flujos.get("ingresos") or flujos.get("utilidad_neta") or {}
    anios_l = sorted(base)[-anios:]
    t = {c: {} for c in CONCEPTOS}
    for a in anios_l:
        fin = base[a]["fin"]
        for c, (tipo, _) in CONCEPTOS.items():
            if tipo == "flujo":
                v = flujos[c].get(a)
                t[c][a] = v["v"] if v else None
            else:
                # Las acciones de la portada (dei) se reportan semanas después del cierre: tolerancia de 120 días.
                t[c][a] = al_cierre(saldos[c], fin, 120 if c == "acciones" else 15)
        if t["acciones"].get(a) is None:
            t["acciones"][a] = t["acciones_promedio"].get(a)  # promedio diluido del año si no hay saldo
        t.setdefault("_fin", {})[a] = fin
    return {"moneda": moneda, "anios": anios_l, "tabla": t}


def _div(a, b):
    try:
        return a / b if a is not None and b not in (None, 0) else None
    except TypeError:
        return None


def razones(est):
    """Razones por año. Valores en fracción (0.25 = 25 %) salvo las veces (x)."""
    t, out = est["tabla"], {}
    for i, a in enumerate(est["anios"]):
        g = lambda c, a=a: t[c].get(a)  # noqa: E731
        prev = est["anios"][i - 1] if i else None
        bruta = g("utilidad_bruta") if g("utilidad_bruta") is not None else (
            g("ingresos") - g("costo_ventas") if g("ingresos") is not None and g("costo_ventas") is not None else None)
        deuda = sum(x for x in (g("deuda_largo_plazo"), g("deuda_corto_plazo")) if x is not None) if (
            g("deuda_largo_plazo") is not None or g("deuda_corto_plazo") is not None) else None
        ebitda = g("utilidad_operativa") + g("depreciacion") if g("utilidad_operativa") is not None and g("depreciacion") is not None else None
        fcf = g("flujo_operativo") - abs(g("capex")) if g("flujo_operativo") is not None and g("capex") is not None else None
        dividendos = abs(g("dividendos_pagados")) if g("dividendos_pagados") is not None else None
        out[a] = {
            "margen_bruto": _div(bruta, g("ingresos")),
            "margen_operativo": _div(g("utilidad_operativa"), g("ingresos")),
            "margen_neto": _div(g("utilidad_neta"), g("ingresos")),
            "crecimiento_ingresos": (_div(g("ingresos"), t["ingresos"].get(prev)) - 1) if prev and _div(g("ingresos"), t["ingresos"].get(prev)) is not None else None,
            "razon_circulante": _div(g("activo_circulante"), g("pasivo_circulante")),
            "prueba_acida": _div((g("activo_circulante") or 0) - (g("inventarios") or 0), g("pasivo_circulante")) if g("activo_circulante") is not None else None,
            "deuda_capital": _div(deuda, g("capital_contable")),
            "pasivo_activo": _div(g("pasivos"), g("activos")),
            "deuda_neta_ebitda": _div((deuda or 0) - (g("efectivo") or 0), ebitda) if deuda is not None and ebitda and ebitda > 0 else None,
            "cobertura_intereses": _div(g("utilidad_operativa"), abs(g("intereses")) if g("intereses") else None),
            "roe": _div(g("utilidad_neta"), g("capital_contable")),
            "roa": _div(g("utilidad_neta"), g("activos")),
            "flujo_libre": fcf,
            "margen_flujo_libre": _div(fcf, g("ingresos")),
            "conversion_efectivo": _div(g("flujo_operativo"), g("utilidad_neta")) if (g("utilidad_neta") or 0) > 0 else None,
            "payout_utilidad": _div(dividendos, g("utilidad_neta")) if (g("utilidad_neta") or 0) > 0 and dividendos else None,
            "payout_flujo_libre": _div(dividendos, fcf) if fcf and fcf > 0 and dividendos else None,
            "ebitda": ebitda,
            "deuda_total": deuda,
        }
    return out


def piotroski(est, rz):
    """Puntaje F de Piotroski (0-9) del último año contra el anterior; None si faltan datos."""
    if len(est["anios"]) < 2:
        return None
    a, p = est["anios"][-1], est["anios"][-2]
    t = est["tabla"]
    try:
        roa_a, roa_p = rz[a]["roa"], rz[p]["roa"]
        cfo = t["flujo_operativo"][a]
        pruebas = {
            "Utilidad neta positiva": t["utilidad_neta"][a] > 0,
            "Flujo operativo positivo": cfo > 0,
            "Mejora el ROA": roa_a > roa_p,
            "Flujo operativo mayor que la utilidad (calidad)": cfo > t["utilidad_neta"][a],
            "Baja la deuda de largo plazo / activos": _div(t["deuda_largo_plazo"][a] or 0, t["activos"][a]) <= _div(t["deuda_largo_plazo"][p] or 0, t["activos"][p]),
            "Mejora la razón circulante": (rz[a]["razon_circulante"] or 0) > (rz[p]["razon_circulante"] or 0),
            "No emitió acciones": (t["acciones"][a] or 0) <= (t["acciones"][p] or 0) * 1.01 if t["acciones"][a] and t["acciones"][p] else True,
            "Mejora el margen bruto": (rz[a]["margen_bruto"] or 0) >= (rz[p]["margen_bruto"] or 0),
            "Mejora la rotación de activos": _div(t["ingresos"][a], t["activos"][a]) > _div(t["ingresos"][p], t["activos"][p]),
        }
    except (TypeError, KeyError):
        return None
    return {"puntos": sum(pruebas.values()), "pruebas": pruebas}


def altman(est, precio, moneda_precio, sector):
    """Z de Altman (versión original para empresas industriales que cotizan). No aplica a bancos, aseguradoras ni REIT,
    ni cuando el reporte está en otra moneda que el precio (ADR)."""
    if any(s in (sector or "").lower() for s in SECTORES_FINANCIEROS):
        return {"aplica": False, "motivo": "No aplica a bancos, aseguradoras, financieras ni bienes raíces."}
    if not precio or (est["moneda"] or "") != (moneda_precio or ""):
        return {"aplica": False, "motivo": "El reporte está en otra moneda que el precio de la acción (ADR o emisora extranjera)."}
    a = est["anios"][-1]
    t = est["tabla"]
    try:
        ta = t["activos"][a]
        wc = t["activo_circulante"][a] - t["pasivo_circulante"][a]
        z = (1.2 * wc / ta + 1.4 * (t["utilidades_retenidas"][a] or 0) / ta + 3.3 * t["utilidad_operativa"][a] / ta
             + 0.6 * precio * t["acciones"][a] / t["pasivos"][a] + 1.0 * t["ingresos"][a] / ta)
    except (TypeError, ZeroDivisionError, KeyError):
        return {"aplica": False, "motivo": "Faltan datos del balance para calcularlo."}
    zona = "segura" if z > 2.99 else "gris" if z >= 1.81 else "de riesgo"
    return {"aplica": True, "z": round(z, 2), "zona": zona}


def _pct(x):
    return f"{x * 100:.1f} %"


REGULADAS = ("servicios públicos", "utilities")


def diagnostico(est, rz, f, z, paga_dividendo=False, sector=""):
    """[{tema, semaforo (verde/ambar/rojo), texto}] con reglas fijas y las cifras que las justifican. Las empresas de
    servicios públicos (luz, gas, agua) tienen tarifas reguladas: operan con más deuda, poca liquidez y flujo libre
    negativo por su inversión obligatoria, así que se miden con umbrales propios del sector."""
    a = est["anios"][-1]
    r = rz[a]
    out = []
    regulada = any(x in (sector or "").lower() for x in REGULADAS)
    nota_reg = " (umbral de empresa de servicios públicos regulada)" if regulada else ""

    def add(tema, color, texto):
        out.append({"tema": tema, "semaforo": color, "texto": texto})

    crec = [rz[x]["crecimiento_ingresos"] for x in est["anios"][-3:] if rz[x]["crecimiento_ingresos"] is not None]
    if crec:
        prom = sum(crec) / len(crec)
        add("Crecimiento", "verde" if prom > 0.05 else "ambar" if prom >= 0 else "rojo",
            f"Ingresos {'crecen' if prom >= 0 else 'caen'} en promedio {_pct(abs(prom))} al año en los últimos {len(crec)} ejercicios.")
    if r["margen_neto"] is not None:
        mn = r["margen_neto"]
        add("Rentabilidad", "verde" if mn > 0.10 else "ambar" if mn > 0 else "rojo",
            f"Margen neto de {_pct(mn)}" + (f", margen operativo de {_pct(r['margen_operativo'])}" if r["margen_operativo"] is not None else "")
            + (f" y ROE de {_pct(r['roe'])}" if r["roe"] is not None else "") + ".")
    if r["razon_circulante"] is not None:
        rc = r["razon_circulante"]
        lim = (1.0, 0.5) if regulada else (1.5, 1.0)
        add("Liquidez", "verde" if rc >= lim[0] else "ambar" if rc >= lim[1] else "rojo",
            f"Razón circulante de {rc:.2f}: por cada {est['moneda'] or 'unidad'} de deudas a menos de un año tiene {rc:.2f} en activos de corto plazo.")
    if r["deuda_neta_ebitda"] is not None or r["deuda_capital"] is not None:
        dn = r["deuda_neta_ebitda"]
        lim = (5, 7) if regulada else (2, 4)
        color = ("verde" if dn < lim[0] else "ambar" if dn < lim[1] else "rojo") if dn is not None else (
            "verde" if r["deuda_capital"] < 1 else "ambar" if r["deuda_capital"] < 2 else "rojo")
        add("Endeudamiento", color,
            ("Tiene más efectivo que deuda (caja neta). " if dn is not None and dn < 0 else
             f"Deuda neta / EBITDA de {dn:.1f} veces (años de flujo operativo para pagar la deuda neta). " if dn is not None else "")
            + (f"Deuda / capital de {r['deuda_capital']:.2f}." if r["deuda_capital"] is not None else "") + nota_reg)
    if r["cobertura_intereses"] is not None:
        ci = r["cobertura_intereses"]
        add("Pago de intereses", "verde" if ci > 5 else "ambar" if ci > 2 else "rojo",
            f"La utilidad operativa cubre {ci:.1f} veces los intereses del año.")
    if r["flujo_libre"] is not None:
        add("Generación de efectivo", "verde" if r["flujo_libre"] > 0 and (r["conversion_efectivo"] or 0) >= 0.8 else "ambar" if r["flujo_libre"] > 0 or (regulada and (r["conversion_efectivo"] or 0) >= 1) else "rojo",
            f"Flujo libre de {r['flujo_libre'] / 1e6:,.0f} millones de {est['moneda']}"
            + (f" ({_pct(r['margen_flujo_libre'])} de los ingresos)" if r["margen_flujo_libre"] is not None else "")
            + (f"; el flujo operativo equivale a {r['conversion_efectivo']:.2f} veces la utilidad neta" if r["conversion_efectivo"] is not None else "")
            + ("; en servicios públicos el flujo libre negativo es habitual por la inversión en redes y plantas" if regulada and r["flujo_libre"] <= 0 else "") + ".")
    if paga_dividendo or r["payout_utilidad"]:
        pf = r["payout_flujo_libre"]
        pu = r["payout_utilidad"]
        if pf is not None or pu is not None:
            base = pf if pf is not None else pu
            add("Dividendo", "verde" if base < 0.6 else "ambar" if base <= 1 else "rojo",
                "Paga en dividendos " + (f"{_pct(pu)} de su utilidad" if pu is not None else "")
                + (" y " if pu is not None and pf is not None else "") + (f"{_pct(pf)} de su flujo libre" if pf is not None else "")
                + ("; por arriba de 100 % el dividendo depende de deuda o reservas." if base > 1 else "."))
    if f:
        add("Piotroski F", "verde" if f["puntos"] >= 7 else "ambar" if f["puntos"] >= 4 else "rojo",
            f"{f['puntos']} de 9 señales de salud financiera mejoran o son positivas frente al año anterior.")
    if z and z.get("aplica"):
        add("Altman Z", {"segura": "verde", "gris": "ambar"}.get(z["zona"], "rojo"),
            f"Z de {z['z']}: zona {z['zona']} (más de 2.99 segura; menos de 1.81, riesgo de quiebra en dos años según el modelo).")
    return out


def calificacion(diag):
    """Semáforo general: rojo si hay 2 o más rojos; verde si la mayoría es verde y no hay rojos; ámbar en otro caso."""
    rojos = sum(d["semaforo"] == "rojo" for d in diag)
    verdes = sum(d["semaforo"] == "verde" for d in diag)
    if not diag:
        return "sin_datos"
    if rojos >= 2:
        return "rojo"
    if rojos == 0 and verdes >= len(diag) / 2:
        return "verde"
    return "ambar"


def documentos(subs, maximo=12):
    """Enlaces a los reportes originales en EDGAR (solo metadatos públicos)."""
    if not subs:
        return []
    r = subs.get("filings", {}).get("recent", {})
    cik = int(subs.get("cik", 0) or 0)
    out = []
    for i, forma in enumerate(r.get("form", [])):
        if forma not in ("10-K", "10-Q", "20-F", "40-F", "6-K", "8-K", "ARS", "DEF 14A"):
            continue
        acc = r["accessionNumber"][i].replace("-", "")
        out.append({"forma": forma, "fecha": r["filingDate"][i], "periodo": r.get("reportDate", [""] * (i + 1))[i],
                    "url": f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/{r['primaryDocument'][i]}"})
        if len(out) >= maximo:
            break
    return out


def motivo_sin_datos(inst):
    t, s = inst.get("ticker", ""), inst.get("sector") or ""
    if t.endswith("-USD") or "Cripto" in s:
        return "Criptomoneda: no tiene estados financieros."
    if "ETF" in s:
        return "ETF o índice: es una canasta de empresas, no una empresa."
    if t.endswith(".MX"):
        return "Emisora mexicana: sus reportes trimestrales se toman de la CNBV vía BIVA (paso siguiente del proceso)."
    return "No presenta reportes a la SEC con datos XBRL (ADR fuera de bolsa u otra jurisdicción)."


def analizar(inst, cik, facts, subs):
    est = estados(facts)
    if not est["anios"]:
        return None
    rz = razones(est)
    f = piotroski(est, rz)
    z = altman(est, inst.get("current_price"), inst.get("currency"), inst.get("sector"))
    diag = diagnostico(est, rz, f, z, bool(inst.get("pays_dividend")), inst.get("sector") or "")
    return {"ticker": inst["ticker"], "nombre": inst.get("name") or facts.get("entityName", ""), "empresa_sec": facts.get("entityName", ""),
            "cik": cik, "sector": inst.get("sector"), "moneda": est["moneda"], "anios": est["anios"], "cierres": est["tabla"].get("_fin", {}),
            "estados": {c: est["tabla"][c] for c in CONCEPTOS}, "razones": rz, "piotroski": f, "altman": z,
            "diagnostico": diag, "calificacion": calificacion(diag), "documentos": documentos(subs),
            "fuente": "SEC EDGAR (datos XBRL de los reportes 10-K, 20-F y 40-F; dominio público)"}


AVISO_403 = ("La SEC rechazó la consulta (HTTP 403): pide identificarse con nombre y correo. En GitHub → Settings → "
             "Secrets and variables → Actions → New repository secret, crea SEC_USER_AGENT con un valor como "
             "«DOMINUS Analisis tucorreo@dominio.com» y vuelve a correr «Estados financieros».")


def main(salida="finanzas", limite=None):
    os.makedirs(salida, exist_ok=True)
    port = pedir(PORTAFOLIO) or []
    try:
        mapa = {v["ticker"].upper(): int(v["cik_str"]) for v in (pedir(TICKERS) or {}).values()}
    except urllib.error.HTTPError as e:
        if e.code != 403:
            raise
        print(f"::error title=SEC EDGAR::{AVISO_403}")
        return 1
    indice, n = [], 0
    for inst in port:
        t = (inst.get("ticker") or "").upper()
        fila = {"ticker": t, "nombre": inst.get("name", ""), "sector": inst.get("sector")}
        cik = mapa.get(t) or mapa.get(t.replace(".", "-"))
        if not cik or t.endswith((".MX", "-USD")) or "ETF" in (inst.get("sector") or ""):
            indice.append({**fila, "estado": "sin_datos", "motivo": motivo_sin_datos(inst)})
            continue
        if limite and n >= limite:
            break
        n += 1
        try:
            facts = pedir(FACTS.format(cik=cik))
            time.sleep(PAUSA)
            subs = pedir(SUBS.format(cik=cik))
            time.sleep(PAUSA)
            res = analizar(inst, cik, facts or {}, subs) if facts else None
        except Exception as e:  # noqa: BLE001  una empresa con error no detiene a las demás
            res = None
            previo = os.path.join(salida, re.sub(r"[^A-Z0-9.-]", "_", t) + ".json")
            if os.path.exists(previo):  # se conserva el análisis de la semana anterior
                try:
                    res = json.load(open(previo, encoding="utf-8"))
                    res["nota"] = "Datos de la corrida anterior: la SEC no respondió esta vez."
                except (OSError, ValueError):
                    res = None
            if not res:
                motivo = "La SEC limitó las consultas; se reintenta la próxima semana." if isinstance(e, Limite) else f"{type(e).__name__}"[:80]
                indice.append({**fila, "estado": "error", "motivo": motivo})
                continue
        if not res:
            indice.append({**fila, "estado": "sin_datos", "motivo": motivo_sin_datos(inst)})
            continue
        with open(os.path.join(salida, re.sub(r"[^A-Z0-9.-]", "_", t) + ".json"), "w", encoding="utf-8") as fh:
            json.dump(res, fh, ensure_ascii=False, separators=(",", ":"))
        indice.append({**fila, "estado": "ok", "calificacion": res["calificacion"], "moneda": res["moneda"], "ultimo": res["anios"][-1]})
    with open(os.path.join(salida, "indice.json"), "w", encoding="utf-8") as fh:
        json.dump({"generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": "SEC EDGAR",
                   "aviso": "Información con fines educativos; no es asesoría de inversión.", "empresas": indice}, fh, ensure_ascii=False, indent=0)
    ok = sum(x["estado"] == "ok" for x in indice)
    print(f"finanzas: {ok} empresas con estados financieros de {len(indice)} instrumentos")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "finanzas", int(sys.argv[2]) if len(sys.argv) > 2 else None))
