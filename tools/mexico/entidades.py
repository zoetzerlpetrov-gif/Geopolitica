#!/usr/bin/env python3
"""Monitor de entidades: cambios de razón social, filiales y actos oficiales de empresas y entes del Estado.

Fase 1 (fuentes oficiales y públicas):
  * DOF (vivos/dof.json, que ya descarga «Datos en movimiento»): títulos del sumario que mencionan a la entidad;
    se marcan como «cambio societario» los que hablan de denominación, fusión, escisión, extinción, liquidación,
    desincorporación, creación o estatutos.
  * SEC EDGAR (entidades con CIK): frases «was renamed» / «formerly» de sus reportes 20-F y 6-K (fragmento corto con
    enlace al documento; no se guarda el texto completo).
  * GLEIF (entidades con LEI): nombre legal vigente, otros nombres, estado, filiales directas y el historial oficial de
    cambios de campos (nombre legal, domicilio, forma jurídica, estado).
Fase 2 (cruce): nombres de las entidades y de sus filiales contra la lista 69-B del SAT (vivos/efos_69b.json).

Reglas: solo personas morales y entes públicos (config/entidades_vigiladas.json); cada hallazgo lleva fuente, fecha y
estado «documentado» (lo publica una fuente oficial). Una coincidencia de nombre es una señal para revisar, no una
acusación. La SEC pide identificarse (SEC_USER_AGENT) y GLEIF es de uso libre (CC0).
Salida: vivos/entidades.json (una vez al día; si una fuente falla, se conserva lo anterior de esa fuente).
"""
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
VIVOS = os.path.join(ROOT, "vivos")
OUT = os.path.join(VIVOS, "entidades.json")
CONFIG = os.path.join(ROOT, "config", "entidades_vigiladas.json")
CADA_H = 20
NOTA_DOF = "https://dof.gob.mx/nota_detalle.php?codigo={c}&fecha={f}"
GLEIF = "https://api.gleif.org/api/v1"
AGENTE_SEC = os.environ.get("SEC_USER_AGENT", "").strip() or "DOMINUS-OSINT entidades (github.com/zoetzerlpetrov-gif/Geopolitica)"
CAMBIO = re.compile(r"denominaci|fusi[oó]n|fusiona|escisi|extin|liquidaci|disoluci|desincorpor|se crea|creaci[oó]n|estatuto|transforma|cambio de nombre|modifica.{0,40}raz[oó]n social", re.I)
CAMPOS_GLEIF = {"LegalName": "Nombre legal", "OtherEntityName": "Otro nombre", "OtherEntityNames": "Otros nombres", "LegalAddress": "Domicilio legal",
                "HeadquartersAddress": "Domicilio de la sede", "EntityStatus": "Estado de la entidad", "LegalForm": "Forma jurídica",
                "RegistrationStatus": "Estado del registro LEI", "LegalJurisdiction": "Jurisdicción"}
SUFIJOS = re.compile(r"\b(s\.?\s?a\.?\s?p?\.?\s?i?\.?\s?(de\s?c\.?\s?v\.?)?|s\.?\s?a\.?\s?s\.?|s\.?\s?de\s?r\.?\s?l\.?(\s?de\s?c\.?\s?v\.?)?|s\.?\s?c\.?|a\.?\s?c\.?|eps|epe|sab|sapi|sa|de|cv)\b", re.I)


def norm(t):
    t = unicodedata.normalize("NFD", str(t or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9&]+", " ", t)).strip()


def norm_razon(t):
    """Nombre sin sufijos societarios (para cruzar listas)."""
    return re.sub(r"\s+", " ", SUFIJOS.sub(" ", norm(t))).strip()


def patron_alias(alias):
    partes = [re.escape(norm(a)) for a in alias if norm(a)]
    return re.compile(r"\b(" + "|".join(sorted(partes, key=len, reverse=True)) + r")\b") if partes else None


# ------------------------------------------------------------------ DOF
def eventos_dof(dof, ent, max_eventos=150):
    pat = patron_alias(ent.get("alias", []) + [ent["nombre"]])
    out = []
    if not pat:
        return out
    for dia, notas in sorted((dof or {}).get("dias", {}).items(), reverse=True):
        for n in notas:
            codigo, tipo, org, titulo = (list(n) + ["", "", "", ""])[:4]
            if not pat.search(norm(titulo)) and not pat.search(norm(org)):
                continue
            f = f"{dia[8:10]}/{dia[5:7]}/{dia[:4]}"
            out.append({"fuente": "DOF", "fecha": dia, "tipo": "cambio societario" if CAMBIO.search(titulo) else "acto oficial", "titulo": titulo[:300],
                        "detalle": f"{tipo} · {org}"[:160], "url": NOTA_DOF.format(c=codigo, f=f), "estado": "documentado", "id": f"dof-{codigo}"})
            if len(out) >= max_eventos:
                return out
    return out


# ------------------------------------------------------------------ EDGAR
def pedir(url, cabeceras=None, abrir=urllib.request.urlopen, timeout=60):
    req = urllib.request.Request(url, headers={"Accept-Encoding": "identity", **(cabeceras or {})})
    with abrir(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def texto_plano(h):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h)))


FRASE_RENOMBRE = re.compile(r"(was renamed|were renamed|renamed as|formerly known as|formerly)", re.I)


def fragmentos_renombre(texto, ancho=220, maximo=12):
    """Fragmentos cortos alrededor de «renamed»/«formerly» que hablan de una sociedad (S.A. de C.V., EPS, etc.)."""
    out, vistos = [], set()
    for m in FRASE_RENOMBRE.finditer(texto):
        frag = texto[max(0, m.start() - ancho): m.end() + ancho].strip()
        if not re.search(r"S\.A\.|de C\.V\.|EPS|EPE|S\. de R\.L\.|Ltd|LLC|B\.V\.|Inc\.", frag):
            continue
        clave = norm(frag)[:120]
        if clave in vistos:
            continue
        vistos.add(clave)
        out.append("…" + frag + "…")
        if len(out) >= maximo:
            break
    return out


def eventos_edgar(cik, desde="2023-01-01", abrir=urllib.request.urlopen):
    q = urllib.parse.urlencode({"q": '"renamed"', "ciks": str(cik).zfill(10), "forms": "20-F,6-K", "dateRange": "custom", "startdt": desde,
                                "enddt": datetime.now(timezone.utc).strftime("%Y-%m-%d")})
    d = json.loads(pedir(f"https://efts.sec.gov/LATEST/search-index?{q}", {"User-Agent": AGENTE_SEC}, abrir))
    docs = {}
    for h in d.get("hits", {}).get("hits", []):
        s = h.get("_source", {})
        if not str(s.get("file_description", s.get("form", ""))).startswith(("20-F", "6-K")):
            continue
        acc, archivo = h["_id"].split(":", 1)
        docs[acc] = {"forma": s.get("form"), "fecha": s.get("file_date"), "url": f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc.replace('-', '')}/{archivo}"}
    out = []
    for doc in sorted(docs.values(), key=lambda x: x["fecha"], reverse=True)[:8]:
        try:
            frs = fragmentos_renombre(texto_plano(pedir(doc["url"], {"User-Agent": AGENTE_SEC}, abrir)))
        except Exception:  # noqa: BLE001
            continue
        for i, fr in enumerate(frs):
            out.append({"fuente": "SEC EDGAR", "fecha": doc["fecha"], "tipo": "cambio de razón social", "titulo": f"{doc['forma']} presentado el {doc['fecha']}",
                        "detalle": fr[:520], "url": doc["url"], "estado": "documentado", "id": f"sec-{doc['url'].rsplit('/', 2)[-2]}-{i}"})
        time.sleep(0.2)
    return out


# ------------------------------------------------------------------ GLEIF
def gleif(ruta, abrir=urllib.request.urlopen):
    return json.loads(pedir(f"{GLEIF}{ruta}", {"Accept": "application/vnd.api+json"}, abrir))


def campo_corto(ruta):
    ult = ruta.rsplit("/", 1)[-1].replace("lei:", "")
    return ult


RUTINA_LEI = {"ISSUED", "PENDING_TRANSFER", "PENDING_ARCHIVAL"}


def ruido_gleif(a):
    """Cambios administrativos sin significado para el monitor: idioma del campo, tipo de dirección y traspasos del
    LEI entre registradores (PENDING_TRANSFER → PENDING_ARCHIVAL → ISSUED)."""
    campo = a.get("field", "")
    if re.search(r"/@(xml:lang|type)$", campo):
        return True
    if campo.endswith("RegistrationStatus") and {a.get("valueOld"), a.get("valueNew")} <= RUTINA_LEI:
        return True
    return a.get("valueOld") == a.get("valueNew")


def eventos_gleif(lei, abrir=urllib.request.urlopen, paginas=10):
    rec = gleif(f"/lei-records/{lei}", abrir)["data"]["attributes"]
    ent = rec["entity"]
    ficha = {"lei": lei, "nombre_legal": ent["legalName"]["name"], "otros_nombres": [o["name"] for o in ent.get("otherNames", [])],
             "estado": ent.get("status"), "registro": rec["registration"]["status"], "forma": (ent.get("legalForm") or {}).get("id"),
             "url": f"https://search.gleif.org/#/record/{lei}"}
    hijos = gleif(f"/lei-records/{lei}/direct-children?page[size]=100", abrir).get("data", [])
    ficha["filiales"] = sorted({(h["id"], h["attributes"]["entity"]["legalName"]["name"], h["attributes"]["entity"]["legalAddress"]["country"]) for h in hijos})
    eventos = []
    for p in range(1, paginas + 1):
        d = gleif(f"/lei-records/{lei}/field-modifications?page[size]=100&page[number]={p}", abrir)
        for r in d.get("data", []):
            a = r["attributes"]
            if ruido_gleif(a):
                continue
            nombre = next((v for k, v in CAMPOS_GLEIF.items() if re.search(rf"/lei:{k}(/|$)", a.get("field", ""))), None)
            if not nombre:
                continue
            eventos.append({"fuente": "GLEIF", "fecha": str(a.get("date", ""))[:10], "tipo": "cambio de razón social" if "nombre" in nombre.lower() else "cambio de registro",
                            "titulo": f"{nombre}: {str(a.get('valueOld') or '—')[:120]} → {str(a.get('valueNew') or '—')[:120]}", "detalle": campo_corto(a.get("field", "")),
                            "url": ficha["url"], "estado": "documentado", "id": f"gleif-{r['id']}"})
        if p >= (d.get("meta", {}).get("pagination", {}).get("lastPage") or 1):
            break
    return ficha, eventos


def cambios_filiales(antes, ahora):
    """Filiales nuevas o que ya no aparecen respecto a la corrida anterior."""
    a = {f[0]: f for f in antes or []}
    b = {f[0]: f for f in ahora or []}
    nuevas = [b[k] for k in b if k not in a]
    salen = [a[k] for k in a if k not in b]
    return nuevas, salen


# ------------------------------------------------------------------ 69-B
def cruce_69b(nombres, efos):
    """Coincidencias exactas de nombre (sin sufijos societarios) con la lista 69-B del SAT."""
    if not efos:
        return []
    idx = {}
    for fila in efos.get("filas", []):
        idx.setdefault(norm_razon(fila[1]), []).append(fila)
    out = []
    for n in nombres:
        for fila in idx.get(norm_razon(n), []):
            out.append({"fuente": "SAT 69-B", "fecha": "", "tipo": "lista 69-B", "titulo": f"{fila[1]} (RFC {fila[0]})", "detalle": f"Situación: {fila[2]}. Coincide con «{n}».",
                        "url": "https://www.sat.gob.mx/consultas/76674/consulta-la-relacion-de-contribuyentes-con-operaciones-presuntamente-inexistentes",
                        "estado": "coincidencia de nombre: verificar RFC", "id": f"69b-{fila[0]}"})
    return out


# ------------------------------------------------------------------ principal
def leer(ruta):
    try:
        return json.load(open(ruta, encoding="utf-8"))
    except (OSError, ValueError):
        return None


def sin_repetidos(eventos):
    """El mismo párrafo aparece en varios reportes de la SEC: se conserva el más reciente."""
    vistos, out = set(), []
    for e in sorted(eventos, key=lambda e: e["fecha"] or "", reverse=True):
        clave = (e["fuente"], norm(e["detalle"] if e["fuente"] == "SEC EDGAR" else e["id"])[:160])
        if clave in vistos:
            continue
        vistos.add(clave)
        out.append(e)
    return out


def marcar_nuevos(eventos, previos, hoy):
    vistos = {e["id"]: e.get("visto_desde", hoy) for e in previos or []}
    for e in eventos:
        e["visto_desde"] = vistos.get(e["id"], hoy)
        e["nuevo"] = e["visto_desde"] == hoy and bool(previos)
    return eventos


def main():
    previo = leer(OUT) or {}
    if previo.get("generado_utc"):
        gen = datetime.strptime(previo["generado_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - gen < timedelta(hours=CADA_H) and previo.get("version") == 1:
            print("Entidades: datos recientes; se conservan")
            return 0
    cfg = leer(CONFIG) or {"entidades": []}
    dof, efos = leer(os.path.join(VIVOS, "dof.json")), leer(os.path.join(VIVOS, "efos_69b.json"))
    hoy = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prev_ent = {e["id"]: e for e in previo.get("entidades", [])}
    errores, salida, cache_sec = [], [], {}
    for ent in cfg["entidades"]:
        ant = prev_ent.get(ent["id"], {})
        eventos = eventos_dof(dof, ent) if dof else [e for e in ant.get("eventos", []) if e["fuente"] == "DOF"]
        ficha = ant.get("gleif")
        if ent.get("cik"):
            try:
                if ent["cik"] not in cache_sec:
                    cache_sec[ent["cik"]] = eventos_edgar(ent["cik"])
                pat = patron_alias(ent.get("alias", []))
                eventos += [e for e in cache_sec[ent["cik"]] if ent["id"] == "pemex" or (pat and pat.search(norm(e["detalle"])))]
            except Exception as e:  # noqa: BLE001
                errores.append(f"{ent['id']} SEC: {e}"[:160])
                eventos += [x for x in ant.get("eventos", []) if x["fuente"] == "SEC EDGAR"]
        if ent.get("lei"):
            try:
                ficha, ev = eventos_gleif(ent["lei"])
                nuevas, salen = cambios_filiales((ant.get("gleif") or {}).get("filiales"), ficha["filiales"])
                if ant.get("gleif"):
                    ev += [{"fuente": "GLEIF", "fecha": hoy, "tipo": "filial nueva", "titulo": f"Aparece la filial {n[1]} ({n[2]})", "detalle": n[0], "url": ficha["url"], "estado": "documentado", "id": f"gleif-filial-alta-{n[0]}"} for n in nuevas]
                    ev += [{"fuente": "GLEIF", "fecha": hoy, "tipo": "filial retirada", "titulo": f"Ya no aparece la filial {s[1]} ({s[2]})", "detalle": s[0], "url": ficha["url"], "estado": "documentado", "id": f"gleif-filial-baja-{s[0]}-{hoy}"} for s in salen]
                eventos += ev
                time.sleep(0.3)
            except Exception as e:  # noqa: BLE001
                errores.append(f"{ent['id']} GLEIF: {e}"[:160])
                eventos += [x for x in ant.get("eventos", []) if x["fuente"] == "GLEIF"]
        nombres = [ent["nombre"], *ent.get("alias", [])] + ([ficha["nombre_legal"], *ficha.get("otros_nombres", []), *[f[1] for f in ficha.get("filiales", [])]] if ficha else [])
        eventos += cruce_69b(nombres, efos)
        eventos = sin_repetidos(eventos)
        eventos = marcar_nuevos(eventos, ant.get("eventos"), hoy)
        eventos.sort(key=lambda e: (e["fecha"] or "0000", e["id"]), reverse=True)
        salida.append({**{k: ent.get(k) for k in ("id", "nombre", "tipo", "lei", "cik")}, "gleif": ficha, "eventos": eventos,
                       "resumen": {t: sum(1 for e in eventos if e["tipo"] == t) for t in sorted({e["tipo"] for e in eventos})}})
    os.makedirs(VIVOS, exist_ok=True)
    recientes = sorted([{**e, "entidad": s["nombre"]} for s in salida for e in s["eventos"] if e["tipo"] != "acto oficial"], key=lambda e: e["fecha"] or "", reverse=True)[:60]
    json.dump({"version": 1, "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "fuentes": ["DOF (sumario diario)", "SEC EDGAR (20-F y 6-K)", "GLEIF (CC0)", "SAT 69-B"],
               "nota": "Hallazgos de fuentes oficiales. Una coincidencia de nombre es una señal para revisar, no una acusación.",
               "entidades": salida, "recientes": recientes, "errores": errores}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"Entidades: {len(salida)} entidades; " + "; ".join(f"{s['id']} {len(s['eventos'])}" for s in salida) + (f"; errores {errores}" if errores else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
