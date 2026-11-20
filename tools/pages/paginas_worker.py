"""Genera cloudflare/huella/paginas-admin.js: las páginas de administración (config/paginas_admin.json) empaquetadas
dentro del Worker como texto. Así admin.dominusosint.com las sirve sin pedirlas a /ops/ (detrás de Cloudflare Access),
sin depender del token de servicio. Uso: python tools/pages/paginas_worker.py  (la prueba avisa si quedó desfasado)."""
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SALIDA = RAIZ / "cloudflare" / "huella" / "paginas-admin.js"


def generar() -> str:
    paginas = json.loads((RAIZ / "config" / "paginas_admin.json").read_text(encoding="utf-8"))["paginas"]
    lineas = ["// Generado por tools/pages/paginas_worker.py a partir de config/paginas_admin.json. No editar a mano."]
    for i, p in enumerate(paginas):
        assert (RAIZ / f"{p}.html").exists(), p
        lineas.append(f'import p{i} from "../../{p}.html";')
    lineas.append("export default {")
    lineas += [f'  "{p}": p{i},' for i, p in enumerate(paginas)]
    lineas.append("};")
    return "\n".join(lineas) + "\n"


if __name__ == "__main__":
    SALIDA.write_text(generar(), encoding="utf-8")
    print("escrito", SALIDA.relative_to(RAIZ))
