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
