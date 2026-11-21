#!/usr/bin/env python3
"""Vulnerabilidades en apps y plataformas (Admin): qué actualizar, a qué versión y cómo verificarlo, con historial.

Fuentes públicas y gratuitas (se respeta robots.txt; sin llaves):
  1. CISA KEV (Known Exploited Vulnerabilities): fallas que YA se están explotando, con fabricante, producto, acción
     requerida y fecha límite. Es la lista de prioridad: si está aquí, hay ataques reales.
  2. NVD (NIST): severidad CVSS y versiones afectadas; de ahí sale «actualiza a X o posterior». Sin llave el NVD permite
     5 consultas cada 30 s: se piden pocas por corrida (las nuevas primero) y se guardan para no repetirlas.
  3. EPSS (FIRST): probabilidad de que la falla se explote en los próximos 30 días.
  4. Have I Been Pwned: lista pública de brechas de datos por empresa o plataforma (sin datos de personas).
  5. Monitor de noticias del proyecto: titulares de hackeos y fraudes que mencionan bancos, aerolíneas y plataformas.
Solo se guardan datos técnicos públicos y titulares (título, enlace, medio y fecha). Salida con historial (nunca borra lo
anterior): <salida>/vulns_mundo.json.
Uso: python3 tools/seguridad/vulns_mundo.py <salida> [vivos]
"""
import json
import os
import re
import sys
import time
import urllib.parse
from datetime import datetime, timedelta, timezone

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(RAIZ, "ingest"))
import fuentes as F  # noqa: E402

KEV = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
NVD = "https://services.nvd.nist.gov/rest/json/cves/2.0?cveId="
EPSS = "https://api.first.org/data/v1/epss?cve="
HIBP = "https://haveibeenpwned.com/api/v3/breaches"
CONFIG = os.path.join(RAIZ, "config", "vulns_mundo.json")
DIAS_KEV = 730          # se guardan las KEV de los últimos 2 años (historial)
NVD_POR_CORRIDA = 45    # consultas al NVD por corrida (6.5 s entre cada una)
PAUSA_NVD = 6.5

# Tipo de falla (CWE) en palabras simples, para quien no es especialista.
CWE = {
    "CWE-78": "Inyección de comandos: el atacante ejecuta órdenes en el equipo",
    "CWE-77": "Inyección de comandos: el atacante ejecuta órdenes en el equipo",
    "CWE-94": "Inyección de código: el atacante ejecuta su propio programa",
    "CWE-502": "Deserialización insegura: datos manipulados ejecutan código",
    "CWE-787": "Error de memoria (escritura fuera de límites): puede tomar control del equipo",
    "CWE-125": "Error de memoria (lectura fuera de límites): puede filtrar información",
    "CWE-416": "Error de memoria (uso después de liberar): puede tomar control del equipo",
    "CWE-119": "Error de memoria: puede tomar control del equipo o bloquearlo",
    "CWE-120": "Desbordamiento de memoria: puede tomar control del equipo",
    "CWE-122": "Desbordamiento de memoria: puede tomar control del equipo",
    "CWE-843": "Confusión de tipos (común en navegadores): puede tomar control del equipo",
    "CWE-20": "Validación de datos incorrecta: entradas manipuladas causan fallas o accesos",
    "CWE-22": "Recorrido de rutas: lee o escribe archivos que no debería",
    "CWE-287": "Autenticación débil: entra sin la contraseña correcta",
    "CWE-288": "Autenticación evitable: entra por un camino alterno",
    "CWE-306": "Falta autenticación en una función crítica",
    "CWE-862": "Falta autorización: hace cosas sin permiso",
    "CWE-863": "Autorización incorrecta: hace cosas sin permiso",
    "CWE-269": "Escalamiento de privilegios: obtiene permisos de administrador",
    "CWE-79": "Cross-site scripting (XSS): inyecta código en páginas web",
    "CWE-89": "Inyección SQL: lee o modifica la base de datos",
    "CWE-918": "SSRF: usa el servidor para atacar otros sistemas",
    "CWE-434": "Subida de archivos peligrosos: sube un programa malicioso",
    "CWE-798": "Credenciales escritas en el código",
    "CWE-200": "Exposición de información sensible",
    "CWE-400": "Agotamiento de recursos: deja el servicio sin funcionar",
    "CWE-352": "CSRF: hace acciones en nombre del usuario sin que lo sepa",
}


def ahora_utc():
    return datetime.now(timezone.utc)


def leer_json(url, leer=F.get, timeout=60):
    return json.loads(leer(url, timeout).decode("utf-8", "replace"))


def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def en_inventario(item, inventario):
    v, p = norm(item.get("fabricante")), norm(item.get("producto"))
    for inv in inventario:
        if norm(inv.get("fabricante")) == v and (not inv.get("productos") or any(norm(x) in p or p in norm(x) for x in inv["productos"])):
            return True
    return False


def como_verificar(fabricante, producto, guias):
    texto = f"{fabricante} {producto}"
    mejor, largo = guias.get("*", ""), -1
    for clave, guia in guias.items():
        if clave == "*":
            continue
        partes = clave.split("|")
        if norm(partes[0]) != norm(fabricante):
            continue
        extra = [x for x in partes[1:] if x]
        if extra and not any(norm(x) in norm(texto) for x in extra):
            continue
        if len(extra) > largo:
            mejor, largo = guia, len(extra)
    return mejor


def tipo_de(cwes):
    for c in cwes or []:
        if c in CWE:
            return CWE[c]
    return "Falla de seguridad explotada activamente"


def de_kev(kev, desde, inventario, guias):
    out = []
    for v in kev.get("vulnerabilities", []):
        item = {"fabricante": v.get("vendorProject", ""), "producto": v.get("product", "")}
        afecta = en_inventario(item, inventario)
        if v.get("dateAdded", "") < desde:
            continue
        notas = [u.strip() for u in str(v.get("notes", "")).split(";") if u.strip().startswith("https://")]
        out.append({
            "cve": v.get("cveID", ""), "fabricante": item["fabricante"], "producto": item["producto"],
            "nombre": v.get("vulnerabilityName", ""), "descripcion": v.get("shortDescription", "")[:600],
            "tipo": tipo_de(v.get("cwes")), "cwes": v.get("cwes", [])[:4],
            "fecha": v.get("dateAdded", ""), "limite": v.get("dueDate", ""),
            "ransomware": v.get("knownRansomwareCampaignUse") == "Known",
            "aviso_fabricante": [u for u in notas if "cisa.gov" not in u and "nvd.nist.gov" not in u][:4],
            "afecta_inventario": afecta, "como_verificar": como_verificar(item["fabricante"], item["producto"], guias),
        })
    return out


def versiones_de_nvd(cve_json):
    """(cvss, severidad, [{producto, corregida, afectadas}], [urls de parche]) desde la respuesta del NVD."""
    vs = (cve_json or {}).get("vulnerabilities") or []
    if not vs:
        return None
    c = vs[0].get("cve", {})
    cvss, sev = None, None
    for k in ("cvssMetricV40", "cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
        m = (c.get("metrics") or {}).get(k)
        if m and m[0].get("cvssData"):
            cvss, sev = m[0]["cvssData"].get("baseScore"), m[0]["cvssData"].get("baseSeverity") or m[0].get("baseSeverity")
            break
    corr = {}
    for conf in c.get("configurations") or []:
        for nodo in conf.get("nodes") or []:
            for cm in nodo.get("cpeMatch") or []:
                if not cm.get("vulnerable"):
                    continue
                partes = cm.get("criteria", "").split(":")
                prod = partes[4].replace("_", " ") if len(partes) > 4 else ""
                fin = cm.get("versionEndExcluding")
                if fin:
                    desde = cm.get("versionStartIncluding") or cm.get("versionStartExcluding") or ""
                    corr.setdefault(prod, []).append({"rama": desde, "corregida": fin})
    parches = [r["url"] for r in c.get("references") or [] if set(r.get("tags") or []) & {"Patch", "Vendor Advisory", "Release Notes"}][:5]
    versiones = [{"producto": p, "corregida": sorted({x["corregida"] for x in l}, key=lambda s: [int(t) if t.isdigit() else 0 for t in re.split(r"[.\-]", s)])[:6]}
                 for p, l in list(corr.items())[:6]]
    return {"cvss": cvss, "severidad": (sev or "").lower(), "versiones": versiones, "parches": parches}


def enriquecer_nvd(items, cache, leer=F.get, dormir=time.sleep, maximo=None):
    """Agrega CVSS y versión corregida. Usa lo ya guardado; consulta al NVD solo lo que falta (las más nuevas primero)."""
    pendientes = [i for i in sorted(items, key=lambda x: x["fecha"], reverse=True) if i["cve"] not in cache]
    maximo = NVD_POR_CORRIDA if maximo is None else maximo
    consultadas, error = 0, None
    for i in pendientes[:maximo]:
        if consultadas:
            dormir(PAUSA_NVD)
        try:
            r = versiones_de_nvd(leer_json(NVD + urllib.parse.quote(i["cve"]), leer, 40))
            cache[i["cve"]] = r or {"cvss": None, "severidad": "", "versiones": [], "parches": []}
        except Exception as e:  # noqa: BLE001
            error = f"NVD: {type(e).__name__}"
            break
        consultadas += 1
    for i in items:
        i.update(cache.get(i["cve"]) or {"cvss": None, "severidad": "", "versiones": [], "parches": []})
    return consultadas, error


def enriquecer_epss(items, leer=F.get):
    cves = [i["cve"] for i in items if i["cve"].startswith("CVE-")]
    datos = {}
    for k in range(0, len(cves), 100):
        r = leer_json(EPSS + ",".join(cves[k:k + 100]), leer, 40)
        for d in r.get("data", []):
            datos[d["cve"]] = (round(float(d.get("epss", 0)), 4), round(float(d.get("percentile", 0)), 4))
    for i in items:
        i["epss"], i["epss_percentil"] = datos.get(i["cve"], (None, None))
    return len(datos)


def es_mx(nombre, dominio):
    return str(dominio or "").endswith(".mx") or bool(re.search(r"m[eé]xic", str(nombre or ""), re.I))


def de_hibp(brechas, marcas, desde):
    todas = [m for lista in marcas.values() for m in lista]
    rx = re.compile(r"\b(" + "|".join(re.escape(m) for m in sorted(todas, key=len, reverse=True)) + r")\b", re.I)
    cat = {m.lower(): c for c, lista in marcas.items() for m in lista}
    out = []
    for b in brechas or []:
        nombre, dominio = b.get("Title") or b.get("Name", ""), b.get("Domain", "")
        m = rx.search(f"{nombre} {dominio}")
        mx = es_mx(nombre, dominio)
        if not (m or mx or str(b.get("AddedDate", ""))[:10] >= desde):
            continue
        out.append({"nombre": nombre, "dominio": dominio, "fecha_brecha": b.get("BreachDate", ""), "publicada": str(b.get("AddedDate", ""))[:10],
                    "cuentas": b.get("PwnCount", 0), "datos": (b.get("DataClasses") or [])[:12], "verificada": bool(b.get("IsVerified")),
                    "sensible": bool(b.get("IsSensitive")), "mx": mx, "marca": m.group(1) if m else "", "categoria": cat.get(m.group(1).lower(), "") if m else ("México" if mx else "")})
    return sorted(out, key=lambda x: x["publicada"], reverse=True)


SEGURIDAD = re.compile(r"hacke|ciberataque|ataque inform|vulnerab|brecha|filtraci|filtrad|ransomware|robo de datos|fraude|phishing|suplantaci|"
                       r"parche|actualiza(r|ci[oó]n) de seguridad|hack|breach|data leak|exploit|security update|zero-day|día cero", re.I)


def de_prensa(noticiero, marcas):
    todas = [m for lista in marcas.values() for m in lista]
    rx = re.compile(r"\b(" + "|".join(re.escape(m) for m in sorted(todas, key=len, reverse=True)) + r")\b", re.I)
    cat = {m.lower(): c for c, lista in marcas.items() for m in lista}
    out = []
    for n in (noticiero or {}).get("notas", []):
        t = n.get("t") or ""
        m = rx.search(t)
        if m and SEGURIDAD.search(t):
            out.append({"t": t[:240], "u": n.get("u", ""), "m": n.get("m", ""), "f": str(n.get("f", ""))[:10], "marca": m.group(1), "categoria": cat.get(m.group(1).lower(), "")})
    return out


def fusionar_prensa(previa, nuevas, desde):
    por_url = {x["u"]: x for x in previa if x.get("f", "") >= desde}
    for n in nuevas:
        por_url.setdefault(n["u"], n)
    return sorted(por_url.values(), key=lambda x: x["f"], reverse=True)[:800]


def construir(salida, vivos=None, ahora=None, leer=F.get, permitido=F.permitido_por_robots, dormir=time.sleep):
    ahora = ahora or ahora_utc()
    cfg = json.load(open(CONFIG, encoding="utf-8"))
    ruta = os.path.join(salida, "vulns_mundo.json")
    previo = json.load(open(ruta, encoding="utf-8")) if os.path.exists(ruta) else {}
    fuentes, kev_items = {}, previo.get("kev", [])
    desde_kev = (ahora - timedelta(days=DIAS_KEV)).strftime("%Y-%m-%d")
    cache = {i["cve"]: {k: i.get(k) for k in ("cvss", "severidad", "versiones", "parches")} for i in kev_items if i.get("versiones") is not None and (i.get("cvss") is not None or i.get("versiones"))}
    if permitido(KEV):
        try:
            kev = leer_json(KEV, leer, 90)
            kev_items = de_kev(kev, desde_kev, cfg["inventario"], cfg["verificar"])
            fuentes["CISA KEV"] = f"ok ({kev.get('catalogVersion', '')}, {len(kev_items)} guardadas de {kev.get('count', '?')})"
        except Exception as e:  # noqa: BLE001
            fuentes["CISA KEV"] = f"error: {type(e).__name__} (se conserva lo anterior)"
    else:
        fuentes["CISA KEV"] = "omitida por robots.txt"
    if permitido(NVD + "CVE-2024-0001"):
        n, err = enriquecer_nvd(kev_items, cache, leer, dormir)
        fuentes["NVD (versiones y CVSS)"] = err or f"ok ({n} nuevas consultadas; {sum(1 for i in kev_items if i.get('versiones'))} con versión corregida)"
    else:
        fuentes["NVD (versiones y CVSS)"] = "omitida por robots.txt"
    try:
        fuentes["EPSS"] = f"ok ({enriquecer_epss(kev_items, leer)} con probabilidad)" if permitido(EPSS + "CVE-2024-0001") else "omitida por robots.txt"
    except Exception as e:  # noqa: BLE001
        fuentes["EPSS"] = f"error: {type(e).__name__}"
        for i in kev_items:
            i.setdefault("epss", None)
            i.setdefault("epss_percentil", None)
    brechas = previo.get("brechas", [])
    if permitido(HIBP):
        try:
            brechas = de_hibp(leer_json(HIBP, leer, 60), cfg["marcas"], (ahora - timedelta(days=365)).strftime("%Y-%m-%d"))
            fuentes["Have I Been Pwned (brechas)"] = f"ok ({len(brechas)})"
        except Exception as e:  # noqa: BLE001
            fuentes["Have I Been Pwned (brechas)"] = f"error: {type(e).__name__} (se conserva lo anterior)"
    else:
        fuentes["Have I Been Pwned (brechas)"] = "omitida por robots.txt"
    noti = None
    if vivos and os.path.exists(os.path.join(vivos, "noticiero.json")):
        noti = json.load(open(os.path.join(vivos, "noticiero.json"), encoding="utf-8"))
    prensa = fusionar_prensa(previo.get("prensa", []), de_prensa(noti, cfg["marcas"]), (ahora - timedelta(days=365)).strftime("%Y-%m-%d"))
    fuentes["Monitor de noticias (titulares)"] = f"ok ({len(prensa)} en 12 meses)" if noti else "sin noticiero en esta corrida (se conserva lo anterior)"
    kev_items.sort(key=lambda x: (x["fecha"], x.get("epss") or 0), reverse=True)
    datos = {
        "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "fuentes": fuentes,
        "resumen": {"kev": len(kev_items), "kev_30d": sum(1 for i in kev_items if i["fecha"] >= (ahora - timedelta(days=30)).strftime("%Y-%m-%d")),
                    "afectan_inventario": sum(1 for i in kev_items if i["afecta_inventario"]), "ransomware": sum(1 for i in kev_items if i["ransomware"]),
                    "brechas": len(brechas), "brechas_mx": sum(1 for b in brechas if b["mx"]), "prensa": len(prensa)},
        "nota": "KEV = fallas que ya se explotan (CISA). La versión corregida viene del NVD y puede faltar para fallas muy nuevas: en ese caso usa el aviso del fabricante. EPSS es una probabilidad estimada.",
        "kev": kev_items, "brechas": brechas, "prensa": prensa,
    }
    os.makedirs(salida, exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False)
    return datos


if __name__ == "__main__":
    d = construir(sys.argv[1] if len(sys.argv) > 1 else "seguridad", sys.argv[2] if len(sys.argv) > 2 else None)
    print("Vulnerabilidades en apps y plataformas:", d["resumen"])
    print("Fuentes:", d["fuentes"])
