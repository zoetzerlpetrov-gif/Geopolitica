"""Noticiero DOMINUS (tools/noticiero/noticiero.py), sin red."""
import json
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "noticiero"))
import noticiero as N  # noqa: E402

CFG = json.load(open(os.path.join(os.path.dirname(__file__), "..", "config", "noticiero.json"), encoding="utf-8"))
REGLAS = N.reglas_de(CFG)
AHORA = datetime(2026, 10, 21, 12, tzinfo=timezone.utc)


def nota(u, t, f="2026-10-21T10:00:00Z", s=("geopolitica",), via="gdelt"):
    return {"t": t, "u": u, "m": "medio.com", "tipo": "", "f": f, "img": "", "s": list(s), "via": via}


def test_config_tiene_30_secciones_con_regex_valida_y_feeds_https():
    assert len(CFG["secciones"]) == 30
    assert len({s["id"] for s in CFG["secciones"]}) == 30
    for s in CFG["secciones"]:
        assert s["titulo"] and s["palabras"]
        re.compile(s["palabras"]), re.compile(s.get("gkg", ""))
        for f in s.get("feeds", []):
            assert f["url"].startswith("https://") and f["nombre"] and f["tipo"]


def test_gdelt_solo_en_secciones_con_gkg_y_con_limite_de_palabra():
    assert N.secciones_de("Gold prices hit record as central banks keep buying", "x.com", REGLAS) == ["oro"]
    # Antes entraban medallas de oro y «Together» (por «ether»).
    assert N.secciones_de("India wins gold medal at Asian Para Games", "x.com", REGLAS) == []
    assert N.secciones_de("Babies in Bloom brings Roanoke together", "x.com", REGLAS) == []
    assert "bonos" in N.secciones_de("Tasa de Cetes a 28 días baja a 6.2%", "x.com", REGLAS)
    # Geopolítica no usa GDELT (sus feeds bastan).
    assert "geopolitica" not in N.secciones_de("Putin agrees to resume talks on Ukraine war", "x.com", REGLAS)
    # Política de México: solo medios .mx; boletines de prensa fuera.
    assert "politica_mx" in N.secciones_de("Morena aprueba reforma judicial en el Senado", "eluniversal.com.mx", REGLAS)
    assert "politica_mx" not in N.secciones_de("Morena aprueba reforma judicial en el Senado", "infobae.com", REGLAS)
    excluir = re.compile(CFG["gkg_excluir_dominio"])
    assert N.secciones_de("Gold prices hit record high", "prnewswire.com", REGLAS, excluir) == []


def test_nota_gkg_toma_titulo_fecha_y_descarta_cortos():
    fila = [""] * 27
    fila[1], fila[3], fila[4] = "20261021103000", "reuters.com", "https://reuters.com/a"
    fila[26] = "<PAGE_TITLE>Copper prices climb as Chile mine output falls this week</PAGE_TITLE>"
    n = N.nota_gkg(fila, REGLAS)
    assert n["f"] == "2026-10-21T10:30:00Z" and n["s"] == ["metales"] and n["via"] == "gdelt" and n["m"] == "reuters.com"
    fila[26] = "<PAGE_TITLE>Copper prices</PAGE_TITLE>"
    assert N.nota_gkg(fila, REGLAS) is None


def test_feed_compartido_reparte_por_palabras_y_feed_unico_aporta_todo():
    items = [{"titulo": "Gold hits record as central banks buy", "url": "https://m/1", "fuente": "Mining", "tipo_fuente": "t", "fecha_utc": "2026-10-21T09:00:00Z"},
             {"titulo": "Una nota cualquiera de la revista", "url": "https://m/2", "fuente": "Mining", "tipo_fuente": "t", "fecha_utc": "2026-10-21T09:00:00Z"}]
    compartido = N.notas_de_feed(items, ["oro", "infantil"], REGLAS)
    assert len(compartido) == 1 and compartido[0]["s"] == ["oro"]
    assert len(N.notas_de_feed(items, ["oro"], REGLAS)) == 2


def test_unir_deduplica_conserva_72h_y_limita_por_seccion():
    nuevos = [nota("https://a/1", "Misiles sobre la frontera norte de Israel"),
              nota("https://b/1", "Misiles sobre la frontera norte de Israel", s=("organismos",), via="rss"),
              nota("https://a/2", "Nota vieja de hace cuatro días", f="2026-10-17T10:00:00Z")]
    out = N.unir([], nuevos, AHORA)
    assert len(out) == 1 and out[0]["via"] == "rss" and set(out[0]["s"]) == {"geopolitica", "organismos"}
    muchas = [nota(f"https://c/{i}", f"Titular número {i} de la guerra", f=f"2026-10-21T{i % 10:02d}:{i:02d}:00Z") for i in range(50)]
    out = N.unir([], muchas, AHORA, maximo=5)
    assert len(out) == 5 and out[0]["f"] >= out[-1]["f"]


def test_feed_general_de_una_sola_seccion_se_filtra_por_palabras():
    items = [{"titulo": "Trufas de chocolate, mezcal y naranja: receta fácil para preparar en casa", "url": "https://i/1", "fuente": "Infobae México",
              "tipo_fuente": "t", "fecha_utc": "2026-11-12T09:00:00Z"},
             {"titulo": "ASF detecta desvío de recursos y empresas fantasma en contratos de Segalmex", "url": "https://i/2", "fuente": "Infobae México",
              "tipo_fuente": "t", "fecha_utc": "2026-11-12T09:00:00Z"}]
    assert [n["u"] for n in N.notas_de_feed(items, ["politica_mx"], REGLAS, filtrar=True)] == ["https://i/2"]
    pol = next(s for s in CFG["secciones"] if s["id"] == "politica_mx")
    assert any("contralacorrupcion.mx" in f["url"] for f in pol["feeds"])
    assert next(f for f in pol["feeds"] if f["nombre"] == "Infobae México").get("filtrar") is True


def test_notas_guardadas_de_feeds_generales_tambien_se_filtran():
    previos = [{"t": "Trufas de chocolate: receta fácil", "u": "u1", "m": "Infobae México", "f": "2026-11-12T09:00:00Z", "s": ["politica_mx"], "via": "rss"},
               {"t": "Sheinbaum presenta reforma electoral", "u": "u2", "m": "Infobae México", "f": "2026-11-12T09:00:00Z", "s": ["politica_mx"], "via": "rss"},
               {"t": "Receta de pozole", "u": "u3", "m": "Otro medio", "f": "2026-11-12T09:00:00Z", "s": ["gastronomia_viajes"], "via": "rss"}]
    assert [n["u"] for n in N.refiltrar(previos, CFG, REGLAS)] == ["u2", "u3"]
