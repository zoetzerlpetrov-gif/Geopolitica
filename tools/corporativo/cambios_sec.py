"""Cambios de directivos de empresas del catálogo reportados a la SEC (8-K, punto 5.02).

Wikidata (fuente del organigrama) tarda días o semanas en reflejar que un CEO renunció. Las empresas que cotizan en EUA
deben avisar a la SEC en 4 días hábiles con un 8-K, punto 5.02 («salida o nombramiento de directores y directivos»).
Cada día se leen los índices diarios de EDGAR (form.idx) de los últimos DIAS días; de los 8-K de empresas del catálogo
(campo cik de vivos/corporativo_empresas.json) se consulta el JSON de envíos de esa empresa para ver los puntos del 8-K.
Salida: vivos/corporativo_8k.json (publicado como data/vivos/) {cik: [{fecha, puntos, url}]} solo con los que traen 5.02. Datos de dominio público.
La SEC pide identificarse con un correo en el User-Agent (secreto SEC_USER_AGENT) y no más de 10 consultas por segundo.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")  # la corrida escribe en vivos/ (se publica como data/vivos/)
EMPRESAS = os.path.join(ROOT, "vivos", "corporativo_empresas.json")
OUT = os.path.join(ROOT, "vivos", "corporativo_8k.json")
AGENTE = os.environ.get("SEC_USER_AGENT", "").strip() or "DOMINUS-OSINT corporativo (github.com/zoetzerlpetrov-gif/Geopolitica)"
DIAS = 45
PAUSA = 0.2
INDICE = "https://www.sec.gov/Archives/edgar/daily-index/{y}/QTR{q}/form.{d}.idx"
ENVIOS = "https://data.sec.gov/submissions/CIK{cik}.json"


def pedir(url, abrir=urllib.request.urlopen):
    try:
        with abrir(urllib.request.Request(url, headers={"User-Agent": AGENTE, "Accept-Encoding": "identity"}), timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        # Fin de semana o día feriado: no hay índice. Para un archivo que no existe, el servidor de la SEC responde
        # 403 (no 404); un 403 por falta de identificación también falla en los envíos de cada empresa, que sí se reporta.
        if e.code in (403, 404) and "/daily-index/" in url:
            return None
        if e.code == 404:
            return None
        raise


def ocho_k(indice_txt, ciks):
    """Líneas de form.idx → [(cik, fecha AAAA-MM-DD)] de los 8-K (y 8-K/A) de empresas del catálogo."""
    out = []
    for linea in (indice_txt or "").splitlines():
        if not re.match(r"8-K(/A)?\s", linea):
            continue
        m = re.search(r"\s(\d{1,10})\s+(\d{4}-?\d{2}-?\d{2})\s+edgar/", linea)
        if m and m.group(1).zfill(10) in ciks:
            f = m.group(2).replace("-", "")
            out.append((m.group(1).zfill(10), f"{f[:4]}-{f[4:6]}-{f[6:]}"))
    return out


def con_502(envios, desde):
    """JSON de envíos de la SEC → [{fecha, puntos, url}] de los 8-K con punto 5.02 desde `desde`."""
    r = (envios or {}).get("filings", {}).get("recent", {})
    cik = str(envios.get("cik", "")).lstrip("0")
    out = []
    for i, forma in enumerate(r.get("form", [])):
        if not forma.startswith("8-K") or r["filingDate"][i] < desde:
            continue
        puntos = r.get("items", [""] * (i + 1))[i] or ""
        if "5.02" not in puntos:
            continue
        acc = r["accessionNumber"][i].replace("-", "")
        out.append({"fecha": r["filingDate"][i], "puntos": puntos, "forma": forma,
                    "url": f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/{r['primaryDocument'][i]}"})
    return out


def main(hoy=None, pedir_fn=pedir, dormir=time.sleep):
    hoy = hoy or datetime.now(timezone.utc).date()
    try:
        emp = json.load(open(EMPRESAS, encoding="utf-8"))
    except (OSError, ValueError):
        print("cambios SEC: sin catálogo de empresas")
        return 0
    ciks = {str(e["cik"]).zfill(10): e["id"] for e in emp.get("empresas", []) if e.get("cik")}
    try:
        previo = json.load(open(OUT, encoding="utf-8"))
    except (OSError, ValueError):
        previo = {}
    vistos = set(previo.get("dias_leidos", []))
    desde = (hoy - timedelta(days=DIAS)).isoformat()
    pendientes = {}
    leidos = []
    for k in range(DIAS):
        d = hoy - timedelta(days=k)
        clave = d.isoformat()
        if clave in vistos and k > 3:  # los últimos 3 días se releen (la SEC publica el índice al final del día)
            leidos.append(clave)
            continue
        try:
            txt = pedir_fn(INDICE.format(y=d.year, q=(d.month - 1) // 3 + 1, d=d.strftime("%Y%m%d")))
        except Exception as e:  # noqa: BLE001  un día sin respuesta no detiene a los demás (se relee en la próxima corrida)
            print(f"  índice {clave}: {type(e).__name__}")
            txt = None
            clave = None
        dormir(PAUSA)
        if txt is None:
            if clave:
                leidos.append(clave)
            continue
        for cik, f in ocho_k(txt.decode("latin-1"), ciks):
            pendientes[cik] = max(pendientes.get(cik, ""), f)
        leidos.append(clave)
    cambios = {c: v for c, v in (previo.get("cambios") or {}).items() if any(x["fecha"] >= desde for x in v)}
    for cik in pendientes:
        try:
            envios = json.loads(pedir_fn(ENVIOS.format(cik=cik)) or b"{}")
        except Exception as e:  # noqa: BLE001  una empresa con error no detiene a las demás
            print(f"  {cik}: {type(e).__name__}")
            continue
        dormir(PAUSA)
        lista = con_502(envios, desde)
        if lista:
            cambios[cik] = lista
    json.dump({"generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "dias": DIAS,
               "fuente": "SEC EDGAR, 8-K punto 5.02 (dominio público)", "dias_leidos": sorted(set(leidos))[-DIAS:],
               "cambios": {c: sorted(v, key=lambda x: x["fecha"], reverse=True) for c, v in cambios.items()},
               "empresa": {c: ciks.get(c, "") for c in cambios}}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"cambios SEC: {len(pendientes)} empresas del catálogo con 8-K en {DIAS} días; {len(cambios)} con cambio de directivos (5.02)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
