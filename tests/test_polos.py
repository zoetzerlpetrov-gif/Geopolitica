"""Polos: lectores de NOAA NCEI (hielo marino), NASA Ozone Watch, DMI (Groenlandia), USNIC (icebergs), Wikidata y OVATION.
Los textos de ejemplo son fragmentos reales de cada archivo (formato de octubre de 2026)."""
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "polos"))
import polos as P  # noqa: E402

NCEI_N9 = """September Northern Hemisphere Sea Ice Extent (1979-2026)
Units,million square km
1991-2020 Mean,5.58
Decadal Trend,-0.73
Date,Value,Anomaly
1979,7.05,1.47
2012,3.57,-2.01
2020,4.00,-1.58
2025,4.75,-0.83
2026,4.81,-0.77
"""

OZONO = """Name: Ozone Hole Area
Units: Million km!U2!N
Date            Data   Minimum     10%     30%    Mean     70%     90% Maximum
2026-06-30      0.00      0.00    0.00    0.00    0.00    0.00    0.00    0.00
2026-09-20     26.10      0.27    7.99   17.01   20.64   22.06   23.66   27.98
2026-10-10     25.14      0.27    7.99   17.01   17.64   22.06   23.66   27.98
2026-10-11     24.47      0.11    8.05   16.85   17.41   21.98   23.74   27.44
2026-10-12   -9999.0      0.00    8.39   16.85   17.16   21.47   23.50   26.71
"""

GSMB = """Polar Portal
Date      SMB(Gt/day)  SMBacc(Gt)
20260920      1.846        53.6
20260921      1.881        55.5
"""
MELTA = """20260920    0.050 %
20260921    0.062 %
20260922    0.051 %
20260909    0.178 %
20260910    0.146 %
"""

USNIC = """﻿Iceberg,Length (NM),Width (NM),Latitude,Longitude,Area (sqMI),Area (sqNM),Area (sqKM),Last Update
A81,28,25,-55.0,-40.54,518.07,391.20,1341.79,10/09/2026
D15A,51,22,-66.63,81.92,1172.77,885.59,3037.47,10/09/2026
roto,x,1,2,3,4,5,6,7
"""


def test_hielo_marino_mensual_ncei():
    d = P.hielo_de(NCEI_N9, 9)
    assert (d["anio"], d["valor"], d["anomalia"], d["media_1991_2020"]) == (2026, 4.81, -0.77, 5.58)
    assert d["mes"] == "septiembre" and d["record_minimo"] == [2012, 3.57]
    assert d["lugar_mas_bajo"] == 4  # 2012, 2020, 2025 y luego 2026
    urls = []
    out = P.hielo(datetime(2026, 10, 15, tzinfo=timezone.utc), lambda u: urls.append(u) or NCEI_N9)
    assert urls[0].endswith("/N/9.csv") and urls[1].endswith("/S/9.csv")
    assert out["artico"]["valor"] == 4.81 and "NCEI" in out["fuente"]


def test_hielo_marino_usa_dos_meses_atras_si_el_ultimo_aun_no_se_publica():
    urls = []
    sin_2026 = NCEI_N9.replace("2026,4.81,-0.77\n", "")
    out = P.hielo(datetime(2026, 11, 2, tzinfo=timezone.utc), lambda u: urls.append(u) or (sin_2026 if u.endswith("/10.csv") else NCEI_N9))  # octubre aún sin 2026 → septiembre
    assert out["artico"]["anio"] == 2026 and out["artico"]["url"].endswith("/N/9")
    assert [u.rsplit("/", 2)[-2:] for u in urls[:2]] == [["N", "10.csv"], ["N", "9.csv"]]


def test_ozono_ultimo_dato_valido_y_maximo_del_anio():
    d = P.ozono_de(OZONO)
    assert (d["fecha"], d["area"], d["media"]) == ("2026-10-11", 24.47, 17.41)
    assert (d["maximo_anio"], d["fecha_maximo"]) == (26.10, "2026-09-20")
    assert d["serie"][-1] == ["2026-10-12", None, 17.16, 8.39, 23.50]  # días futuros: solo la climatología
    assert d["serie"][0][0] == "2026-09-20"  # la gráfica empieza en julio (junio queda fuera)


def test_groenlandia_balance_y_deshielo_solo_primer_bloque():
    d = P.groenlandia_de(GSMB, MELTA)
    assert (d["fecha"], d["smb_dia_gt"], d["smb_acum_gt"]) == ("2026-09-21", 1.881, 55.5)
    assert (d["deshielo_fecha"], d["deshielo_pct"]) == ("2026-09-22", 0.051)
    assert len(d["deshielo_serie"]) == 3


def test_icebergs_usnic():
    f = P.icebergs_de(USNIC)
    assert [x["properties"]["nombre"] for x in f] == ["A81", "D15A"]
    p = f[1]["properties"]
    assert f[1]["geometry"]["coordinates"] == [81.92, -66.63]
    assert (p["largo_km"], p["ancho_km"], p["area_km2"], p["actualizado"]) == (94.5, 40.7, 3037, "2026-10-09")


def test_bases_polares_y_sitios_de_groenlandia_con_respaldo():
    fila = lambda q, nombre, lon, lat, pais="": {"x": {"value": f"http://www.wikidata.org/entity/{q}"}, "xEs": {"value": nombre},
                                                 "coord": {"value": f"Point({lon} {lat})"}, **({"paisEs": {"value": pais}} if pais else {})}
    filas = [fila("Q498627", "Estación McMurdo", 166.668, -77.848, "Estados Unidos"), fila("Q9", "Estación tropical", -99, 19),
             fila("Q1368174", "Base Esperanza", -56.998, -63.397, "Argentina"), fila("Q10", "Estación Ártica", 11.9, 78.9)]
    bases = P.estaciones_de({"results": {"bindings": filas}})
    assert [b["properties"]["nombre"] for b in bases] == ["Estación McMurdo", "Base Esperanza", "Estación Ártica"]
    assert bases[0]["properties"]["region"] == "Antártida" and bases[2]["properties"]["region"] == "Ártico"
    entidad = lambda q: {"entities": {q: {"claims": {"P625": [{"mainsnak": {"datavalue": {"value": {"latitude": 76.531, "longitude": -68.703}}}}]}}}}
    P.time.sleep = lambda s: None
    feats, estado = P.sitios({}, lambda q: {"results": {"bindings": filas * 10}}, entidad)
    assert estado["groenlandia"] == len(P.GROENLANDIA)
    pituffik = [f for f in feats if f["properties"]["id"] == "wd:Q131520504"][0]
    assert pituffik["geometry"]["coordinates"] == [-68.703, 76.531] and pituffik["properties"]["kind"] == "base"
    # Wikidata falla: se conservan los objetos anteriores.
    def falla(q):
        raise RuntimeError("429")
    feats2, estado2 = P.sitios({"features": feats}, falla, lambda q: (_ for _ in ()).throw(RuntimeError("caído")))
    assert len(feats2) == len(feats) and str(estado2["bases"]).startswith("error")


def test_aurora_ovation_filtra_y_corrige_longitud():
    fc = P.aurora_de({"Observation Time": "2026-10-15T04:34:00Z", "coordinates": [[0, 67, 5], [200, 65, 30], [10, -70, 12]]})
    assert [f["geometry"]["coordinates"] for f in fc["features"]] == [[-160, 65], [10, -70]]
    assert fc["features"][0]["properties"]["p"] == 30


def test_ritmo_por_parte():
    assert P.toca({}, "ozono", 1000)
    assert not P.toca({"ozono": {"t": 1000}}, "ozono", 1000 + 3600)
    assert P.toca({"ozono": {"t": 1000}}, "ozono", 1000 + 6 * 3600)
