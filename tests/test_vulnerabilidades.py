"""Monitor diario de vulnerabilidades (tools/seguridad/vulnerabilidades.py): detecta lo que debe y no filtra secretos."""
import importlib.util
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("vuln", RAIZ / "tools" / "seguridad" / "vulnerabilidades.py")
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)


def test_inyeccion_python_detectada():
    codigo = "import os, subprocess, yaml, pickle\nos.system(x)\nsubprocess.run(c, shell=True)\nyaml.load(t)\npickle.loads(b)\ncur.execute(f'SELECT * FROM t WHERE a={a}')\ncur.execute('SELECT ?', (a,))\neval(z)\n"
    titulos = [h["titulo"] for h in v.revisar_python_codigo(codigo, "x.py")]
    assert any("os.system" in t for t in titulos) and any("shell=True" in t for t in titulos)
    assert any("SafeLoader" in t for t in titulos) and any("pickle" in t for t in titulos)
    assert sum("SQL" in t for t in titulos) == 1, "la consulta con parámetros no se marca"
    assert any("eval" in t for t in titulos)


def test_workflow_con_inyeccion_y_sin_fijar(tmp_path, monkeypatch):
    wf = "on: issues\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo ${{ github.event.issue.title }}\n"
    monkeypatch.setattr(v, "leer", lambda ruta: wf)
    h = v.revisar_workflows([".github/workflows/x.yml"])[0]
    ids = [x["id"] for x in h]
    assert any(i.startswith("wf-iny:") for i in ids) and any(i.startswith("wf-pin:") for i in ids)


def test_secretos_no_se_copian(monkeypatch):
    llave = "AKIA" + "ABCDEFGHIJKLMNOP"
    monkeypatch.setattr(v, "leer", lambda ruta: f"clave = '{llave}'\n")
    h = v.revisar_secretos(["config.js"])[0]
    assert h and h[0]["severidad"] == "critica"
    assert llave not in json.dumps(h), "el informe nunca incluye el secreto"


def test_proyecto_sin_inyeccion_python_ni_secretos():
    archivos = v.archivos_repo()
    assert not v.revisar_secretos(archivos)[0]
    assert not v.revisar_python(archivos)[0]
    assert not [h for h in v.revisar_workflows(archivos)[0] if h["severidad"] in ("critica", "alta")]


def test_controles_manuales_y_aviso_de_clientes():
    sin = {h["id"]: h for h in v.controles_manuales(0)}
    con = {h["id"]: h for h in v.controles_manuales(2)}
    assert sin["manual:datos-por-plan"]["severidad"] == "media"
    assert con["manual:datos-por-plan"]["severidad"] == "alta" and "2 CLIENTE" in con["manual:datos-por-plan"]["titulo"]
    assert "manual:2fa" in sin


def test_una_revision_que_falla_no_detiene_las_demas():
    def rota():
        raise ValueError("x")
    h, r = v.correr([("rota", rota), ("bien", lambda: ([], "ok")), ("sin", lambda: (_ for _ in ()).throw(LookupError("sin token")))])
    assert [x["estado"] for x in r] == ["error", "ok", "omitida"]


def test_dependencias_cdn_y_python():
    deps, sueltas = v.dependencias_python(["requirements-dev.txt"])
    assert any(n == "pytest" for _, n, _, _ in deps)
    cdn = v.dependencias_cdn(["js/exportar.js"])
    assert ("npm", "jspdf", "4.2.1", "js/exportar.js") in cdn
    assert not any(n == "xlsx" for _, n, _, _ in cdn), "SheetJS 0.18.5 ya no se usa"
