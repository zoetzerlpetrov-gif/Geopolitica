"""Licitaciones abiertas de la Unión Europea (TED) y de Estados Unidos (grants.gov; SAM.gov si existe el secreto
SAM_API_KEY) en un solo archivo para el buscador de Investigación → Licitaciones.

TED no permite consultas desde el navegador (no envía encabezados CORS) y SAM.gov pide llave: por eso se consultan
aquí, en la ingesta, como máximo cada 12 horas. Solo se guardan título, comprador, país, fechas, clasificación y el
enlace al aviso oficial (nada de documentos completos).

Uso: python3 tools/licitaciones.py --salida eventos/licitaciones.json
"""
import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request

UA = "DOMINUS-OSINT/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
CADA_HORAS = 12
TED = "https://api.ted.europa.eu/v3/notices/search"
CAMPOS_TED = ["publication-number", "notice-title", "buyer-name", "buyer-country", "publication-date", "deadline-receipt-tender-date-lot"]
EXTRA_TED = ["classification-cpv", "notice-type"]
IDIOMAS = ("spa", "eng", "fra", "deu", "ita", "por")


def _post(url, cuerpo, timeout=60):
    req = urllib.request.Request(url, data=json.dumps(cuerpo).encode(), headers={"User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def _get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def texto_idioma(v):
    """TED da los textos por idioma ({"spa": ["…"], "eng": [...]}): se prefiere español, luego inglés."""
    if isinstance(v, str):
        return v
    if isinstance(v, list):
        return texto_idioma(v[0]) if v else ""
    if isinstance(v, dict):
        for k in IDIOMAS:
            if v.get(k):
                return texto_idioma(v[k])
        for x in v.values():
            if x:
                return texto_idioma(x)
    return ""


def fecha_ted(v):
    """«2026-12-15+01:00» → «2026-12-15»."""
    v = texto_idioma(v) if not isinstance(v, str) else v
    return (v or "")[:10]


def aviso_ted(n):
    num = n.get("publication-number", "")
    cpv = n.get("classification-cpv") or []
    return {
        "fuente": "TED (UE)", "id": num, "titulo": texto_idioma(n.get("notice-title"))[:300],
        "comprador": texto_idioma(n.get("buyer-name"))[:200], "pais": texto_idioma(n.get("buyer-country"))[:3],
        "publicado": fecha_ted(n.get("publication-date")), "cierre": fecha_ted(n.get("deadline-receipt-tender-date-lot")),
        "cpv": [c for c in (cpv if isinstance(cpv, list) else [cpv]) if isinstance(c, str)][:4],
        "tipo": texto_idioma(n.get("notice-type")), "url": f"https://ted.europa.eu/es/notice/-/detail/{num}",
    }


def ted(dias=3, paginas=6):
    desde = (dt.date.today() - dt.timedelta(days=dias)).strftime("%Y%m%d")
    out, campos = [], CAMPOS_TED + EXTRA_TED
    for p in range(1, paginas + 1):
        cuerpo = {"query": f"publication-date>={desde}", "fields": campos, "limit": 250, "page": p, "scope": "ACTIVE"}
        try:
            d = _post(TED, cuerpo)
        except urllib.error.HTTPError as e:
            if e.code == 400 and campos != CAMPOS_TED:  # algún campo extra no existe: se repite con los básicos
                campos = CAMPOS_TED
                d = _post(TED, {**cuerpo, "fields": campos})
            else:
                raise
        avisos = d.get("notices") or []
        out += [aviso_ted(n) for n in avisos]
        if len(avisos) < 250:
            break
        time.sleep(2)
    return out


def grants(filas=250, maximo=1000):
    out = []
    for inicio in range(0, maximo, filas):
        d = _post("https://api.grants.gov/v1/api/search2", {"rows": filas, "startRecordNum": inicio, "oppStatuses": "forecasted|posted"})
        hits = (d.get("data") or {}).get("oppHits") or []
        for h in hits:
            mdy = lambda s: (f"{s[6:10]}-{s[0:2]}-{s[3:5]}" if s and len(s) == 10 else "")  # noqa: E731
            out.append({"fuente": "Grants.gov (EUA)", "id": h.get("number", ""), "titulo": (h.get("title") or "")[:300],
                        "comprador": (h.get("agency") or "").strip(), "pais": "USA", "publicado": mdy(h.get("openDate")),
                        "cierre": mdy(h.get("closeDate")), "cpv": h.get("cfdaList") or [], "tipo": h.get("oppStatus", ""),
                        "url": f"https://www.grants.gov/search-results-detail/{h.get('id', '')}"})
        if len(hits) < filas:
            break
        time.sleep(2)
    return out


def sam(llave, dias=3):
    hoy = dt.date.today()
    q = (f"https://api.sam.gov/opportunities/v2/search?limit=1000&ptype=o,k,p,r&postedFrom={(hoy - dt.timedelta(days=dias)):%m/%d/%Y}"
         f"&postedTo={hoy:%m/%d/%Y}&api_key={llave}")
    d = _get(q)
    return [{"fuente": "SAM.gov (EUA)", "id": o.get("solicitationNumber") or o.get("noticeId", ""), "titulo": (o.get("title") or "")[:300],
             "comprador": o.get("fullParentPathName", "").split(".")[0], "pais": "USA", "publicado": (o.get("postedDate") or "")[:10],
             "cierre": (o.get("responseDeadLine") or "")[:10], "cpv": [o["naicsCode"]] if o.get("naicsCode") else [], "tipo": o.get("type", ""),
             "url": o.get("uiLink") or f"https://sam.gov/opp/{o.get('noticeId', '')}/view"} for o in d.get("opportunitiesData") or []]


def reciente(ruta, horas=CADA_HORAS):
    try:
        with open(ruta, encoding="utf-8") as f:
            g = dt.datetime.fromisoformat(json.load(f)["generado_utc"].replace("Z", "+00:00"))
        return dt.datetime.now(dt.timezone.utc) - g < dt.timedelta(hours=horas)
    except Exception:  # noqa: BLE001
        return False


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", default="eventos/licitaciones.json")
    ap.add_argument("--forzar", action="store_true")
    a = ap.parse_args(argv)
    if not a.forzar and reciente(a.salida):
        print("Licitaciones: el archivo tiene menos de 12 h; no se consulta.")
        return 0
    fuentes, avisos = {}, []
    tareas = [("ted", ted), ("grants", grants)]
    llave = os.environ.get("SAM_API_KEY", "").strip()
    if llave:
        tareas.append(("sam", lambda: sam(llave)))
    for nombre, fn in tareas:
        t0 = time.time()
        try:
            r = fn()
            avisos += r
            fuentes[nombre] = {"estado": "ok", "avisos": len(r), "segundos": round(time.time() - t0, 1)}
        except Exception as e:  # noqa: BLE001
            msg = str(e).split("api_key=")[0]  # nunca registrar la llave
            fuentes[nombre] = {"estado": "error", "error": msg[:200]}
        print(f"   {nombre}: {fuentes[nombre]}")
    if not avisos:
        print("Licitaciones: ninguna fuente respondió; se conserva el archivo anterior.")
        return 0
    os.makedirs(os.path.dirname(a.salida) or ".", exist_ok=True)
    with open(a.salida, "w", encoding="utf-8") as f:
        json.dump({"generado_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fuentes": fuentes, "avisos": avisos},
                  f, ensure_ascii=False, separators=(",", ":"))
    print(f"Licitaciones: {len(avisos)} avisos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
