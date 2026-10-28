#!/usr/bin/env python3
"""Empresas extranjeras que operan en México: catálogo filtrable (Wikidata, CC0).

Tres consultas a Wikidata:
  1. Filiales ubicadas en México (país = México) cuya matriz (P749) tiene sede en otro país.
  2. Empresas con sede fuera de México que declaran una filial (P355) en México.
  3. Empresas con sede fuera de México cuya zona de operación (P2541) incluye a México.
De cada una se guarda: empresa en México (si se conoce), matriz, país de la matriz (nombre e ISO), industria, sitio
web y el identificador de Wikidata. Wikidata es incompleta: falta una empresa no significa que no opere en México.
En el navegador, el buscador también consulta GLEIF (LEI de empresas registradas en México y su matriz) en vivo.
Se renueva cada 7 días. Salida: vivos/empresas_extranjeras_mx.json.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "vivos", "empresas_extranjeras_mx.json")
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
SPARQL = "https://query.wikidata.org/sparql"
DIAS = 7

# Partes comunes: ?matriz con sede (P159→P17) o país (P17) distinto de México; industria y sitio opcionales.
_MATRIZ = """
  ?matriz wdt:P17 ?pais. FILTER(?pais != wd:Q96)
  ?pais wdt:P297 ?iso.
  OPTIONAL { ?matriz wdt:P452 ?industria. }
  OPTIONAL { ?matriz wdt:P856 ?web. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }"""
CONSULTAS = {
    "filial_en_mexico": f"""SELECT DISTINCT ?filial ?filialLabel ?matriz ?matrizLabel ?paisLabel ?iso ?industriaLabel ?web WHERE {{
  ?filial wdt:P17 wd:Q96; wdt:P749 ?matriz.{_MATRIZ}
}} LIMIT 6000""",
    "declara_filial": f"""SELECT DISTINCT ?filial ?filialLabel ?matriz ?matrizLabel ?paisLabel ?iso ?industriaLabel ?web WHERE {{
  ?matriz wdt:P355 ?filial. ?filial wdt:P17 wd:Q96.{_MATRIZ}
}} LIMIT 6000""",
    "opera_en_mexico": f"""SELECT DISTINCT ?matriz ?matrizLabel ?paisLabel ?iso ?industriaLabel ?web WHERE {{
  ?matriz wdt:P2541 wd:Q96; wdt:P452 [].{_MATRIZ}
}} LIMIT 6000""",
}


def sparql(q, intentos=1, espera=65):
    """Consulta con tiempo límite corto: el paso corre dentro de «Datos en movimiento» (cada 20 min) y no debe alargarlo."""
    for i in range(intentos):
        try:
            req = urllib.request.Request(f"{SPARQL}?format=json&query={urllib.parse.quote(q)}",
                                         headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
            with urllib.request.urlopen(req, timeout=espera) as r:
                return json.loads(r.read())["results"]["bindings"]
        except Exception:  # noqa: BLE001
            if i == intentos - 1:
                raise
            time.sleep(5)
    return []


def qid(uri):
    return (uri or "").rsplit("/", 1)[-1]


def unir(filas_por_via):
    """{vía: [filas SPARQL]} → lista de registros sin duplicados (por matriz y filial), con las vías que lo respaldan."""
    out = {}
    for via, filas in filas_por_via.items():
        for f in filas:
            v = lambda k: f.get(k, {}).get("value", "")  # noqa: E731
            matriz, filial = qid(v("matriz")), qid(v("filial"))
            if not matriz or v("matrizLabel") == matriz:  # sin etiqueta legible: se omite
                continue
            r = out.setdefault((matriz, filial), {"matriz": v("matrizLabel"), "matriz_qid": matriz, "pais": v("paisLabel"), "iso": v("iso"),
                                                  "filial": v("filialLabel") if filial and v("filialLabel") != filial else "", "filial_qid": filial,
                                                  "industrias": [], "web": v("web"), "vias": []})
            ind = v("industriaLabel")
            if ind and not ind.startswith("Q") and ind not in r["industrias"]:
                r["industrias"].append(ind)
            if via not in r["vias"]:
                r["vias"].append(via)
            if not r["web"] and v("web"):
                r["web"] = v("web")
    # Una matriz que solo aparece por «opera en México» y también tiene filial listada: se queda la fila con filial.
    con_filial = {m for (m, fl) in out if fl}
    return sorted((r for (m, fl), r in out.items() if fl or m not in con_filial), key=lambda r: (r["matriz"].lower(), r["filial"].lower()))


INTENTO = os.path.join(ROOT, "vivos", "empresas_extranjeras_mx.intento")
REINTENTO_H = 6


def main():
    ahora = datetime.now(timezone.utc)
    if os.path.exists(OUT):
        gen = json.load(open(OUT, encoding="utf-8")).get("generado_utc", "")
        if gen and ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(days=DIAS):
            print("extranjeras: datos de hace menos de 7 días; se conservan")
            return 0
    # Un intento fallido reciente (Wikidata saturada) no se repite en cada corrida de 20 min, sino cada 6 h.
    if os.path.exists(INTENTO):
        try:
            previo = datetime.strptime(open(INTENTO, encoding="utf-8").read().strip(), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            if ahora - previo < timedelta(hours=REINTENTO_H):
                print("extranjeras: el último intento falló hace menos de 6 h; se espera")
                return 0
        except ValueError:
            pass
    os.makedirs(os.path.dirname(INTENTO), exist_ok=True)
    open(INTENTO, "w", encoding="utf-8").write(ahora.strftime("%Y-%m-%dT%H:%M:%SZ"))
    filas, errores = {}, {}
    for via, q in CONSULTAS.items():
        try:
            filas[via] = sparql(q)
        except Exception as e:  # noqa: BLE001
            errores[via] = str(e)[:150]
        time.sleep(5)
    if not filas:
        print(f"extranjeras: ninguna consulta respondió {errores}; se conserva el anterior")
        return 0
    registros = unir(filas)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": "Wikidata (CC0)", "errores": errores,
               "por_via": {k: len(v) for k, v in filas.items()}, "empresas": registros},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"extranjeras: {len(registros)} registros de {len({r['matriz_qid'] for r in registros})} matrices; {errores or ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
