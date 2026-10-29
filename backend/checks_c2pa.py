"""Pruebas criptográficas con certificados efímeros de laboratorio, sin red."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import sys
import c2pa
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.fase2.c2pa_sdk import verify


def signed_fixture(tmp_path):
    ca_key = ec.generate_private_key(ec.SECP256R1())
    leaf_key = ec.generate_private_key(ec.SECP256R1())
    root_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'DOMINUS QA ROOT · NO PRODUCCION')])
    leaf_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'DOMINUS QA SIGNER')])
    now = dt.datetime.now(dt.timezone.utc)
    def builder(subject, issuer, public):
        return x509.CertificateBuilder().subject_name(subject).issuer_name(issuer).public_key(public).serial_number(x509.random_serial_number()).not_valid_before(now - dt.timedelta(days=1)).not_valid_after(now + dt.timedelta(days=7))
    root = builder(root_name, root_name, ca_key.public_key()).add_extension(x509.BasicConstraints(ca=True, path_length=1), critical=True).add_extension(x509.KeyUsage(False, False, False, False, False, True, True, False, False), critical=True).add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), False).sign(ca_key, hashes.SHA256())
    leaf = builder(leaf_name, root_name, leaf_key.public_key()).add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True).add_extension(x509.KeyUsage(True, False, False, False, False, False, False, False, False), critical=True).add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.EMAIL_PROTECTION]), critical=False).add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), False).add_extension(x509.SubjectKeyIdentifier.from_public_key(leaf_key.public_key()), False).sign(ca_key, hashes.SHA256())
    ca_pem = root.public_bytes(serialization.Encoding.PEM)
    chain = leaf.public_bytes(serialization.Encoding.PEM) + ca_pem
    anchor = tmp_path / 'qa-root.pem'
    anchor.write_bytes(ca_pem)
    source, signed = tmp_path / 'unsigned.jpg', tmp_path / 'signed.jpg'
    Image.new('RGB', (32, 32), (90, 140, 180)).save(source, 'JPEG')
    manifest = {'claim_generator_info': [{'name': 'DOMINUS QA', 'version': '1'}], 'format': 'image/jpeg', 'title': 'ARCHIVO SINTETICO DE PRUEBA', 'assertions': [{'label': 'c2pa.actions', 'data': {'actions': [{'action': 'c2pa.created', 'digitalSourceType': 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCreation'}]}}]}
    context = c2pa.Context.from_dict({'verify': {'remote_manifest_fetch': False, 'ocsp_fetch': False}, 'trust': {'user_anchors': ca_pem.decode()}})
    with c2pa.Signer.from_callback(lambda data: leaf_key.sign(data, ec.ECDSA(hashes.SHA256())), c2pa.C2paSigningAlg.ES256, chain.decode()) as signer:
        with c2pa.Builder(manifest, context=context) as b:
            b.sign_file(source, signed, signer)
    context.close()
    return source, signed, anchor


def statuses(result):
    return json.dumps(result, ensure_ascii=False)


def test_unsigned_does_not_claim_authenticity(tmp_path):
    f = tmp_path / 'unsigned.jpg'
    Image.new('RGB', (16, 16)).save(f)
    r = verify(f)
    assert r['estado'] == 'sin_manifiesto', r
    assert 'no prueba falsedad' in r['limite']


def test_real_signature_and_tampering(tmp_path):
    _, signed, anchor = signed_fixture(tmp_path)
    good = verify(signed, anchor)
    assert good['estado'] == 'verificado_por_sdk', good
    assert good['active_manifest']
    assert good['validation_state'] in ('Valid', 'Trusted'), good
    untrusted = verify(signed)
    assert 'untrusted' in statuses(untrusted).lower() or untrusted['validation_state'] != 'Trusted', untrusted
    raw = bytearray(signed.read_bytes())
    pos = raw.index(b'\xff\xdb') + 5
    raw[pos] ^= 1
    altered = tmp_path / 'altered.jpg'
    altered.write_bytes(raw)
    bad = verify(altered, anchor)
    assert bad.get('validation_state') not in ('Valid', 'Trusted')
    assert any(word in statuses(bad).lower() for word in ('mismatch', 'invalid', 'error')), bad
