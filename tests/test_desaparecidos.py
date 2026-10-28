"""Capa de personas desaparecidas y fosas (tools/crimen/desaparecidos.py), sin red."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "crimen"))
import desaparecidos as D  # noqa: E402

LUGAR = lambda t: (-103.35, 20.67, "Guadalajara, Jalisco", "MEX", "ciudad")  # noqa: E731


def test_clasificar():
    casos = {
        "Hallan fosa clandestina con 12 cuerpos en Tlajomulco": "fosa",
        "Madres buscadoras localizan restos en un predio de Hermosillo": "fosa",
        "Colectivo de madres buscadoras inicia jornada de búsqueda en Sonora": "busqueda",
        "Identifican restos hallados en crematorio clandestino de Teuchitlán": "fosa",
        "Jalisco tiene 15 mil cuerpos sin identificar, reconoce la fiscalía": "identificacion",
        "Desaparece joven de 17 años en Zapopan; familia pide ayuda": "desaparicion",
        "Mass grave found near Kharkiv": "fosa",
        "Desaparecen los fondos del programa social en Puebla": None,
        "El avión desaparecido sobre el Índico, diez años después": None,
    }
    for t, esperado in casos.items():
        assert D.clasificar(t) == esperado, t


def test_casos_individuales_sin_titulo():
    f = D.de_titular("Desaparece Juan Pérez de 17 años en Zapopan", "https://medio.mx/1", "Medio", "2026-10-28T10:00:00Z", LUGAR, "RSS")
    p = f["properties"]
    assert "Juan" not in p["title"] and p["titulo_omitido"] and p["url"] == "https://medio.mx/1"
    g = D.de_titular("Hallan fosa clandestina en Tlajomulco", "https://medio.mx/2", "Medio", "2026-10-28T10:00:00Z", LUGAR, "RSS")
    assert g["properties"]["title"].startswith("Hallan fosa") and not g["properties"]["titulo_omitido"]
    pais = lambda t: (-102, 23, "México", "MEX", "país")  # noqa: E731
    assert D.de_titular("Hallan fosa clandestina en el país", "https://x/3", "M", "2026-10-28T10:00:00Z", pais, "RSS") is None
