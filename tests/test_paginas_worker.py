"""Las páginas de administración que sirve el Worker están al día con config/paginas_admin.json."""
import importlib.util
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


def test_modulo_del_worker_al_dia():
    spec = importlib.util.spec_from_file_location("pw", RAIZ / "tools" / "pages" / "paginas_worker.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    actual = (RAIZ / "cloudflare" / "huella" / "paginas-admin.js").read_text(encoding="utf-8")
    assert actual == m.generar(), "Corre: python tools/pages/paginas_worker.py"
