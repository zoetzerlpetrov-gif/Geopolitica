#!/usr/bin/env python3
"""Creadores de contenido con más seguidores: los 100 primeros por plataforma, según Wikidata.

Fuente: servicio de consultas SPARQL de Wikidata (datos CC0). La propiedad P8687 («número de seguidores en redes
sociales») lleva como calificador la cuenta (YouTube P2397, TikTok P7085, Instagram P2003) y la fecha del dato (P585).
Se toma el dato más reciente de cada persona en cada plataforma. X (P2002) no se incluye: Wikidata casi no registra sus
seguidores (4 personas en octubre de 2026) y la lista sería engañosa.

Solo datos profesionales de figuras públicas: nombre, plataforma, enlace a la cuenta oficial, seguidores y fecha del
dato, ocupación y país de nacionalidad (para ubicarla en el mapa, en el centro del país). No se guardan fechas de
nacimiento, lugar de residencia, fotos ni ningún otro dato personal. Solo personas (Q5): no marcas ni medios.

Salida: vivos/creadores.geojson, un punto por país con sus creadores. Se actualiza cada 7 días; si falla, se conserva
el archivo anterior.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SALIDA = os.path.join(ROOT, "vivos", "creadores.geojson")
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
SPARQL = "https://query.wikidata.org/sparql"
TOP = 100
DIAS = 7
MAXIMO = 1_000_000_000  # nadie llega a mil millones: un dato mayor es un error de captura en Wikidata

# plataforma → (calificador de la cuenta, mínimo de seguidores para la consulta, enlace)
PLATAFORMAS = {
    "YouTube": ("P2397", 15_000_000, "https://www.youtube.com/channel/{}"),
    "TikTok": ("P7085", 5_000_000, "https://www.tiktok.com/@{}"),
    "Instagram": ("P2003", 15_000_000, "https://www.instagram.com/{}/"),
}


def sparql(q, intentos=3):
    for i in range(intentos):
        try:
            req = urllib.request.Request(f"{SPARQL}?format=json&query={urllib.parse.quote(q)}",
                                         headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())["results"]["bindings"]
        except Exception:  # noqa: BLE001
            if i == intentos - 1:
                raise
            time.sleep(15 * (i + 1))
    return []


def consulta_cuentas(prop, minimo):
    return f"""SELECT ?p ?pLabel ?seg ?u ?fecha WHERE {{
  ?st pq:{prop} ?u; ps:P8687 ?seg. FILTER(?seg > {minimo})
  ?p p:P8687 ?st. ?p wdt:P31 wd:Q5.
  OPTIONAL {{ ?st pq:P585 ?fecha. }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "es,en". }}
}}"""


def consulta_detalles(qids):
    valores = " ".join(f"wd:{q}" for q in qids)
    return f"""SELECT ?p ?iso ?ocL WHERE {{
  VALUES ?p {{ {valores} }}
  OPTIONAL {{ ?p wdt:P27 ?c. ?c wdt:P298 ?iso. }}
  OPTIONAL {{ ?p wdt:P106 ?o. ?o rdfs:label ?ocL. FILTER(LANG(?ocL) = "es") }}
}}"""


def _v(fila, k):
    return (fila.get(k) or {}).get("value", "")


def mejores(filas, plataforma, top=TOP):
    """Filas SPARQL → los `top` con más seguidores, un registro por persona con su dato más reciente."""
    _, _, enlace = PLATAFORMAS[plataforma]
    por_persona = {}
    for f in filas:
        qid = _v(f, "p").rsplit("/", 1)[-1]
        nombre = _v(f, "pLabel")
        if not qid.startswith("Q") or not nombre or nombre == qid:
            continue
        try:
            seg = int(float(_v(f, "seg")))
        except ValueError:
            continue
        if seg > MAXIMO:
            continue
        fecha = _v(f, "fecha")[:10]
        reg = {"qid": qid, "nombre": nombre, "plataforma": plataforma, "cuenta": _v(f, "u"), "seguidores": seg, "fecha": fecha}
        previo = por_persona.get(qid)
        # Gana el dato con fecha más reciente; con la misma fecha (o sin fecha), el mayor.
        if not previo or (fecha, seg) > (previo["fecha"], previo["seguidores"]):
            por_persona[qid] = reg
    lista = sorted(por_persona.values(), key=lambda r: -r["seguidores"])[:top]
    for i, r in enumerate(lista, 1):
        r["puesto"] = i
        r["url"] = enlace.format(urllib.parse.quote(r["cuenta"], safe="._-"))
    return lista


def detalles(filas):
    """Filas SPARQL → {qid: {"paises": [iso3…], "ocupaciones": [hasta 3]}}."""
    out = {}
    for f in filas:
        d = out.setdefault(_v(f, "p").rsplit("/", 1)[-1], {"paises": [], "ocupaciones": []})
        iso, oc = _v(f, "iso"), _v(f, "ocL")
        if iso and iso not in d["paises"]:
            d["paises"].append(iso)
        if oc and oc not in d["ocupaciones"] and len(d["ocupaciones"]) < 3:
            d["ocupaciones"].append(oc)
    return out


def por_pais(cuentas, info, paises):
    """Cuentas + detalles → un punto por país (centro del gazetteer) con sus creadores ordenados por seguidores."""
    personas = {}
    for c in cuentas:
        p = personas.setdefault(c["qid"], {"qid": c["qid"], "nombre": c["nombre"], "cuentas": [],
                                           "ocupaciones": info.get(c["qid"], {}).get("ocupaciones", [])})
        p["cuentas"].append({k: c[k] for k in ("plataforma", "url", "seguidores", "fecha", "puesto")})
    grupos, sin_pais = {}, 0
    for qid, p in personas.items():
        isos = [i for i in info.get(qid, {}).get("paises", []) if i in paises]
        if not isos:
            sin_pais += 1
        for iso in isos:
            grupos.setdefault(iso, []).append({**p, "otras_nacionalidades": len(isos) > 1})
    feats = []
    for iso, lista in grupos.items():
        lista.sort(key=lambda p: -max(c["seguidores"] for c in p["cuentas"]))
        pais = paises[iso]
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [pais["lon"], pais["lat"]]},
                      "properties": {"iso3": iso, "pais": pais.get("es") or pais.get("en") or iso, "n": len(lista), "creadores": lista}})
    feats.sort(key=lambda f: -f["properties"]["n"])
    return feats, sin_pais


def main():
    ahora = datetime.now(timezone.utc)
    try:
        prev = json.load(open(SALIDA, encoding="utf-8"))
        if ahora - datetime.strptime(prev["generado_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(days=DIAS):
            print("creadores: datos recientes")
            return 0
    except (OSError, ValueError, KeyError):
        pass
    cuentas, detalle = [], []
    for plataforma, (prop, minimo, _) in PLATAFORMAS.items():
        try:
            lista = mejores(sparql(consulta_cuentas(prop, minimo)), plataforma)
            cuentas += lista
            detalle.append(f"{plataforma}: {len(lista)}")
        except Exception as e:  # noqa: BLE001
            detalle.append(f"{plataforma}: error {e}"[:100])
        time.sleep(3)  # cortesía con el servicio de consultas
    if len(cuentas) < 50:
        print(f"creadores: muy pocos datos ({'; '.join(detalle)}); se conserva el archivo anterior")
        return 0
    qids = sorted({c["qid"] for c in cuentas})
    info = {}
    for i in range(0, len(qids), 150):
        info.update(detalles(sparql(consulta_detalles(qids[i:i + 150]))))
        time.sleep(3)
    paises = {k: v for k, v in json.load(open(os.path.join(ROOT, "config", "gazetteer.json"), encoding="utf-8"))["paises"].items() if v.get("lat") is not None}
    feats, sin_pais = por_pais(cuentas, info, paises)
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "fuente": "Wikidata (CC0), propiedad P8687", "sin_pais": sin_pais, "features": feats}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"creadores: {len(qids)} personas en {len(feats)} países ({'; '.join(detalle)}; {sin_pais} sin país en Wikidata)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
