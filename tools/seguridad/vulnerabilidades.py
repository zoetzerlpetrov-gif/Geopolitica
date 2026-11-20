#!/usr/bin/env python3
"""Monitor diario de vulnerabilidades de DOMINUS (complementa al vigía de cada 10 minutos y a la autoauditoría semanal).

Revisa el repositorio y los sitios publicados, y manda el resultado al Worker (D1, privado). El repositorio es público:
este script NO imprime hallazgos en el registro de GitHub Actions ni escribe archivos en data/; solo muestra totales.

Revisiones (cada una es independiente: si falla o le falta un secreto, queda como «omitida» o «error» y sigue):
  1. Dependencias con vulnerabilidades conocidas (OSV.dev, sin llave): Python (requirements*.txt), npm (package-lock.json)
     y bibliotecas que el sitio carga de CDN con versión fija (cdn.jsdelivr.net / unpkg.com).
  2. Secretos escritos en el código (patrones de llaves de nube, tokens y llaves privadas). Nunca se copia el secreto.
  3. Inyección de código en Python (eval/exec, shell=True, os.system, pickle, yaml.load inseguro, SQL armado con texto).
  4. Inyección en JavaScript del sitio y del Worker (eval, new Function, document.write).
  5. Flujos de GitHub Actions: datos externos dentro de «run:» (inyección de órdenes), acciones sin fijar a un commit,
     pull_request_target y permisos amplios.
  6. Encabezados de seguridad de los sitios (HSTS, CSP aplicada o solo informativa, marcos, nosniff, Referrer-Policy).
  7. Archivos sensibles expuestos (.git, .env, respaldos) y redirección de HTTP a HTTPS.
  8. Protección de Admin: páginas y API sin sesión deben negar; /ops/ debe pasar por Cloudflare Access; la API de cuentas
     no debe responder a otros orígenes.
  9. Certificados TLS por vencer.
 10. Alertas de GitHub (code scanning, Dependabot, secret scanning) y regla de protección de main (anti borrado/ransomware).
 11. Controles que requieren a una persona (2FA, respaldos fuera de línea, límite de intentos en Cloudflare, CSP, datos
     por plan servidos desde el Worker), con su paso a paso.

Uso: python tools/seguridad/vulnerabilidades.py  (variables: VULN_INGEST_TOKEN, GITHUB_TOKEN, GITHUB_REPOSITORY).
"""
import ast
import json
import os
import re
import socket
import ssl
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
INGESTA = "https://admin.dominusosint.com/admin/huella/vulnerabilidades/ingesta"
SITIOS = {"publico": "https://dominusosint.com/", "admin": "https://admin.dominusosint.com/"}
UA = "DOMINUS-vulnerabilidades/1.0 (revision propia)"


# ---------------------------------------------------------------- utilidades
def http(url, metodo="GET", cuerpo=None, cabeceras=None, timeout=25, seguir=True):
    """Petición HTTP → (estado, cabeceras dict en minúsculas, cuerpo bytes). Sin seguir redirecciones si seguir=False."""
    req = urllib.request.Request(url, data=cuerpo, method=metodo, headers={"User-Agent": UA, **(cabeceras or {})})
    abridor = urllib.request.build_opener() if seguir else urllib.request.build_opener(_SinRedireccion)
    try:
        with abridor.open(req, timeout=timeout) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read(400000)
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, (e.read(20000) if e.fp else b"")


class _SinRedireccion(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def archivos_repo():
    try:
        salida = subprocess.run(["git", "ls-files"], cwd=RAIZ, capture_output=True, text=True, check=True).stdout
        return [l for l in salida.splitlines() if l]
    except (OSError, subprocess.CalledProcessError):
        return []


def leer(ruta):
    try:
        with open(os.path.join(RAIZ, ruta), encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def hallazgo(id_, categoria, severidad, titulo, detalle, accion, quien="claude"):
    return {"id": id_, "categoria": categoria, "severidad": severidad, "titulo": titulo, "detalle": detalle, "accion": accion, "quien": quien}


# ---------------------------------------------------------------- 1. dependencias (OSV)
def dependencias_python(archivos):
    deps, sueltas = [], []
    for ruta in archivos:
        if not re.search(r"(^|/)requirements[^/]*\.txt$", ruta):
            continue
        for linea in leer(ruta).splitlines():
            linea = linea.split("#")[0].strip()
            if not linea or linea.startswith("-"):
                continue
            m = re.match(r"^([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*==\s*([0-9][^\s;,]*)", linea)
            if m:
                deps.append(("PyPI", m.group(1).lower(), m.group(2), ruta))
            else:
                sueltas.append((linea, ruta))
    return deps, sueltas


def dependencias_npm(archivos):
    deps = []
    for ruta in archivos:
        if not ruta.endswith("package-lock.json"):
            continue
        try:
            datos = json.loads(leer(ruta) or "{}")
        except ValueError:
            continue
        for clave, info in (datos.get("packages") or {}).items():
            if clave.startswith("node_modules/") and info.get("version"):
                deps.append(("npm", clave.split("node_modules/")[-1], info["version"], ruta))
    return deps


CDN = re.compile(r"(?:cdn\.jsdelivr\.net/npm|unpkg\.com)/((?:@[a-z0-9._-]+/)?[a-z0-9._-]+)@([0-9][0-9A-Za-z.-]*)")


def dependencias_cdn(archivos):
    vistos = {}
    for ruta in archivos:
        if ruta.endswith((".html", ".js", ".mjs")) and not ruta.startswith(("tests/", "node_modules/")):
            for nombre, version in CDN.findall(leer(ruta)):
                vistos.setdefault((nombre, version.rstrip(".")), ruta)
    return [("npm", n, v, r) for (n, v), r in vistos.items()]


VENDOR = [("maplibre-gl", "vendor/maplibre-gl/maplibre-gl.mjs", re.compile(r"maplibre-gl v?(\d+\.\d+\.\d+)|v(\d+\.\d+\.\d+)"))]


def dependencias_vendor(archivos):
    """Bibliotecas copiadas en vendor/ (las carga el navegador de los visitantes): versión desde su encabezado."""
    deps = []
    for nombre, ruta, patron in VENDOR:
        if ruta in archivos:
            m = patron.search(leer(ruta)[:600])
            if m:
                deps.append(("npm", nombre, m.group(1) or m.group(2), ruta))
    return deps


def consultar_osv(deps, pedir=http):
    """deps [(ecosistema, nombre, version, ruta)] → {indice: [ids de vulnerabilidades]} (consulta por lotes de 500)."""
    encontrados = {}
    for inicio in range(0, len(deps), 500):
        lote = deps[inicio:inicio + 500]
        cuerpo = json.dumps({"queries": [{"package": {"ecosystem": e, "name": n}, "version": v} for e, n, v, _ in lote]}).encode()
        estado, _, datos = pedir("https://api.osv.dev/v1/querybatch", "POST", cuerpo, {"Content-Type": "application/json"}, 60)
        if estado != 200:
            raise RuntimeError(f"OSV respondió {estado}")
        for i, r in enumerate(json.loads(datos).get("results", [])):
            ids = [v["id"] for v in (r.get("vulns") or [])]
            if ids:
                encontrados[inicio + i] = ids
    return encontrados


def resumen_osv(vid, pedir=http):
    try:
        estado, _, datos = pedir(f"https://api.osv.dev/v1/vulns/{vid}", timeout=30)
        if estado == 200:
            d = json.loads(datos)
            sev = (d.get("database_specific") or {}).get("severity", "")
            arreglo = ""
            for a in d.get("affected", []):
                for r in a.get("ranges", []):
                    for ev in r.get("events", []):
                        if ev.get("fixed"):
                            arreglo = ev["fixed"]
            return d.get("summary", "") or d.get("details", "")[:200], str(sev).upper(), arreglo
    except (ValueError, OSError):
        pass
    return "", "", ""


def revisar_dependencias(archivos, pedir=http):
    py, sueltas = dependencias_python(archivos)
    npm, cdn = dependencias_npm(archivos), dependencias_cdn(archivos) + dependencias_vendor(archivos)
    deps = py + npm + cdn
    hall = []
    for linea, ruta in sueltas[:30]:
        hall.append(hallazgo(f"dep-sin-fijar:{ruta}:{linea[:40]}", "Actualizaciones", "baja", f"Dependencia sin versión exacta: {linea[:60]}",
                             f"En {ruta}. Sin versión exacta no se puede comprobar contra vulnerabilidades conocidas y una actualización puede entrar sin revisión.",
                             "Fijar la versión con «==» tras probarla.", "claude"))
    for i, ids in consultar_osv(deps, pedir).items():
        eco, nombre, version, ruta = deps[i]
        resumen, sev, arreglo = resumen_osv(ids[0], pedir)
        en_sitio = (eco, nombre, version, ruta) in cdn
        severidad = {"CRITICAL": "critica", "HIGH": "alta", "MODERATE": "media", "MEDIUM": "media", "LOW": "baja"}.get(sev, "alta" if en_sitio else "media")
        if ruta.endswith("package-lock.json") and severidad in ("critica", "alta"):
            severidad = "media"  # herramientas de CI y medición: no se publican en el sitio
        hall.append(hallazgo(f"dep:{eco}:{nombre}:{version}", "Dependencias", severidad,
                             f"{nombre} {version} tiene vulnerabilidades conocidas ({', '.join(ids[:4])}{'…' if len(ids) > 4 else ''})",
                             f"{resumen[:300]} · Usada en {ruta}{' (la carga el navegador de los visitantes)' if en_sitio else ''}.",
                             f"Actualizar a {arreglo or 'la versión corregida'} y volver a probar.", "claude"))
    return hall, f"{len(deps)} dependencias revisadas en OSV"


# ---------------------------------------------------------------- 2. secretos en el código
SECRETOS = [
    ("Llave de AWS", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("Token de GitHub", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b")),
    ("Llave de Google", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("Llave de OpenAI/Anthropic", re.compile(r"\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b")),
    ("Token de Slack", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{20,}\b")),
    ("Token de Stripe", re.compile(r"\b[rs]k_live_[A-Za-z0-9]{20,}\b")),
    ("Token de Mercado Pago", re.compile(r"\bAPP_USR-\d{6,}-\d{6}-[a-f0-9]{32}-\d+\b")),
    ("Llave privada", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
]


def revisar_secretos(archivos):
    hall = []
    for ruta in archivos:
        if ruta.startswith(("data/", "vendor/")) or ruta.endswith((".png", ".jpg", ".pdf", ".woff2", ".pmtiles", ".zip", ".geojson")):
            continue
        for n, linea in enumerate(leer(ruta).splitlines(), 1):
            for nombre, patron in SECRETOS:
                if patron.search(linea) and "ejemplo" not in linea.lower() and "example" not in linea.lower():
                    hall.append(hallazgo(f"secreto:{ruta}:{n}", "Secretos", "critica", f"Posible {nombre} escrito en el código",
                                         f"{ruta}, línea {n}. El repositorio es público: cualquiera puede copiarlo.",
                                         "1) Revoca la llave en el servicio que la emitió. 2) Crea una nueva y guárdala como secreto (GitHub o Worker). 3) Pide a Claude que la quite del código.", "ambos"))
    return hall, f"{len(archivos)} archivos revisados"


# ---------------------------------------------------------------- 3. inyección en Python
def _texto_armado(nodo):
    return isinstance(nodo, ast.JoinedStr) or (isinstance(nodo, ast.BinOp) and isinstance(nodo.op, (ast.Add, ast.Mod))) or (
        isinstance(nodo, ast.Call) and isinstance(nodo.func, ast.Attribute) and nodo.func.attr == "format")


def revisar_python_codigo(fuente, ruta):
    hall = []
    try:
        arbol = ast.parse(fuente)
    except SyntaxError:
        return hall
    for nodo in ast.walk(arbol):
        if not isinstance(nodo, ast.Call):
            continue
        f = nodo.func
        nombre = f.id if isinstance(f, ast.Name) else f.attr if isinstance(f, ast.Attribute) else ""
        base = f.value.id if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name) else ""
        linea = getattr(nodo, "lineno", 0)
        def agregar(sev, titulo, accion):
            hall.append(hallazgo(f"py:{ruta}:{linea}:{nombre}", "Inyección de código", sev, titulo, f"{ruta}, línea {linea}.", accion, "claude"))
        if nombre in ("eval", "exec") and isinstance(f, ast.Name):
            agregar("alta", f"Uso de {nombre}() en Python", "Reemplazar por un análisis explícito (json, ast.literal_eval o un mapa de funciones permitidas).")
        if base == "os" and nombre in ("system", "popen"):
            agregar("alta", f"os.{nombre}() ejecuta texto en la consola", "Usar subprocess.run con una lista de argumentos y sin shell.")
        if any(k.arg == "shell" and isinstance(k.value, ast.Constant) and k.value.value is True for k in nodo.keywords):
            agregar("alta", "subprocess con shell=True", "Pasar los argumentos como lista y quitar shell=True.")
        if base in ("pickle", "marshal") and nombre in ("load", "loads"):
            agregar("alta", f"{base}.{nombre}() puede ejecutar código al leer datos", "Usar JSON para datos externos.")
        if base == "yaml" and nombre == "load" and not any(k.arg == "Loader" and "Safe" in ast.unparse(k.value) for k in nodo.keywords):
            agregar("alta", "yaml.load sin SafeLoader", "Usar yaml.safe_load.")
        if nombre in ("execute", "executemany", "executescript") and nodo.args and _texto_armado(nodo.args[0]):
            agregar("alta", "Consulta SQL armada con texto (posible inyección SQL)", "Usar parámetros «?» y pasar los valores aparte.")
    return hall


def revisar_python(archivos):
    hall = []
    py = [r for r in archivos if r.endswith(".py") and not r.startswith("tests/")]
    for ruta in py:
        hall += revisar_python_codigo(leer(ruta), ruta)
    return hall, f"{len(py)} archivos de Python revisados"


# ---------------------------------------------------------------- 4. inyección en JavaScript
JS_PELIGRO = [
    (re.compile(r"(?<![\w.])eval\s*\("), "eval()", "alta"),
    (re.compile(r"\bnew\s+Function\s*\("), "new Function()", "alta"),
    (re.compile(r"\bdocument\.write\s*\("), "document.write()", "media"),
    (re.compile(r"\bset(?:Timeout|Interval)\s*\(\s*[\"'`]"), "setTimeout/setInterval con texto", "media"),
]


def revisar_js(archivos):
    hall = []
    js = [r for r in archivos if r.endswith((".js", ".mjs")) and not r.startswith(("tests/", "vendor/", "node_modules/")) and "/node_modules/" not in r]
    for ruta in js:
        for n, linea in enumerate(leer(ruta).splitlines(), 1):
            if linea.lstrip().startswith("//"):
                continue
            for patron, nombre, sev in JS_PELIGRO:
                if patron.search(linea):
                    hall.append(hallazgo(f"js:{ruta}:{n}:{nombre}", "Inyección de código", sev, f"{nombre} en JavaScript", f"{ruta}, línea {n}.",
                                         "Reemplazar por código que no interprete texto como programa.", "claude"))
    return hall, f"{len(js)} archivos de JavaScript revisados (CodeQL revisa además cada cambio)"


# ---------------------------------------------------------------- 5. GitHub Actions
EXTERNOS = re.compile(r"\$\{\{\s*github\.(?:event\.(?:issue|pull_request|comment|review|head_commit|commits|pages|discussion)[^}]*|head_ref)\s*\}\}")


def revisar_workflows(archivos):
    hall = []
    wfs = [r for r in archivos if r.startswith(".github/workflows/") and r.endswith((".yml", ".yaml"))]
    for ruta in wfs:
        texto = leer(ruta)
        if "pull_request_target" in texto:
            hall.append(hallazgo(f"wf-prt:{ruta}", "GitHub Actions", "alta", "Flujo con pull_request_target", f"{ruta}: corre código de terceros con permisos del repositorio.",
                                 "Cambiar a pull_request o no hacer checkout del código del PR.", "claude"))
        if re.search(r"^permissions:\s*write-all", texto, re.M):
            hall.append(hallazgo(f"wf-perm:{ruta}", "GitHub Actions", "media", "Permisos write-all", ruta, "Dar solo los permisos necesarios.", "claude"))
        en_run = False
        for n, linea in enumerate(texto.splitlines(), 1):
            if re.match(r"\s*(?:-\s*)?run:", linea):
                en_run = True
            elif re.match(r"\s*(?:-\s*)?(?:uses|with|env|name|if):", linea):
                en_run = False
            if en_run and EXTERNOS.search(linea):
                hall.append(hallazgo(f"wf-iny:{ruta}:{n}", "GitHub Actions", "alta", "Dato externo dentro de «run:» (inyección de órdenes)",
                                     f"{ruta}, línea {n}.", "Pasar el dato por una variable de entorno y citarla.", "claude"))
            m = re.search(r"uses:\s*([^\s@]+)@([^\s#]+)", linea)
            if m and not m.group(1).startswith("./") and not re.fullmatch(r"[0-9a-f]{40}", m.group(2)):
                hall.append(hallazgo(f"wf-pin:{ruta}:{m.group(1)}", "GitHub Actions", "media", f"Acción {m.group(1)} sin fijar a un commit",
                                     f"{ruta}, línea {n} (@{m.group(2)}). Si alguien altera esa etiqueta, el flujo corre su código.",
                                     "Fijar la acción a su SHA de 40 caracteres.", "claude"))
    return hall, f"{len(wfs)} flujos revisados"


# ---------------------------------------------------------------- 6-8. sitios publicados
def revisar_encabezados(pedir=http):
    hall, notas = [], []
    for nombre, url in SITIOS.items():
        objetivo = url if nombre == "publico" else url + "admin/huella/ingreso"
        estado, cab, _ = pedir(objetivo)
        notas.append(f"{nombre}: {estado}")
        def falta(clave, titulo, sev, accion, quien="claude"):
            hall.append(hallazgo(f"enc:{nombre}:{clave}", "Encabezados", sev, f"{titulo} ({nombre})", objetivo, accion, quien))
        if "strict-transport-security" not in cab:
            falta("hsts", "Falta HSTS", "media", "Agregar Strict-Transport-Security (max-age=31536000; includeSubDomains).")
        csp = cab.get("content-security-policy", "")
        if not csp:
            falta("csp", "CSP solo informativa (Report-Only), no aplicada" if "content-security-policy-report-only" in cab else "Sin Content-Security-Policy", "media",
                  "Aplicar la CSP: primero revisar los avisos de la versión Report-Only y después cambiarla a Content-Security-Policy.", "ambos")
        if "x-frame-options" not in cab and "frame-ancestors" not in csp:
            falta("marcos", "La página se puede incrustar en otro sitio (clickjacking)", "media", "Agregar X-Frame-Options: DENY o frame-ancestors 'none'.")
        if cab.get("x-content-type-options", "").lower() != "nosniff":
            falta("nosniff", "Falta X-Content-Type-Options: nosniff", "baja", "Agregar el encabezado.")
        if "referrer-policy" not in cab:
            falta("referrer", "Falta Referrer-Policy", "baja", "Agregar Referrer-Policy: strict-origin-when-cross-origin.")
        servidor = cab.get("server", "") + cab.get("x-powered-by", "")
        if re.search(r"\d+\.\d+", servidor):
            falta("version", "El servidor revela su versión", "baja", "Ocultar la versión en Server/X-Powered-By.")
    return hall, "; ".join(notas)


SENSIBLES = ["/.git/config", "/.git/HEAD", "/.env", "/.env.local", "/backup.zip", "/.DS_Store", "/wrangler.toml", "/.github/workflows/pages.yml"]


def revisar_rutas_sensibles(pedir=http):
    hall = []
    for ruta in SENSIBLES:
        estado, cab, cuerpo = pedir("https://dominusosint.com" + ruta, seguir=False)
        tipo = cab.get("content-type", "")
        if estado == 200 and "text/html" not in tipo and len(cuerpo) > 0:
            hall.append(hallazgo(f"expuesto:{ruta}", "Archivos expuestos", "alta" if ".git" in ruta or ".env" in ruta else "media",
                                 f"{ruta} se puede descargar del sitio", f"Respondió 200 ({tipo}).", "Excluirlo de la publicación (pages.yml) y del _site.", "claude"))
    estado, cab, _ = pedir("http://dominusosint.com/", seguir=False)
    if not (300 <= estado < 400 and cab.get("location", "").startswith("https://")):
        hall.append(hallazgo("http-a-https", "Transporte", "media", "HTTP no redirige a HTTPS", f"Respondió {estado}.",
                             "En Cloudflare → SSL/TLS → Edge Certificates: activar «Always Use HTTPS».", "tu"))
    return hall, f"{len(SENSIBLES)} rutas probadas"


def revisar_admin(pedir=http):
    hall = []
    estado, cab, _ = pedir("https://admin.dominusosint.com/legal.html", seguir=False)
    if not (estado in (302, 303) and "ingreso" in cab.get("location", "")):
        hall.append(hallazgo("admin-pagina-abierta", "Protección de Admin", "critica", "Una página de Admin abre sin iniciar sesión",
                             f"admin.dominusosint.com/legal.html respondió {estado}.", "Revisar authorized() en el Worker de inmediato.", "claude"))
    for ruta in ("/admin/huella/vulnerabilidades", "/admin/huella/marketing/visitas", "/admin/huella/legal"):
        estado, _, _ = pedir("https://admin.dominusosint.com" + ruta, seguir=False)
        if estado not in (401, 403):
            hall.append(hallazgo(f"admin-api:{ruta}", "Protección de Admin", "critica", f"La API {ruta} no niega el acceso sin sesión",
                                 f"Respondió {estado}.", "Revisar el orden de las rutas en cloudflare/huella/service.js.", "claude"))
    estado, cab, _ = pedir("https://dominusosint.com/ops/legal", seguir=False)
    destino = urllib.parse.urlsplit(cab.get("location", "")).hostname or ""
    if not (300 <= estado < 400 and destino.endswith(".cloudflareaccess.com")):
        hall.append(hallazgo("ops-sin-access", "Protección de Admin", "alta", "/ops/ no está detrás de Cloudflare Access",
                             f"dominusosint.com/ops/legal respondió {estado}.",
                             "Cloudflare → Zero Trust → Access → Applications: revisar que la aplicación cubra dominusosint.com/ops/*.", "tu"))
    estado, cab, _ = pedir("https://admin.dominusosint.com/cuenta/sesion", cabeceras={"Origin": "https://atacante.example"}, seguir=False)
    if cab.get("access-control-allow-origin") in ("*", "https://atacante.example"):
        hall.append(hallazgo("cors-cuentas", "Protección de Admin", "critica", "La API de cuentas responde a cualquier origen",
                             "Access-Control-Allow-Origin permite otros sitios.", "Restringir ORIGENES_MAPA en cloudflare/planes/service.js.", "claude"))
    return hall, "Admin, /ops/ y API de cuentas probadas sin sesión"


def dias_certificado(host, puerto=443):
    ctx = ssl.create_default_context()
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    with socket.create_connection((host, puerto), timeout=15) as s, ctx.wrap_socket(s, server_hostname=host) as t:
        vence = datetime.strptime(t.getpeercert()["notAfter"], "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
    return (vence - datetime.now(timezone.utc)).days


def revisar_tls(dias=dias_certificado):
    hall = []
    for host in ("dominusosint.com", "admin.dominusosint.com"):
        d = dias(host)
        if d < 21:
            hall.append(hallazgo(f"tls:{host}", "Transporte", "alta" if d < 7 else "media", f"El certificado de {host} vence en {d} días", "",
                                 "Cloudflare lo renueva solo; si no se renueva, revisar SSL/TLS → Edge Certificates.", "tu"))
    return hall, "certificados vigentes revisados"


# ---------------------------------------------------------------- 10. GitHub
def ubicacion(a):
    """Archivo y línea de una alerta (code scanning) o paquete y manifiesto (Dependabot), para poder corregirla."""
    loc = ((a.get("most_recent_instance") or {}).get("location") or {})
    if loc.get("path"):
        return f"{loc['path']}, línea {loc.get('start_line', '?')}. Ver en GitHub → Security."
    dep = a.get("dependency") or {}
    if dep:
        return f"{(dep.get('package') or {}).get('name', '?')} en {dep.get('manifest_path', '?')}. Ver en GitHub → Security."
    return "Ver en GitHub → Security."

def revisar_github(repo, token, pedir=http):
    if not (repo and token):
        raise LookupError("sin GITHUB_TOKEN")
    cab = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    hall, notas = [], []
    for tipo, ruta, nombre in (("code", "code-scanning/alerts", "code scanning"), ("dep", "dependabot/alerts", "Dependabot"), ("sec", "secret-scanning/alerts", "secret scanning")):
        estado, _, datos = pedir(f"https://api.github.com/repos/{repo}/{ruta}?state=open&per_page=100", cabeceras=cab)
        if estado != 200:
            notas.append(f"{nombre}: sin permiso ({estado})")
            continue
        alertas = json.loads(datos)
        notas.append(f"{nombre}: {len(alertas)} abiertas")
        for a in alertas[:50]:
            regla = a.get("rule") or a.get("security_advisory") or {}
            sev = str((a.get("rule") or {}).get("security_severity_level") or (a.get("security_vulnerability") or {}).get("severity") or "high").lower()
            sev = {"critical": "critica", "high": "alta", "medium": "media", "moderate": "media", "low": "baja"}.get(sev, "alta")
            if tipo == "sec":
                sev = "critica"
            hall.append(hallazgo(f"gh-{tipo}:{a.get('number')}", "Alertas de GitHub", sev, f"Alerta de {nombre} n.º {a.get('number')}: {str(regla.get('description') or regla.get('summary') or a.get('secret_type_display_name') or '')[:120]}",
                                 ubicacion(a), "Claude la corrige en el código; si es un secreto, primero revócalo tú.", "ambos" if tipo == "sec" else "claude"))
    estado, _, datos = pedir(f"https://api.github.com/repos/{repo}/rulesets", cabeceras=cab)
    if estado == 200 and not json.loads(datos):
        hall.append(hallazgo("gh-ruleset", "Ransomware y borrado", "alta", "main no tiene regla contra borrado o reescritura",
                             "Sin ruleset, alguien con acceso podría borrar o reescribir el historial.", "GitHub → Settings → Rules → importar docs/github/ruleset-main.json.", "tu"))
    return hall, "; ".join(notas)


# ---------------------------------------------------------------- 11. controles que requieren a una persona
def controles_manuales(clientes_pago=0):
    """Recordatorios que ningún script puede comprobar desde fuera. Se quitan de config/seguridad_manual.json al confirmarlos."""
    try:
        confirmados = set(json.loads(leer("config/seguridad_manual.json") or "{}").get("confirmados", []))
    except ValueError:
        confirmados = set()
    lista = [
        ("2fa", "alta", "Confirma la verificación en dos pasos (2FA) en GitHub, Cloudflare, Google y Mercado Pago",
         "Es la principal defensa contra robo de contraseñas y fuerza bruta.", "En cada servicio: Configuración → Seguridad → Verificación en dos pasos (de preferencia con llave física o app, no SMS)."),
        ("respaldo", "alta", "Respaldo fuera de línea del repositorio y de la base D1 (protección contra ransomware)",
         "Si una cuenta se compromete, el respaldo fuera de línea permite reconstruir todo.", "Cada mes: descargar el ZIP del repositorio (GitHub → Code → Download ZIP) y exportar D1 (Cloudflare → D1 → dominusosint-planes → Export) a un disco que no quede conectado."),
        ("rate-limit", "media", "Límite de intentos en las páginas de ingreso (fuerza bruta)",
         "El ingreso usa GitHub, Google y PIN de Cloudflare (sin contraseñas propias), pero un límite frena abusos.", "Cloudflare → dominusosint.com → Security → WAF → Rate limiting rules: crear una regla para admin.dominusosint.com/admin/huella/* y /cuenta/* con 20 solicitudes por minuto por IP, acción «Block» 10 minutos."),
        ("repo-privado", "media", "Decidir si el repositorio pasa a privado",
         "Hoy el código de las páginas de Admin es público (no los datos ni las llaves). Con el repositorio privado nadie puede estudiar el código para buscar fallas.", "GitHub → Settings → General → Danger Zone → Change visibility → Private. Cloudflare Pages sigue publicando igual."),
    ]
    sev_datos = "alta" if clientes_pago else "media"
    lista.append(("datos-por-plan", sev_datos,
                  f"Datos por plan servidos desde el Worker{' — YA HAY ' + str(clientes_pago) + ' CLIENTE(S) DE PAGO' if clientes_pago else ''}",
                  "El sitio es estático: los candados ordenan lo que ve el cliente, pero no protegen los archivos de data/. Una persona con conocimientos técnicos podría abrir directamente un archivo de data/. Para que los datos de un plan sean de verdad exclusivos, hay que servirlos desde el Worker revisando el plan.",
                  "Pídele a Claude: «Servir los datos por plan desde el Worker». Hacerlo al llegar el primer cliente de pago."))
    return [hallazgo(f"manual:{k}", "Requiere tu intervención", s, t, d, a, "tu" if k != "datos-por-plan" else "ambos") for k, s, t, d, a in lista if k not in confirmados]


# ---------------------------------------------------------------- orquestación
def correr(revisiones):
    hallazgos, resumen = [], []
    for nombre, fn in revisiones:
        try:
            h, nota = fn()
            hallazgos += h
            resumen.append({"nombre": nombre, "estado": "hallazgos" if h else "ok", "nota": nota})
        except LookupError as e:
            resumen.append({"nombre": nombre, "estado": "omitida", "nota": str(e)})
        except Exception as e:  # una revisión que falla no detiene las demás
            resumen.append({"nombre": nombre, "estado": "error", "nota": type(e).__name__})
    return hallazgos, resumen


def enviar(informe, token, pedir=http):
    estado, _, datos = pedir(INGESTA, "POST", json.dumps(informe).encode(), {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}, 60)
    if estado != 200:
        raise RuntimeError(f"El Worker respondió {estado}")
    return json.loads(datos)


def main():
    archivos = archivos_repo()
    repo, gh = os.environ.get("GITHUB_REPOSITORY", ""), os.environ.get("GITHUB_TOKEN", "")
    revisiones = [
        ("Dependencias (OSV)", lambda: revisar_dependencias(archivos)),
        ("Secretos en el código", lambda: revisar_secretos(archivos)),
        ("Inyección en Python", lambda: revisar_python(archivos)),
        ("Inyección en JavaScript", lambda: revisar_js(archivos)),
        ("GitHub Actions", lambda: revisar_workflows(archivos)),
        ("Encabezados de seguridad", revisar_encabezados),
        ("Archivos expuestos y HTTPS", revisar_rutas_sensibles),
        ("Protección de Admin", revisar_admin),
        ("Certificados TLS", revisar_tls),
        ("Alertas de GitHub y ruleset", lambda: revisar_github(repo, gh)),
    ]
    hallazgos, resumen = correr(revisiones)
    token = os.environ.get("VULN_INGEST_TOKEN", "")
    informe = {"fecha": datetime.now(timezone.utc).isoformat(timespec="seconds"), "hallazgos": hallazgos + controles_manuales(), "revisiones": resumen}
    conteo = {s: sum(1 for h in informe["hallazgos"] if h["severidad"] == s) for s in ("critica", "alta", "media", "baja", "info")}
    # Solo totales en el registro público de Actions.
    print("Revisiones:", ", ".join(f"{r['nombre']}={r['estado']}" for r in resumen))
    print("Totales por severidad:", conteo)
    if not token:
        print("Sin VULN_INGEST_TOKEN: no se envía al Worker (corrida local).")
        return 0
    # El Worker sube a «alta» el control de datos por plan si ya hay clientes de pago, y devuelve cuántos hay.
    clientes = int(enviar(informe, token).get("clientes_pago") or 0)
    with open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a", encoding="utf-8") as f:
        f.write(f"clientes_pago={clientes}\n")
    print("Enviado al Worker. Clientes de pago:", clientes)
    return 0


if __name__ == "__main__":
    sys.exit(main())
