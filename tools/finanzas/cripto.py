"""Criptomonedas del Portafolio: ficha de la red con datos abiertos de DefiLlama.

Una criptomoneda no es una empresa: no tiene estado de resultados. Lo más parecido a «ingresos» son las comisiones
que pagan los usuarios de su red, y a «tamaño del negocio», el valor bloqueado en sus aplicaciones (TVL) y las
monedas estables que circulan en ella. DefiLlama publica estos datos gratis (api.llama.fi, stablecoins.llama.fi).
Diagnóstico con reglas fijas: actividad (comisiones del último año), tendencia de las comisiones (último mes
anualizado frente al año) y tendencia del TVL a un año. Nada de esto es asesoría de inversión.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
import edgar as E  # noqa: E402

API = "https://api.llama.fi"
ESTABLES = "https://stablecoins.llama.fi/stablecoinchains"
AGENTE = "DOMINUS-OSINT finanzas (github.com/zoetzerlpetrov-gif/Geopolitica)"
PAUSA = 1.0
# Clave del Portafolio → (nombre de la red en DefiLlama, clave de comisiones). None: DefiLlama no la mide.
REDES = {
    "BTC-USD": ("Bitcoin", "bitcoin"), "ETH-USD": ("Ethereum", "ethereum"), "SOL-USD": ("Solana", "solana"),
    "BNB-USD": ("BSC", "bsc"), "AVAX-USD": ("Avalanche", "avalanche"), "ADA-USD": ("Cardano", "cardano"),
    "XRP-USD": ("XRPL", "xrpl"), "XLM-USD": ("Stellar", "stellar"), "HBAR-USD": ("Hedera", "hedera"),
    "DOGE-USD": ("Doge", None),
}


def pedir(url, abrir=urllib.request.urlopen):
    try:
        with abrir(urllib.request.Request(url, headers={"User-Agent": AGENTE, "Accept": "application/json"}), timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code in (400, 404, 500, 502):
            return None
        raise


def tendencia_tvl(historia):
    """Cambio del TVL a un año (fracción) con la serie diaria [{date, tvl}]."""
    if not historia or len(historia) < 370:
        return None
    hoy, antes = historia[-1]["tvl"], historia[-366]["tvl"]
    return (hoy / antes - 1) if antes else None


def diagnostico(f):
    out = []

    def add(tema, color, texto):
        out.append({"tema": tema, "semaforo": color, "texto": texto})

    a = f.get("comisiones_1a")
    if a is not None:
        add("Uso de la red (comisiones)", "verde" if a >= 100e6 else "ambar",
            f"Los usuarios pagaron {a / 1e6:,.1f} millones de USD en comisiones en el último año"
            + ("." if a >= 100e6 else "; hay redes que cobran muy poco por diseño (XRP, Stellar, Hedera), así que pocas comisiones no siempre significan poco uso."))
        m = f.get("comisiones_30d")
        if m is not None and a > 0:
            r = m * 12.17 / a
            add("Tendencia del uso", "verde" if r > 1.1 else "ambar" if r >= 0.7 else "rojo",
                f"El último mes, anualizado, equivale a {r * 100:.0f} % de las comisiones del año (arriba de 100 %: el uso crece).")
    t = f.get("tvl_cambio_1a")
    if t is not None:
        add("Valor bloqueado (TVL)", "verde" if t > 0.10 else "ambar" if t >= -0.30 else "rojo",
            f"El valor depositado en aplicaciones de la red cambió {t * 100:+.0f} % en un año, medido en dólares: incluye la variación del precio de las monedas (hoy: {f['tvl'] / 1e6:,.0f} millones de USD).")
    return out


def ficha(t, nombre, red, clave, chains, establecoins, historia, fees, revenue):
    c = next((x for x in chains if x.get("name") == red), {})
    f = {"tvl": c.get("tvl"), "tvl_cambio_1a": tendencia_tvl(historia),
         "comisiones_30d": (fees or {}).get("total30d"), "comisiones_1a": (fees or {}).get("total1y"),
         "ingresos_red_1a": (revenue or {}).get("total1y"),
         "estables": next((x["totalCirculatingUSD"].get("peggedUSD") for x in establecoins if x.get("name") == red), None)}
    diag = diagnostico(f)
    m = lambda v: "—" if v is None else f"{v / 1e6:,.1f} millones de USD"  # noqa: E731
    bloques = [{"titulo": f"Red {red}", "columnas": ["Dato", "Valor", "Qué significa"], "filas": [
        ["Comisiones pagadas (12 meses)", m(f["comisiones_1a"]), "Lo que los usuarios pagan por usar la red: lo más parecido a sus «ventas»."],
        ["Comisiones (30 días)", m(f["comisiones_30d"]), "Uso reciente."],
        ["Ingresos de la red (12 meses)", m(f["ingresos_red_1a"]), "Parte de las comisiones que se queda el protocolo (p. ej. se destruye o va a quienes validan)."],
        ["Valor bloqueado (TVL)", m(f["tvl"]), "Dinero depositado en las aplicaciones de la red (préstamos, intercambios)."],
        ["Cambio del TVL a un año", "—" if f["tvl_cambio_1a"] is None else f"{f['tvl_cambio_1a'] * 100:+.1f} %", ""],
        ["Monedas estables en la red", m(f["estables"]), "Dólares digitales que circulan en ella: señal de uso para pagos."],
    ], "nota": "Una criptomoneda no tiene estados financieros: su valor depende de la adopción de la red y de la oferta y demanda de la moneda."}]
    return {"ticker": t, "nombre": nombre, "empresa_sec": f"Red {red}", "sector": "Criptomonedas", "perfil": "cripto", "moneda": "USD",
            "anios": [], "estados": {}, "razones": {}, "piotroski": None, "altman": None, "red": f, "bloques": bloques,
            "diagnostico": diag, "calificacion": E.calificacion(diag),
            "documentos": [{"forma": "DefiLlama", "fecha": "", "url": f"https://defillama.com/chain/{red}"}],
            "fuente": "DefiLlama (datos abiertos de las redes: comisiones, TVL y monedas estables)"}


def main(salida="finanzas"):
    port = {i.get("ticker", "").upper(): i for i in (E.pedir(E.PORTAFOLIO) or [])}
    ruta = os.path.join(salida, "indice.json")
    indice = json.load(open(ruta, encoding="utf-8")) if os.path.exists(ruta) else {"empresas": []}
    por = {e["ticker"]: e for e in indice.get("empresas", [])}
    chains = pedir(f"{API}/v2/chains") or []
    time.sleep(PAUSA)
    estables = pedir(ESTABLES) or []
    ok = 0
    for t, (red, clave) in REDES.items():
        inst = port.get(t, {"ticker": t, "name": t})
        fila = por.setdefault(t, {"ticker": t, "nombre": inst.get("name", t), "sector": "Criptomonedas"})
        try:
            historia = pedir(f"{API}/v2/historicalChainTvl/{red}") or []
            time.sleep(PAUSA)
            fees = pedir(f"{API}/summary/fees/{clave}?dataType=dailyFees") if clave else None
            rev = pedir(f"{API}/summary/fees/{clave}?dataType=dailyRevenue") if clave else None
            time.sleep(PAUSA)
            res = ficha(t, inst.get("name") or t, red, clave, chains, estables, historia, fees, rev)
        except Exception as e:  # noqa: BLE001
            fila.update(estado="error", motivo=f"{type(e).__name__}"[:80])
            continue
        if not res["diagnostico"]:
            fila.update(estado="sin_datos", motivo="DefiLlama no publica comisiones ni TVL de esta red.")
            continue
        with open(os.path.join(salida, re.sub(r"[^A-Z0-9.-]", "_", t) + ".json"), "w", encoding="utf-8") as fh:
            json.dump(res, fh, ensure_ascii=False, separators=(",", ":"))
        fila.update(estado="ok", motivo="", calificacion=res["calificacion"], moneda="USD", ultimo="red")
        ok += 1
    indice["empresas"] = list(por.values())
    with open(ruta, "w", encoding="utf-8") as fh:
        json.dump(indice, fh, ensure_ascii=False, indent=0)
    print(f"finanzas cripto: {ok} redes con ficha")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "finanzas"))
