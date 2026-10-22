"""Imagen que el medio publica en su feed (RSS) o en GDELT (SharingImage): solo https, sin logotipos, nunca de personas."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tools", "clima"))
from ingest import fuentes as F  # noqa: E402
import tornados as T  # noqa: E402

RSS = b"""<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<item><title>Nota con foto</title><link>https://medio.mx/nota-1</link><pubDate>Thu, 08 Oct 2026 10:00:00 +0000</pubDate>
  <media:content url="https://cdn.medio.mx/foto.jpg" medium="image"/></item>
<item><title>Nota con enclosure</title><link>https://medio.mx/nota-2</link><enclosure url="https://cdn.medio.mx/b.png" type="image/png"/></item>
<item><title>Nota con img en descripcion</title><link>https://medio.mx/nota-3</link><description>&lt;img src="https://cdn.medio.mx/c.webp"&gt; texto</description></item>
<item><title>Solo logo</title><link>https://medio.mx/nota-4</link><media:thumbnail url="https://cdn.medio.mx/logo.png"/></item>
<item><title>Sin https</title><link>https://medio.mx/nota-5</link><media:content url="http://cdn.medio.mx/d.jpg"/></item>
</channel></rss>"""


def test_imagen_de_rss():
    c = F.parsear_rss(RSS, {"nombre": "Medio", "tipo": "medio"})
    assert [x["imagen"] for x in c] == ["https://cdn.medio.mx/foto.jpg", "https://cdn.medio.mx/b.png", "https://cdn.medio.mx/c.webp", "", ""]


def test_publicaciones_de_personas_sin_imagen():
    c = F.parsear_rss(RSS, {"nombre": "Mastodon", "tipo": "red_social", "modo": "solo_enlace"})
    assert all("imagen" not in x for x in c)


def test_sharing_image_de_gdelt():
    fila = [""] * 27
    fila[18] = "https://img.medio.com/nota.jpg"
    assert T.imagen_de(fila) == "https://img.medio.com/nota.jpg"
    fila[18] = "https://img.medio.com/default-logo.png"
    assert T.imagen_de(fila) == ""
    assert T.imagen_de(["x"] * 5) == ""


def test_imagen_de_portada_og_image():
    import fuentes as F
    html = '<head><meta property="og:image" content="https://medio.mx/fotos/nota.jpg"><meta name="twitter:image" content="https://medio.mx/t.jpg"></head>'
    assert F.imagen_de_html(html) == "https://medio.mx/fotos/nota.jpg"
    assert F.imagen_de_html('<meta content="https://x.com/logo.png" property="og:image">') == ""
    assert F.imagen_de_html('<meta property="og:image" content="http://inseguro.com/a.jpg">') == ""
    assert F.og_imagen("https://medio.mx/nota", leer=lambda u: html, robots=lambda u: True) == "https://medio.mx/fotos/nota.jpg"
    assert F.og_imagen("https://medio.mx/nota", leer=lambda u: html, robots=lambda u: False) == ""


def test_buscar_imagenes_solo_recientes_y_sin_imagen():
    from datetime import datetime, timezone
    import run as R
    t = datetime(2026, 10, 21, 12, tzinfo=timezone.utc)
    evs = [{"url": "https://a/1", "fecha_utc": "2026-10-21T11:30:00Z", "severidad": 3},
           {"url": "https://a/2", "fecha_utc": "2026-10-21T05:00:00Z", "severidad": 5},
           {"url": "https://a/3", "fecha_utc": "2026-10-21T11:50:00Z", "severidad": 4, "imagen": "https://ya/x.jpg"}]
    n = R.buscar_imagenes(evs, t, og=lambda u: "https://img/" + u[-1] + ".jpg")
    assert n == 1 and evs[0]["imagen"] == "https://img/1.jpg" and "imagen" not in evs[1] and evs[2]["imagen"] == "https://ya/x.jpg"
