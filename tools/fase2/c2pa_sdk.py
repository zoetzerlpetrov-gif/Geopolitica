"""Verificación C2PA offline con SDK oficial. Se ejecuta en un proceso separado."""
import argparse
import hashlib
import json
from pathlib import Path


def verify(path, anchors=None):
    import c2pa
    config = {'verify': {'verify_after_reading': True, 'verify_trust': True,
                         'verify_timestamp_trust': True, 'remote_manifest_fetch': False,
                         'ocsp_fetch': False}, 'core': {'allowed_network_hosts': []}}
    if anchors:
        config['trust'] = {'user_anchors': Path(anchors).read_text(encoding='utf-8')}
    try:
        with c2pa.Context.from_dict(config) as context:
            with c2pa.Reader(str(path), context=context) as reader:
                raw = json.loads(reader.json())
        active = raw.get('active_manifest')
        manifests = raw.get('manifests', {})
        summary = {'estado': 'verificado_por_sdk', 'sdk': c2pa.sdk_version(), 'active_manifest': active,
                   'validation_state': raw.get('validation_state', 'consultar_resultados'),
                   'validation_status': raw.get('validation_status', []),
                   'validation_results': raw.get('validation_results', {}),
                   'manifiestos': [{'id': k, 'title': v.get('title'), 'claim_generator': v.get('claim_generator'),
                                    'signature_info': v.get('signature_info')} for k, v in manifests.items()],
                   'red': 'Deshabilitada: sin OCSP ni manifiestos remotos; comprobación offline.',
                   'anclas_adicionales': bool(anchors),
                   'limite': 'Integridad y confianza del manifiesto; no certifica la escena ni identifica al autor por sí sola.'}
        serialized = json.dumps(summary, ensure_ascii=False)
        if len(serialized) > 11000:
            summary['validation_results'] = {'parcial': True, 'nota': 'Reporte extenso: revisar con c2patool/SDK para informe íntegro.'}
        return summary
    except c2pa.C2paError as exc:
        message = str(exc)
        missing = any(code in message for code in ('JumbfNotFound', 'NoManifestFound', 'No JUMBF', 'no JUMBF'))
        return {'estado': 'sin_manifiesto' if missing else 'error_de_validacion', 'sdk': c2pa.sdk_version(),
                'detalle': message[:3000], 'red': 'Deshabilitada',
                'limite': 'Ausencia de credenciales o error no prueba falsedad. No se declara firma válida.'}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('archivo')
    p.add_argument('--anclas')
    a = p.parse_args()
    path = Path(a.archivo).resolve(strict=True)
    if not path.is_file() or path.stat().st_size > 100 * 1024 * 1024:
        p.exit(1, 'Archivo inválido o mayor de 100 MB.\n')
    print(json.dumps(verify(path, a.anclas), ensure_ascii=False))


if __name__ == '__main__':
    main()
