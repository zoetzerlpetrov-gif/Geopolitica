#!/usr/bin/env python3
"""Empresas registradas en México cuya matriz está en otro país, según GLEIF (Global Legal Entity Identifier Foundation).

Complementa a extranjeras_mx.py (Wikidata), que solo cubre empresas grandes. GLEIF publica sus datos con licencia CC0.
  1. Entidades con domicilio legal en México: API de GLEIF, 200 por página (≈7,700 en octubre de 2026, ≈40 páginas).
  2. Relaciones de consolidación (archivo «rr» de la copia dorada, ≈24 MB): para cada entidad mexicana, su matriz última
     (IS_ULTIMATELY_CONSOLIDATED_BY) o, si no hay, la directa (IS_DIRECTLY_CONSOLIDATED_BY); y las sucursales de empresas
     extranjeras (IS_INTERNATIONAL_BRANCH_OF).
  3. Nombre y país de cada matriz: API de GLEIF, 100 identificadores por consulta.
Solo quedan las que tienen matriz fuera de México. Solo entran empresas con LEI: muchas filiales pequeñas no lo tienen.
Se renueva cada 7 días; un intento fallido se repite en 6 h. Salida: vivos/empresas_extranjeras_gleif.json.
"""
import csv
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "vivos", "empresas_extranjeras_gleif.json")
INTENTO = os.path.join(ROOT, "vivos", "empresas_extranjeras_gleif.intento")
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
API = "https://api.gleif.org/api/v1/lei-records"
COPIA = "https://goldencopy.gleif.org/api/v2/golden-copies/publishes/latest"
DIAS, REINTENTO_H = 7, 6
TIPOS = {"IS_ULTIMATELY_CONSOLIDATED_BY": 0, "IS_DIRECTLY_CONSOLIDATED_BY": 1, "IS_INTERNATIONAL_BRANCH_OF": 2}
ULTIMA = [0.0]


def pedir(url, timeout=60):
    """GET con pausa de 1.1 s entre consultas (la API de GLEIF admite 60 por minuto)."""
    espera = 1.1 - (time.time() - ULTIMA[0])
    if espera > 0:
        time.sleep(espera)
    ULTIMA[0] = time.time()
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/vnd.api+json"}), timeout=timeout) as r:
        return r.read()


def entidad(x):
    """Registro de la API → {lei, nombre, ciudad, pais (ISO2), estado}."""
    e = (x.get("attributes") or {}).get("entity") or {}
    dom = e.get("legalAddress") or {}
    return {"lei": x.get("id", ""), "nombre": (e.get("legalName") or {}).get("name", ""), "ciudad": dom.get("city", ""),
            "pais": dom.get("country", ""), "estado": e.get("status", "")}


def entidades_mx(consultar=pedir, max_paginas=80):
    out, pag = {}, 1
    while pag <= max_paginas:
        p = urllib.parse.urlencode({"filter[entity.legalAddress.country]": "MX", "page[size]": "200", "page[number]": str(pag)})
        d = json.loads(consultar(f"{API}?{p}"))
        for x in d.get("data", []):
            r = entidad(x)
            out[r["lei"]] = r
        if pag >= (d.get("meta", {}).get("pagination", {}).get("lastPage") or 0):
            break
        pag += 1
    return out


def url_relaciones(publicacion):
    return publicacion["data"]["rr"]["full_file"]["csv"]["url"]


def matrices(filas, mx):
    """Filas del CSV de relaciones → {lei mexicano: (lei matriz, tipo)}, con preferencia por la matriz última."""
    elegido = {}
    for f in filas:
        hijo, padre, tipo = f.get("Relationship.StartNode.NodeID"), f.get("Relationship.EndNode.NodeID"), f.get("Relationship.RelationshipType")
        if hijo not in mx or tipo not in TIPOS or f.get("Relationship.RelationshipStatus") != "ACTIVE" or not padre:
            continue
        if hijo not in elegido or TIPOS[tipo] < TIPOS[elegido[hijo][1]]:
            elegido[hijo] = (padre, tipo)
    return elegido


def leer_relaciones(zip_bytes):
    z = zipfile.ZipFile(io.BytesIO(zip_bytes))
    return csv.DictReader(io.TextIOWrapper(z.open(z.namelist()[0]), encoding="utf-8"))


def datos_matrices(leis, consultar=pedir, lote=100):
    out = {}
    leis = sorted(set(leis))
    for i in range(0, len(leis), lote):
        p = urllib.parse.urlencode({"filter[lei]": ",".join(leis[i:i + lote]), "page[size]": str(lote)})
        for x in json.loads(consultar(f"{API}?{p}")).get("data", []):
            r = entidad(x)
            out[r["lei"]] = r
    return out


def armar(mx, elegido, padres, nombre_pais):
    """Solo las que tienen matriz fuera de México y activas."""
    out = []
    for lei, (plei, tipo) in elegido.items():
        h, m = mx[lei], padres.get(plei)
        if not m or not m["pais"] or m["pais"] == "MX" or h.get("estado") == "INACTIVE":
            continue
        out.append({"filial": h["nombre"], "lei": lei, "ciudad": h["ciudad"], "matriz": m["nombre"], "matriz_lei": plei, "iso": m["pais"],
                    "pais": nombre_pais(m["pais"]), "industrias": [], "relacion": {"IS_INTERNATIONAL_BRANCH_OF": "sucursal"}.get(tipo, "filial")})
    return sorted(out, key=lambda r: (r["matriz"].lower(), r["filial"].lower()))


def nombre_pais_desde_gazetteer():
    g = json.load(open(os.path.join(ROOT, "config", "gazetteer.json"), encoding="utf-8"))
    return lambda iso2: (g["paises"].get(g["iso2_a_iso3"].get(iso2, ""), {}) or {}).get("es", iso2)


def toca(ahora):
    """¿Hay que actualizar? Datos de menos de 7 días o un fallo de hace menos de 6 h: no."""
    try:
        gen = json.load(open(OUT, encoding="utf-8")).get("generado_utc", "")
        if gen and ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(days=DIAS):
            return False
    except (OSError, ValueError):
        pass
    try:
        previo = datetime.strptime(open(INTENTO, encoding="utf-8").read().strip(), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        if ahora - previo < timedelta(hours=REINTENTO_H):
            return False
    except (OSError, ValueError):
        pass
    return True


def main():
    ahora = datetime.now(timezone.utc)
    if not toca(ahora):
        print("extranjeras GLEIF: datos recientes o fallo reciente; se conserva lo anterior")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(INTENTO, "w", encoding="utf-8").write(ahora.strftime("%Y-%m-%dT%H:%M:%SZ"))
    t0 = time.time()
    try:
        mx = entidades_mx()
        elegido = matrices(leer_relaciones(pedir(url_relaciones(json.loads(pedir(COPIA))), timeout=300)), mx)
        padres = datos_matrices({p for p, _ in elegido.values()})
    except Exception as e:  # noqa: BLE001
        print(f"extranjeras GLEIF: falló ({e}); se conserva lo anterior")
        return 0
    registros = armar(mx, elegido, padres, nombre_pais_desde_gazetteer())
    json.dump({"generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": "GLEIF (CC0)",
               "entidades_mx": len(mx), "con_relacion": len(elegido), "empresas": registros},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"extranjeras GLEIF: {len(registros)} con matriz extranjera de {len(mx)} entidades mexicanas ({time.time() - t0:.0f} s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
