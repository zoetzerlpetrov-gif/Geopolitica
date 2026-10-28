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


def test_c2intel_csv():
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "red"))
    import red as R
    txt = "#ip,ioc\n1.117.74.144,Possible Cobaltstrike C2 IP\n10.0.0.1,Possible Sliver C2 IP\nbasura\n"
    assert R.ips_c2intel(txt) == {"1.117.74.144": "Cobaltstrike", "10.0.0.1": "Sliver"}


def test_detalles_por_lotes_y_filas():
    vistos = []
    def consultar(q):
        vistos.append(q)
        return [{"e": {"value": WD + "Q160746"}, "eLabel": {"value": "Nestlé"}, "industriaLabel": {"value": "alimentos"}, "web": {"value": "https://nestle.com"}},
                {"e": {"value": WD + "Q39"}, "eLabel": {"value": "Suiza"}, "iso": {"value": "CH"}},
                {"e": {"value": WD + "Q1"}, "eLabel": {"value": "Nestlé México"}}]
    det = E.detalles(["Q160746", "Q39", "Q1", "Q1", ""], consultar)
    assert len(vistos) == 1 and "wd:Q160746" in vistos[0]
    filas = E.a_filas([("Q1", "Q160746", "Q39")], det)
    r = E.unir({"filial_en_mexico": filas})
    assert r[0]["matriz"] == "Nestlé" and r[0]["pais"] == "Suiza" and r[0]["iso"] == "CH" and r[0]["filial"] == "Nestlé México"
    assert r[0]["industrias"] == ["alimentos"]
    # sin presupuesto de tiempo no se consulta nada
    assert E.detalles(["Q1"], consultar, presupuesto_s=-1) == {}
