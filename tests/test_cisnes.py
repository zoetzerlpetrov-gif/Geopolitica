"""Cisnes blancos y negros: probabilidad base con fuente, señales de noticias y llamados oficiales (sin red)."""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "cisnes"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "corporativo"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "corporativo"))
import cisnes as C  # noqa: E402

AHORA = datetime(2026, 11, 14, 4, tzinfo=timezone.utc)
CFG = json.load(open(os.path.join(os.path.dirname(__file__), "..", "config", "cisnes.json"), encoding="utf-8"))


def test_cada_evento_tiene_fuente_y_no_inventa_probabilidad():
    for e in CFG["eventos"]:
        assert e["fuentes"] and all(u.startswith("https://") or u.startswith("http://") for _, u in e["fuentes"]), e["id"]
        assert e["tipo"] in ("blanco", "negro") and e["base_texto"]
        if e.get("base_anual") is None and e.get("frecuencia_anual") is None:
            assert "No hay tasa" in e["base_texto"] or "sin tasa" in e["base_texto"].lower() or "no hay tasa" in e["base_texto"].lower(), e["id"]
    assert C.probabilidad({"frecuencia_anual": 3.2}) > 0.95
    assert C.probabilidad({"base_anual": None}) is None


def test_senales_noticias_y_llamados_oficiales():
    notas = [{"t": "Tormenta geomagnética severa: NOAA emite alerta G4", "f": "2026-11-13T10:00:00Z", "u": "https://x/1", "m": "A"}] * 6
    prot = {"features": [
        {"properties": {"tipo": "registro", "nivel": 3, "titulo": "Llamado a reservas por clima espacial", "ambitos": "clima espacial", "fecha": "2026-11-01"}},
        {"properties": {"tipo": "viaje", "nivel": 4, "titulo": "Aviso de viaje: X", "ambitos": "clima espacial", "fecha": "2026-11-01"}},
        {"properties": {"tipo": "registro", "nivel": 3, "titulo": "Campaña permanente", "ambitos": "clima espacial", "fecha": "2024-01-01"}}]}
    hist = {"dias": {f"2026-11-{d:02d}": {"tormenta_solar": 1} for d in range(1, 14)}}
    ev, nuevo = C.calcular({"eventos": [e for e in CFG["eventos"] if e["id"] == "tormenta_solar"]}, {"notas": notas}, prot, hist, AHORA)
    e = ev[0]
    assert e["menciones_72h"] == 6 and e["promedio_72h"] == 1.0 and e["nivel"] == "alto"   # 7/2 = ×3.5 y ≥ 5 titulares
    assert e["n_alertas"] == 2 and e["n_alertas_recientes"] == 1                          # sin avisos de viaje; la de 2024 no cuenta
    assert e["prob_ajustada_12m"] == min(0.95, 0.0127 * 2.5)
    assert nuevo["dias"]["2026-11-14"]["tormenta_solar"] == 6


def test_sin_historial_solo_cuentan_los_llamados():
    assert C.nivel(50, 0, 0, 3)[0] == "normal"
    assert C.nivel(0, 0, 1, 3)[0] == "elevado"
    assert C.nivel(0, 0, 3, 3)[0] == "alto"
    assert C.nivel(0, 10, 0, 20)[0] == "bajo"
