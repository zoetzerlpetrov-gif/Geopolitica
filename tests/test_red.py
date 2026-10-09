"""Red y ciberseguridad: cortes (IODA), servidores C2 por país (abuse.ch + DB-IP) y avisos ICS (CISA CSAF)."""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "red"))
import red as R  # noqa: E402

P = R.Paises()


def test_cortes_por_pais():
    hasta = 1_791_574_712
    evs = [{"location": "country/MZ", "start": hasta - 7200, "duration": 9000, "datasource": "bgp", "score": 1632.4},
           {"location": "country/MZ", "start": hasta - 5000, "duration": 6000, "datasource": "ping-slash24", "score": 10},
           {"location": "country/LT", "start": hasta - 86400, "duration": 3600, "datasource": "gtr", "score": 5},
           {"location": "asn/123", "start": hasta, "duration": 1}]
    fs = {f["properties"]["pais_iso3"]: f["properties"] for f in R.cortes(evs, P, hasta)}
    assert set(fs) == {"MOZ", "LTU"}
    mz = fs["MOZ"]
    assert mz["en_curso"] and mz["n_senales"] == 2 and mz["fin_utc"] is None and mz["horas"] == 2.0
    assert "ioda.inetintel.cc.gatech.edu/country/MZ" in mz["url"]
    assert not fs["LTU"]["en_curso"] and fs["LTU"]["senales"] == ["Tráfico hacia Google"]


def test_c2_solo_conteos_por_pais():
    geo = R.GeoIP([("1.0.0.0", "1.0.0.255", "AU"), ("8.8.8.0", "8.8.8.255", "US"), ("9.9.9.0", "9.9.9.255", "ZZ"), ("2001::", "2001::ffff", "US")])
    tf = {"1": [{"ioc_type": "ip:port", "ioc_value": "8.8.8.8:443", "threat_type": "botnet_cc", "malware_printable": "Vidar"}],
          "2": [{"ioc_type": "url", "ioc_value": "https://8.8.8.9/gate", "threat_type": "botnet_cc", "malware_printable": "Lumma"}],
          "3": [{"ioc_type": "domain", "ioc_value": "malo.example", "threat_type": "botnet_cc"}],
          "4": [{"ioc_type": "ip:port", "ioc_value": "1.0.0.7:80", "threat_type": "payload_delivery"}],
          "5": [{"ioc_type": "ip:port", "ioc_value": "9.9.9.9:80", "threat_type": "botnet_cc", "malware_printable": "X"}]}
    ips = {**R.ips_threatfox(tf), **R.ips_feodo([{"ip_address": "1.0.0.5", "malware": "QakBot"}])}
    assert set(ips) == {"8.8.8.8", "8.8.8.9", "9.9.9.9", "1.0.0.5"}
    feats, sin = R.c2_por_pais(ips, geo, P)
    assert sin == 1  # 9.9.9.9 cae en un rango sin país
    usa = feats[0]["properties"]
    assert usa["pais_iso3"] == "USA" and usa["n"] == 2 and dict(usa["familias"]) == {"Vidar": 1, "Lumma": 1}
    assert "8.8.8.8" not in json.dumps(feats)  # nunca se publica una IP


def test_csaf_y_agrupado_por_sede():
    a = R.leer_csaf(json.load(open(os.path.join(ROOT, "tests", "datos", "csaf_icsa.json"), encoding="utf-8")))
    assert a["id"] == "ICSA-26-281-03" and a["sede"] == "Finland" and a["fabricante"] == "Satel" and a["cvss"] == 8.8 and not a["explotado"]
    assert a["url"].endswith("icsa-26-281-03") and a["sectores"] == ["Communications"]
    b = {**a, "id": "X", "sede": "Germany, United States", "cvss": 9.8, "explotado": True, "fecha": "2026-10-09"}
    c = {**a, "id": "Y", "sede": "Atlantis"}
    feats, sin = R.ics_por_pais([a, b, c], P)
    por = {f["properties"]["pais_iso3"]: f["properties"] for f in feats}
    assert set(por) == {"FIN", "DEU"} and [x["id"] for x in sin] == ["Y"]
    assert por["DEU"]["criticos"] == 1 and por["DEU"]["explotados"] == 1


def test_fecha_del_nombre():
    assert R.fecha_de_nombre("icsa-26-281-03.json").strftime("%Y-%m-%d") == "2026-10-08"
    assert R.fecha_de_nombre("icsma-25-001-01.json").strftime("%Y-%m-%d") == "2025-01-01"
    assert R.fecha_de_nombre("icsa-26-281-03.json.asc") is None
