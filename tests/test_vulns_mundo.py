"""Vulnerabilidades en apps y plataformas (tools/seguridad/vulns_mundo.py) con fuentes simuladas."""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "seguridad"))
import vulns_mundo as V  # noqa: E402

AHORA = datetime(2026, 11, 21, 12, tzinfo=timezone.utc)
KEV = {"catalogVersion": "2026.11.20", "count": 3, "vulnerabilities": [
    {"cveID": "CVE-2026-1", "vendorProject": "Apple", "product": "iOS", "vulnerabilityName": "Apple iOS WebKit", "dateAdded": "2026-11-20", "dueDate": "2026-12-11",
     "shortDescription": "x", "knownRansomwareCampaignUse": "Known", "notes": "https://support.apple.com/x ; https://nvd.nist.gov/vuln/detail/CVE-2026-1", "cwes": ["CWE-787"]},
    {"cveID": "CVE-2026-2", "vendorProject": "Acme", "product": "Router", "vulnerabilityName": "Acme", "dateAdded": "2026-10-01", "dueDate": "2026-10-22",
     "shortDescription": "y", "knownRansomwareCampaignUse": "Unknown", "notes": "", "cwes": []},
    {"cveID": "CVE-2020-3", "vendorProject": "Microsoft", "product": "Windows", "vulnerabilityName": "Viejo", "dateAdded": "2020-01-01", "dueDate": "2020-02-01",
     "shortDescription": "z", "knownRansomwareCampaignUse": "Unknown", "notes": "", "cwes": []}]}
NVD = {"vulnerabilities": [{"cve": {"metrics": {"cvssMetricV31": [{"cvssData": {"baseScore": 9.8, "baseSeverity": "CRITICAL"}}]},
       "configurations": [{"nodes": [{"cpeMatch": [{"vulnerable": True, "criteria": "cpe:2.3:o:apple:iphone_os:*:*", "versionEndExcluding": "18.7.2"}]}]}],
       "references": [{"url": "https://support.apple.com/x", "tags": ["Vendor Advisory"]}]}}]}
HIBP = [{"Name": "AcmeAir", "Title": "Aeroméxico", "Domain": "aeromexico.com", "BreachDate": "2026-09-01", "AddedDate": "2026-10-01T00:00:00Z", "PwnCount": 1000,
         "DataClasses": ["Email addresses"], "IsVerified": True},
        {"Name": "Viejo", "Title": "Viejo", "Domain": "viejo.com", "BreachDate": "2015-01-01", "AddedDate": "2016-01-01T00:00:00Z", "PwnCount": 5, "DataClasses": []}]


def leer(url, timeout=60):
    if url == V.KEV:
        return json.dumps(KEV).encode()
    if url.startswith(V.NVD):
        return json.dumps(NVD).encode()
    if url.startswith(V.EPSS):
        return json.dumps({"data": [{"cve": "CVE-2026-1", "epss": "0.42", "percentile": "0.97"}]}).encode()
    if url == V.HIBP:
        return json.dumps(HIBP).encode()
    raise OSError(url)


def test_construye_con_version_corregida_inventario_y_brechas(tmp_path):
    viv = tmp_path / "vivos"
    viv.mkdir()
    (viv / "noticiero.json").write_text(json.dumps({"notas": [{"t": "Hackeo a clientes de BBVA: roban datos", "u": "https://a.mx/1", "m": "a", "f": "2026-11-20T00:00:00Z"},
                                                                {"t": "BBVA abre sucursal", "u": "https://a.mx/2", "m": "a", "f": "2026-11-20"}]}), encoding="utf-8")
    d = V.construir(str(tmp_path / "s"), str(viv), AHORA, leer=leer, permitido=lambda u: True, dormir=lambda s: None)
    cves = [i["cve"] for i in d["kev"]]
    assert cves == ["CVE-2026-1", "CVE-2026-2"]  # la de 2020 queda fuera del historial de 2 años
    ios = d["kev"][0]
    assert ios["afecta_inventario"] and ios["ransomware"] and ios["cvss"] == 9.8 and ios["epss"] == 0.42
    assert ios["versiones"] == [{"producto": "iphone os", "corregida": ["18.7.2"]}]
    assert "Ajustes" in ios["como_verificar"] and ios["aviso_fabricante"] == ["https://support.apple.com/x"]
    assert "memoria" in ios["tipo"].lower()
    assert [b["nombre"] for b in d["brechas"]] == ["Aeroméxico"] and d["brechas"][0]["categoria"] == "Aerolíneas y viajes"
    assert [p["marca"] for p in d["prensa"]] == ["BBVA"]
    # Segunda corrida: lo del NVD ya guardado no se vuelve a pedir, y la prensa anterior se conserva.
    pedidas = []
    d2 = V.construir(str(tmp_path / "s"), None, AHORA, leer=lambda u, t=60: (pedidas.append(u), leer(u, t))[1], permitido=lambda u: True, dormir=lambda s: None)
    assert not [u for u in pedidas if u.startswith(V.NVD + "CVE-2026-1")]
    assert d2["prensa"] and d2["kev"][0]["versiones"]


def test_si_una_fuente_falla_se_conserva_lo_anterior(tmp_path):
    V.construir(str(tmp_path), None, AHORA, leer=leer, permitido=lambda u: True, dormir=lambda s: None)

    def roto(url, timeout=60):
        raise OSError("caído")
    d = V.construir(str(tmp_path), None, AHORA, leer=roto, permitido=lambda u: True, dormir=lambda s: None)
    assert len(d["kev"]) == 2 and d["brechas"] and "error" in d["fuentes"]["CISA KEV"]
