"""Empresas extranjeras en México (tools/investigacion/extranjeras_mx.py), sin red."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "investigacion"))
import extranjeras_mx as E  # noqa: E402

WD = "http://www.wikidata.org/entity/"


def fila(**k):
    return {c: {"value": v} for c, v in k.items()}


def test_unir_sin_duplicados_y_con_vias():
    filas = {
        "filial_en_mexico": [
            fila(filial=WD + "Q1", filialLabel="Nestlé México", matriz=WD + "Q160746", matrizLabel="Nestlé", paisLabel="Suiza", iso="CH", industriaLabel="alimentos"),
            fila(filial=WD + "Q1", filialLabel="Nestlé México", matriz=WD + "Q160746", matrizLabel="Nestlé", paisLabel="Suiza", iso="CH", industriaLabel="bebidas", web="https://www.nestle.com"),
        ],
        "declara_filial": [fila(filial=WD + "Q1", filialLabel="Nestlé México", matriz=WD + "Q160746", matrizLabel="Nestlé", paisLabel="Suiza", iso="CH")],
        "opera_en_mexico": [
            fila(matriz=WD + "Q160746", matrizLabel="Nestlé", paisLabel="Suiza", iso="CH"),  # ya tiene filial: se omite
            fila(matriz=WD + "Q53268", matrizLabel="Toyota", paisLabel="Japón", iso="JP", industriaLabel="Q123"),
            fila(matriz=WD + "Q99", matrizLabel="Q99", paisLabel="X", iso="XX"),  # sin etiqueta legible
        ],
    }
    r = E.unir(filas)
    assert [x["matriz"] for x in r] == ["Nestlé", "Toyota"]
    n = r[0]
    assert n["filial"] == "Nestlé México" and n["industrias"] == ["alimentos", "bebidas"]
    assert n["vias"] == ["filial_en_mexico", "declara_filial"] and n["web"] == "https://www.nestle.com"
    assert r[1]["filial"] == "" and r[1]["industrias"] == []  # una industria sin etiqueta (Q123) no se guarda


def test_consultas_excluyen_matrices_mexicanas():
    for q in E.CONSULTAS.values():
        assert "FILTER(?pais != wd:Q96)" in q and "LIMIT" in q


def test_threatfox_api_sin_llave_y_con_respuesta():
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "red"))
    import red as R
    ok = {"query_status": "ok", "data": [{"threat_type": "botnet_cc", "ioc_type": "ip:port", "ioc_value": "1.2.3.4:443", "malware_printable": "Cobalt Strike"},
                                         {"threat_type": "payload_delivery", "ioc_type": "url", "ioc_value": "http://5.6.7.8/x"}]}
    assert R.ips_threatfox_api(ok) == {"1.2.3.4": "Cobalt Strike"}
    assert R.ips_threatfox_api({"query_status": "no_result"}) == {}
