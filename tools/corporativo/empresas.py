#!/usr/bin/env python3
"""Catálogo de empresas con su organigrama público: dueños, matriz, consejo, dirección y filiales (Wikidata, CC0).

Qué empresas: las que cotizan en alguna bolsa (P414) y las mexicanas con director general registrado, con artículo
en al menos 8 Wikipedias (filtra registros vacíos o dudosos). Unas 3,300.

Qué se guarda de cada persona: solo su nombre y su identificador de Wikidata, porque ocupa un cargo público en la
empresa (director general, presidente o miembro del consejo, fundador, dueño). No se guardan fotos, fechas de
nacimiento, domicilios ni ningún otro dato personal. Solo cargos vigentes (sin fecha de término).

Wikidata la editan voluntarios: puede estar incompleta o atrasada. El panel lo dice y enlaza a la fuente oficial
(informe anual, SEC EDGAR, bolsa de valores) para confirmar.

Wikidata limita las consultas: hay una pausa entre consultas y, si responde 429, se espera lo que pida
(Retry-After). Si una consulta falla se conserva lo de la semana anterior para ese dato.

Salida: vivos/corporativo_empresas.json. Se renueva cada 7 días.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "vivos", "corporativo_empresas.json")
SPARQL = "https://query.wikidata.org/sparql"
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
CADA_DIAS = 7
LIMITE_S = 300  # tope de la corrida: lo que no alcance se conserva de la semana anterior y se completa en la siguiente
PAUSA_S = 3
MIN_SITELINKS = 8
MAX_POR_ROL = {"consejo": 20, "dir": 15, "filiales": 15, "duenos": 12, "fund": 8}

SEL = (f"{{ ?e wdt:P414 ?b0 }} UNION {{ ?e wdt:P17 wd:Q96; wdt:P169 ?c0 }} "
       f"?e wikibase:sitelinks ?s. FILTER(?s >= {MIN_SITELINKS})")
# Cargo → propiedad de Wikidata.
ROLES = [("ceo", "P169"), ("pres", "P488"), ("consejo", "P3320"), ("dir", "P1037"), ("fund", "P112"),
         ("duenos", "P127"), ("matriz", "P749"), ("filiales", "P355")]

Q_BASE = f"""SELECT ?e ?s ?les ?len ?iso ?cik WHERE {{ {{ SELECT DISTINCT ?e ?s WHERE {{ {SEL} }} }}
  OPTIONAL {{ ?e rdfs:label ?les FILTER(lang(?les) = "es") }} OPTIONAL {{ ?e rdfs:label ?len FILTER(lang(?len) = "en") }}
  OPTIONAL {{ ?e wdt:P17/wdt:P298 ?iso }} OPTIONAL {{ ?e wdt:P5531 ?cik }} }}"""
Q_EXTRA = f"""SELECT ?e ?indEs ?indEn ?sede ?web WHERE {{ {{ SELECT DISTINCT ?e WHERE {{ {SEL} }} }}
  OPTIONAL {{ ?e wdt:P452 ?ind. OPTIONAL {{ ?ind rdfs:label ?indEs FILTER(lang(?indEs) = "es") }} OPTIONAL {{ ?ind rdfs:label ?indEn FILTER(lang(?indEn) = "en") }} }}
  OPTIONAL {{ ?e wdt:P159 ?hq. ?hq rdfs:label ?sede FILTER(lang(?sede) = "es") }}
  OPTIONAL {{ ?e wdt:P856 ?web }} }}"""
# Alias de Wikidata («Disney» para «The Walt Disney Company»): sirven para reconocer la empresa en los titulares.
Q_ALIAS = f"""SELECT ?e ?al WHERE {{ {{ SELECT DISTINCT ?e WHERE {{ {SEL} }} }}
  ?e skos:altLabel ?al FILTER(lang(?al) IN ("en", "es") && STRLEN(?al) >= 4 && STRLEN(?al) <= 30) }}"""
Q_BOLSAS = f"""SELECT ?e ?bolsa ?tick WHERE {{ {{ SELECT DISTINCT ?e WHERE {{ {SEL} }} }}
  ?e p:P414 ?st. ?st ps:P414 ?b. FILTER NOT EXISTS {{ ?st pq:P582 ?fin }} ?b rdfs:label ?bolsa FILTER(lang(?bolsa) = "en")
  OPTIONAL {{ ?st pq:P249 ?tick }} }}"""


def q_rol(prop):
    return f"""SELECT ?e ?v ?les ?len ?parte ?rolEs ?rolEn ?hum ?vs WHERE {{ {{ SELECT DISTINCT ?e WHERE {{ {SEL} }} }}
  ?e p:{prop} ?st. ?st ps:{prop} ?v. FILTER NOT EXISTS {{ ?st pq:P582 ?fin }} FILTER NOT EXISTS {{ ?st wikibase:rank wikibase:DeprecatedRank }}
  OPTIONAL {{ ?st pq:P1107 ?parte }}
  OPTIONAL {{ ?st pq:P2868 ?rol. OPTIONAL {{ ?rol rdfs:label ?rolEs FILTER(lang(?rolEs) = "es") }} OPTIONAL {{ ?rol rdfs:label ?rolEn FILTER(lang(?rolEn) = "en") }} }}
  OPTIONAL {{ ?v rdfs:label ?les FILTER(lang(?les) = "es") }} OPTIONAL {{ ?v rdfs:label ?len FILTER(lang(?len) = "en") }}
  OPTIONAL {{ ?v wdt:P31 wd:Q5. BIND(1 AS ?hum) }} OPTIONAL {{ ?v wikibase:sitelinks ?vs }} }}"""


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def leer_json(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def consultar(query, intentos=3, espera_max=30):
    """Filas de una consulta SPARQL. Respeta el Retry-After de Wikidata."""
    datos = urllib.parse.urlencode({"query": query}).encode()
    for k in range(intentos):
        req = urllib.request.Request(SPARQL, data=datos, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
        try:
            with urllib.request.urlopen(req, timeout=150) as r:
                return json.loads(r.read())["results"]["bindings"]
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or k == intentos - 1:
                raise
            espera = e.headers.get("Retry-After") if e.code == 429 else None
            time.sleep(min(espera_max, int(espera) if espera and espera.isdigit() else 20 * (k + 1)))
    return []


def qid(b, campo):
    v = (b.get(campo) or {}).get("value", "")
    return v.rsplit("/", 1)[-1] if v else ""


def val(b, campo):
    return (b.get(campo) or {}).get("value", "")


def base(filas):
    out = {}
    for b in filas:
        q = qid(b, "e")
        e = out.setdefault(q, {"id": q, "n": "", "en": "", "pais": "", "cik": "", "s": int(val(b, "s") or 0)})
        e["n"] = e["n"] or val(b, "les") or val(b, "len")
        e["en"] = e["en"] or val(b, "len")
        e["pais"] = e["pais"] or val(b, "iso")
        e["cik"] = e["cik"] or val(b, "cik")
    return {q: e for q, e in out.items() if e["n"] and not e["n"].startswith("Q")}


def extra(empresas, filas):
    for b in filas:
        e = empresas.get(qid(b, "e"))
        if not e:
            continue
        if val(b, "indEs") or val(b, "indEn"):
            e.setdefault("ind", val(b, "indEs") or val(b, "indEn"))
            if val(b, "indEn") and val(b, "indEn") not in e.get("ind_en", ""):
                e["ind_en"] = (e.get("ind_en", "") + " " + val(b, "indEn")).strip()
        if val(b, "sede"):
            e.setdefault("sede", val(b, "sede"))
        if val(b, "web").startswith("http"):
            e.setdefault("web", val(b, "web"))


def bolsas(empresas, filas):
    for b in filas:
        e = empresas.get(qid(b, "e"))
        if not e:
            continue
        par = [val(b, "bolsa"), val(b, "tick")]
        lst = e.setdefault("bolsas", [])
        if par not in lst and len(lst) < 6:
            lst.append(par)


def alias(empresas, filas, maximo=4):
    """Alias útiles para reconocer la empresa: sin claves de cotización (todo mayúsculas cortas) ni repetidos."""
    for b in filas:
        e = empresas.get(qid(b, "e"))
        a = val(b, "al").strip()
        if not e or not a or (a.isupper() and len(a) <= 5) or a in (e["n"], e["en"]):
            continue
        lst = e.setdefault("al", [])
        if a not in lst and len(lst) < maximo:
            lst.append(a)


def rol(empresas, clave, filas):
    """Agrega [nombre, qid, parte o cargo, es_persona] por empresa. Sin nombre en español ni inglés no se usa."""
    por = {}
    for b in filas:
        e = qid(b, "e")
        if e not in empresas:
            continue
        nombre = val(b, "les") or val(b, "len")
        v = qid(b, "v")
        if not nombre or nombre == v:
            continue
        extra_ = val(b, "parte") or val(b, "rolEs") or val(b, "rolEn")
        if extra_ and clave == "duenos":
            try:
                extra_ = f"{float(extra_) * 100:.4g} %"
            except ValueError:
                pass
        lst = por.setdefault(e, {})
        if v not in lst:
            lst[v] = [nombre, v, extra_, 1 if val(b, "hum") else 0, int(val(b, "vs") or 0)]
        elif extra_ and not lst[v][2]:
            lst[v][2] = extra_
    for e, d in por.items():
        filas_e = sorted(d.values(), key=lambda x: -x[4])[:MAX_POR_ROL.get(clave, 6)]
        empresas[e][clave] = [x[:4] for x in filas_e]


def construir(ahora=None, consulta=consultar, pausa=PAUSA_S, limite_s=LIMITE_S, reloj=time.monotonic):
    ahora = ahora or datetime.now(timezone.utc)
    t0 = reloj()
    anterior = leer_json(OUT, {}) or {}
    previo = {e["id"]: e for e in anterior.get("empresas", [])}
    # Consultas que ya salieron bien en los últimos 7 días: no se repiten (la corrida sigue donde se quedó la anterior).
    hace = iso(ahora - timedelta(days=CADA_DIAS))
    ok = {k: v for k, v in (anterior.get("pasos_ok") or {}).items() if v >= hace}
    estado = {}
    try:
        empresas = base(consulta(Q_BASE))
        estado["base"] = f"{len(empresas)} empresas"
    except Exception as e:  # noqa: BLE001  sin la lista base no se reescribe nada
        return f"sin cambios: la consulta base falló ({type(e).__name__})"
    # Primero los cargos (lo que más se consulta), después industria, bolsas y alias.
    pasos = [(c, (lambda c: lambda f: rol(empresas, c, f))(c), q_rol(p), (c,)) for c, p in ROLES]
    pasos += [("extra", lambda f: extra(empresas, f), Q_EXTRA, ("ind", "ind_en", "sede", "web")),
              ("bolsas", lambda f: bolsas(empresas, f), Q_BOLSAS, ("bolsas",)),
              ("alias", lambda f: alias(empresas, f), Q_ALIAS, ("al",))]
    def conservar(campos):
        for q, emp in empresas.items():
            for c in campos:
                if c in previo.get(q, {}):
                    emp[c] = previo[q][c]

    completo = True
    for nombre, aplicar, query, campos in pasos:
        if nombre in ok:
            estado[nombre] = f"al día (consultado {ok[nombre][:10]})"
            conservar(campos)
            continue
        if reloj() - t0 > limite_s:  # sin tiempo: lo de la semana anterior, y se reintenta en la próxima hora
            estado[nombre] = "error: sin tiempo en esta corrida; se conserva el anterior"
            conservar(campos)
            completo = False
            continue
        time.sleep(pausa)
        try:
            filas = consulta(query)
            aplicar(filas)
            estado[nombre] = f"{len(filas)} filas"
            ok[nombre] = iso(ahora)
        except Exception as e:  # noqa: BLE001  se conserva el dato de la corrida anterior
            estado[nombre] = f"error: {type(e).__name__}; se conserva el anterior"
            conservar(campos)
            completo = False
    lista = sorted(empresas.values(), key=lambda e: -e["s"])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generado_utc": iso(ahora), "fuente": "Wikidata (CC0)", "min_sitelinks": MIN_SITELINKS, "completo": completo, "pasos_ok": ok, "fuentes": estado,
                   "empresas": lista}, f, ensure_ascii=False, separators=(",", ":"))
    return f"{len(lista)} empresas; " + "; ".join(f"{k}: {v}" for k, v in estado.items())


def main():
    ahora = datetime.now(timezone.utc)
    previo = leer_json(OUT, {}) or {}
    gen = previo.get("generado_utc", "")
    # Completo: cada 7 días. Incompleto (falló o se acabó el tiempo): se reintenta a la hora.
    espera = timedelta(days=CADA_DIAS) if previo.get("completo", True) else timedelta(hours=1)
    try:
        if ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < espera:
            print("empresas: catálogo reciente")
            return 0
    except ValueError:
        pass
    print("empresas:", construir(ahora))
    return 0


if __name__ == "__main__":
    sys.exit(main())
