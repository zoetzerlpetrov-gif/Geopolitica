"""Mueve las páginas de solo administración del sitio armado (_site) a /ops/ para protegerlas con Cloudflare Access.

Uso: python3 tools/pages/mover_admin.py _site

- Cada página pasa de _site/X.html a _site/ops/X.html con <base href="../">: sus rutas relativas (css/, js/, data/,
  config/, otras páginas) siguen apuntando a la raíz, tanto en dominusosint.com/ops/X como en el Worker de Admin.
- Un script mínimo mantiene en la misma página los enlaces «#seccion» y history.pushState/replaceState con «#…» o «?…»
  (con <base> irían a la raíz).
- Agrega a _site/_redirects las rutas viejas (/X.html y /X → /ops/X) para enlaces guardados y entre páginas.
- Agrega a _site/_headers «noindex» y «no-store» para /ops/*.
"""
import json
import os
import sys

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
BASE = ('<base href="../">'
        '<script>document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest(\'a[href^="#"]\');'
        'if(!a)return;e.preventDefault();var h=a.getAttribute("href");if(h.length>1)location.hash=h.slice(1);},true);'
        '["pushState","replaceState"].forEach(function(m){var f=history[m];history[m]=function(s,t,u){'
        'if(typeof u==="string"&&(u.charAt(0)==="#"||u.charAt(0)==="?"))u=location.pathname+(u.charAt(0)==="#"?location.search:"")+u;'
        'return f.call(history,s,t,u);};});</script>')


def config():
    with open(os.path.join(RAIZ, "config", "paginas_admin.json"), encoding="utf-8") as f:
        return json.load(f)


def con_base(html):
    """Inserta <base> justo después de <head> (antes de cualquier ruta relativa)."""
    i = html.lower().find("<head")
    if i < 0:
        raise ValueError("sin <head>")
    j = html.index(">", i) + 1
    return html[:j] + BASE + html[j:]


def mover(sitio):
    c = config()
    ruta, paginas = c["ruta"], c["paginas"]
    os.makedirs(os.path.join(sitio, ruta), exist_ok=True)
    movidas = []
    for p in paginas:
        origen = os.path.join(sitio, p + ".html")
        if not os.path.exists(origen):
            continue
        with open(origen, encoding="utf-8") as f:
            html = f.read()
        with open(os.path.join(sitio, ruta, p + ".html"), "w", encoding="utf-8") as f:
            f.write(con_base(html))
        os.remove(origen)
        movidas.append(p)
    reglas = "".join(f"/{p}.html  /{ruta}/{p}  301\n/{p}  /{ruta}/{p}  301\n" for p in movidas)
    with open(os.path.join(sitio, "_redirects"), "a", encoding="utf-8") as f:
        f.write(f"\n# Páginas de administración en /{ruta}/ (tools/pages/mover_admin.py)\n" + reglas)
    with open(os.path.join(sitio, "_headers"), "a", encoding="utf-8") as f:
        f.write(f"\n/{ruta}/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: private, no-store\n")
    return movidas


if __name__ == "__main__":
    m = mover(sys.argv[1] if len(sys.argv) > 1 else "_site")
    print(f"{len(m)} páginas de administración en /ops/.")
