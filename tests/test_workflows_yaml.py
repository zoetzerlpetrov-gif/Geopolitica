"""Los workflows deben ser YAML válido: un «: » dentro de un valor sin comillas (p. ej. en el nombre de un paso)
invalida TODO el archivo y GitHub deja de ejecutarlo sin avisar (17-nov-2026: «Datos en movimiento» se detuvo una hora).
Revisión sin dependencias: valores simples de una línea, saltando los bloques «|» y «>»."""
import glob
import os
import re

RAIZ = os.path.join(os.path.dirname(__file__), "..")
CLAVE = re.compile(r"^(\s*)(?:-\s+)?([A-Za-z0-9_.-]+):(?:\s+(.*))?$")


def problemas(texto):
    out, bloque = [], None
    for n, linea in enumerate(texto.splitlines(), 1):
        if not linea.strip() or linea.lstrip().startswith("#"):
            continue
        sangria = len(linea) - len(linea.lstrip())
        if bloque is not None:
            if sangria > bloque:
                continue
            bloque = None
        m = CLAVE.match(linea)
        if not m:
            continue
        valor = re.sub(r"\s+#.*$", "", (m.group(3) or "").strip())
        if valor[:1] in ("|", ">"):
            bloque = len(m.group(1))
            continue
        if not valor or valor[0] in "\"'[{&*!":
            continue
        if ": " in valor or valor.endswith(":"):
            out.append(f"línea {n}: «{valor[:60]}» lleva «: » sin comillas")
    return out


def test_valor_con_dos_puntos_sin_comillas_se_detecta():
    assert problemas("steps:\n  - name: Paso (fuente: X)\n    run: echo hola\n")
    assert not problemas("steps:\n  - name: \"Paso (fuente: X)\"\n    run: |\n      echo \"a: b\"\n")


def test_workflows_sin_errores_de_yaml():
    for f in sorted(glob.glob(os.path.join(RAIZ, ".github", "workflows", "*.yml"))):
        assert problemas(open(f, encoding="utf-8").read()) == [], os.path.basename(f)
