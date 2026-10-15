"""Lugares de culto de OSM por religión: clasificación y descarga por cajas con rotación (sin red)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "capas"))
import culto as K  # noqa: E402


def test_subtipo_por_religion_y_denominacion():
    assert K.subtipo({"religion": "christian", "denomination": "roman_catholic"}) == "pc_catolicismo"
    assert K.subtipo({"religion": "christian", "denomination": "greek_catholic"}) == "pc_catolicismo"
    assert K.subtipo({"religion": "christian", "denomination": "orthodox"}) == "pc_cristianismo"
    assert K.subtipo({"religion": "christian"}) == "pc_cristianismo"
    casos = {"muslim": "pc_islam", "jewish": "pc_judaismo", "hindu": "pc_hinduismo", "buddhist": "pc_budismo", "shinto": "pc_sintoismo",
             "sikh": "pc_sijismo", "taoist": "pc_taoismo", "jain": "pc_jainismo", "bahai": "pc_bahai", "satanism": "pc_ocultismo",
             "pagan": "pc_paganismo", "voodoo": "pc_afro_espiritismo", "spiritualist": "pc_afro_espiritismo", "unitarian_universalist": "pc_otras"}
    for rel, st in casos.items():
        assert K.subtipo({"religion": rel}) == st, rel
    assert K.subtipo({}) == "pc_otras"


def test_filas_compactas_sin_datos_de_personas():
    els = [{"type": "node", "id": 1, "lat": 19.43, "lon": -99.13, "tags": {"amenity": "place_of_worship", "religion": "christian",
            "denomination": "roman_catholic", "name": "Catedral", "phone": "555", "operator": "x"}},
           {"type": "way", "id": 2, "center": {"lat": 1, "lon": 2}, "tags": {"religion": "muslim"}},
           {"type": "relation", "id": 3, "tags": {}}]  # sin coordenada
    assert K.filas(els) == [["n1", -99.13, 19.43, "pc_catolicismo", "Catedral", "roman_catholic"], ["w2", 2, 1, "pc_islam", "", ""]]


def test_rotacion_parte_cajas_pesadas_y_conserva_lo_descargado(tmp_path):
    cajas = K.Cajas(str(tmp_path))
    assert len(cajas.estado) == 96
    primera = cajas.pendientes()[0]

    def consultar(q):
        if f"({primera.replace(',', ',')})" in q.replace(".0", "").replace(" ", ""):
            raise RuntimeError("demasiado pesada")
        return [{"type": "node", "id": 9, "lat": 0, "lon": 0, "tags": {"religion": "jewish"}}]
    hechas, partidas, errores = K.actualizar(cajas, consultar, plazo_s=5, ahora="2026-10-15T00:00:00Z", pausa=0)
    assert partidas == 1 and primera not in cajas.estado and len(cajas.estado) == 99
    assert hechas > 0 and all(f[3] == "pc_judaismo" for f in cajas.todas())
    # Otra instancia lee el mismo estado (se conserva entre corridas).
    assert K.Cajas(str(tmp_path)).completas()[0] == cajas.completas()[0]


def test_al_dia_solo_cuando_todas_las_cajas_son_recientes(tmp_path):
    from datetime import datetime, timezone
    cajas = K.Cajas(str(tmp_path))
    assert not cajas.al_dia()
    hoy = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for k in cajas.estado:
        cajas.estado[k]["t"] = hoy
    assert cajas.al_dia()
    next(iter(cajas.estado.values()))["t"] = "2020-01-01T00:00:00Z"
    assert not cajas.al_dia()
