import csv
import io
import json
import os
import sys
import zipfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "mexico"))
import contraste_mx as C  # noqa: E402

MESES = C.MESES


def fila(cod, v):
    return {"partnerCode": cod, "primaryValue": v * 1e6, "motCode": 0, "customsCode": "C00", "partner2Code": 0}


def test_reparto_petroleo_separa_eua_identificados_y_sin_pais():
    r = C.resumen_petroleo([fila(0, 100), fila(842, 20), fila(636, 50), fila(899, 10), fila(192, 0.5), fila(320, 19.5),
                            {**fila(636, 999), "motCode": 1000}])          # desglose por transporte: se ignora
    assert (r["total"], r["eua"], r["sin_pais"], r["paises_identificados"], r["cuba"]) == (100, 20, 60, 20, 0.5)
    assert r["sin_pais_pct"] == 60 and r["detalle_sin_pais"] == {"Rest of America, nes": 50, "Areas, nes": 10}


def test_comercio_con_api_simulada(monkeypatch, tmp_path):
    monkeypatch.setattr(C, "MESES_COMERCIO", 2)
    monkeypatch.setattr(C, "MONITOR", str(tmp_path / "no.json"))

    def pedir(url):
        if "period=202610" in url:
            return {"data": [], "error": ""}                    # mes aún no reportado
        if "cmdCode=TOTAL" in url:
            return {"data": [fila(0, 80000)], "error": ""}
        return {"data": [fila(0, 2000), fila(842, 500), fila(568, 1500)], "error": ""}
    r = C.comercio({}, datetime(2026, 11, 17, tzinfo=timezone.utc), pedir=pedir, dormir=lambda s: None)
    assert list(r["meses"]) == ["202609"] and r["meses"]["202609"]["sin_pais_pct"] == 75 and r["meses"]["202609"]["exportaciones_totales"] == 80000


def csv_zip(filas):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=["Año", "Entidad", "Tipo de delito", "Subtipo de delito", "Modalidad", *MESES])
    w.writeheader()
    for f in filas:
        w.writerow(f)
    z = io.BytesIO()
    with zipfile.ZipFile(z, "w") as zz:
        zz.writestr("victimas.csv", buf.getvalue().encode("latin-1"))
    return z.getvalue()


def registro(anio, subtipo, por_mes, tipo=""):
    return {"Año": anio, "Entidad": "X", "Tipo de delito": tipo or subtipo, "Subtipo de delito": subtipo, "Modalidad": "Con arma de fuego", **{m: por_mes for m in MESES}}


def test_seguridad_detecta_posible_reclasificacion():
    html = ('<a href="https://sspcgob-my.sharepoint.com/:u:/g/a">2015 - 2025 (Fuero Común - Víctimas). Incidencia delictiva estatal</a>'
            '<a href="https://sspcgob-my.sharepoint.com/:u:/g/b">Enero - septiembre 2026 (Fuero común - Víctimas). Incidencia delictiva estatal</a>'
            '<a href="https://sspcgob-my.sharepoint.com/:u:/g/c">1997 - 2017 (Fuero común - Delitos). Incidencia delictiva estatal</a>')
    hist = csv_zip([registro("2024", "Homicidio doloso", 100), registro("2025", "Homicidio doloso", 100),
                    registro("2025", "Otros delitos que atentan contra la vida y la integridad corporal", 10)])
    actual = csv_zip([registro("2026", "Homicidio doloso", 70), registro("2026", "Otros delitos que atentan contra la vida y la integridad corporal", 30)])
    s = C.seguridad(descargar=lambda u: hist if u.endswith("/a") else actual, html=html)
    assert s["ultimo_mes"] == 9 and len(s["archivos"]) == 2
    assert s["anuales"]["homicidio_doloso"] == {"2024": 1200, "2025": 1200}
    assert s["mismo_periodo"]["homicidio_doloso"] == {"2025": 900, "2026": 630}
    sen = s["senales"][0]
    assert sen["baja"] == "homicidio_doloso" and sen["sube"] == "otros_vida" and sen["cambio_baja_pct"] == -30.0 and sen["absorbe_pct"] == 67


def test_categorias_no_se_confunden():
    assert C.categoria({"Tipo de delito": "Secuestro", "Subtipo de delito": "Secuestro extorsivo"}) == "secuestro"
    assert C.categoria({"Tipo de delito": "Homicidio", "Subtipo de delito": "Homicidio culposo", "Modalidad": "En accidente de tránsito"}) == "homicidio_culposo"
    assert C.categoria({"Tipo de delito": "Robo", "Subtipo de delito": "Robo a casa habitación"}) is None


def test_tendencia_de_varios_anios():
    anuales = {"homicidio_doloso": {"2019": 34722, "2025": 23612}, "otros_vida": {"2019": 10269, "2025": 17110}, "feminicidio": {"2019": 972, "2025": 736}}
    t = C.tendencias(anuales)
    hd = [x for x in t if x["baja"] == "homicidio_doloso"]
    assert len(hd) == 1 and hd[0]["sube"] == "otros_vida" and hd[0]["tipo"] == "tendencia" and hd[0]["cambio_baja_pct"] == -32.0 and hd[0]["absorbe_pct"] == 62
