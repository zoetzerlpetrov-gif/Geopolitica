"""Reglas editoriales del noticiero en video (correcciones de noviembre de 2026)."""
import importlib.util
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "tools" / "red"))
sys.path.insert(0, str(RAIZ / "tools" / "noticiero_video"))
_spec = importlib.util.spec_from_file_location("guion_reglas", RAIZ / "tools" / "noticiero_video" / "guion.py")
g = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(g)
CFG = json.loads((RAIZ / "config" / "noticiero.json").read_text(encoding="utf-8"))
PAL = {s["id"]: s["palabras"] for s in CFG["secciones"]}


def test_nota_de_politicos_no_es_familiar_y_va_a_politica():
    t = "Familia morenista celebra boda en hotel de lujo"
    assert not g.noticia_familiar_positiva(t)
    assert not re.search(PAL["familia"], t.lower(), re.I)
    assert re.search(PAL["politica_mx"], t.lower(), re.I)
    assert g.noticia_familiar_positiva("Familia celebra 50 años de matrimonio con boda sorpresa")


def test_no_se_dicen_noticias_positivas_ni_el_punto_medio():
    assert "positiv" not in json.dumps(CFG["secciones"], ensure_ascii=False).split('"familia"')[1].split('"nota"')[0]
    assert "·" not in g.para_voz("Familia y parejas · Avisos")
    fuente = (RAIZ / "tools" / "noticiero_video" / "guion.py").read_text(encoding="utf-8")
    assert "noticias positivas" not in fuente


def test_estafa_sin_detalle_no_agrega_orientacion_generica():
    fuente = (RAIZ / "tools" / "noticiero_video" / "guion.py").read_text(encoding="utf-8")
    assert 'perfil.get("modalidad") != "sin_detalle"' in fuente
