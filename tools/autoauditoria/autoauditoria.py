#!/usr/bin/env python3
"""Autoauditoría semanal de DOMINUS (solo admin): evalúa el repositorio contra los controles de
config/autoauditoria.json (ISO 27001, OWASP Top 10 y ASVS, NIST CSF, CIS, ISO 22301, 27701, 31000, LFPDPPP, cadena de
suministro, WCAG y licencias de datos).

Controles «auto»: cada uno usa una verificación de este archivo (función en VERIFICACIONES) que revisa el código.
Controles «manual»: toman el estado que quien administra escribe en el archivo de configuración.
Puntaje: cumple = 1, parcial = 0.5, no cumple = 0; «no aplica» y «sin evaluar» no cuentan.

Uso: python3 tools/autoauditoria/autoauditoria.py <carpeta de salida>   → ultimo.json e historial.json
     (sin carpeta, solo imprime el resumen). Con --sin-pruebas no corre pytest ni node (más rápido).
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EXCLUIR = ("vendor/", "node_modules/", "tools/medicion/", ".git/")
VALOR = {"cumple": 1.0, "parcial": 0.5, "no_cumple": 0.0}


def archivos(*ext):
    """Archivos versionados (git ls-files) con esas extensiones, sin dependencias de terceros."""
    try:
        lista = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split("\n")
    except (OSError, subprocess.CalledProcessError):
        lista = [os.path.relpath(os.path.join(d, f), ROOT) for d, _, fs in os.walk(ROOT) for f in fs]
    return [f for f in lista if f and f.endswith(ext) and not f.startswith(EXCLUIR) and "/node_modules/" not in f]


def leer(rel):
    try:
        return open(os.path.join(ROOT, rel), encoding="utf-8", errors="replace").read()
    except OSError:
        return ""


def existe(rel):
    return os.path.exists(os.path.join(ROOT, rel))


def r(estado, detalle):
    return {"estado": estado, "detalle": detalle}


# ------------------------------------------------------------------ verificaciones automáticas
PATRONES_SECRETO = re.compile(r"(AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|ghp_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{40,}|sk-[A-Za-z0-9]{32,}"
                              r"|xox[bp]-[0-9A-Za-z-]{10,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)")


def secretos(cfg):
    hall = [f for f in archivos(".js", ".mjs", ".py", ".json", ".yml", ".yaml", ".html", ".md", ".toml", ".txt") if PATRONES_SECRETO.search(leer(f))]
    peligrosos = [f for f in archivos("") if os.path.basename(f) in (".env", "id_rsa", "id_ed25519") or f.endswith((".pem", ".key", ".p12"))]
    if hall or peligrosos:
        return r("no_cumple", f"Posibles secretos en: {', '.join((hall + peligrosos)[:8])}")
    return r("cumple", "Sin llaves ni archivos de llaves en el repositorio; los secretos viven en GitHub Secrets.")


def _html_sin_escape():
    n = 0
    for f in archivos(".js"):
        if not f.startswith("js/"):
            continue
        for linea in leer(f).splitlines():
            if re.search(r"innerHTML|insertAdjacentHTML", linea) and "${" in linea and "esc(" not in linea:
                n += 1
    return n


def codigo_seguro(cfg):
    evals = [f for f in archivos(".js") if f.startswith("js/") and re.search(r"\beval\(|new Function\(", leer(f))]
    n, base = _html_sin_escape(), cfg.get("linea_base_html_sin_escape", 0)
    if evals:
        return r("no_cumple", f"eval o new Function en: {', '.join(evals)}")
    if n > base:
        return r("parcial", f"{n} inserciones de HTML con ${{…}} sin esc() (línea base revisada: {base}). Revisar las {n - base} nuevas.")
    return r("cumple", f"Sin eval; {n} inserciones de HTML sin esc() revisadas a mano (solo números o texto propio).")


def inyeccion(cfg):
    sql = [f for f in archivos(".py") if re.search(r"execute\(\s*f[\"']|execute\([^)\n]*%\s|execute\([^)\n]*\.format\(|\btext\(\s*f[\"']", leer(f))]
    shell = [f for f in archivos(".py") if re.search(r"shell\s*=\s*True|os\.system\(", leer(f))]
    cod = codigo_seguro(cfg)
    if sql or shell:
        return r("no_cumple", f"SQL o comandos armados con texto en: {', '.join((sql + shell)[:6])}")
    if cod["estado"] != "cumple":
        return r("parcial", "SQL parametrizado; " + cod["detalle"])
    return r("cumple", "SQL solo con consultas parametrizadas (SQLAlchemy), comandos sin shell y HTML externo escapado.")


def actions_inyeccion(cfg):
    malos = []
    for f in archivos(".yml", ".yaml"):
        if not f.startswith(".github/workflows/"):
            continue
        for i, linea in enumerate(leer(f).splitlines(), 1):
            if re.search(r"^\s*(-\s*)?run:.*\$\{\{\s*github\.(event|head_ref)", linea):
                malos.append(f"{f}:{i}")
    return r("no_cumple", f"Datos de eventos dentro de run: {', '.join(malos)}") if malos else r("cumple", "Ningún workflow pega datos de eventos dentro de los comandos.")


def acciones_fijadas(cfg):
    usos = [m.group(1) for f in archivos(".yml") if f.startswith(".github/workflows/") for m in re.finditer(r"uses:\s*([^\s#]+)", leer(f))]
    externas = [u for u in usos if not u.startswith("./")]
    fijas = [u for u in externas if re.search(r"@[0-9a-f]{40}$", u)]
    if not externas:
        return r("cumple", "Sin acciones externas.")
    estado = "cumple" if len(fijas) == len(externas) else "parcial" if fijas else "no_cumple"
    return r(estado, f"{len(fijas)} de {len(externas)} usos de acciones externas fijados por hash.")


def permisos_workflows(cfg):
    wf = [f for f in archivos(".yml") if f.startswith(".github/workflows/")]
    sin = [f for f in wf if not re.search(r"^permissions:", leer(f), re.M)]
    estado = "cumple" if not sin else "parcial" if len(sin) < len(wf) else "no_cumple"
    return r(estado, f"{len(wf) - len(sin)} de {len(wf)} workflows declaran permisos" + (f"; faltan: {', '.join(os.path.basename(x) for x in sin[:8])}" if sin else "."))


def dependabot(cfg):
    return r("cumple", ".github/dependabot.yml existe.") if existe(".github/dependabot.yml") else r("no_cumple", "No existe .github/dependabot.yml.")


def codeql(cfg):
    hay = any("codeql-action" in leer(f) for f in archivos(".yml") if f.startswith(".github/workflows/"))
    return r("cumple", "Hay workflow de CodeQL.") if hay else r("no_cumple", "No hay análisis estático (CodeQL) en CI.")


def dependencias_fijadas(cfg):
    sueltas = []
    for f in [x for x in archivos(".txt") if os.path.basename(x).startswith("requirements")]:
        for linea in leer(f).splitlines():
            l = linea.split("#")[0].strip()
            if l and not l.startswith("-") and "==" not in l:
                sueltas.append(f"{f}: {l}")
    for f in [x for x in archivos(".json") if os.path.basename(x) == "package.json"]:
        try:
            d = json.loads(leer(f))
        except ValueError:
            continue
        for k, v in {**d.get("dependencies", {}), **d.get("devDependencies", {})}.items():
            if not re.match(r"^\d", str(v)):
                sueltas.append(f"{f}: {k}@{v}")
    return r("cumple", "Todas las dependencias tienen versión exacta.") if not sueltas else r("parcial", f"{len(sueltas)} sin versión exacta: {'; '.join(sueltas[:6])}")


def solo_https(cfg):
    malos = [f for f in archivos(".js", ".py") if (f.startswith(("js/", "tools/", "backend/", "cloudflare/", "ingest/"))) and
             re.search(r"[\"'`]http://(?!localhost|127\.0\.0\.1|0\.0\.0\.0|www\.w3\.org|cv\.iptc\.org|purl\.org|schemas\.|ns\.adobe\.com)[a-z0-9-]+\.[a-z]", leer(f))]
    return r("cumple", "Todas las llamadas usan HTTPS.") if not malos else r("parcial", f"Enlaces http:// en: {', '.join(malos[:8])}")


def rastreadores(cfg):
    pat = re.compile(r"google-analytics|googletagmanager|gtag\(|connect\.facebook\.net|fbq\(|hotjar|clarity\.ms|plausible\.io|matomo")
    hall = [f for f in archivos(".html", ".js") if (f.endswith(".html") or f.startswith("js/")) and pat.search(leer(f))]
    return r("cumple", "Sin analítica ni píxeles de terceros.") if not hall else r("no_cumple", f"Rastreadores en: {', '.join(hall)}")


def youtube_nocookie(cfg):
    hall = [f for f in archivos(".js") if f.startswith("js/") and "youtube.com/embed" in leer(f)]
    return r("cumple", "Reproductores con youtube-nocookie.") if not hall else r("parcial", f"youtube.com/embed en: {', '.join(hall)}")


def csp_sitio(cfg):
    paginas = [f for f in archivos(".html") if "/" not in f]
    con = [f for f in paginas if "Content-Security-Policy" in leer(f)]
    if len(con) == len(paginas):
        return r("cumple", "Todas las páginas declaran CSP.")
    return r("no_cumple" if not con else "parcial", f"{len(con)} de {len(paginas)} páginas con CSP. GitHub Pages no permite encabezados: se resuelve en el Worker de Cloudflare.")


def encabezados_backend(cfg):
    app = leer("backend/dominus/app.py")
    if not app:
        return r("no_aplica", "Sin backend.")
    faltan = [h for h in ("Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options", "X-Content-Type-Options") if h not in app]
    return r("cumple", "Backend con CSP, HSTS, X-Frame-Options y nosniff.") if not faltan else r("parcial", f"Faltan: {', '.join(faltan)}")


def backend_autenticacion(cfg):
    s = leer("backend/dominus/security.py") + leer("backend/dominus/app.py")
    if not s:
        return r("no_aplica", "Sin backend.")
    tiene = {"Argon2": "argon2" in s.lower(), "segundo factor (TOTP)": "pyotp" in s, "límite de intentos": "rate_limit" in s}
    faltan = [k for k, v in tiene.items() if not v]
    return r("cumple", "Argon2id, TOTP y límite de intentos.") if not faltan else r("parcial", f"Falta: {', '.join(faltan)}")


def cookies(cfg):
    app = leer("backend/dominus/app.py")
    if not app:
        return r("no_aplica", "Sin backend.")
    ok = "httponly=True" in app and "samesite='strict'" in app.lower().replace('"', "'")
    return r("cumple", "Cookie de sesión HttpOnly y SameSite=Strict (Secure según configuración).") if ok else r("parcial", "Revisar banderas de la cookie de sesión.")


def xml_seguro(cfg):
    inseguros = [f for f in archivos(".py") if f.startswith("backend/") and re.search(r"xml\.etree|from xml import|lxml", leer(f)) and "defusedxml" not in leer(f)]
    return r("cumple", "El backend lee XML con defusedxml.") if not inseguros else r("parcial", f"XML sin defusedxml en: {', '.join(inseguros)}")


def bitacora(cfg):
    s = leer("backend/dominus/security.py")
    return r("cumple", "Bitácora encadenada con HMAC en el backend.") if "hmac" in s and "audit" in s else r("no_cumple", "Sin bitácora con integridad.")


def worker_origenes(cfg):
    ws = [f for f in archivos(".js") if f.startswith("cloudflare/") and "fetch(" in leer(f)]
    if not ws:
        return r("no_aplica", "Sin Workers.")
    sin = [f for f in ws if "ORIGENES" not in leer(f) and "Origin" not in leer(f)]
    return r("cumple", f"{len(ws)} Worker(s) con lista de orígenes permitidos.") if not sin else r("parcial", f"Sin lista de orígenes: {', '.join(sin)}")


def plan_en_servidor(cfg):
    ws = " ".join(leer(f) for f in archivos(".js", ".ts") if f.startswith("cloudflare/"))
    if "planes.json" in ws or "acceso_por_plan" in ws:
        return r("cumple", "El Worker valida el plan.")
    return r("no_cumple", "El plan se valida solo en el navegador (sitio público). Pendiente para la versión comercial en Cloudflare.")


def aviso_privacidad(cfg):
    hay = existe("privacidad.html") or existe("docs/PRIVACIDAD.md")
    return r("cumple", "Aviso de privacidad publicado.") if hay else r("no_cumple", "No hay aviso de privacidad (privacidad.html).")


def plan_incidentes(cfg):
    return r("cumple", "docs/INCIDENTES.md existe.") if existe("docs/INCIDENTES.md") else r("no_cumple", "No hay plan de respuesta a incidentes escrito.")


def respaldo(cfg):
    if existe("docs/RECUPERACION.md"):
        return r("cumple", "Procedimiento de recuperación documentado.")
    if existe("backend/dominus/backup.py"):
        return r("parcial", "El backend tiene respaldo (backup.py) y los datos públicos se regeneran desde las fuentes; falta docs/RECUPERACION.md.")
    return r("no_cumple", "Sin respaldo ni procedimiento de recuperación.")


def inventario_fuentes(cfg):
    try:
        fuentes = json.loads(leer("config/entities.json"))["fuentes"]
    except (ValueError, KeyError):
        return r("no_cumple", "No se pudo leer config/entities.json.")
    sin = [k for k, v in fuentes.items() if not v.get("licencia")]
    return r("cumple" if not sin else "parcial", f"{len(fuentes)} fuentes inventariadas" + (f"; sin licencia anotada: {', '.join(sin[:8])}" if sin else ", todas con licencia anotada."))


def licencias_fuentes(cfg):
    try:
        lic = json.loads(leer("config/comercial_licencias.json"))["fuentes"]
    except (ValueError, KeyError):
        return r("no_cumple", "No se pudo leer config/comercial_licencias.json.")
    pend = [f["nombre"] for f in lic if f.get("estado") != "listo"]
    return r("cumple", "Todas las fuentes no comerciales están resueltas.") if not pend else r("parcial", f"{len(lic) - len(pend)} de {len(lic)} resueltas; pendientes: {', '.join(pend[:8])}")


def idioma_paginas(cfg):
    paginas = [f for f in archivos(".html") if "/" not in f]
    sin = [f for f in paginas if not re.search(r"<html[^>]*\blang=", leer(f))]
    return r("cumple", f"Las {len(paginas)} páginas declaran su idioma.") if not sin else r("parcial", f"Sin lang: {', '.join(sin)}")


def pruebas(cfg, correr=True):
    if not correr:
        return r("sin_evaluar", "Pruebas no ejecutadas en esta corrida (--sin-pruebas).")
    res = []
    for nombre, cmd in (("Python", [sys.executable, "-m", "pytest", "-q", "tests"]), ("JavaScript", ["node", "--test", *sorted(os.path.join("tests", "js", x) for x in os.listdir(os.path.join(ROOT, "tests", "js")) if x.endswith(".test.mjs"))])):
        try:
            p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=600)
            ultima = [l for l in (p.stdout + p.stderr).strip().splitlines() if l.strip()][-1:] or [""]
            res.append((nombre, p.returncode == 0, ultima[0][:120]))
        except (OSError, subprocess.TimeoutExpired) as e:
            res.append((nombre, None, type(e).__name__))
    if any(ok is False for _, ok, _ in res):
        return r("no_cumple", " · ".join(f"{n}: {'pasan' if ok else 'FALLAN'} ({t})" for n, ok, t in res))
    if any(ok is None for _, ok, _ in res):
        return r("parcial", " · ".join(f"{n}: {'pasan' if ok else 'sin ejecutar'} ({t})" for n, ok, t in res))
    return r("cumple", " · ".join(f"{n}: pasan ({t})" for n, _, t in res))


VERIFICACIONES = {f.__name__: f for f in (secretos, codigo_seguro, inyeccion, actions_inyeccion, acciones_fijadas, permisos_workflows, dependabot, codeql,
                                          dependencias_fijadas, solo_https, rastreadores, youtube_nocookie, csp_sitio, encabezados_backend,
                                          backend_autenticacion, cookies, xml_seguro, bitacora, worker_origenes, plan_en_servidor, aviso_privacidad,
                                          plan_incidentes, respaldo, inventario_fuentes, licencias_fuentes, idioma_paginas, pruebas)}
PRIORIDAD = {"alta": 0, "media": 1, "baja": 2}


def puntaje(items):
    cuentan = [VALOR[i["estado"]] for i in items if i["estado"] in VALOR]
    return round(100 * sum(cuentan) / len(cuentan)) if cuentan else None


def evaluar(cfg, correr_pruebas=True, ahora=None):
    cache, resultados = {}, []
    for c in cfg["controles"]:
        if c["tipo"] == "auto":
            if c["check"] not in cache:
                fn = VERIFICACIONES[c["check"]]
                cache[c["check"]] = fn(cfg, correr_pruebas) if fn is pruebas else fn(cfg)
            res = cache[c["check"]]
        else:
            res = r(c.get("estado", "sin_evaluar"), c.get("evidencia", ""))
        resultados.append({k: c.get(k) for k in ("id", "marco", "ref", "titulo", "tipo", "prioridad", "mejora")} | res)
    marcos = []
    for mid, nombre in cfg["marcos"].items():
        it = [x for x in resultados if x["marco"] == mid]
        marcos.append({"id": mid, "nombre": nombre, "puntaje": puntaje(it), "controles": len(it),
                       **{k: sum(1 for x in it if x["estado"] == k) for k in ("cumple", "parcial", "no_cumple", "sin_evaluar", "no_aplica")}})
    mejoras = sorted([x for x in resultados if x["estado"] in ("no_cumple", "parcial", "sin_evaluar")],
                     key=lambda x: (PRIORIDAD.get(x["prioridad"], 1), {"no_cumple": 0, "parcial": 1, "sin_evaluar": 2}[x["estado"]]))
    # Una mejora por acción (varios marcos comparten la misma verificación).
    vistas, unicas = set(), []
    for x in mejoras:
        if x["mejora"] not in vistas:
            vistas.add(x["mejora"]); unicas.append({**x, "marcos": sorted({y["marco"] for y in mejoras if y["mejora"] == x["mejora"]})})
    return {"fecha_utc": (ahora or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ"), "puntaje_global": puntaje(resultados),
            "marcos": marcos, "controles": resultados, "mejoras": unicas}


def main(args):
    correr = "--sin-pruebas" not in args
    salida = next((a for a in args if not a.startswith("--")), None)
    cfg = json.load(open(os.path.join(ROOT, "config", "autoauditoria.json"), encoding="utf-8"))
    res = evaluar(cfg, correr)
    print(f"Autoauditoría: {res['puntaje_global']} % global")
    for m in res["marcos"]:
        print(f"  {m['puntaje'] if m['puntaje'] is not None else '—':>4} %  {m['nombre']}")
    print(f"  {len(res['mejoras'])} mejoras pendientes")
    if salida:
        os.makedirs(salida, exist_ok=True)
        json.dump(res, open(os.path.join(salida, "ultimo.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        ruta_h = os.path.join(salida, "historial.json")
        try:
            hist = json.load(open(ruta_h, encoding="utf-8"))
        except (OSError, ValueError):
            hist = []
        hist = [h for h in hist if h["fecha_utc"][:10] != res["fecha_utc"][:10]]
        hist.append({"fecha_utc": res["fecha_utc"], "global": res["puntaje_global"], **{m["id"]: m["puntaje"] for m in res["marcos"]}})
        json.dump(hist[-104:], open(ruta_h, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
