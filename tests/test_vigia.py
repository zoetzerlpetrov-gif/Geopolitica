import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "seguridad"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "autoauditoria"))
import vigia as V  # noqa: E402

T = datetime(2026, 11, 19, 12, tzinfo=timezone.utc)
SANOS = [{"sitio": "GitHub Pages", "ok": True, "integro": True}, {"sitio": "dominusosint.com", "ok": False}]


def test_senales_de_cloudflare():
    calma = {"solicitudes_15m": 900, "promedio_15m": 800, "errores_5xx": 0, "pct_5xx": 0, "eventos_firewall": 3}
    assert V.senales_cloudflare(calma) == []
    pico = {**calma, "solicitudes_15m": 9000, "promedio_15m": 800}
    assert "Pico de tráfico" in V.senales_cloudflare(pico)[0]
    assert V.senales_cloudflare({**calma, "eventos_firewall": 500})
    assert V.senales_cloudflare({**calma, "pct_5xx": 40})


def test_modo_proteccion_y_calma():
    ataque = {"solicitudes_15m": 20000, "promedio_15m": 500, "errores_5xx": 0, "pct_5xx": 0, "eventos_firewall": 0}
    est, motivos, accion = V.decidir({}, SANOS, ataque, None, T)
    assert est["nivel"] == "ataque" and accion == "proteger"
    calma = {**ataque, "solicitudes_15m": 400}
    previo = {"proteccion": True, "ultima_senal_cf": (T - timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")}
    assert V.decidir(previo, SANOS, calma, None, T)[2] is None                 # aún no pasan 60 min
    previo["ultima_senal_cf"] = (T - timedelta(minutes=61)).strftime("%Y-%m-%dT%H:%M:%SZ")
    assert V.decidir(previo, SANOS, calma, None, T)[2] == "liberar"


def test_integridad_y_github():
    alterado = [{"sitio": "GitHub Pages", "ok": True, "integro": False}]
    est, motivos, _ = V.decidir({"racha_integridad": 1}, alterado, None, None, T)
    assert est["racha_integridad"] == 2 and not motivos                        # 2 corridas: puede ser la publicación en curso
    est, motivos, _ = V.decidir({"racha_integridad": 2}, alterado, None, None, T)
    assert "Posible alteración" in motivos[0]
    gh = {"commits_extranos": [{"sha": "abc", "autor": "otro"}], "alertas": {"secret_scanning": 1}}
    est, motivos, _ = V.decidir({}, SANOS, None, gh, T)
    assert est["nivel"] == "alerta" and len(motivos) == 2
    assert V.huella_index(b"<html>  \n</html>\n") == V.huella_index("<html>\n</html>")


def test_github_y_cloudflare_con_respuestas_simuladas():
    def pedir(url, metodo="GET", cuerpo=None, cabeceras=None):
        if "commits" in url:
            return 200, json.dumps([{"sha": "a" * 40, "author": {"login": "intruso"}, "commit": {"message": "cambio\nx"}}]).encode(), 10
        if "graphql" in url:
            z = {"ahora": [{"count": 100, "sum": {}}], "errores": [{"count": 1}], "base": [{"count": 9600}],
                 "fw": [{"count": 7, "dimensions": {"action": "block", "source": "waf", "clientCountryName": "XX", "clientAsn": 1}}]}
            return 200, json.dumps({"data": {"viewer": {"zones": [z]}}}).encode(), 10
        return 403, b"{}", 10
    gh = V.revisar_github("o/r", "t", "2026-11-19T00:00:00Z", pedir)
    assert gh["commits_extranos"][0]["autor"] == "intruso" and gh["alertas"]["code_scanning"] is None
    cf = V.analitica_cloudflare("t", "z", pedir, T)
    assert cf["promedio_15m"] == 100.0 and cf["eventos_firewall"] == 7 and cf["paises"] == [("XX", 7)]


def test_autoauditoria_nuevas_verificaciones():
    import autoauditoria as A
    cfg = json.load(open(os.path.join(os.path.dirname(__file__), "..", "config", "autoauditoria.json"), encoding="utf-8"))
    assert A.vigia_seguridad(cfg)["estado"] == "cumple"
    assert A.politica_seguridad(cfg)["estado"] == "cumple"
    assert A.datos_personales_publicos(cfg)["estado"] == "cumple"
    ejemplo = "APP" + "_USR-" + "1" * 16 + "-111111-abc"   # armado en partes para que el propio detector no lo marque aquí
    assert A.PATRONES_SECRETO.search(f"token {ejemplo}")
