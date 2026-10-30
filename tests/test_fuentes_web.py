"""Contratos y seguridad del monitor ejecutado en GitHub Actions."""
import json
import pytest
from tools.fase23.connectors import ConnectorError, PublicHTTP, fetch_source, fingerprint, ofac_parse, validate_parameters

class FakeHTTP:
    def __init__(self, replies):
        self.replies = replies
        self.downloaded = self.requests = 0
        self.calls = []
    def request(self, method, url, body=None, **kwargs):
        self.calls.append((method, url, body))
        self.requests += 1
        raw = self.replies.pop(0)
        return raw if isinstance(raw, bytes) else json.dumps(raw).encode()


def test_usaspending_real_contract_pagination_and_partial_flag():
    fake = FakeHTTP([{'results': [{'Award ID': 'a'}], 'page_metadata': {'hasNext': True}}, {'results': [{'Award ID': 'b'}], 'page_metadata': {'hasNext': False}}])
    r = fetch_source('usaspending', {'query': 'energy', 'start': '2026-01-01', 'end': '2026-02-01'}, fake)
    assert len(r['datos']['resultados']) == 2 and r['datos']['paginas'] == 2 and not r['parcial']
    assert fake.calls[1][2]['page'] == 2
    assert fake.calls[0][2]['filters']['award_type_codes'] == ['A', 'B', 'C', 'D']
    fake = FakeHTTP([{'results': [], 'page_metadata': {'hasNext': True}}] * 10)
    assert fetch_source('usaspending', {'query': 'energy'}, fake)['parcial']


def test_ofac_namespaces_aliases_cannot_prove_identity_or_accept_xxe():
    xml = b'<sdnList xmlns="https://test"><publshInformation><Publish_Date>2026-10-29</Publish_Date></publshInformation><sdnEntry><uid>1</uid><lastName>EMPRESA QA</lastName><sdnType>Entity</sdnType><akaList><aka><lastName>ALIAS QA</lastName></aka></akaList></sdnEntry></sdnList>'
    result = ofac_parse(xml, 'alias qa')
    assert result['resultados'][0]['id'] == '1'
    assert 'no confirmada' in result['resultados'][0]['coincidencia']
    with pytest.raises(Exception):
        ofac_parse(b'<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><sdnList>&e;</sdnList>', 'test')
    with pytest.raises(ConnectorError):
        ofac_parse(b'<sdnList/>', 'x')


def test_epo_weekly_and_document_no_registration_or_external_dtd():
    fake = FakeHTTP([b'<a href="/publication-server/rest/v1.2/publication-dates/20261028/patents">x</a>', b'<a href="/patents/EP1004359NWB1">p</a><a href="/patents/EP1234567NWA1">q</a>'])
    r = fetch_source('epo_weekly', {'prefix': 'EP1004'}, fake)
    assert r['datos']['total_publicaciones'] == 2 and len(r['datos']['resultados']) == 1
    fake = FakeHTTP([b'<!DOCTYPE ep-patent-document SYSTEM "https://evil.example/dtd"><ep-patent-document date-publ="20261028"><invention-title>QA</invention-title></ep-patent-document>'])
    r = fetch_source('epo_document', {'publication': 'EP1004359NWB1'}, fake)
    assert r['datos']['titulo'] == ['QA']
    assert len(fake.calls) == 1


def test_fixed_destinations_no_url_injection_and_no_redirection(monkeypatch):
    with pytest.raises(ValueError):
        validate_parameters('ofac', {'query': 'hello', 'url': 'http://127.0.0.1'})
    with pytest.raises(ValueError):
        validate_parameters('epo_document', {'publication': '../metadata'})
    with pytest.raises(ConnectorError):
        PublicHTTP().request('GET', 'https://127.0.0.1/')
    monkeypatch.setattr('tools.fase23.connectors.socket.getaddrinfo', lambda *a, **k: [(None, None, None, None, ('127.0.0.1', 443))])
    with pytest.raises(ConnectorError):
        PublicHTTP().request('GET', 'https://data.epo.org/publication-server')


def test_sat_copy_preserves_distinct_status_and_age():
    raw = {'campos': ['rfc', 'nombre', 'situacion'], 'generado_utc': '2026-01-01T00:00:00Z', 'corte_sat': 'enero', 'filas': [['ABC010101AB1', 'QA', 'Sentencia favorable']]}
    r = fetch_source('sat69b', {'rfc': 'ABC010101AB1'}, FakeHTTP([raw]))
    assert r['datos']['resultados'][0]['situacion'] == 'Sentencia favorable'
    assert r['datos']['generado_utc_copia'] == raw['generado_utc']


def test_pagination_checkpoint_resumes_without_changing_period():
    fake = FakeHTTP([{'results': [{'Award ID': 'page11'}], 'page_metadata': {'hasNext': False}}])
    r = fetch_source('usaspending', {'query': 'energy'}, fake, checkpoint={'continuacion': 11, 'periodo': {'desde': '2026-01-01', 'hasta': '2026-02-01'}})
    assert fake.calls[0][2]['page'] == 11
    assert fake.calls[0][2]['filters']['time_period'][0]['end_date'] == '2026-02-01'
    assert r['parcial'] and r['datos']['continuacion'] is None


def test_fingerprints_ignore_row_order_and_download_clock():
    a = {'datos': {'resultados': [{'id': 2}, {'id': 1}]}, 'parcial': False, 'observado_utc': '2026-01-01'}
    b = {'datos': {'resultados': [{'id': 1}, {'id': 2}]}, 'parcial': False, 'observado_utc': '2026-01-02'}
    assert fingerprint(a) == fingerprint(b)


def test_source_old_copy_marked_stale():
    raw = {'campos': ['rfc', 'nombre', 'situacion'], 'generado_utc': '2020-01-01T00:00:00Z', 'filas': [['ABC010101AB1', 'QA', 'Desvirtuado']]}
    r = fetch_source('sat69b', {'rfc': 'ABC010101AB1'}, FakeHTTP([raw]))
    assert r['datos']['stale'] and r['datos']['age_days'] > 14


def test_ofac_only_accepts_its_exact_published_storage(monkeypatch):
    import httpx
    from tools.fase23.connectors import OFAC, OFAC_STORAGE
    monkeypatch.setattr('tools.fase23.connectors.socket.getaddrinfo', lambda *a, **k: [(None, None, None, None, ('1.1.1.1', 443))])
    calls = []
    destination = 'https://' + OFAC_STORAGE + '/Published/qa/SDN.XML?signature=ephemeral-test'
    def respond(req):
        calls.append(req)
        if len(calls) == 1:
            return httpx.Response(302, headers={'location': destination})
        return httpx.Response(200, content=b'<sdnList/>')
    h = PublicHTTP(client=httpx.Client(transport=httpx.MockTransport(respond)))
    assert h.request('GET', OFAC) == b'<sdnList/>'
    assert len(calls) == 2 and calls[1].headers['host'] == OFAC_STORAGE
    assert calls[1].extensions['sni_hostname'] == OFAC_STORAGE
    assert calls[1].url.host == '1.1.1.1'
    h = PublicHTTP(client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(302, headers={'location': 'https://evil.example/Published/SDN.XML'}))))
    with pytest.raises(ConnectorError):
        h.request('GET', OFAC)


