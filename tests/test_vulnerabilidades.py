"""Recolector de vulnerabilidades (tools/vulnerabilidades.py): puntajes, producto y combinación con KEV y EPSS."""
import datetime as dt
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import vulnerabilidades as V  # noqa: E402

CVE = {"id": "CVE-2026-0001", "metrics": {"cvssMetricV31": [{"cvssData": {"baseScore": 9.8, "vectorString": "CVSS:3.1/AV:N", "baseSeverity": "CRITICAL"}}],
                                          "cvssMetricV40": [{"cvssData": {"baseScore": 9.2, "vectorString": "CVSS:4.0/AV:N", "baseSeverity": "CRITICAL"}}]},
       "configurations": [{"nodes": [{"cpeMatch": [{"vulnerable": True, "criteria": "cpe:2.3:a:php:php:8.3.0:*:*:*:*:*:*:*"}]}]}]}


def test_puntaje_prefiere_cvss4_y_producto_cpe():
    p = V.puntaje(CVE)
    assert p["cvss"] == 9.2 and p["version"] == "4.0"
    assert V.producto_cpe(CVE) == "php:php"
    assert V.puntaje({})["cvss"] is None


def test_combinar_marca_kev_y_ordena():
    nvd = {"CVE-1": {"id": "CVE-1", "cvss": 9.8, "producto": "a:b", "descripcion": "x"}, "CVE-2": {"id": "CVE-2", "cvss": 9.1, "producto": "c:d", "descripcion": "y"}}
    kev = {"CVE-2": {"proveedor": "C", "producto": "D", "nombre": "D RCE", "agregado": "2026-10-20", "limite": "", "ransomware": "Known", "accion": "Parchar"},
           "CVE-3": {"proveedor": "GitLab", "producto": "GitLab", "nombre": "GitLab RCE", "agregado": "2026-10-01", "limite": "", "ransomware": "", "accion": ""},
           "CVE-OLD": {"proveedor": "X", "producto": "Y", "nombre": "viejo", "agregado": "2020-01-01", "limite": "", "ransomware": "", "accion": ""}}
    r = V.combinar(nvd, kev, {"CVE-1": {"epss": 0.9, "percentil": 0.99}}, hoy=dt.date(2026, 10, 22))
    ids = [v["id"] for v in r]
    assert "CVE-OLD" not in ids and "CVE-3" in ids
    assert ids[0] in ("CVE-2", "CVE-3")  # las explotadas (KEV) van primero
    assert r[-1]["id"] == "CVE-1" and r[-1]["epss"] == 0.9
    assert all(v["url"].startswith("https://nvd.nist.gov/vuln/detail/") for v in r)
