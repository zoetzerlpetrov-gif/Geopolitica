"""Genera fuentes.html (Fuentes, licencias y atribución) a partir de SOURCES.md, para que el sitio no enlace al repositorio.

Uso: python3 tools/pages/fuentes_pagina.py _site/fuentes.html
Convierte el subconjunto de Markdown que usa SOURCES.md: títulos, párrafos, tablas, listas, **negritas**, `código` y
[enlaces](https://…). Todo el texto se escapa; solo se aceptan enlaces http(s).
"""
import html
import os
import re
import sys

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
ICONO = ('<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E'
         '%3Cpath fill=\'%23C8102E\' d=\'M44 44 30 4h40L56 44 96 30v40L56 56l14 40H30l14-40L4 70V30z\'/%3E%3C/svg%3E">')


def en_linea(t):
    """Escapa y aplica negritas, código y enlaces http(s)."""
    partes, i = [], 0
    for m in re.finditer(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", t):
        partes.append(_formato(t[i:m.start()]))
        partes.append(f'<a href="{html.escape(m.group(2), quote=True)}" target="_blank" rel="noopener noreferrer">{_formato(m.group(1))}</a>')
        i = m.end()
    partes.append(_formato(t[i:]))
    return "".join(partes)


def _formato(t):
    t = html.escape(t, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    return re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)


def celdas(linea):
    return [c.strip() for c in linea.strip().strip("|").split("|")]


def convertir(md):
    out, lineas, i = [], md.splitlines(), 0
    while i < len(lineas):
        l = lineas[i]
        if not l.strip():
            i += 1
            continue
        m = re.match(r"^(#{1,4})\s+(.*)", l)
        if m:
            n = len(m.group(1))
            ident = re.sub(r"[^a-z0-9]+", "-", m.group(2).lower()).strip("-")
            out.append(f'<h{n} id="{ident}">{en_linea(m.group(2))}</h{n}>')
            i += 1
            continue
        if l.lstrip().startswith("|") and i + 1 < len(lineas) and re.match(r"^\s*\|[\s:|-]+\|\s*$", lineas[i + 1]):
            cab = celdas(l)
            filas = []
            i += 2
            while i < len(lineas) and lineas[i].lstrip().startswith("|"):
                filas.append(celdas(lineas[i]))
                i += 1
            th = "".join(f"<th>{en_linea(c)}</th>" for c in cab)
            tr = "".join("<tr>" + "".join(f"<td>{en_linea(c)}</td>" for c in f) + "</tr>" for f in filas)
            out.append(f'<div class="tabla"><table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>')
            continue
        if re.match(r"^\s*([-*]|\d+\.)\s+", l):
            orden = bool(re.match(r"^\s*\d+\.", l))
            items = []
            while i < len(lineas) and re.match(r"^\s*([-*]|\d+\.)\s+", lineas[i]):
                items.append(re.sub(r"^\s*([-*]|\d+\.)\s+", "", lineas[i]))
                i += 1
            tag = "ol" if orden else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{en_linea(x)}</li>" for x in items) + f"</{tag}>")
            continue
        par = []
        while i < len(lineas) and lineas[i].strip() and not re.match(r"^(#{1,4}\s|\s*\||\s*([-*]|\d+\.)\s)", lineas[i]):
            par.append(lineas[i].strip())
            i += 1
        out.append(f"<p>{en_linea(' '.join(par))}</p>")
    return "\n".join(out)


def pagina(md):
    return f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fuentes, licencias y atribución · DOMINUS</title>
  {ICONO}
  <meta name="color-scheme" content="light dark">
  <link rel="stylesheet" href="css/app.css">
  <style>body{{display:block;height:auto;overflow:auto}}main{{max-width:1200px;margin:0 auto;padding:16px;line-height:1.55}}
  .tabla{{overflow:auto;margin:10px 0 18px}}table{{border-collapse:collapse;font-size:13px;min-width:640px}}
  th,td{{border:1px solid var(--line);padding:5px 7px;text-align:left;vertical-align:top}}th{{background:var(--surface-2)}}</style>
  <script type="module" src="js/apariencia.js"></script>
</head>
<body>
  <header class="topbar"><a class="link-btn" href="./">← Mapa</a></header>
  <main>
{convertir(md)}
  </main>
</body>
</html>
"""


if __name__ == "__main__":
    destino = sys.argv[1] if len(sys.argv) > 1 else "fuentes.html"
    with open(os.path.join(RAIZ, "SOURCES.md"), encoding="utf-8") as f:
        md = f.read()
    with open(destino, "w", encoding="utf-8") as f:
        f.write(pagina(md))
    print("Fuentes y licencias en", destino)
