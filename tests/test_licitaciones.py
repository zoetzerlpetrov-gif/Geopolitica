"""Recolector de licitaciones (tools/licitaciones.py): textos multilingües de TED, fechas y frescura del archivo."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import licitaciones as L  # noqa: E402


def test_texto_idioma_prefiere_espanol():
    assert L.texto_idioma({"deu": ["Bau"], "spa": ["Obra"]}) == "Obra"
    assert L.texto_idioma({"fin": ["Rakennus"]}) == "Rakennus"
    assert L.texto_idioma(["x", "y"]) == "x"
    assert L.texto_idioma(None) == ""


def test_aviso_ted():
    a = L.aviso_ted({"publication-number": "674235-2026", "notice-title": {"spa": ["Mantenimiento de vía"]},
                     "buyer-name": {"spa": ["Adif"]}, "buyer-country": ["ESP"], "publication-date": "2026-10-01+02:00",
                     "deadline-receipt-tender-date-lot": ["2026-12-15+01:00"], "classification-cpv": ["45234100"]})
    assert a["titulo"] == "Mantenimiento de vía" and a["pais"] == "ESP"
    assert a["publicado"] == "2026-10-01" and a["cierre"] == "2026-12-15"
    assert a["url"].endswith("/674235-2026") and a["cpv"] == ["45234100"]


def test_reciente(tmp_path):
    ruta = tmp_path / "l.json"
    assert not L.reciente(str(ruta))
    ruta.write_text(json.dumps({"generado_utc": "2000-01-01T00:00:00Z"}))
    assert not L.reciente(str(ruta))
    import datetime as dt
    ruta.write_text(json.dumps({"generado_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}))
    assert L.reciente(str(ruta))
