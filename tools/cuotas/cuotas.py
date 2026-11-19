"""Estado de las cuotas de APIs, llaves y tokens (Admin → Cuotas de APIs).

Uso: python3 tools/cuotas/cuotas.py SALIDA.json

- Lee config/apis_cuotas.json (límite de cada servicio y llamadas por corrida de cada flujo).
- Cuenta cuántas veces corre cada workflow al día a partir de su cron (.github/workflows/*.yml).
- Consumo estimado = corridas por día × llamadas por corrida; porcentaje = consumo / límite (llevado al mismo periodo).
- Mediciones reales cuando hay forma de pedirlas sin exponer llaves: límite de la API de GitHub (GITHUB_TOKEN) y
  peticiones a Workers de Cloudflare de las últimas 24 h (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID, si el token
  tiene permiso de análisis). Solo se escriben totales; nunca se imprime ni se guarda un token.
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
DIAS_POR = {"día": 1, "hora": 1 / 24, "10 minutos": 1 / 144, "mes": 30}


def _valores(campo, minimo, maximo):
    """Cuántos valores toma un campo de cron («*», «*/20», «1,15», «8-17», «8-17/2»)."""
    total = set()
    for parte in campo.split(","):
        paso = 1
        if "/" in parte:
            parte, p = parte.split("/")
            paso = int(p)
        if parte == "*":
            ini, fin = minimo, maximo
        elif "-" in parte:
            ini, fin = (int(x) for x in parte.split("-"))
        else:
            ini = fin = int(parte)
        total.update(range(ini, fin + 1, paso))
    return len(total)


def corridas_por_dia(cron):
    """Corridas al día de una expresión cron de 5 campos (día del mes o de la semana fijos cuentan como fracción)."""
    m, h, dom, mes, dow = cron.split()[:5]
    por_dia = _valores(m, 0, 59) * _valores(h, 0, 23)
    if dom != "*":
        por_dia *= _valores(dom, 1, 31) / 30
    if dow != "*":
        por_dia *= _valores(dow, 0, 6) / 7
    if mes != "*":
        por_dia *= _valores(mes, 1, 12) / 12
    return por_dia


def crons(ruta):
    try:
        texto = open(ruta, encoding="utf-8").read()
    except OSError:
        return None
    return re.findall(r"cron:\s*['\"]([^'\"]+)['\"]", texto)


def estimar(servicio, dir_workflows):
    """Consumo estimado del servicio por periodo de su límite, con el detalle por flujo."""
    detalle, por_dia = [], 0.0
    for f in servicio.get("flujos", []):
        cs = crons(os.path.join(dir_workflows, f["workflow"]))
        if cs is None:
            detalle.append({"workflow": f["workflow"], "corridas_dia": None, "llamadas_dia": None, "nota": "workflow no encontrado"})
            continue
        corr = sum(corridas_por_dia(c) for c in cs)
        llam = corr * f.get("llamadas_por_corrida", 1)
        por_dia += llam
        detalle.append({"workflow": f["workflow"], "corridas_dia": round(corr, 2), "llamadas_dia": round(llam, 1), "nota": f.get("nota", "")})
    periodo = DIAS_POR.get(servicio.get("periodo"), 1)
    return round(por_dia * periodo, 1), detalle


def semaforo(pct, umbrales, usado=0, limite=1):
    if usado is None:
        return "sin_medicion"
    if pct is None:
        return "sin_limite"
    return "rojo" if pct >= umbrales["rojo"] else "amarillo" if pct >= umbrales["amarillo"] else "verde"


def _pedir(url, cabeceras, datos=None):
    req = urllib.request.Request(url, data=datos, headers=cabeceras)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def medir_github():
    tok = os.environ.get("GITHUB_TOKEN")
    if not tok:
        return None
    try:
        d = _pedir("https://api.github.com/rate_limit", {"Authorization": f"Bearer {tok}", "User-Agent": "dominus-cuotas"})
        c = d["resources"]["core"]
        return {"usado": c["used"], "limite": c["limit"], "restante": c["remaining"], "periodo": "hora"}
    except Exception as e:  # noqa: BLE001
        return {"error": type(e).__name__}


def medir_cloudflare_workers():
    tok, cuenta = os.environ.get("CLOUDFLARE_API_TOKEN"), os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    if not tok or not cuenta:
        return None
    hasta = datetime.now(timezone.utc).replace(microsecond=0)
    desde = hasta - timedelta(days=1)
    q = {"query": "query($c:String!,$d:Time!,$h:Time!){viewer{accounts(filter:{accountTag:$c}){workersInvocationsAdaptive(limit:1000,filter:{datetime_geq:$d,datetime_leq:$h}){sum{requests}}}}}",
         "variables": {"c": cuenta, "d": desde.isoformat().replace("+00:00", "Z"), "h": hasta.isoformat().replace("+00:00", "Z")}}
    try:
        d = _pedir("https://api.cloudflare.com/client/v4/graphql", {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
                   json.dumps(q).encode())
        if d.get("errors"):
            return {"error": "el token no tiene permiso de análisis de la cuenta"}
        filas = d["data"]["viewer"]["accounts"][0]["workersInvocationsAdaptive"]
        return {"usado": sum(f["sum"]["requests"] for f in filas), "periodo": "día"}
    except Exception as e:  # noqa: BLE001
        return {"error": type(e).__name__}


MEDIDORES = {"github_rate_limit": medir_github, "cloudflare_workers": medir_cloudflare_workers}


def calcular(cfg, dir_workflows, medir=True):
    out = []
    for s in cfg["servicios"]:
        estimado, detalle = estimar(s, dir_workflows)
        real = MEDIDORES[s["medicion_real"]]() if medir and s.get("medicion_real") in MEDIDORES else None
        if isinstance(real, dict) and "usado" in real:
            usado = real["usado"]
        elif s.get("flujos"):
            usado = estimado
        else:
            usado = None  # sin flujos que lo consuman ni medición real: depende de las visitas al sitio
        limite = s.get("limite")
        pct = round(usado / limite, 4) if limite and usado is not None else None
        out.append({"id": s["id"], "nombre": s["nombre"], "secreto": s["secreto"], "limite": limite, "unidad": s["unidad"],
                    "periodo": s["periodo"], "verificado": s.get("verificado", False), "estimado": estimado, "real": real,
                    "usado": usado, "pct": pct, "semaforo": semaforo(pct, cfg["umbrales"], usado, limite), "detalle": detalle,
                    "panel": s.get("panel"), "si_excede": s.get("si_excede"), "uso_por_visitas": s.get("uso_por_visitas", False)})
    return {"generado_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat(), "servicios": out,
            "limites_por_usuario": cfg.get("limites_por_usuario", {})}


if __name__ == "__main__":
    cfg = json.load(open(os.path.join(RAIZ, "config", "apis_cuotas.json"), encoding="utf-8"))
    res = calcular(cfg, os.path.join(RAIZ, ".github", "workflows"))
    with open(sys.argv[1] if len(sys.argv) > 1 else "cuotas.json", "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=1)
    rojos = sum(s["semaforo"] == "rojo" for s in res["servicios"])
    print(f"{len(res['servicios'])} servicios revisados; {rojos} en rojo.")
