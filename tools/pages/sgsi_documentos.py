"""Publica copias de lectura del SGSI desde sus originales. No incluye solicitudes o firmas privadas."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCUMENTOS = [
    ('alcance', 'Alcance del SGSI', 'ALCANCE.md'),
    ('politica', 'Política, objetivos y roles · pendiente de aprobación', 'POLITICA_SEGURIDAD.md'),
    ('riesgos', 'Evaluación inicial de riesgos 5×5', 'RIESGOS_PROYECTO.md'),
    ('arco', 'Procedimiento ARCO', 'ARCO.md'),
]


def generar(salida, root=ROOT):
    documentos = [{'id': i, 'titulo': t, 'origen': 'docs/sgsi/' + f,
                   'texto': (root / 'docs/sgsi' / f).read_text(encoding='utf-8')}
                  for i, t, f in DOCUMENTOS]
    gobierno = json.loads((root / 'config/sgsi_gobierno.json').read_text(encoding='utf-8'))
    salida = Path(salida)
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(json.dumps({'revisado': gobierno['revisado'], 'gobierno': gobierno,
                                  'documentos': documentos}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')


if __name__ == '__main__':
    generar(sys.argv[1])
