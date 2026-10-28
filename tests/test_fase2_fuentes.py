"""Interferencia GPS y franjas de eclipses (sin red)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "vivos"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "espacio"))
import eclipses as E  # noqa: E402
import gps_interferencia as G  # noqa: E402


def test_gps_niveles_y_filtro():
    csv_ = "hex,count_good_aircraft,count_bad_aircraft\nA,1,0\nB,90,10\nC,95,1\nD,2,3\nE,1,1\nF,2,2\n"
    feats = G.features(csv_, "2026-10-24", contorno=lambda h: [[0, 0], [1, 0], [1, 1], [0, 0]])
    por = {f["properties"]["hex"]: f["properties"] for f in feats}
    assert set(por) == {"B", "D"}  # A, E y F: menos de 5 aviones; C: menos de 2 %
    assert por["B"]["nivel"] == "medio" and por["B"]["pct"] == 10.0
    assert por["D"]["nivel"] == "alto"
    assert G.ultima_fecha("date,suspect,num_bad_aircraft_hexes,source\n2026-10-23,false,612,merged\n2026-10-24,true,637,merged\n") == "2026-10-23"


def test_eclipse_franja_y_decada():
    pagina = """<pre>
 Limits  28 48.0N 044 56.6W  27 07.3N 044 01.4W  27 57.7N 044 28.6W  1.060   0   -  206  03m06.1s
 08:26   30 43.3N 038 53.6W  30 02.1N 034 13.5W  30 29.3N 036 14.0W  1.063   8  74  213  03m24.6s
 08:28   32 46.2N 031 35.0W  31 24.5N 028 47.4W  32 07.1N 030 05.4W  1.065  14  77  218  03m39.9s
</pre>"""
    n, s, c = E.franja(pagina)
    assert len(n) == len(s) == len(c) == 3
    assert abs(n[1][0] + 38.893) < 0.01 and abs(n[1][1] - 30.722) < 0.01
    fila = ('<tr><td><a href="x">2027 Aug 02</a></td><td>10:07:50</td><td><a>Total</a></td><td>136</td><td>0.142</td>'
            '<td><a href="../SEpath/SEpath2001/SE2027Aug02Tpath.html">06m23s</a></td><td>Africa, Europe <br /><strong>[Total: Spain, Egypt]</strong></td></tr>')
    e = E.filas_decada(fila, "sol")[0]
    assert e["fecha"] == "2027-08-02" and e["tipo"] == "total" and e["duracion"] == "06m23s"
    assert e["franja_url"].endswith("SEpath/SEpath2001/SE2027Aug02Tpath.html") and "(Total: Spain, Egypt)" in e["region"]
