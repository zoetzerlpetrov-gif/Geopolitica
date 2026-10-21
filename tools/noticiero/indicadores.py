#!/usr/bin/env python3
"""Indicadores del Noticiero DOMINUS: cifras de fuentes oficiales, con su fecha y el dato anterior.

  México        Banco de México, API SIE (secreto BANXICO_API_KEY): tipo de cambio FIX, tasa objetivo, TIIE, CETES,
                bonos, inflación y reservas.
  Divisas       Banco Central Europeo (tipos de referencia diarios, sin llave) para EUR, USD, JPY, CNY, INR, GBP…;
                Banco Central de Rusia para el rublo (el BCE dejó de publicarlo en 2022).
  EUA           Departamento del Tesoro (curva de rendimientos diaria, CSV público) y Oficina de Estadísticas
                Laborales (inflación y desempleo, API v1 sin llave; 25 consultas al día por IP, por eso cada 6 h).
  Cripto        CoinGecko (API pública sin llave). No hay precio oficial de las criptomonedas: es un promedio de casas
                de cambio y así se rotula.

Índices bursátiles (S&P 500, Dow, IPC, Russell 2000, VIX) y metales no tienen una fuente oficial gratuita que se pueda
reproducir; la página enlaza a quien los publica. Nada de esto es recomendación de inversión.

Salida: vivos/indicadores.json  {generado_utc, aviso, grupos: [{id, titulo, fuente, enlace, nota, datos: [...]}], errores, marcas}
"""
import csv
import io
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "indicadores.json")
AVISO = "Datos informativos de fuentes oficiales (cripto: promedio de mercado). No son recomendación de inversión."
BANXICO = "https://www.banxico.org.mx/SieAPIRest/service/v1/series/{ids}/datos/{ini}/{fin}"
# (serie, nombre corto, unidad, decimales). Verificadas con la API (títulos en la sonda del 21-oct-2026).
SERIES_BANXICO = [
    ("SF43718", "Dólar FIX", "MXN por USD", 4),
    ("SF61745", "Tasa objetivo Banxico", "%", 2),
    ("SF60648", "TIIE 28 días", "%", 4),
    ("SF43936", "CETES 28 días", "%", 2),
]
ECB = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
CBR = "https://www.cbr.ru/scripts/XML_daily.asp"
TESORO = ("https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/all/{mes}"
          "?type=daily_treasury_yield_curve&field_tdr_date_value_month={mes}&page&_format=csv")
BLS = "https://api.bls.gov/publicAPI/v1/timeseries/data/"
COINGECKO = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,ripple,stellar&vs_currencies=usd,mxn&include_24hr_change=true"
CRIPTOS = [("bitcoin", "Bitcoin (BTC)"), ("ethereum", "Ether (ETH)"), ("ripple", "XRP"), ("stellar", "Stellar (XLM)")]
CADA_6H = 6 * 3600


def dato(id_, nombre, valor, unidad, fecha, previo=None, decimales=2, corto=""):
    return {"id": id_, "nombre": nombre, "corto": corto or nombre, "valor": valor, "previo": previo, "unidad": unidad, "fecha": fecha, "decimales": decimales}


def _num(v):
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------------------ Banxico
def leer_banxico(js, series=SERIES_BANXICO):
    """Respuesta de /series/{ids}/datos/{ini}/{fin} → datos con el último valor y el anterior."""
    meta = {s[0]: s for s in series}
    out = []
    for se in js.get("bmx", {}).get("series", []):
        sid = se.get("idSerie")
        if sid not in meta:
            continue
        vals = [(d["fecha"], _num(d["dato"])) for d in se.get("datos") or [] if _num(d.get("dato")) is not None]
        if not vals:
            continue
        _, corto, unidad, dec = meta[sid]
        f = vals[-1][0]
        out.append(dato(sid, se.get("titulo", corto), vals[-1][1], unidad, "-".join(reversed(f.split("/"))),
                        vals[-2][1] if len(vals) > 1 else None, dec, corto))
    return sorted(out, key=lambda x: [s[0] for s in series].index(x["id"]))


def banxico(token, ahora):
    ini, fin = (ahora - timedelta(days=430)).strftime("%Y-%m-%d"), ahora.strftime("%Y-%m-%d")
    url = BANXICO.format(ids=",".join(s[0] for s in SERIES_BANXICO), ini=ini, fin=fin)
    req = urllib.request.Request(url, headers={"User-Agent": F.UA, "Bmx-Token": token, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return leer_banxico(json.loads(r.read()))


# ------------------------------------------------------------------ divisas
def leer_ecb(xml_bytes):
    """{código: unidades por 1 EUR}, fecha."""
    raiz = ET.fromstring(xml_bytes)
    dia = next(c for c in raiz.iter() if c.tag.endswith("Cube") and c.get("time"))
    return {c.get("currency"): float(c.get("rate")) for c in dia if c.get("currency")}, dia.get("time")


def leer_cbr(xml_bytes):
    """Rublos por 1 USD y fecha (dd.mm.aaaa → aaaa-mm-dd)."""
    raiz = ET.fromstring(xml_bytes)
    f = "-".join(reversed(raiz.get("Date", "").split(".")))
    for v in raiz.findall("Valute"):
        if v.findtext("CharCode") == "USD":
            return float(v.findtext("Value").replace(",", ".")) / float(v.findtext("Nominal") or 1), f
    return None, f


def divisas(tasas, fecha, previas=None):
    """Cruces contra el dólar a partir de los tipos del BCE (por 1 EUR)."""
    usd = tasas.get("USD")
    if not usd:
        return []
    previas = previas or {}

    def cruce(c, t):
        return t.get(c) / t["USD"] if t.get(c) and t.get("USD") else None
    out = [dato("EURUSD", "Euro en dólares (EUR/USD)", usd, "USD por EUR", fecha, previas.get("USD"), 4, "EUR/USD")]
    for c, nom in [("MXN", "Pesos mexicanos por dólar"), ("JPY", "Yenes por dólar"), ("CNY", "Yuanes por dólar"), ("INR", "Rupias indias por dólar"),
                   ("GBP", "Libras por dólar"), ("CHF", "Francos suizos por dólar"), ("BRL", "Reales por dólar")]:
        v = cruce(c, tasas)
        if v:
            out.append(dato(f"USD{c}", f"{nom} (USD/{c})", v, f"{c} por USD", fecha, cruce(c, previas), 4, f"USD/{c}"))
    return out


# ------------------------------------------------------------------ EUA
def leer_tesoro(texto):
    """CSV de la curva diaria → bonos a 2, 10 y 30 años (último día y el anterior)."""
    filas = list(csv.DictReader(io.StringIO(texto)))
    if not filas:
        return []
    filas.sort(key=lambda r: datetime.strptime(r["Date"], "%m/%d/%Y"), reverse=True)
    f = datetime.strptime(filas[0]["Date"], "%m/%d/%Y").strftime("%Y-%m-%d")
    out = []
    for col, corto in [("3 Mo", "Letra 3 meses"), ("2 Yr", "Bono 2 años"), ("10 Yr", "Bono 10 años"), ("30 Yr", "Bono 30 años")]:
        v = _num(filas[0].get(col))
        if v is not None:
            out.append(dato(f"UST{col.replace(' ', '')}", f"Rendimiento del Tesoro de EUA, {corto.lower()}", v, "%", f,
                            _num(filas[1].get(col)) if len(filas) > 1 else None, 2, f"EUA {corto.lower()}"))
    return out


def leer_bls(js):
    """Inflación anual (IPC-U, sin ajuste) y desempleo de EUA."""
    out = []
    for se in js.get("Results", {}).get("series", []):
        d = [x for x in se.get("data", []) if re.match(r"M(0[1-9]|1[0-2])$", x.get("period", ""))]
        if not d:
            continue
        val = {(int(x["year"]), int(x["period"][1:])): float(x["value"]) for x in d}
        (a, m), v = max(val.items())
        fecha = f"{a}-{m:02d}"
        if se["seriesID"] == "CUUR0000SA0":
            def anual(a, m):
                return (val[(a, m)] / val[(a - 1, m)] - 1) * 100 if (a, m) in val and (a - 1, m) in val else None
            pa, pm = (a, m - 1) if m > 1 else (a - 1, 12)
            out.append(dato("CPIUS", "Inflación anual de EUA (IPC-U)", anual(a, m), "%", fecha, anual(pa, pm), 1, "Inflación EUA"))
        elif se["seriesID"] == "LNS14000000":
            pa, pm = (a, m - 1) if m > 1 else (a - 1, 12)
            out.append(dato("UNRATE", "Tasa de desempleo de EUA", v, "%", fecha, val.get((pa, pm)), 1, "Desempleo EUA"))
    return [x for x in out if x["valor"] is not None]


# ------------------------------------------------------------------ cripto
def leer_coingecko(js, fecha):
    out = []
    for cid, nom in CRIPTOS:
        p = js.get(cid) or {}
        if p.get("usd") is None:
            continue
        ch = p.get("usd_24h_change")
        previo = p["usd"] / (1 + ch / 100) if ch is not None else None
        out.append(dato(cid, f"{nom} en dólares", p["usd"], "USD", fecha, previo, 2 if p["usd"] >= 1 else 4, nom))
    return out


def grupo(id_, titulo, fuente, enlace, datos, nota=""):
    return {"id": id_, "titulo": titulo, "fuente": fuente, "enlace": enlace, "nota": nota, "datos": datos}


def main():
    ahora = datetime.now(timezone.utc)
    previo = {}
    if os.path.exists(OUT):
        try:
            previo = json.load(open(OUT, encoding="utf-8"))
        except ValueError:
            pass
    viejos = {g["id"]: g for g in previo.get("grupos", [])}
    marcas = previo.get("marcas", {})
    grupos, errores = {}, []

    def intentar(id_, fn, cada=0):
        """Corre una fuente; si falla o aún no le toca, se conserva el grupo anterior."""
        if cada and ahora.timestamp() - marcas.get(id_, 0) < cada and id_ in viejos:
            grupos[id_] = viejos[id_]
            return
        try:
            g = fn()
            if g["datos"]:
                grupos[id_] = g
                marcas[id_] = ahora.timestamp()
                return
            errores.append(f"{id_}: sin datos")
        except Exception as e:  # noqa: BLE001  una fuente caída no detiene a las demás
            errores.append(f"{id_}: {e}"[:160])
        if id_ in viejos:
            grupos[id_] = viejos[id_]

    token = os.environ.get("BANXICO_API_KEY", "")
    if token:
        intentar("mx", lambda: grupo("mx", "México: tipo de cambio, tasas e inflación", "Banco de México (SIE)", "https://www.banxico.org.mx/SieInternet/",
                                     banxico(token, ahora)), 3600)
    else:
        errores.append("mx: falta el secreto BANXICO_API_KEY")

    def g_divisas():
        tasas, f = leer_ecb(F.get(ECB, timeout=30))
        # Tipos de los dos últimos días publicados: el anterior sirve para el cambio.
        dias = {**(viejos.get("divisas") or {}).get("dias", {}), f: tasas}
        dias = {k: dias[k] for k in sorted(dias)[-2:]}
        datos = divisas(tasas, f, dias[min(dias)] if len(dias) > 1 else None)
        try:
            rub, frub = leer_cbr(F.get(CBR, timeout=30))
            if rub:
                ant = next((x for x in (viejos.get("divisas") or {}).get("datos", []) if x["id"] == "USDRUB"), None)
                previo_rub = (ant["valor"] if ant["fecha"] != frub else ant["previo"]) if ant else None
                datos.append(dato("USDRUB", "Rublos por dólar (USD/RUB, Banco Central de Rusia)", rub, "RUB por USD", frub, previo_rub, 4, "USD/RUB"))
        except Exception as e:  # noqa: BLE001
            errores.append(f"rublo: {e}"[:120])
        return {**grupo("divisas", "Divisas", "Banco Central Europeo (tipos de referencia) y Banco Central de Rusia",
                        "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html", datos,
                        "Cruces contra el dólar calculados con los tipos de referencia del BCE (14:00 CET)."), "dias": dias}
    intentar("divisas", g_divisas, 3600)

    intentar("eua_bonos", lambda: grupo("eua_bonos", "EUA: bonos del Tesoro", "Departamento del Tesoro de EUA",
                                        "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve",
                                        leer_tesoro(F.get(TESORO.format(mes=ahora.strftime("%Y%m")), timeout=40).decode("utf-8", "replace"))
                                        or leer_tesoro(F.get(TESORO.format(mes=(ahora.replace(day=1) - timedelta(days=1)).strftime("%Y%m")), timeout=40).decode("utf-8", "replace"))), CADA_6H)

    def g_bls():
        req = urllib.request.Request(BLS, data=json.dumps({"seriesid": ["CUUR0000SA0", "LNS14000000"]}).encode(),
                                       headers={"User-Agent": F.UA, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=40) as r:
            return grupo("eua_empleo", "EUA: inflación y desempleo", "Oficina de Estadísticas Laborales de EUA (BLS)", "https://www.bls.gov/", leer_bls(json.loads(r.read())))
    intentar("eua_empleo", g_bls, CADA_6H)

    intentar("cripto", lambda: grupo("cripto", "Criptomonedas", "CoinGecko (promedio de casas de cambio; no es fuente oficial)", "https://www.coingecko.com/",
                                     leer_coingecko(json.loads(F.get(COINGECKO, timeout=30)), ahora.strftime("%Y-%m-%d %H:%M UTC")), "Cambio contra hace 24 h."), 1200)

    orden = ["mx", "divisas", "eua_bonos", "eua_empleo", "cripto"]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "aviso": AVISO, "grupos": [grupos[k] for k in orden if k in grupos],
               "errores": errores, "marcas": marcas}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"indicadores: {sum(len(g['datos']) for g in grupos.values())} datos en {len(grupos)} grupos; errores: {errores}")
    for k in orden:
        for x in (grupos.get(k) or {}).get("datos", []):
            print(f"   {k} {x['corto']}: {x['valor']} ({x['fecha']}; anterior {x['previo']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
