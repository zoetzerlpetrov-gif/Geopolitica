"""Historial de 90 días de señales de crimen (conteo por celda y día), sin red."""
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "crimen"))
import historial as H  # noqa: E402


def _f(lon, lat, fecha, tipo="Narcotráfico", url=None):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {"title": f"nota {fecha}", "url": url or f"https://x/{lon}/{fecha}", "source": "Medio", "date": fecha, "tipo": tipo,
                           "lugar": "Culiacán", "pais_iso3": "MEX"}}


def _total(h):
    return sum(n for f in h["features"] for _, _, n in f["properties"]["d"])


def test_conteo_por_celda_y_sin_duplicar_dias_cerrados():
    ahora = datetime(2026, 10, 14, 23, tzinfo=timezone.utc)
    feats = [_f(-107.39, 24.80, "2026-10-14T10:00:00Z"), _f(-107.41, 24.81, "2026-10-13T10:00:00Z", "Crimen organizado"),
             _f(-107.40, 24.79, "2026-10-12T10:00:00Z"), _f(-99.1, 19.4, "2026-10-14T01:00:00Z", "Terrorismo"), _f(0, 0, "2026-10-14T01:00:00Z", "Otro")]
    h = H.actualizar({}, feats, ahora)
    assert len(h["features"]) == 2 and _total(h) == 4  # el tipo desconocido no cuenta
    culiacan = next(f for f in h["features"] if f["properties"]["c"] == "25.0,-107.5")
    assert len(culiacan["properties"]["notas"]) == 3 and set(culiacan["properties"]["notas"][0]) >= {"Medio"}
    # Dos días después, las 72 h ya no traen el día 12: queda fijo con lo contado; los días abiertos se recalculan.
    h2 = H.actualizar(h, feats[:2] + feats[3:], ahora + timedelta(days=2))
    assert _total(h2) == 4
    # Después de 90 días todo sale del historial.
    assert _total(H.actualizar(h2, [], ahora + timedelta(days=95))) == 0


def test_solo_titulares_y_enlaces_sin_texto():
    h = H.actualizar({}, [_f(10, 10, "2026-10-14T01:00:00Z")], datetime(2026, 10, 14, 5, tzinfo=timezone.utc))
    nota = h["features"][0]["properties"]["notas"][0]
    assert len(nota) == 5 and nota[1].startswith("https://")
