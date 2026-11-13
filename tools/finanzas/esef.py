"""Estados financieros de empresas europeas del Portafolio desde sus informes anuales ESEF.

Desde 2021 las emisoras de la UE publican su informe financiero anual en XBRL (formato ESEF, NIIF). filings.xbrl.org
(XBRL International) reúne los que entregan los registros nacionales y los ofrece en xBRL-JSON. Se busca cada empresa
por su LEI (identificador mundial de entidades, GLEIF) en config/finanzas_lei.json, se toman los dos informes más
recientes (hasta 4 ejercicios: cada uno trae el año y el anterior) y se reutilizan razones, puntajes y diagnóstico.
Las empresas que no aparecen ahí (p. ej. las alemanas, que publican en el Bundesanzeiger) quedan con su motivo.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(__file__))
import bmv as B  # noqa: E402
import edgar as E  # noqa: E402

API = "https://filings.xbrl.org"
AGENTE = "DOMINUS-OSINT finanzas (github.com/zoetzerlpetrov-gif/Geopolitica)"
PAUSA = 1.0
LEIS = os.path.join(os.path.dirname(__file__), "..", "..", "config", "finanzas_lei.json")


def pedir(url, abrir=urllib.request.urlopen):
    try:
        with abrir(urllib.request.Request(url, headers={"User-Agent": AGENTE, "Accept": "application/json"}), timeout=180) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def _dia(texto):
    return date.fromisoformat(texto[:10])


def periodo(p):
    """xBRL-JSON usa fin exclusivo: «2025-01-01T00:00:00/2026-01-01T00:00:00» → «2025-01-01/2025-12-31»;
    un instante «2026-01-01T00:00:00» es el cierre del 2025-12-31."""
    if "/" in p:
        ini, fin = p.split("/")
        return f"{ini[:10]}/{(_dia(fin) - timedelta(days=1)).isoformat()}"
    return (_dia(p) - timedelta(days=1)).isoformat() if p[11:19] == "00:00:00" else p[:10]


def leer_json(datos):
    """xBRL-JSON → mismo formato que bmv.leer_xbrl: {"hechos": {concepto: {periodo: valor}}, "moneda", "fibra"}.
    Solo totales (sin dimensiones adicionales) en moneda o número puro."""
    hechos, monedas = {}, {}
    for f in (datos or {}).get("facts", {}).values():
        d = f.get("dimensions", {})
        if set(d) - {"concept", "entity", "period", "unit", "language"} or "period" not in d:
            continue
        try:
            v = float(f.get("value"))
        except (TypeError, ValueError):
            continue
        unidad = str(d.get("unit") or "").split(":")[-1]
        if re.fullmatch(r"[A-Z]{3}", unidad):
            monedas[unidad] = monedas.get(unidad, 0) + 1
        nombre = str(d["concept"]).split(":")[-1]
        hechos.setdefault(nombre, {}).setdefault(periodo(d["period"]), v)
    return {"hechos": hechos, "moneda": max(monedas, key=monedas.get) if monedas else "EUR", "fibra": False}


def analizar(inst, lei, informes, docs):
    est = B.anuales(informes)
    if not est["anios"]:
        return None
    rz = E.razones(est)
    f = E.piotroski(est, rz) if len(est["anios"]) >= 2 else None
    z = E.altman(est, inst.get("current_price"), inst.get("currency"), inst.get("sector"))
    diag = E.diagnostico(est, rz, f, z, bool(inst.get("pays_dividend")), inst.get("sector") or "")
    return {"ticker": inst["ticker"], "nombre": inst.get("name") or lei, "empresa_sec": f"LEI {lei}", "sector": inst.get("sector"),
            "moneda": est["moneda"], "anios": est["anios"], "cierres": est["tabla"].get("_fin", {}),
            "estados": {c: est["tabla"][c] for c in B.CONCEPTOS}, "razones": rz, "piotroski": f, "altman": z,
            "diagnostico": diag, "calificacion": E.calificacion(diag), "documentos": docs, "perfil": "empresa",
            "fuente": "Informes financieros anuales ESEF (XBRL) de los registros de la UE, vía filings.xbrl.org"}


def main(salida="finanzas"):
    leis = json.load(open(LEIS, encoding="utf-8")).get("empresas", {})
    port = {i.get("ticker", "").upper(): i for i in (E.pedir(E.PORTAFOLIO) or [])}
    ruta = os.path.join(salida, "indice.json")
    indice = json.load(open(ruta, encoding="utf-8")) if os.path.exists(ruta) else {"empresas": []}
    por = {e["ticker"]: e for e in indice.get("empresas", [])}
    ok = 0
    for t, info in leis.items():
        inst = port.get(t, {"ticker": t, "name": info.get("nombre"), "sector": info.get("sector")})
        fila = por.setdefault(t, {"ticker": t, "nombre": inst.get("name", ""), "sector": inst.get("sector")})
        if not info.get("lei") or not info.get("esef", True):
            fila.update(estado="sin_datos", motivo=info.get("motivo") or "Sin informe ESEF disponible.")
            continue
        try:
            lista = (pedir(f"{API}/api/entities/{info['lei']}/filings?page[size]=50") or {}).get("data", [])
            time.sleep(PAUSA)
            lista = sorted((x["attributes"] for x in lista if x["attributes"].get("json_url")), key=lambda a: (a["period_end"], a.get("date_added", "")), reverse=True)
            elegidos, vistos = [], set()
            for a in lista:
                if a["period_end"] not in vistos:
                    vistos.add(a["period_end"])
                    elegidos.append(a)
                if len(elegidos) == 2:
                    break
            if not elegidos:
                fila.update(estado="sin_datos", motivo=info.get("motivo") or "filings.xbrl.org no tiene su informe ESEF.")
                continue
            informes = []
            for a in elegidos:
                informes.append(leer_json(pedir(API + a["json_url"])))
                time.sleep(PAUSA)
            docs = [{"forma": f"Informe anual ESEF {a['period_end'][:4]}", "fecha": (a.get("date_added") or "")[:10], "periodo": a["period_end"],
                     "url": API + (a.get("viewer_url") or a.get("report_url") or a["json_url"])} for a in elegidos]
            res = analizar(inst, info["lei"], informes, docs)
        except Exception as e:  # noqa: BLE001
            fila.update(estado="error", motivo=f"{type(e).__name__}"[:80])
            continue
        if not res:
            fila.update(estado="sin_datos", motivo="El informe ESEF no trae estados comparables.")
            continue
        with open(os.path.join(salida, re.sub(r"[^A-Z0-9.-]", "_", t) + ".json"), "w", encoding="utf-8") as fh:
            json.dump(res, fh, ensure_ascii=False, separators=(",", ":"))
        fila.update(estado="ok", motivo="", calificacion=res["calificacion"], moneda=res["moneda"], ultimo=res["anios"][-1])
        ok += 1
    indice["empresas"] = list(por.values())
    with open(ruta, "w", encoding="utf-8") as fh:
        json.dump(indice, fh, ensure_ascii=False, indent=0)
    print(f"finanzas ESEF: {ok} empresas europeas con estados financieros")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "finanzas"))
