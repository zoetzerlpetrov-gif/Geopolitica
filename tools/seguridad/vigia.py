#!/usr/bin/env python3
"""Vigía de seguridad de DOMINUS: revisa cada 10 minutos el sitio, Cloudflare y GitHub, y entra en modo de protección.

Qué revisa (cada fuente es opcional: sin su secreto, se omite y lo dice):
  1. Disponibilidad e integridad: pide las páginas publicadas (GitHub Pages, dominusosint.com, Worker) y compara el
     index.html publicado con el del repositorio. Si difiere en 3 corridas seguidas, avisa «posible alteración».
  2. Cloudflare (CLOUDFLARE_VIGIA_TOKEN + CLOUDFLARE_ZONE_ID): solicitudes, errores 5xx y eventos de firewall de los
     últimos 15 minutos contra el promedio de las 24 h anteriores (API GraphQL de analítica).
  3. GitHub (GITHUB_TOKEN del propio flujo): commits nuevos en main de autores fuera de la lista permitida y alertas
     abiertas de code scanning, secret scanning y Dependabot.
Modo de protección (solo si el token tiene «Zone Settings: Edit»): con un ataque en curso pone el nivel de seguridad de
la zona en «under_attack» (desafío a cada visita) y lo regresa al nivel anterior tras 60 minutos sin señales.
Avisos: abre o actualiza un issue «🛡️ Vigía» con la etiqueta «seguridad» (GitHub te manda correo) y escribe el estado en
vigia/estado.json (rama datos-vigia; lo muestra el Centro de control). Nunca publica direcciones IP: solo países, ASN y
reglas, en totales.
"""
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SALIDA = os.environ.get("VIGIA_DIR", os.path.join(ROOT, "vigia"))
ESTADO = os.path.join(SALIDA, "estado.json")
SITIOS = [("Cloudflare Pages", "https://dominus-osint.pages.dev/"), ("dominusosint.com", "https://dominusosint.com/"),
          ("Worker admin", "https://admin.dominusosint.com/legal/datos.json")]
UMBRAL = {"factor_solicitudes": 5, "min_solicitudes": 3000, "eventos_firewall": 300, "pct_5xx": 20, "corridas_integridad": 3, "calma_min": 60}
AUTORES = {a.strip().lower() for a in os.environ.get("VIGIA_AUTORES", "zoetzerlpetrov-gif,geopolitica-bot,github-actions[bot],dependabot[bot],claude").split(",") if a.strip()}


def ahora():
    return datetime.now(timezone.utc)


def http(url, metodo="GET", cuerpo=None, cabeceras=None, timeout=25):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(url, data=datos, method=metodo, headers={"User-Agent": "DOMINUS-vigia", **({"Content-Type": "application/json"} if datos else {}), **(cabeceras or {})})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), round((time.time() - t0) * 1000)
    except urllib.error.HTTPError as e:
        return e.code, e.read() if hasattr(e, "read") else b"", round((time.time() - t0) * 1000)


# ------------------------------------------------------------------ 1. disponibilidad e integridad
def revisar_sitios(pedir=http, local_index=None):
    out = []
    for nombre, url in SITIOS:
        try:
            st, cuerpo, ms = pedir(url)
            item = {"sitio": nombre, "url": url, "estado": st, "ms": ms, "ok": 200 <= st < 400}
            if url.endswith("/") and local_index is not None and st == 200:
                item["integro"] = huella_index(cuerpo) == huella_index(local_index)
            out.append(item)
        except Exception as e:  # noqa: BLE001
            out.append({"sitio": nombre, "url": url, "estado": 0, "ms": None, "ok": False, "error": str(e)[:120]})
    return out


def huella_index(contenido):
    """Huella del index.html sin espacios al final de línea (la publicación no cambia el contenido)."""
    t = contenido.decode("utf-8", "ignore") if isinstance(contenido, bytes) else str(contenido)
    return hashlib.sha256("\n".join(l.rstrip() for l in t.strip().splitlines()).encode()).hexdigest()


# ------------------------------------------------------------------ 2. Cloudflare
CONSULTA = """query($zona:String!,$desde:Time!,$hasta:Time!,$base:Time!){viewer{zones(filter:{zoneTag:$zona}){
ahora:httpRequestsAdaptiveGroups(limit:1,filter:{datetime_geq:$desde,datetime_lt:$hasta}){count sum{edgeResponseBytes}}
errores:httpRequestsAdaptiveGroups(limit:1,filter:{datetime_geq:$desde,datetime_lt:$hasta,edgeResponseStatus_geq:500}){count}
base:httpRequestsAdaptiveGroups(limit:1,filter:{datetime_geq:$base,datetime_lt:$desde}){count}
fw:firewallEventsAdaptiveGroups(limit:20,filter:{datetime_geq:$desde,datetime_lt:$hasta},orderBy:[count_DESC]){count dimensions{action source clientCountryName clientAsn}}}}}"""


def analitica_cloudflare(token, zona, pedir=http, t=None):
    t = t or ahora()
    desde, base = t - timedelta(minutes=15), t - timedelta(hours=24, minutes=15)
    st, cuerpo, _ = pedir("https://api.cloudflare.com/client/v4/graphql", "POST",
                          {"query": CONSULTA, "variables": {"zona": zona, "desde": desde.strftime("%Y-%m-%dT%H:%M:%SZ"), "hasta": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "base": base.strftime("%Y-%m-%dT%H:%M:%SZ")}},
                          {"Authorization": f"Bearer {token}"})
    d = json.loads(cuerpo or b"{}")
    if st != 200 or d.get("errors"):
        raise RuntimeError(f"GraphQL {st}: {str(d.get('errors'))[:200]}")
    z = d["data"]["viewer"]["zones"][0]
    n = (z["ahora"] or [{"count": 0}])[0]["count"]
    base_15 = ((z["base"] or [{"count": 0}])[0]["count"]) / 96   # 24 h = 96 bloques de 15 min
    err = (z["errores"] or [{"count": 0}])[0]["count"]
    fw = z.get("fw") or []
    paises, asn, acciones = {}, {}, {}
    for g in fw:
        dm = g["dimensions"]
        paises[dm.get("clientCountryName") or "?"] = paises.get(dm.get("clientCountryName") or "?", 0) + g["count"]
        asn[str(dm.get("clientAsn"))] = asn.get(str(dm.get("clientAsn")), 0) + g["count"]
        acciones[f"{dm.get('source')}:{dm.get('action')}"] = acciones.get(f"{dm.get('source')}:{dm.get('action')}", 0) + g["count"]
    top = lambda m: sorted(m.items(), key=lambda x: -x[1])[:5]   # noqa: E731
    return {"solicitudes_15m": n, "promedio_15m": round(base_15, 1), "errores_5xx": err, "pct_5xx": round(100 * err / n, 1) if n else 0,
            "eventos_firewall": sum(g["count"] for g in fw), "paises": top(paises), "asn": top(asn), "acciones": top(acciones)}


def senales_cloudflare(m, u=UMBRAL):
    s = []
    if m["solicitudes_15m"] >= u["min_solicitudes"] and m["solicitudes_15m"] >= u["factor_solicitudes"] * max(m["promedio_15m"], 1):
        s.append(f"Pico de tráfico: {m['solicitudes_15m']} solicitudes en 15 min (promedio {m['promedio_15m']}).")
    if m["eventos_firewall"] >= u["eventos_firewall"]:
        s.append(f"{m['eventos_firewall']} eventos de firewall en 15 min.")
    if m["solicitudes_15m"] >= 200 and m["pct_5xx"] >= u["pct_5xx"]:
        s.append(f"{m['pct_5xx']} % de errores 5xx.")
    return s


def nivel_zona(token, zona, valor=None, pedir=http):
    url = f"https://api.cloudflare.com/client/v4/zones/{zona}/settings/security_level"
    st, cuerpo, _ = pedir(url, "PATCH" if valor else "GET", {"value": valor} if valor else None, {"Authorization": f"Bearer {token}"})
    d = json.loads(cuerpo or b"{}")
    if st != 200 or not d.get("success"):
        raise RuntimeError(f"security_level {st}")
    return d["result"]["value"]


# ------------------------------------------------------------------ 3. GitHub
def revisar_github(repo, token, desde, pedir=http):
    h = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    out = {"commits_extranos": [], "alertas": {}}
    st, cuerpo, _ = pedir(f"https://api.github.com/repos/{repo}/commits?sha=main&since={desde}", cabeceras=h)
    if st == 200:
        for c in json.loads(cuerpo):
            autor = ((c.get("author") or {}).get("login") or (c.get("commit", {}).get("author") or {}).get("name") or "").lower()
            if autor not in AUTORES:
                out["commits_extranos"].append({"sha": c["sha"][:10], "autor": autor, "mensaje": c["commit"]["message"].splitlines()[0][:100]})
    for nombre, ruta in (("code_scanning", "code-scanning/alerts"), ("secret_scanning", "secret-scanning/alerts"), ("dependabot", "dependabot/alerts")):
        st, cuerpo, _ = pedir(f"https://api.github.com/repos/{repo}/{ruta}?state=open&per_page=100", cabeceras=h)
        out["alertas"][nombre] = len(json.loads(cuerpo)) if st == 200 else None   # None = sin permiso o desactivado
    return out


# ------------------------------------------------------------------ decisión
def decidir(previo, sitios, cf, gh, t, u=UMBRAL):
    """→ (estado nuevo, motivos, acción de zona: 'proteger' | 'liberar' | None)."""
    motivos = []
    integ = [s for s in sitios if s.get("integro") is False]
    racha = (previo.get("racha_integridad", 0) + 1) if integ else 0
    if racha >= u["corridas_integridad"]:
        motivos.append("Posible alteración: el index.html publicado no coincide con el del repositorio (" + ", ".join(s["sitio"] for s in integ) + ").")
    caidos = [s["sitio"] for s in sitios if not s["ok"] and s["sitio"] != "dominusosint.com"]
    if caidos:
        motivos.append("Sin respuesta: " + ", ".join(caidos) + ".")
    sen_cf = senales_cloudflare(cf) if cf else []
    motivos += sen_cf
    if gh and gh.get("commits_extranos"):
        motivos.append(f"{len(gh['commits_extranos'])} commit(s) en main de autores no permitidos.")
    if gh and (gh["alertas"].get("secret_scanning") or 0) > 0:
        motivos.append(f"{gh['alertas']['secret_scanning']} secreto(s) expuesto(s) detectado(s) por GitHub.")
    accion = None
    ultima = previo.get("ultima_senal_cf")
    if sen_cf:
        ultima = t.strftime("%Y-%m-%dT%H:%M:%SZ")
        if not previo.get("proteccion"):
            accion = "proteger"
    elif previo.get("proteccion") and ultima and t - datetime.strptime(ultima, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) >= timedelta(minutes=u["calma_min"]):
        accion = "liberar"
    nivel = "ataque" if sen_cf else "alerta" if motivos else "normal"
    return {"nivel": nivel, "racha_integridad": racha, "ultima_senal_cf": ultima}, motivos, accion


def issue(repo, token, motivos, detalle, pedir=http):
    """Abre o comenta el issue «🛡️ Vigía» (GitHub manda correo). Sin IPs."""
    h = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    st, cuerpo, _ = pedir(f"https://api.github.com/repos/{repo}/issues?state=open&labels=seguridad&per_page=20", cabeceras=h)
    abiertos = [i for i in (json.loads(cuerpo) if st == 200 else []) if i["title"].startswith("🛡️ Vigía")]
    texto = "**" + " ".join(motivos) + "**\n\n```json\n" + json.dumps(detalle, ensure_ascii=False, indent=1)[:5000] + "\n```\n\n_Generado por tools/seguridad/vigia.py_"
    if abiertos:
        pedir(f"https://api.github.com/repos/{repo}/issues/{abiertos[0]['number']}/comments", "POST", {"body": texto}, h)
    else:
        pedir(f"https://api.github.com/repos/{repo}/issues", "POST", {"title": "🛡️ Vigía: posible incidente de seguridad", "body": texto, "labels": ["seguridad"]}, h)


def main():
    os.makedirs(SALIDA, exist_ok=True)
    try:
        previo = json.load(open(ESTADO, encoding="utf-8"))
    except (OSError, ValueError):
        previo = {}
    t = ahora()
    local = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    sitios = revisar_sitios(local_index=local)
    avisos, cf, gh = [], None, None
    tok_cf, zona = os.environ.get("CLOUDFLARE_VIGIA_TOKEN", ""), os.environ.get("CLOUDFLARE_ZONE_ID", "")
    if tok_cf and zona:
        try:
            cf = analitica_cloudflare(tok_cf, zona, t=t)
        except Exception as e:  # noqa: BLE001
            avisos.append(f"Cloudflare: {e}"[:200])
    else:
        avisos.append("Cloudflare sin configurar (CLOUDFLARE_VIGIA_TOKEN y CLOUDFLARE_ZONE_ID).")
    repo, tok_gh = os.environ.get("GITHUB_REPOSITORY", ""), os.environ.get("GITHUB_TOKEN", "")
    if repo and tok_gh:
        try:
            gh = revisar_github(repo, tok_gh, (t - timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ"))
        except Exception as e:  # noqa: BLE001
            avisos.append(f"GitHub: {e}"[:200])
    est, motivos, accion = decidir(previo, sitios, cf, gh, t)
    proteccion, nivel_previo = previo.get("proteccion", False), previo.get("nivel_zona_previo")
    if accion and tok_cf and zona:
        try:
            if accion == "proteger":
                nivel_previo = nivel_zona(tok_cf, zona)
                nivel_zona(tok_cf, zona, "under_attack")
                proteccion = True
                motivos.append("🛡️ Modo de protección activado: Cloudflare desafía cada visita (under_attack).")
            else:
                nivel_zona(tok_cf, zona, nivel_previo or "medium")
                proteccion = False
                motivos.append(f"✅ {UMBRAL['calma_min']} min sin señales: nivel de seguridad regresado a «{nivel_previo or 'medium'}».")
        except Exception as e:  # noqa: BLE001
            avisos.append(f"No se pudo cambiar el nivel de seguridad: {e}"[:200])
    detalle = {"hora": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "sitios": sitios, "cloudflare": cf, "github": gh, "avisos": avisos}
    if motivos and repo and tok_gh and (motivos != previo.get("motivos") or accion):
        try:
            issue(repo, tok_gh, motivos, detalle)
        except Exception as e:  # noqa: BLE001
            avisos.append(f"No se pudo abrir el issue: {e}"[:200])
    historial = (previo.get("historial") or [])[-287:] + [{"hora": detalle["hora"], "nivel": est["nivel"], "solicitudes": (cf or {}).get("solicitudes_15m"), "firewall": (cf or {}).get("eventos_firewall")}]
    json.dump({**est, "generado_utc": detalle["hora"], "proteccion": proteccion, "nivel_zona_previo": nivel_previo, "motivos": motivos, "detalle": detalle, "historial": historial},
              open(ESTADO, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    # En el registro de Actions solo totales: los detalles (que podrían citar respuestas de las API) van al issue y al JSON.
    print(f"Vigía: nivel {est['nivel']}; protección {'ACTIVA' if proteccion else 'no'}; {len(motivos)} señal(es); {len(avisos)} aviso(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
