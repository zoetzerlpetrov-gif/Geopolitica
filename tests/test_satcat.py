"""Satélites sin CelesTrak: TLE de SatNOGS, descarte de TLE viejos y ficha desde GCAT."""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "vivos"))
import satcat as SC  # noqa: E402
import actualizar as A  # noqa: E402

ISS = ["ISS (ZARYA)", "1 25544U 98067A   26281.98258931  .00005946  00000-0  11685-3 0  9992",
       "2 25544  51.6313  96.9458 0006822 239.5445 120.4870 15.48782794589393"]
VIEJO = ["VIEJO", "1 11111U 80001A   26200.00000000  .00000000  00000-0  00000-0 0  9990",
         "2 11111  51.6313  96.9458 0006822 239.5445 120.4870 15.48782794589393"]
JD_9OCT = 2461322.5  # 2026-10-09 00:00 UTC


def test_edad_y_renovar():
    assert 0 < SC.edad_dias(ISS[1], JD_9OCT + 0.5) < 1
    grupos = {"stations": [["ISS VIEJA", ISS[1].replace("26281", "26200"), ISS[2]], VIEJO]}
    out, ren, desc = SC.renovar(grupos, {"25544": ISS}, JD_9OCT)
    assert ren == 1 and desc == 1 and out["stations"][0][1] == ISS[1] and out["stations"][0][0] == "ISS VIEJA"


def test_tle_satnogs_y_telescopios():
    t = SC.tle_satnogs([{"tle0": "0 HST", "tle1": ISS[1], "tle2": ISS[2], "norad_cat_id": 20580}, {"tle0": "x", "tle1": "", "tle2": "", "norad_cat_id": 1}])
    assert list(t) == ["20580"] and t["20580"][0] == "HST"
    assert [x[0] for x in SC.telescopios({"a": [t["20580"], ["HST DEB", ISS[1], ISS[2]]]})] == ["HST"]


def test_ficha_gcat():
    tsv = ("#JCAT\tSatcat\tType\tName\tPLName\tLDate\tDDate\tStatus\tOwner\tState\tManufacturer\tBus\tMass\tTotMass\tLength\tDiameter\tSpan\n"
           "# Updated\nS25544\t25544\tP  \tISS\tISS (Zarya)\t1998 Nov 20\t-\tO\tNASA\tUS\tKHR\t-\t   419725 \t-\t 73.0\t-\t109.0\n"
           "S00001\t00001\tR2\tx\tx\t1957 Oct  4\t1957 Dec  1\tR\tOKB1\tSU\t-\t-\t7790\t-\t28\t2.6\t-\n")
    filas = SC.leer_tsv(tsv)
    partes, usados = SC.catalogo_para(filas, {"25544"})
    assert partes["4"]["25544"] == ["P", "US", "NASA", "1998 Nov 20", "", "O", 419725, "73×109", "KHR", "", "ISS (Zarya)"]
    assert usados == {"US", "NASA", "KHR"} and not partes["1"]
    assert SC.nombres_orgs(SC.leer_tsv("#Code\tShortEName\tEName\tShortName\nUS\tUSA\tUnited States\t-\nAALTO\t-\t-\tAalto Univ.\n")) == {"US": "USA", "AALTO": "Aalto Univ."}


def test_recolector_sin_celestrak(tmp_path, monkeypatch):
    monkeypatch.setattr(A, "OUT", str(tmp_path))
    (tmp_path / "satelites.json").write_text(json.dumps({"generado_utc": "2026-10-01T00:00:00Z", "grupos": {"stations": [ISS], "science": [VIEJO]}, "aparte": []}))
    pedidas = []

    def get(url, timeout=120, headers=None):
        pedidas.append(url)
        assert "celestrak" not in url
        if "satnogs" in url:
            return json.dumps([{"tle0": "0 HST", "tle1": ISS[1].replace("25544", "20580"), "tle2": ISS[2].replace("25544", "20580"), "norad_cat_id": 20580}]).encode()
        if "satcat.tsv" in url:
            return b"#Satcat\tType\tState\tOwner\nS\t25544\tP\tUS\tNASA\n"
        return b"#Code\tShortEName\nUS\tUSA\nNASA\tNASA\n"
    monkeypatch.setattr(A, "get", get)
    monkeypatch.setattr(A, "_jd_ahora", lambda: JD_9OCT + 1)
    monkeypatch.setattr(A.time, "sleep", lambda s: None)
    monkeypatch.setattr(A, "CELESTRAK_PERMITIDO", False)
    A.satelites()
    d = json.loads((tmp_path / "satelites.json").read_text())
    assert set(d["grupos"]) == {"stations", "science", "satnogs", "telescopios"}
    assert d["grupos"]["science"] == [] and [t[0] for t in d["grupos"]["telescopios"]] == ["HST"]
    assert "robots.txt" in d["fuente"] and d["satnogs_utc"]
    assert any("satcat.tsv" in u for u in pedidas)
