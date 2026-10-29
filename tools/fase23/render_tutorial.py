"""Regenera únicamente el tutorial incrustado en plataforma.html.
Dependencia de autoría: python -m pip install Markdown==3.10.2
No se necesita Markdown en el servidor ni en el navegador.
"""
import hashlib
import html
from pathlib import Path
import re
import markdown

ROOT = Path(__file__).resolve().parents[2]
START, END = '<!-- tutorial-f3:inicio -->', '<!-- tutorial-f3:fin -->'


def render():
    chunks, index = [], []
    for source, prefix, label in [('docs/TUTORIAL_FASE3.md', 'paso', 'Tutorial paso a paso'), ('docs/FASE3.md', 'operacion', 'Referencia operativa completa')]:
        text = (ROOT / source).read_text()
        sections = re.split(r'^## ', text, flags=re.M)
        intro = sections.pop(0)
        chunks.append('<h3>' + label + '</h3>')
        chunks.append(markdown.markdown(re.sub(r'^# .*\n', '', intro), extensions=['tables', 'fenced_code']))
        for n, section in enumerate(sections, 1):
            title, _, body = section.partition('\n')
            anchor = f'f3-{prefix}-{n}'
            index.append(f'<a href="#{anchor}">{html.escape(title)}</a>')
            content = markdown.markdown(body, extensions=['tables', 'fenced_code'])
            content = re.sub(r'<table>(.*?)</table>', r'<div class="tabla"><table>\1</table></div>', content, flags=re.S)
            chunks.append(f'<details id="{anchor}"'+(' open' if prefix=='paso' and n==1 else '')+'><summary>'+html.escape(title)+'</summary>'+content+'</details>')
    digest = hashlib.sha256(((ROOT/'docs/TUTORIAL_FASE3.md').read_text()+(ROOT/'docs/FASE3.md').read_text()).encode()).hexdigest()
    block = START+'\n<section id="tutorial-f3" class="tutorial-fases" data-source-sha256="'+digest+'"><h2>Fase 3 · Tutorial de instalación y operación</h2><p>Abre los pasos en orden. Los comandos se copian y ejecutan en tu terminal; esta página no instala software ni recibe tus claves.</p><details open><summary>Índice del tutorial y referencia operativa</summary><nav aria-label="Índice del tutorial Fase 3">'+''.join(index)+'</nav></details>'+''.join(chunks)+'</section>\n'+END
    path = ROOT/'plataforma.html'
    source = path.read_text()
    if START in source:
        source = source[:source.index(START)]+block+source[source.index(END)+len(END):]
    else:
        source = source.replace('</main>', block+'</main>', 1)
    path.write_text(source)


if __name__ == '__main__':
    render()
