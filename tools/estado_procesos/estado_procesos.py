#!/usr/bin/env python3
"""Estado diario de los procesos automáticos de DOMINUS (solo admin, estado.html).

Revisa dos cosas, con las reglas de config/procesos.json:
1. Workflows de GitHub Actions: cuándo terminó bien la última corrida, fallas seguidas, cancelaciones y duración
   (API de GitHub con el GITHUB_TOKEN del workflow; el repositorio es público, solo se lee).
2. Datos publicados en el sitio: antigüedad de cada archivo (su campo de fecha) y las fuentes que reportan error.

Estados: «ok», «atraso» (más de max_horas sin éxito o sin datos nuevos, o una falla reciente) y «falla» (más del
doble, o 3 fallas seguidas). La bitácora guarda cada incidencia 90 días, para soporte.

Uso: python3 tools/estado_procesos/estado_procesos.py <carpeta>   → ultimo.json, historial.json y bitacora.json
     Variables: GITHUB_REPOSITORY, GITHUB_TOKEN (opcional) y SITIO (URL del sitio; por omisión la de GitHub Pages).
     Termina con código 1 si algo está en «falla», para que GitHub avise por correo.
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ORDEN = {"ok": 0, "sin_datos": 1, "atraso": 2, "falla": 3}
FALLA = ("failure", "timed_out", "startup_failure")
DIAS_BITACORA = 90


def fecha(s):
    """ISO 8601 con o sin zona («…Z», «…-06:00» como el Portafolio); sin zona se toma como UTC."""
    try:
        t = datetime.fromisoformat(str(s).strip().replace("Z", "+00:00"))
    except (TypeError, ValueError):
        try:
            t = datetime.strptime(str(s)[:19], "%Y-%m-%dT%H:%M:%S")
        except (TypeError, ValueError):
            return None
    return (t if t.tzinfo else t.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)


def valor(datos, ruta):
    """datos["a"]["b"] para la ruta «a.b»; None si falta algún tramo."""
    for k in str(ruta or "").split("."):
        if not isinstance(datos, dict):
            return None
        datos = datos.get(k)
    return datos


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ") if t else None


def horas(ahora, t):
    return round((ahora - t).total_seconds() / 3600, 1) if t else None


def calificar(h, max_horas, fallas_seguidas=0):
    """Estado por antigüedad (horas sin éxito o sin datos nuevos) y fallas seguidas."""
    if h is None or h > 2 * max_horas or fallas_seguidas >= 3:
        return "falla"
    if h > max_horas or fallas_seguidas >= 1:
        return "atraso"
    return "ok"


def evaluar_workflow(proc, corridas, ahora):
    """corridas: lista de la API (más recientes primero) con status, conclusion, created_at, updated_at, html_url."""
    terminadas = [c for c in corridas if c.get("status") == "completed"]
    exitos = [c for c in terminadas if c.get("conclusion") == "success"]
    ultima_ok = fecha(exitos[0]["updated_at"]) if exitos else None
    seguidas = 0
    for c in terminadas:
        if c.get("conclusion") == "cancelled" or c.get("conclusion") == "skipped":
            continue
        if c.get("conclusion") in FALLA:
            seguidas += 1
        else:
            break
    dia = [c for c in corridas if (fecha(c.get("created_at")) or ahora) >= ahora - timedelta(hours=24)]
    cuenta = {"exito": 0, "falla": 0, "cancelada": 0, "en_curso": 0}
    for c in dia:
        k = ("en_curso" if c.get("status") != "completed" else "exito" if c.get("conclusion") == "success"
             else "falla" if c.get("conclusion") in FALLA else "cancelada" if c.get("conclusion") == "cancelled" else None)
        if k:
            cuenta[k] += 1
    duraciones = [(fecha(c["updated_at"]) - fecha(c.get("run_started_at") or c["created_at"])).total_seconds() / 60
                  for c in exitos[:10] if fecha(c.get("updated_at")) and fecha(c.get("run_started_at") or c.get("created_at"))]
    h = horas(ahora, ultima_ok)
    estado = calificar(h, proc["max_horas"], seguidas)
    if not corridas:
        estado = "falla"
    partes = []
    if ultima_ok is None:
        partes.append("Ninguna corrida reciente terminó bien.")
    elif h > proc["max_horas"]:
        partes.append(f"Lleva {h} h sin terminar bien (límite {proc['max_horas']} h).")
    if seguidas:
        partes.append(f"{seguidas} falla(s) seguida(s).")
    if cuenta["cancelada"] and cuenta["cancelada"] >= max(3, cuenta["exito"]):
        partes.append(f"{cuenta['cancelada']} corridas canceladas en 24 h: revisar la concurrencia del workflow.")
        estado = max(estado, "atraso", key=ORDEN.get)
    ultima = corridas[0] if corridas else {}
    return {"id": proc["id"], "nombre": proc["nombre"], "workflow": proc["workflow"], "cada": proc.get("cada"),
            "afecta": proc.get("afecta"), "max_horas": proc["max_horas"], "estado": estado,
            "ultimo_exito_utc": iso(ultima_ok), "horas_sin_exito": h, "fallas_seguidas": seguidas, "corridas_24h": cuenta,
            "duracion_media_min": round(sum(duraciones) / len(duraciones), 1) if duraciones else None,
            "ultima_corrida": {"estado": ultima.get("conclusion") or ultima.get("status"), "inicio_utc": ultima.get("created_at"),
                               "url": ultima.get("html_url")} if ultima else None,
            "detalle": " ".join(partes) or "Al día."}


def pasos_de(jobs):
    """Pasos fallidos y los 5 más lentos de los jobs de una corrida (API list jobs)."""
    fallidos, todos = [], []
    for j in jobs:
        for s in j.get("steps") or []:
            a, b = fecha(s.get("started_at")), fecha(s.get("completed_at"))
            if s.get("conclusion") in FALLA:
                fallidos.append(f"{j.get('name')} → {s.get('name')}")
            if a and b and not str(s.get("name", "")).startswith(("Post ", "Set up", "Complete")):
                todos.append({"paso": str(s.get("name"))[:90], "min": round((b - a).total_seconds() / 60, 1)})
    return fallidos, sorted(todos, key=lambda x: -x["min"])[:5]


def errores_de(datos, tipo):
    """Fuentes con error dentro de un archivo publicado, según su forma: «pasos» y «fuentes» (dict o lista) o «errores»."""
    if not tipo or not isinstance(datos, dict):
        return []
    v = valor(datos, tipo)
    salida = []
    if isinstance(v, dict):
        for k, x in v.items():
            if isinstance(x, dict) and x.get("estado") not in (None, "ok"):
                salida.append(f"{k}: {str(x.get('error') or x.get('estado'))[:160]}")
            elif isinstance(x, str) and x.lower().startswith("error"):
                salida.append(f"{k}: {x[:160]}")
    elif isinstance(v, list):
        for x in v:
            if isinstance(x, dict) and x.get("estado") not in (None, "ok"):
                salida.append(f"{x.get('nombre') or x.get('id')}: {str(x.get('error') or x.get('estado'))[:160]}")
            elif isinstance(x, str):
                salida.append(x[:160])
    return salida[:25]


def evaluar_dato(regla, datos, ahora):
    if datos is None:
        return {"id": regla["id"], "nombre": regla["nombre"], "archivo": regla["archivo"], "estado": "falla",
                "generado_utc": None, "horas": None, "max_horas": regla["max_horas"], "errores": [], "detalle": "No se pudo leer el archivo publicado."}
    t = fecha(datos.get(regla["campo"])) if isinstance(datos, dict) else None
    h = horas(ahora, t)
    errs = errores_de(datos, regla.get("errores"))
    estado = calificar(h, regla["max_horas"])
    detalle = "Sin fecha en el archivo." if t is None else f"Generado hace {h} h (límite {regla['max_horas']} h)." if h > regla["max_horas"] else "Al día."
    if errs:
        detalle += f" {len(errs)} fuente(s) con error (se conservan sus datos anteriores)."
    m = regla.get("minimo")
    if m:  # p. ej. el Portafolio: al día pero sin una sola noticia también es un problema
        n = valor(datos, m["campo"]) or 0
        if not isinstance(n, (int, float)) or n < m["valor"]:
            detalle += f" {m.get('texto', m['campo'])}: {n} (mínimo {m['valor']})."
            if ORDEN[estado] < ORDEN["atraso"]:
                estado = "atraso"
    return {"id": regla["id"], "nombre": regla["nombre"], "archivo": regla["archivo"], "estado": estado, "generado_utc": iso(t),
            "horas": h, "max_horas": regla["max_horas"], "errores": errs, "detalle": detalle}


def global_de(items):
    return max((i["estado"] for i in items), key=ORDEN.get, default="sin_datos")


def actualizar_bitacora(previa, res, ahora):
    """Agrega una entrada por cada proceso o archivo que no está «ok» (y por cada fuente con error); 90 días."""
    corte = iso(ahora - timedelta(days=DIAS_BITACORA))
    bit = [e for e in (previa or []) if e.get("fecha_utc", "") >= corte]
    vistos = {(e["fecha_utc"][:10], e["id"], e["detalle"]) for e in bit}
    nuevas = []
    for w in res["workflows"]:
        if w["estado"] != "ok":
            nuevas.append({"tipo": "proceso", "id": w["id"], "nombre": w["nombre"], "estado": w["estado"], "detalle": w["detalle"]
                           + (f" Pasos fallidos: {'; '.join(w['pasos_fallidos'])}." if w.get("pasos_fallidos") else ""),
                           "url": (w.get("ultima_corrida") or {}).get("url")})
    for d in res["datos"]:
        if d["estado"] != "ok":
            nuevas.append({"tipo": "datos", "id": d["id"], "nombre": d["nombre"], "estado": d["estado"], "detalle": d["detalle"], "url": None})
        for e in d["errores"]:
            nuevas.append({"tipo": "fuente", "id": d["id"], "nombre": d["nombre"], "estado": "aviso", "detalle": e, "url": None})
    for n in nuevas:
        n["fecha_utc"] = res["fecha_utc"]
        if (n["fecha_utc"][:10], n["id"], n["detalle"]) not in vistos:
            bit.append(n)
            vistos.add((n["fecha_utc"][:10], n["id"], n["detalle"]))
    return sorted(bit, key=lambda e: e["fecha_utc"], reverse=True)


# ------------------------------------------------------------------ red
def _get(url, token=None):
    h = {"User-Agent": "dominus-estado-procesos", "Accept": "application/vnd.github+json"}
    if token and url.startswith("https://api.github.com/"):
        h["Authorization"] = f"Bearer {token}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def revisar(cfg, repo, sitio, token=None, ahora=None, get=_get):
    ahora = ahora or datetime.now(timezone.utc)
    api = f"https://api.github.com/repos/{repo}/actions"
    workflows = []
    for p in cfg["workflows"]:
        try:
            corridas = get(f"{api}/workflows/{p['workflow']}/runs?branch=main&per_page=60", token).get("workflow_runs", [])
            w = evaluar_workflow(p, corridas, ahora)
            ultima_term = next((c for c in corridas if c.get("status") == "completed" and c.get("conclusion") != "cancelled"), None)
            if ultima_term:
                w["pasos_fallidos"], w["pasos_lentos"] = pasos_de(get(f"{api}/runs/{ultima_term['id']}/jobs?per_page=30", token).get("jobs", []))
        except Exception as e:  # noqa: BLE001
            w = {"id": p["id"], "nombre": p["nombre"], "workflow": p["workflow"], "cada": p.get("cada"), "afecta": p.get("afecta"),
                 "max_horas": p["max_horas"], "estado": "sin_datos", "detalle": f"No se pudo consultar GitHub: {type(e).__name__}"}
        workflows.append(w)
    datos = []
    for regla in cfg["datos"]:
        try:
            base = regla["archivo"] if regla["archivo"].startswith("http") else sitio.rstrip("/") + "/" + regla["archivo"]
            contenido = get(base + f"?r={int(ahora.timestamp())}")
        except Exception:  # noqa: BLE001
            contenido = None
        datos.append(evaluar_dato(regla, contenido, ahora))
    return {"fecha_utc": iso(ahora), "repositorio": repo, "sitio": sitio,
            "estado_global": global_de(workflows + datos), "workflows": workflows, "datos": datos}


def main(args):
    salida = args[0] if args else None
    repo = os.environ.get("GITHUB_REPOSITORY", "zoetzerlpetrov-gif/Geopolitica")
    dueno, nombre = repo.split("/", 1)
    sitio = os.environ.get("SITIO") or f"https://{dueno.lower()}.github.io/{nombre}/"
    cfg = json.load(open(os.path.join(ROOT, "config", "procesos.json"), encoding="utf-8"))
    res = revisar(cfg, repo, sitio, os.environ.get("GITHUB_TOKEN"))
    for x in res["workflows"] + res["datos"]:
        print(f"[{x['estado']:>9}] {x['nombre']}: {x['detalle']}")
    print("Estado global:", res["estado_global"])
    if salida:
        os.makedirs(salida, exist_ok=True)
        leer = lambda n, d: json.load(open(os.path.join(salida, n), encoding="utf-8")) if os.path.exists(os.path.join(salida, n)) else d  # noqa: E731
        hist = [h for h in leer("historial.json", []) if h["fecha_utc"][:10] != res["fecha_utc"][:10]]
        todos = res["workflows"] + res["datos"]
        hist.append({"fecha_utc": res["fecha_utc"], "global": res["estado_global"],
                     **{k: sum(1 for x in todos if x["estado"] == k) for k in ORDEN}})
        bit = actualizar_bitacora(leer("bitacora.json", []), res, fecha(res["fecha_utc"]))
        for n, v in (("ultimo.json", res), ("historial.json", hist[-DIAS_BITACORA:]), ("bitacora.json", bit)):
            json.dump(v, open(os.path.join(salida, n), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 1 if res["estado_global"] == "falla" else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
