"""Vulnerabilidades críticas recientes para Herramientas → Informática y ciberseguridad.

Fuentes públicas y gratuitas (sin llave):
- NVD (NIST) API 2.0: CVE publicados o modificados en los últimos 30 días con severidad CRÍTICA (CVSS v3.1 o v4.0 ≥ 9.0).
- CISA KEV: catálogo de vulnerabilidades explotadas activamente (se marca cada CVE que aparece en él).
- FIRST EPSS: probabilidad de explotación en los próximos 30 días.
Se guardan solo identificador, descripción corta (de NVD), puntajes, producto afectado (CPE o KEV), fechas y enlaces.
Corre en la ingesta, como máximo cada 6 horas.

Uso: python3 tools/vulnerabilidades.py --salida eventos/vulnerabilidades.json
"""
import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.parse
import urllib.request

UA = "DOMINUS-OSINT/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
NVD = "https://services.nvd.nist.gov/rest/json/cves/2.0"
KEV = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
EPSS = "https://api.first.org/data/v1/epss"
CADA_HORAS = 6


def _get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def producto_cpe(cve):
    """Primer producto afectado según los CPE de NVD: «php:php», «gitlab:gitlab»…"""
    for conf in cve.get("configurations", []) or []:
        for nodo in conf.get("nodes", []) or []:
            for m in nodo.get("cpeMatch", []) or []:
                partes = str(m.get("criteria", "")).split(":")
                if len(partes) > 5 and m.get("vulnerable"):
                    return f"{partes[3]}:{partes[4]}"
    return ""


def puntaje(cve):
    """Mejor puntaje CVSS disponible: v4.0, v3.1, v3.0 (en ese orden), con su versión y vector."""
    met = cve.get("metrics", {}) or {}
    for clave, ver in (("cvssMetricV40", "4.0"), ("cvssMetricV31", "3.1"), ("cvssMetricV30", "3.0")):
        for m in met.get(clave, []) or []:
            d = m.get("cvssData", {})
            if d.get("baseScore") is not None:
                return {"cvss": d["baseScore"], "version": ver, "vector": d.get("vectorString", ""), "severidad": d.get("baseSeverity", "")}
    return {"cvss": None, "version": "", "vector": "", "severidad": ""}


def leer_nvd(dias=30, hoy=None):
    hoy = hoy or dt.datetime.now(dt.timezone.utc)
    desde = (hoy - dt.timedelta(days=dias)).strftime("%Y-%m-%dT%H:%M:%S.000")
    hasta = hoy.strftime("%Y-%m-%dT%H:%M:%S.000")
    out = {}
    for sev in ("cvssV3Severity", "cvssV4Severity"):
        inicio = 0
        while True:
            q = {"pubStartDate": desde, "pubEndDate": hasta, sev: "CRITICAL", "resultsPerPage": 2000, "startIndex": inicio}
            d = _get(f"{NVD}?{urllib.parse.urlencode(q)}", timeout=120)
            for v in d.get("vulnerabilities", []):
                c = v.get("cve", {})
                desc = next((x.get("value", "") for x in c.get("descriptions", []) if x.get("lang") == "en"), "")
                out[c.get("id")] = {"id": c.get("id"), "publicado": str(c.get("published", ""))[:10], "modificado": str(c.get("lastModified", ""))[:10],
                                    "descripcion": desc[:400], "producto": producto_cpe(c), **puntaje(c), "cwe": next((w.get("value") for p in c.get("weaknesses", []) or [] for w in p.get("description", []) if w.get("lang") == "en"), "")}
            inicio += d.get("resultsPerPage", 0) or 2000
            if inicio >= d.get("totalResults", 0):
                break
            time.sleep(6)  # límite público de NVD: 5 consultas cada 30 s sin llave
        time.sleep(6)
    return out


def leer_kev():
    d = _get(KEV, timeout=90)
    return {v["cveID"]: {"proveedor": v.get("vendorProject", ""), "producto": v.get("product", ""), "nombre": v.get("vulnerabilityName", ""),
                         "agregado": v.get("dateAdded", ""), "limite": v.get("dueDate", ""), "ransomware": v.get("knownRansomwareCampaignUse", ""),
                         "accion": v.get("requiredAction", "")[:300]} for v in d.get("vulnerabilities", [])}


def leer_epss(ids):
    out = {}
    ids = list(ids)
    for i in range(0, len(ids), 100):
        try:
            d = _get(f"{EPSS}?{urllib.parse.urlencode({'cve': ','.join(ids[i:i + 100])})}")
            for x in d.get("data", []):
                out[x["cve"]] = {"epss": float(x.get("epss", 0)), "percentil": float(x.get("percentile", 0))}
        except Exception as e:  # noqa: BLE001
            print(f"   EPSS: {e}")
        time.sleep(1)
    return out


def combinar(nvd, kev, epss, dias_kev=60, hoy=None):
    """Lista final: críticas recientes de NVD + las agregadas a KEV en los últimos `dias_kev` días (aunque no sean críticas)."""
    hoy = (hoy or dt.date.today()).isoformat()
    limite = (dt.date.fromisoformat(hoy) - dt.timedelta(days=dias_kev)).isoformat()
    res = {k: dict(v) for k, v in nvd.items()}
    for k, v in kev.items():
        if v["agregado"] >= limite and k not in res:
            res[k] = {"id": k, "publicado": "", "modificado": "", "descripcion": v["nombre"], "producto": f"{v['proveedor']}:{v['producto']}".lower().replace(" ", "_"),
                      "cvss": None, "version": "", "vector": "", "severidad": "", "cwe": ""}
    for k, v in res.items():
        v["kev"] = kev.get(k)
        v.update(epss.get(k, {"epss": None, "percentil": None}))
        v["url"] = f"https://nvd.nist.gov/vuln/detail/{k}"
    return sorted(res.values(), key=lambda v: (bool(v.get("kev")), v.get("epss") or 0, v.get("cvss") or 0), reverse=True)


def reciente(ruta, horas=CADA_HORAS):
    try:
        g = dt.datetime.fromisoformat(json.load(open(ruta, encoding="utf-8"))["generado_utc"].replace("Z", "+00:00"))
        return dt.datetime.now(dt.timezone.utc) - g < dt.timedelta(hours=horas)
    except Exception:  # noqa: BLE001
        return False


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", default="eventos/vulnerabilidades.json")
    ap.add_argument("--forzar", action="store_true")
    a = ap.parse_args(argv)
    if not a.forzar and reciente(a.salida):
        print("Vulnerabilidades: el archivo tiene menos de 6 h; no se consulta.")
        return 0
    fuentes = {}
    nvd, kev = {}, {}
    for nombre, fn in (("nvd", leer_nvd), ("kev", leer_kev)):
        t0 = time.time()
        try:
            r = fn()
            (nvd if nombre == "nvd" else kev).update(r)
            fuentes[nombre] = {"estado": "ok", "n": len(r), "segundos": round(time.time() - t0, 1)}
        except Exception as e:  # noqa: BLE001
            fuentes[nombre] = {"estado": "error", "error": str(e)[:200]}
        print(f"   {nombre}: {fuentes[nombre]}")
    if not nvd and not kev:
        print("Vulnerabilidades: sin respuesta de NVD ni de CISA; se conserva el archivo anterior.")
        return 0
    lista = combinar(nvd, kev, {})
    epss = leer_epss([v["id"] for v in lista])
    fuentes["epss"] = {"estado": "ok" if epss else "sin datos", "n": len(epss)}
    lista = combinar(nvd, kev, epss)
    os.makedirs(os.path.dirname(a.salida) or ".", exist_ok=True)
    with open(a.salida, "w", encoding="utf-8") as f:
        json.dump({"generado_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fuentes": fuentes, "kev_total": len(kev), "vulnerabilidades": lista},
                  f, ensure_ascii=False, separators=(",", ":"))
    print(f"Vulnerabilidades: {len(lista)} ({sum(1 for v in lista if v.get('kev'))} explotadas según CISA).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
