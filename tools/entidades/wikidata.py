#!/usr/bin/env python3
"""Fase C2: organizaciones y personas de rol público desde Wikidata (CC0).

Genera:
  data/entidades/personas.json        jefes de Estado y de gobierno vigentes, líderes de organismos y CEOs
  data/entidades/organizaciones.json  gobiernos, organismos internacionales, bolsas de valores y empresas
  data/entidades/organismos.geojson   sedes de organismos internacionales y bolsas (capa del mapa)
  data/entidades/manifest.json        estado de la extracción (el mapa lo combina con data/capas/manifest.json)

Reglas de privacidad (se aplican en código, no solo en el esquema):
  - De cada persona se guarda SOLO: id de Wikidata, nombre, cargo, organización, país, subtipo y enlace.
  - Nunca se consultan ni se guardan coordenadas, residencias, familiares, contactos ni fecha de nacimiento.
  - Las personas no tienen geometría: no existe capa de personas.
Uso:  python3 tools/entidades/wikidata.py
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DESTINO = os.path.join(ROOT, "data", "entidades")
ENDPOINT = "https://query.wikidata.org/sparql"
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica; datos de rol público)"
CAMPOS_PERSONA = ("id", "nombre", "cargo", "organizacion_id", "pais_iso3", "wikidata", "subtipo", "fuente", "actualizado_utc")

# Declaraciones "verdaderas" (wdt:): Wikidata marca como preferida la vigente, así que no hace falta
# filtrar por fecha de fin. La versión con calificadores excedía el límite de 60 s del servicio.
Q_JEFES = """
SELECT ?iso3 ?persona ?personaLabel ?rol WHERE {
  ?pais wdt:P31 wd:Q3624078; wdt:P298 ?iso3.
  { ?pais wdt:P35 ?persona. BIND("estado" AS ?rol) }
  UNION { ?pais wdt:P6 ?persona. BIND("gobierno" AS ?rol) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}"""

Q_ORGANISMOS = """
SELECT ?org ?orgLabel ?coord ?ciudadLabel ?lider ?liderLabel WHERE {
  ?org wdt:P31 wd:Q484652; wikibase:sitelinks ?links. FILTER(?links >= 40)
  OPTIONAL { ?org wdt:P159 ?ciudad. ?ciudad wdt:P625 ?coord. }
  OPTIONAL { ?org p:P488 ?s. ?s ps:P488 ?lider. FILTER NOT EXISTS { ?s pq:P582 ?f } }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}"""

Q_BOLSAS = """
SELECT ?org ?orgLabel ?coord ?ciudadLabel ?iso3 WHERE {
  ?org wdt:P31 wd:Q11691; wikibase:sitelinks ?links. FILTER(?links >= 8)
  OPTIONAL { ?org wdt:P625 ?c1. }
  OPTIONAL { ?org wdt:P159 ?ciudad. ?ciudad wdt:P625 ?c2. }
  BIND(COALESCE(?c1, ?c2) AS ?coord)
  OPTIONAL { ?org wdt:P17 ?pais. ?pais wdt:P298 ?iso3. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}"""

Q_EMPRESAS = """
SELECT ?org ?orgLabel ?iso3 ?ceo ?ceoLabel WHERE {
  ?org wdt:P31 wd:Q891723; wikibase:sitelinks ?links. FILTER(?links >= 60)
  OPTIONAL { ?org wdt:P17 ?pais. ?pais wdt:P298 ?iso3. }
  OPTIONAL { ?org p:P169 ?s. ?s ps:P169 ?ceo. FILTER NOT EXISTS { ?s pq:P582 ?f } }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}"""


def sparql(consulta):
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": consulta, "format": "json"})
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)["results"]["bindings"]
        except Exception as e:  # noqa: BLE001
            print(f"  reintento {i + 1}: {e}")
            time.sleep(20 * (i + 1))
    raise RuntimeError("Wikidata no respondió")


def qid(uri):
    return uri.rsplit("/", 1)[-1]


def val(fila, k):
    return fila.get(k, {}).get("value")


def coord(wkt):
    # "Point(-99.13 19.43)"
    if not wkt or not wkt.startswith("Point("):
        return None
    lon, lat = wkt[6:-1].split()
    return {"lat": round(float(lat), 4), "lon": round(float(lon), 4)}


def persona(id_, nombre, cargo, org, iso3, subtipo, ahora):
    p = {"id": id_, "nombre": nombre, "cargo": cargo, "organizacion_id": org, "pais_iso3": iso3 or None,
         "wikidata": f"https://www.wikidata.org/wiki/{id_}", "subtipo": subtipo, "fuente": "wikidata", "actualizado_utc": ahora}
    return {k: p[k] for k in CAMPOS_PERSONA}  # lista blanca: nada fuera de estos campos


def main():
    os.makedirs(DESTINO, exist_ok=True)
    ahora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    personas, orgs, geo = {}, {}, []
    estado = {}

    def paso(nombre, fn):
        t0 = time.time()
        try:
            n = fn()
            estado[nombre] = {"estado": "ok", "registros": n, "segundos": round(time.time() - t0)}
        except Exception as e:  # noqa: BLE001
            estado[nombre] = {"estado": "error", "error": str(e)[:300]}
        print(nombre, estado[nombre])
        time.sleep(5)  # cortesía con el servicio público de consultas

    def jefes():
        n = 0
        for f in sparql(Q_JEFES):
            iso3, pid = val(f, "iso3"), qid(val(f, "persona"))
            org = f"gob:{iso3}"
            orgs.setdefault(org, {"id": org, "nombre": f"Gobierno ({iso3})", "subtipo": "gobiernos_ministerios", "sector": None,
                                  "pais_iso3": iso3, "lei": None, "wikidata": None, "sede": None, "indices": [], "personas": [],
                                  "fuente": "wikidata", "url_fuente": None})
            cargo = "Jefatura de Estado" if val(f, "rol") == "estado" else "Jefatura de gobierno"
            if pid in personas:  # misma persona en ambos cargos (p. ej. México, EUA)
                if cargo not in personas[pid]["cargo"]:
                    personas[pid]["cargo"] += f" y {cargo.lower()}"
            else:
                personas[pid] = persona(pid, val(f, "personaLabel"), cargo, org, iso3, "jefes_estado_gobierno", ahora)
                n += 1
            if pid not in orgs[org]["personas"]:
                orgs[org]["personas"].append(pid)
        return n

    def organismos():
        n = 0
        for f in sparql(Q_ORGANISMOS):
            oid = qid(val(f, "org"))
            o = orgs.setdefault(oid, {"id": oid, "nombre": val(f, "orgLabel"), "subtipo": "organismos_internacionales", "sector": None,
                                      "pais_iso3": None, "lei": None, "wikidata": f"https://www.wikidata.org/wiki/{oid}",
                                      "sede": None, "indices": [], "personas": [], "fuente": "wikidata", "url_fuente": None})
            c = coord(val(f, "coord"))
            if c and not o["sede"]:
                o["sede"] = {**c, "ciudad": val(f, "ciudadLabel") or ""}
            if val(f, "lider"):
                lid = qid(val(f, "lider"))
                if lid not in personas:
                    personas[lid] = persona(lid, val(f, "liderLabel"), f"Liderazgo de {o['nombre']}", oid, None, "lideres_organismos", ahora)
                if lid not in o["personas"]:
                    o["personas"].append(lid)
            n += 1
        return n

    def bolsas():
        n = 0
        for f in sparql(Q_BOLSAS):
            oid = qid(val(f, "org"))
            c = coord(val(f, "coord"))
            o = orgs.setdefault(oid, {"id": oid, "nombre": val(f, "orgLabel"), "subtipo": "bolsas_valores", "sector": "finanzas",
                                      "pais_iso3": val(f, "iso3"), "lei": None, "wikidata": f"https://www.wikidata.org/wiki/{oid}",
                                      "sede": None, "indices": [], "personas": [], "fuente": "wikidata", "url_fuente": None})
            if c and not o["sede"]:
                o["sede"] = {**c, "ciudad": val(f, "ciudadLabel") or ""}
            n += 1
        return n

    def empresas():
        n = 0
        for f in sparql(Q_EMPRESAS):
            oid = qid(val(f, "org"))
            o = orgs.setdefault(oid, {"id": oid, "nombre": val(f, "orgLabel"), "subtipo": "empresas", "sector": None,
                                      "pais_iso3": val(f, "iso3"), "lei": None, "wikidata": f"https://www.wikidata.org/wiki/{oid}",
                                      "sede": None, "indices": [], "personas": [], "fuente": "wikidata", "url_fuente": None})
            if val(f, "ceo"):
                cid = qid(val(f, "ceo"))
                if cid not in personas:
                    personas[cid] = persona(cid, val(f, "ceoLabel"), f"Dirección general de {o['nombre']}", oid, val(f, "iso3"), "ceos_directivos", ahora)
                if cid not in o["personas"]:
                    o["personas"].append(cid)
            n += 1
        return n

    for nombre, fn in [("jefes", jefes), ("organismos", organismos), ("bolsas", bolsas), ("empresas", empresas)]:
        paso(nombre, fn)

    if not personas and not orgs:
        print("Sin datos: se conservan los archivos anteriores.")
        return 1

    for o in orgs.values():
        if o["sede"] and o["subtipo"] in ("organismos_internacionales", "bolsas_valores"):
            geo.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [o["sede"]["lon"], o["sede"]["lat"]]},
                        "properties": {"id": f"wd:{o['id']}", "n": o["nombre"], "st": o["subtipo"], "p": o["pais_iso3"] or "", "x": o["sede"]["ciudad"]}})

    def escribir(nombre, datos):
        with open(os.path.join(DESTINO, nombre), "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=0 if nombre.endswith(".geojson") else 1)

    escribir("personas.json", {"generado_utc": ahora, "fuente": "Wikidata (CC0)", "nota": "Solo rol público.",
                               "registros": sorted(personas.values(), key=lambda p: p["id"])})
    escribir("organizaciones.json", {"generado_utc": ahora, "fuente": "Wikidata (CC0)", "registros": sorted(orgs.values(), key=lambda o: o["id"])})
    escribir("organismos.geojson", {"type": "FeatureCollection", "features": geo})
    escribir("manifest.json", {"generado_utc": ahora, "pasos": estado, "familias": {"organismos": {
        "archivo": "data/entidades/organismos.geojson", "formato": "geojson", "objetos": len(geo),
        "bytes": os.path.getsize(os.path.join(DESTINO, "organismos.geojson")), "fuente": "wikidata",
        "estado": "ok" if geo else "error", "error": None if geo else "sin sedes con coordenadas", "actualizado_utc": ahora}}})
    print(f"personas: {len(personas)} · organizaciones: {len(orgs)} · sedes en mapa: {len(geo)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
