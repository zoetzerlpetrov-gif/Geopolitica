import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "marketing"))
import contenido as C  # noqa: E402
import metricas_youtube as M  # noqa: E402

DATOS = {
    "contraste_mx": {"comercio": {"meses": {"202605": {"total": 2375.8, "eua": 353.5, "sin_pais": 1961.6, "sin_pais_pct": 82.6, "banxico_petroleras": 2389.2}}},
                     "seguridad": {"pagina": "https://www.gob.mx/sesnsp", "senales": [{"baja": "homicidio_doloso", "sube": "feminicidio", "cambio_baja_pct": -18.6, "cambio_sube_pct": 141.6, "periodo": "enero a septiembre 2026 vs 2025"}]}},
    "pemex_cuba": {"periodos": [{"periodo": "Año 2025", "crudo_kbd": 15.0, "petroliferos_kbd": 2.2, "usd_millones": 500.0, "forma": "20-F", "presentado": "2026-04-30", "fuente": "https://www.sec.gov/a.htm"}]},
    "co2": {"series": {"mauna_loa": {"mes": "2026-09", "ppm": 426.07, "aumento_ppm": 1.7, "mes_anterior": "2025-09"}}},
    "monitor_mx": {"alertas": []},
    "cisnes": {"eventos": [{"nombre": "Pandemia", "nivel": "elevado", "menciones_72h": 4, "prob_base_12m": 0.02, "fuentes": [["Marani 2021", "https://doi.org/x"]]}]},
}
CFG = {"sitio": "https://dominusosint.com/", "evergreen": [{"pilar": "herramienta", "titulo": "¿Ese enlace es seguro?", "texto": "Pégalo en el verificador.", "ruta": "#b-herr-enlace", "hashtags": ["Fraude"]}]}
HOY = datetime(2026, 11, 18, tzinfo=timezone.utc)


def test_borradores_con_cifra_fuente_y_limites():
    bs = C.generar(CFG, DATOS, HOY)
    temas = [b["tema"] for b in bs]
    assert temas[:2] == ["comercio_sin_pais", "pemex_cuba"] and "co2_mauna_loa" in temas and "cisne" in temas
    assert "monitor_mx" not in temas                         # sin alertas no hay borrador
    com = bs[0]
    assert "82.6 %" in com["titular"] and com["fuente"].startswith("UN Comtrade")
    for b in bs:
        x = b["textos"]["x"]
        largo = len(x) - sum(len(u) - 23 for u in x.split() if u.startswith("http"))
        assert largo <= 280, (b["tema"], largo)
        assert len(b["textos"]["bluesky"]) <= 300
        assert "utm_source=x" in x and "https://dominusosint.com/" in x
    assert "Marani 2021" == [b for b in bs if b["tema"] == "cisne"][0]["fuente"]
    assert bs[-1]["textos"]["x"].rstrip().endswith("#Fraude") and "#b-herr-enlace" in bs[-1]["textos"]["x"]


def test_combinar_conserva_30_dias():
    viejo = {"id": "20261001-co2", "fecha": "2026-10-01", "tema": "co2"}
    reciente = {"id": "20261117-co2", "fecha": "2026-11-17", "tema": "co2"}
    nuevo = {"id": "20261118-co2", "fecha": "2026-11-18", "tema": "co2"}
    out = C.combinar([viejo, reciente], [nuevo], HOY)
    assert [b["id"] for b in out] == ["20261118-co2", "20261117-co2"]


def test_metricas_youtube():
    c = M.resumen_canal({"snippet": {"title": "Canal"}, "statistics": {"subscriberCount": "12", "viewCount": "340", "videoCount": "9"}})
    assert c == {"suscriptores": 12, "vistas": 340, "videos": 9, "titulo": "Canal"}
    assert M.resumen_canal({"statistics": {"hiddenSubscriberCount": True}})["suscriptores"] is None
    v = M.videos_de([{"id": "a", "snippet": {"title": "A", "publishedAt": "2026-11-17T10:00:00Z"}, "statistics": {"viewCount": "5"}, "status": {"privacyStatus": "private"}},
                     {"id": "b", "snippet": {"title": "B", "publishedAt": "2026-11-18T10:00:00Z"}, "statistics": {}, "status": {"privacyStatus": "public"}}])
    assert [x["id"] for x in v] == ["b", "a"] and v[1]["vistas"] == 5
    h = M.agregar_historial([{"fecha": "2026-11-18", "vistas": 1}], "2026-11-18", c, v)
    assert len(h) == 1 and h[0]["vistas"] == 340 and h[0]["publicos"] == 1
