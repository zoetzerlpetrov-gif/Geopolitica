#!/usr/bin/env python3
"""Indicadores del Noticiero DOMINUS: cifras de fuentes oficiales, con su fecha y el dato anterior.

  México        Banco de México, API SIE (secreto BANXICO_API_KEY): tipo de cambio FIX, tasa objetivo, TIIE, CETES,
                bonos, inflación y reservas.
  Divisas       Banco Central Europeo (tipos de referencia diarios, sin llave) para EUR, USD, JPY, CNY, INR, GBP…;
                Banco Central de Rusia para el rublo (el BCE dejó de publicarlo en 2022).
  EUA           Departamento del Tesoro (curva de rendimientos diaria, CSV público), cada 6 h. La inflación y el desempleo
                de EUA (BLS) no se incluyen: el robots.txt de api.bls.gov no permite programas.
  Cripto        Kraken (API pública de la casa de cambio, sin llave; su robots.txt lo permite). No hay precio oficial de
                las criptomonedas: es el precio de una casa de cambio y así se rotula. (CoinGecko se descartó: su
                robots.txt no permite programas.)

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
AVISO = "Datos informativos de fuentes oficiales (cripto: precio de una casa de cambio). No son recomendación de inversión."
BANXICO = "https://www.banxico.org.mx/SieAPIRest/service/v1/series/{ids}/datos/{ini}/{fin}"
# (serie, nombre corto, unidad, decimales, grupo). Verificadas con la API el 21-oct-2026 (título de cada serie).
SERIES_BANXICO = [
    ("SF43718", "Dólar FIX", "MXN por USD", 4, "mx"), ("SF46410", "Euro", "MXN por EUR", 4, "mx"),
    ("SF46406", "Yen", "MXN por JPY", 4, "mx"), ("SF290383", "Yuan", "MXN por CNY", 4, "mx"),
    ("SF61745", "Tasa objetivo Banxico", "%", 2, "mx"), ("SF60648", "TIIE 28 días", "%", 4, "mx"), ("SF331451", "TIIE de fondeo", "%", 2, "mx"),
    ("SP30578", "Inflación anual (INPC)", "%", 2, "mx"), ("SP30577", "Inflación mensual (INPC)", "%", 2, "mx"),
    ("SF43707", "Reservas internacionales", "millones de USD", 1, "mx"),
    ("SF43936", "CETES 28 días", "%", 2, "mx_valores"), ("SF43939", "CETES 91 días", "%", 2, "mx_valores"),
    ("SF43942", "CETES 182 días", "%", 2, "mx_valores"), ("SF43945", "CETES 364 días", "%", 2, "mx_valores"),
    ("SF43883", "Bono M 3 años", "%", 2, "mx_valores"), ("SF44071", "Bono M 10 años", "%", 2, "mx_valores"),
    ("SF45384", "Bono M 20 años", "%", 2, "mx_valores"), ("SF60696", "Bono M 30 años", "%", 2, "mx_valores"),
    ("SF61592", "Udibono 3 años (tasa real)", "%", 2, "mx_valores"),
]
ECB = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
CBR = "https://www.cbr.ru/scripts/XML_daily.asp"
TESORO = ("https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/all/{mes}"
          "?type=daily_treasury_yield_curve&field_tdr_date_value_month={mes}&page&_format=csv")
KRAKEN = "https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,XRPUSD,XLMUSD"
CRIPTOS = [("XBT", "Bitcoin (BTC)"), ("ETH", "Ether (ETH)"), ("XRP", "XRP"), ("XLM", "Stellar (XLM)")]
CADA_6H = 6 * 3600


def bajar(url, timeout=40):
    """Descarga solo si el robots.txt del sitio lo permite."""
    if not F.permitido_por_robots(url):
        raise PermissionError("el robots.txt del sitio no lo permite")
    return F.get(url, timeout=timeout)


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
        _, corto, unidad, dec, grupo_ = meta[sid]
        f = vals[-1][0]
        out.append({**dato(sid, re.sub(r"\s+", " ", se.get("titulo") or corto).strip(), vals[-1][1], unidad, "-".join(reversed(f.split("/"))),
                           vals[-2][1] if len(vals) > 1 else None, dec, corto), "grupo": grupo_})
    return sorted(out, key=lambda x: [s[0] for s in series].index(x["id"]))


def banxico(token, ahora):
    ini, fin = (ahora - timedelta(days=430)).strftime("%Y-%m-%d"), ahora.strftime("%Y-%m-%d")
    if not F.permitido_por_robots(BANXICO):
        raise PermissionError("el robots.txt del sitio no lo permite")
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


# ------------------------------------------------------------------ cripto
def leer_kraken(js, fecha):
    """Ticker de Kraken → último precio en USD; el «anterior» es la apertura del día (campo «o», 00:00 UTC)."""
    res = js.get("result") or {}
    out = []
    for cod, nom in CRIPTOS:
        par = next((v for k, v in res.items() if cod in k and k.endswith("USD")), None)
        if not par:
            continue
        v, o = _num(par["c"][0]), _num(par.get("o"))
        out.append(dato(cod, f"{nom} en dólares", v, "USD", fecha, o, 2 if v >= 1 else 4, nom))
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
        mx = []

        def g_mx():
            mx[:] = banxico(token, ahora)
            return grupo("mx", "México: tipo de cambio, tasas, inflación y reservas", "Banco de México (SIE)", "https://www.banxico.org.mx/SieInternet/",
                         [x for x in mx if x["grupo"] == "mx"])
        intentar("mx", g_mx, 3600)
        intentar("mx_valores", lambda: grupo("mx_valores", "México: CETES, Bonos M y Udibonos (última subasta)", "Banco de México (SIE)",
                                             "https://www.banxico.org.mx/SieInternet/", [x for x in mx if x["grupo"] == "mx_valores"],
                                             "Tasa de rendimiento en la subasta primaria semanal."), 3600)
    else:
        errores.append("mx: falta el secreto BANXICO_API_KEY")

    def g_divisas():
        tasas, f = leer_ecb(bajar(ECB, timeout=30))
        # Tipos de los dos últimos días publicados: el anterior sirve para el cambio.
        dias = {**(viejos.get("divisas") or {}).get("dias", {}), f: tasas}
        dias = {k: dias[k] for k in sorted(dias)[-2:]}
        datos = divisas(tasas, f, dias[min(dias)] if len(dias) > 1 else None)
        try:
            rub, frub = leer_cbr(bajar(CBR, timeout=30))
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
                                        leer_tesoro(bajar(TESORO.format(mes=ahora.strftime("%Y%m")), timeout=40).decode("utf-8", "replace"))
                                        or leer_tesoro(bajar(TESORO.format(mes=(ahora.replace(day=1) - timedelta(days=1)).strftime("%Y%m")), timeout=40).decode("utf-8", "replace"))), CADA_6H)

    intentar("cripto", lambda: grupo("cripto", "Criptomonedas", "Kraken (casa de cambio; no hay precio oficial)", "https://www.kraken.com/prices",
                                     leer_kraken(json.loads(bajar(KRAKEN, timeout=30)), ahora.strftime("%Y-%m-%d %H:%M UTC")),
                                     "Cambio contra la apertura del día (00:00 UTC)."), 900)

    orden = ["mx", "mx_valores", "divisas", "eua_bonos", "cripto"]
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
