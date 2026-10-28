"""Cuadros de Meteosat (tools/vivos/meteosat.py) sin red."""
import io
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "vivos"))
import meteosat as M  # noqa: E402


def test_momentos_cada_30_min_y_publicados():
    ahora = 1_792_000_000  # 2026-10-14T…
    ts = M.momentos(ahora)
    assert len(ts) == M.CUADROS and ts == sorted(ts)
    assert all(t % (M.PASO_MIN * 60) == 0 for t in ts)
    assert ahora - ts[-1] >= M.RETRASO_MIN * 60 and ahora - ts[-1] < (M.RETRASO_MIN + M.PASO_MIN) * 60


def test_caja_en_web_mercator_y_url():
    x0, y0, x1, y1, w, h = M.caja()
    assert round(x0) == -8905559 and x1 > 0 and abs(y0 + y1) < 1 and w == M.ANCHO and 1900 < h < 2200
    u = M.url_cuadro(M.PRODUCTOS["ir"], 1_792_000_800)
    assert "layers=msg_fes%3Air108%2Cmsg_iodc%3Air108" in u and "crs=EPSG%3A3857" in u and "time=2026-" in u


def test_webp_descarta_imagen_vacia():
    from PIL import Image
    vacia, llena = io.BytesIO(), io.BytesIO()
    Image.new("RGBA", (8, 8), (0, 0, 0, 0)).save(vacia, "PNG")
    Image.new("RGBA", (8, 8), (200, 200, 200, 255)).save(llena, "PNG")
    assert M.a_webp(vacia.getvalue()) is None
    assert M.a_webp(llena.getvalue())[:4] == b"RIFF"
