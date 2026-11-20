"""Resumen que se manda al Tablero de pruebas (tools/e2e/enviar_pruebas.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "e2e"))
import enviar_pruebas as E  # noqa: E402


def test_cuenta_pytest_y_node():
    assert E.contar_pytest("....\n2 failed, 910 passed, 1 error in 13.1s\n") == (910, 3)
    assert E.contar_pytest("912 passed in 13.1s") == (912, 0)
    assert E.contar_node("# tests 790\n# pass 784\n# fail 6\n") == (784, 6)
    assert E.contar_pytest("") == (0, 0)


def test_resumen_por_rol_cuenta_graves_y_lista_problemas():
    informe = {"resultados": [{
        "rol": "demo", "arranque_s": 12, "errores": [{"tipo": "js", "msg": "x is undefined"}, {"tipo": "datos", "msg": "HTTP 404"}],
        "capas": [{"nombre": "Sismos", "resultado": "12"}, {"nombre": "Trenes", "resultado": "sin datos"}],
        "imagenes": [{"id": "viirs", "quedo_al_quitar": ["img-viirs"], "quedo_al_quitar_rapido": []}],
        "paginas": [{"pagina": "reporte.html", "http": 200, "errores": []}, {"pagina": "planes.html", "http": 500, "errores": []}],
        "solo_admin_visible": [], "parpadeo_candados": 9,
        "comprobaciones": [{"nombre": "Tema", "ok": True}, {"nombre": "Mejorar plan", "ok": False, "detalle": "no abre"}]}]}
    c = E.construir(informe, "912 passed in 1s", "# pass 784\n# fail 0")
    r = c["roles"][0]
    assert (r["js"], r["pegadas"], r["paginas_mal"], r["vacias"]) == (1, 1, 1, 1)
    assert r["grave"] == 1 + 1 + 1 + 1 + 1  # JS, imagen, página, comprobación y parpadeo
    assert any("Mejorar plan" in p for p in r["problemas"]) and any("aviso" in p for p in r["problemas"])
    assert c["unitarias"] == {"python": {"pasan": 912, "fallan": 0}, "js": {"pasan": 784, "fallan": 0}}
