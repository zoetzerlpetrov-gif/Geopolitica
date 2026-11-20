#!/usr/bin/env python3
"""Envía al Worker (solo Admin) el resumen de una corrida de pruebas: roles del navegador (e2e/informe.json) y conteo de
pruebas unitarias (salidas de pytest y node --test). Se guarda en D1 y se ve en Admin → Sistema → Tablero de pruebas.
Solo resúmenes: cifras, nombres de comprobaciones y hasta 60 problemas por rol (sin datos de personas).
Uso: PRUEBAS_INGEST_TOKEN=… python3 tools/e2e/enviar_pruebas.py e2e/informe.json [pytest.txt] [node.txt]
Sin token, solo imprime el resumen (no falla)."""
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "pages"))
import datos_por_plan as DP  # noqa: E402
import urllib.request
from datetime import datetime, timezone

INGESTA = "https://admin.dominusosint.com/admin/huella/pruebas/ingesta"


def contar_pytest(texto):
    """«912 passed, 2 failed in 12.3s» → (912, 2)."""
    linea = next((l for l in reversed((texto or "").splitlines()) if re.search(r"\d+ (passed|failed)", l)), "")
    p = re.search(r"(\d+) passed", linea)
    f = re.search(r"(\d+) failed", linea)
    e = re.search(r"(\d+) errors?", linea)
    return (int(p.group(1)) if p else 0, (int(f.group(1)) if f else 0) + (int(e.group(1)) if e else 0))


def contar_node(texto):
    """Líneas «# pass 784» y «# fail 0» del reporte de node --test."""
    p = re.findall(r"^# pass (\d+)", texto or "", re.M)
    f = re.findall(r"^# fail (\d+)", texto or "", re.M)
    return (int(p[-1]) if p else 0, int(f[-1]) if f else 0)


def problemas(r):
    """Lista corta y legible de lo que falló en un rol."""
    out = []
    for e in r.get("errores", []):
        if e.get("tipo") in ("js", "arranque"):
            out.append(f"Error de JavaScript: {e.get('msg', '')}")
    for p in r.get("paginas", []):
        if p.get("http", 200) >= 400 or p.get("http") == 0 or any(str(x).startswith("js") for x in p.get("errores", [])):
            out.append(f"Página con error: {p.get('pagina')} (HTTP {p.get('http')})")
    for i in r.get("imagenes", []):
        if i.get("quedo_al_quitar") or i.get("quedo_al_quitar_rapido"):
            out.append(f"Imagen que no se quitó: {i.get('id')}")
    for x in r.get("solo_admin_visible", []):
        out.append(f"Visible sin ser admin: {x}")
    for c in r.get("comprobaciones", []):
        if not c.get("ok"):
            out.append(f"Falló «{c.get('nombre')}»: {c.get('detalle', '')}")
    for c in r.get("capas", []):
        if re.match(r"^0\b|sin datos|sin respuesta", str(c.get("resultado", ""))):
            out.append(f"Capa vacía o sin datos (aviso): {c.get('nombre', c.get('id'))}")
    return [x[:240] for x in out][:60]


def resumen_rol(r):
    pm = [p for p in r.get("paginas", []) if p.get("http", 200) >= 400 or p.get("http") == 0 or any(str(x).startswith("js") for x in p.get("errores", []))]
    js = [e for e in r.get("errores", []) if e.get("tipo") in ("js", "arranque")]
    peg = [i for i in r.get("imagenes", []) if i.get("quedo_al_quitar") or i.get("quedo_al_quitar_rapido")]
    fallidas = [c for c in r.get("comprobaciones", []) if not c.get("ok")]
    parp = 1 if (r.get("parpadeo_candados") or 0) > 4 else 0
    return {"rol": r.get("rol"), "arranque_s": r.get("arranque_s") or 0, "capas": len(r.get("capas", [])),
            "vacias": sum(1 for c in r.get("capas", []) if re.match(r"^0\b|sin datos|sin respuesta", str(c.get("resultado", "")))),
            "pegadas": len(peg), "sin_imagen": sum(1 for i in r.get("imagenes", []) if i.get("aparece") is False),
            "paginas": len(r.get("paginas", [])), "paginas_mal": len(pm), "js": len(js), "solo_admin_visible": len(r.get("solo_admin_visible", [])),
            "parpadeo": r.get("parpadeo_candados") or 0, "grave": len(pm) + len(js) + len(peg) + len(r.get("solo_admin_visible", [])) + len(fallidas) + parp,
            "comprobaciones": r.get("comprobaciones", []), "problemas": problemas(r)}


def construir(informe, pytest_txt="", node_txt="", ahora=None):
    ahora = ahora or datetime.now(timezone.utc)
    py, nd = contar_pytest(pytest_txt), contar_node(node_txt)
    serv = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    corrida = f"{serv}/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}" if os.environ.get("GITHUB_RUN_ID") and os.environ.get("GITHUB_REPOSITORY") else ""
    return {"fecha": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "commit": os.environ.get("GITHUB_SHA", "")[:40], "corrida": corrida,
            "sitio": "copia local con los datos publicados de dominusosint.com",
            "roles": [resumen_rol(r) for r in (informe or {}).get("resultados", [])],
            "unitarias": {"python": {"pasan": py[0], "fallan": py[1]}, "js": {"pasan": nd[0], "fallan": nd[1]}},
            "datos_plan": dict(list(DP.calcular(informe or {})[0].items())[:500])}


def main():
    leer = lambda p: open(p, encoding="utf-8").read() if p and os.path.exists(p) else ""  # noqa: E731
    informe = json.loads(leer(sys.argv[1]) or "{}") if len(sys.argv) > 1 else {}
    c = construir(informe, leer(sys.argv[2] if len(sys.argv) > 2 else ""), leer(sys.argv[3] if len(sys.argv) > 3 else ""))
    print(f"Roles: {[(r['rol'], r['grave']) for r in c['roles']]} · unitarias {c['unitarias']}")
    token = os.environ.get("PRUEBAS_INGEST_TOKEN", "").strip()
    if not token:
        print("Sin PRUEBAS_INGEST_TOKEN: no se envía al Worker.")
        return 0
    req = urllib.request.Request(INGESTA, data=json.dumps(c).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}", "User-Agent": "DOMINUS-pruebas"})
    with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310 (URL fija del Worker propio)
        print("Enviado al tablero de pruebas:", r.status)
    return 0


if __name__ == "__main__":
    sys.exit(main())
