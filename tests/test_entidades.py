import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "mexico"))
import entidades as E  # noqa: E402

DOF = {"dias": {"2025-01-21": [["5747000", "Decreto", "PODER EJECUTIVO", "Decreto por el que se ordena la desincorporación por fusión de Seguridad Alimentaria Mexicana con Diconsa, S.A. de C.V."]],
                "2026-10-21": [["5801837", "Aviso", "SECRETARÍA DE ENERGÍA", "Aviso de licitación de la Comisión Federal de Electricidad"]]}}


def test_dof_menciones_y_cambios_societarios():
    seg = E.eventos_dof(DOF, {"nombre": "Segalmex", "alias": ["Seguridad Alimentaria Mexicana"]})
    assert len(seg) == 1 and seg[0]["tipo"] == "cambio societario"
    assert seg[0]["url"] == "https://dof.gob.mx/nota_detalle.php?codigo=5747000&fecha=21/01/2025"
    cfe = E.eventos_dof(DOF, {"nombre": "CFE", "alias": ["Comisión Federal de Electricidad", "CFE"]})
    assert cfe[0]["tipo"] == "acto oficial"
    assert E.eventos_dof(DOF, {"nombre": "Tren Maya", "alias": ["Tren Maya"]}) == []


def test_fragmentos_de_la_sec():
    t = ("Since July 2023, our subsidiary acquires oil. Effective March 31, 2026, Gasolinas Bienestar, S.A. de C.V. was renamed "
         "Servicios Logísticos Integrales Mumiya, S.A. de C.V. The weather was renamed nothing.")
    f = E.fragmentos_renombre(t)
    assert len(f) == 1 and "Gasolinas Bienestar" in f[0]


def test_ruido_gleif_y_filiales():
    assert E.ruido_gleif({"field": "/lei:Entity/lei:LegalName/@xml:lang", "valueOld": "en", "valueNew": "es"})
    assert E.ruido_gleif({"field": "/lei:Registration/lei:RegistrationStatus", "valueOld": "PENDING_TRANSFER", "valueNew": "ISSUED"})
    assert not E.ruido_gleif({"field": "/lei:Registration/lei:RegistrationStatus", "valueOld": "ISSUED", "valueNew": "LAPSED"})
    assert not E.ruido_gleif({"field": "/lei:Entity/lei:LegalName", "valueOld": "PETROLEOS MEXICANOS", "valueNew": "PETROLEOS MEXICANOS EPE"})
    nuevas, salen = E.cambios_filiales([("A", "Uno", "MX"), ("B", "Dos", "MX")], [("B", "Dos", "MX"), ("C", "Tres", "IE")])
    assert [n[0] for n in nuevas] == ["C"] and [s[0] for s in salen] == ["A"]


def test_cruce_69b_sin_sufijos():
    efos = {"filas": [["XAXX010101000", "COMERCIALIZADORA EJEMPLO, S.A. DE C.V.", "Definitivo"]]}
    hits = E.cruce_69b(["Comercializadora Ejemplo SA de CV", "Otra Empresa"], efos)
    assert len(hits) == 1 and hits[0]["tipo"] == "lista 69-B" and "verificar RFC" in hits[0]["estado"]
    assert E.norm_razon("PETROLEOS MEXICANOS EPE") == E.norm_razon("Petróleos Mexicanos")


def test_repetidos_y_nuevos():
    a = {"fuente": "SEC EDGAR", "fecha": "2026-09-08", "detalle": "…X was renamed Y, S.A. de C.V.…", "id": "sec-1-0", "tipo": "cambio de razón social"}
    b = {**a, "fecha": "2026-06-22", "id": "sec-2-0"}
    assert [e["id"] for e in E.sin_repetidos([b, a])] == ["sec-1-0"]
    ev = E.marcar_nuevos([{"id": "x"}, {"id": "y"}], [{"id": "x", "visto_desde": "2026-11-01"}], "2026-11-19")
    assert ev[0]["nuevo"] is False and ev[1]["nuevo"] is True and ev[1]["visto_desde"] == "2026-11-19"
