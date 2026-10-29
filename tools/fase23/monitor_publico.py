"""Salud de fuentes públicas con consultas genéricas. Nunca lee expedientes ni claves."""
import argparse
import datetime as dt
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
from dominus.connectors import SOURCES, PublicHTTP, fetch_source, fingerprint


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--salida', required=True)
    a = p.parse_args()
    dest = Path(a.salida)
    old = {}
    if dest.exists():
        old = {s['id']: s for s in json.loads(dest.read_text()).get('fuentes', [])}
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    defaults = {'ofac': {'query': 'DOMINUS_HEALTH_CHECK_NO_ENTITY'}, 'usaspending': {'query': 'energy', 'start': (dt.date.today() - dt.timedelta(days=7)).isoformat(), 'end': dt.date.today().isoformat()}, 'epo_weekly': {}, 'epo_document': {'publication': 'EP1004359NWB1'}, 'sat69b': {'rfc': 'AAA010101AAA'}}
    rows = []
    for source, meta in SOURCES.items():
        row = {'id': source, **meta, 'intentado_utc': now, 'estado': 'pendiente', 'ultimo_exito_utc': old.get(source, {}).get('ultimo_exito_utc')}
        try:
            r = fetch_source(source, defaults[source], PublicHTTP())
            row.update({'estado': 'antiguo' if r['datos'].get('stale') else 'parcial' if r['parcial'] else 'ok', 'ultimo_exito_utc': r['observado_utc'], 'corte': r['datos'].get('corte'), 'generado_utc_copia': r['datos'].get('generado_utc_copia'), 'bytes': r['bytes'], 'peticiones': r['requests'], 'huella_resultado': fingerprint(r), 'alcance': r['datos']['alcance']})
        except Exception as exc:
            row.update({'estado': 'error', 'error': type(exc).__name__ + ': disponibilidad o esquema no verificados en este intento'})
        rows.append(row)
        print(source + ': ' + row['estado'], flush=True)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps({'version': 1, 'generado_utc': now, 'alcance': 'Monitor con consultas genéricas. No representa las vigilancias privadas ni garantiza cobertura o disponibilidad.', 'fuentes': rows}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
