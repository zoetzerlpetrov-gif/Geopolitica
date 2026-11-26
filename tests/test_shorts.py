"""Shorts temáticos de YouTube (tools/shorts): paletas legibles, tema rotativo, filtros de titulares y subida privada."""
import json
import os
import sys
from datetime import datetime, timezone

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(RAIZ, "tools", "shorts"))
import paletas as P  # noqa: E402
import shorts as S  # noqa: E402
import subir_short as U  # noqa: E402

AHORA = datetime(2026, 11, 26, 18, tzinfo=timezone.utc)


def nota(t, m="Medio A", s="gastronomia_viajes", f="2026-11-26T10:00:00Z", u="https://ejemplo.mx/n"):
    return {"t": t, "m": m, "s": [s], "f": f, "u": u}


def test_paletas_legibles_y_rotan():
    for p in P.PALETAS:
        assert P.contraste(p["tinta"], p["fondo"]) >= 7, p["nombre"]
        assert P.contraste(p["fondo"], p["acento"]) >= 4.5, p["nombre"]
    nombres = {P.paleta_del_dia(f"2026-11-{d:02d}")["nombre"] for d in range(1, 9)}
    assert len(nombres) == len(P.PALETAS)
    assert P.paleta_del_dia("2026-11-26")["nombre"] != P.paleta_del_dia("2026-11-26", desfase=3)["nombre"]


def test_temas_configurados_y_rotacion():
    cfg = S.config()
    secciones = [t["seccion"] for t in cfg["temas"]]
    assert len(secciones) == len(set(secciones)) >= 10
    assert all(t.get("icono") and t.get("gancho") and t.get("hashtags") for t in cfg["temas"])
    dias = {S.tema_del_dia(cfg["temas"], f"2026-11-{d:02d}")["seccion"] for d in range(1, 15)}
    assert len(dias) == len(cfg["temas"])
    assert S.tema_del_dia(cfg["temas"], "2026-11-26", "clima")["seccion"] == "clima"


def test_titulares_en_espanol_sin_tragedias_en_temas_ligeros_y_medios_distintos():
    n = {"notas": [
        nota("Adulto mayor muere atragantado en restaurante de Monterrey", "MVS", u="https://a.mx/1"),
        nota("Extorsiones en aeropuerto de Los Cabos alertan a turistas", "MVS", u="https://a.mx/2"),
        nota("The best tacos in town are here and now", "Inglés", u="https://a.mx/3"),
        nota("El Museo de Antropología encabeza una lista de destinos para viajar", "Medio A", u="https://a.mx/4"),
        nota("Oaxaca prepara su feria del mezcal con 200 productores", "Medio A", u="https://a.mx/5"),
        nota("Nueva ruta aérea conecta Mérida con Bogotá desde diciembre", "Medio B", u="https://a.mx/6"),
        nota("Chefs mexicanos ganan premio en la guía de restaurantes de este año", "Medio C", u="https://a.mx/7"),
        nota("Campeche abre temporada de avistamiento de flamencos en la costa", "Medio D", u="https://a.mx/8"),
        nota("Puebla presenta su calendario de festivales gastronómicos del invierno", "Medio E", u="https://a.mx/9"),
    ]}
    items = S.elegir_titulares(n, "gastronomia_viajes", 3, ahora=AHORA, ligero=True)
    titulos = " ".join(i["titulo"] for i in items)
    assert len(items) == 3 and "muere" not in titulos and "Extorsiones" not in titulos and "tacos" not in titulos
    assert len({i["medio"] for i in items}) == 3
    # Sin «ligero», la nota trágica sí puede entrar (temas como política o clima)
    assert any("muere" in i["titulo"] for i in S.elegir_titulares(n, "gastronomia_viajes", 3, ahora=AHORA))


def test_guion_con_fuentes_y_metadatos_privados():
    tema = S.config()["temas"][0]
    items = [{"titulo": "Titular uno de prueba", "medio": "Medio A", "url": "https://a.mx/1", "fecha": "2026-11-26"},
             {"titulo": "Titular dos de prueba", "medio": "Medio B", "url": "https://b.mx/2", "fecha": "2026-11-26"}]
    g = S.guion(tema, items, "2026-11-26")
    assert [e["tipo"] for e in g["escenas"]] == ["portada", "nota", "nota", "cierre"]
    assert "#Shorts" in g["titulo"] and len(g["titulo"]) <= 100
    assert "Voz sintética" in g["descripcion"]
    lineas = g["descripcion"].split("\n")
    assert "• Titular uno de prueba — Medio A (https://a.mx/1)" in lineas
    m = U.metadatos(g, g["descripcion"])
    assert m["status"] == {"privacyStatus": "private", "selfDeclaredMadeForKids": False, "containsSyntheticMedia": True}
    assert len(m["snippet"]["tags"]) <= 15


def test_sin_llaves_no_sube(tmp_path, monkeypatch):
    for k in ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN"):
        monkeypatch.delenv(k, raising=False)
    (tmp_path / "guion.json").write_text(json.dumps({"titulo": "x"}), encoding="utf-8")
    assert U.subir(str(tmp_path)) is None


def test_violencia_fuera_en_todos_los_temas_y_emoji_por_titular():
    n = {"notas": [nota("Balacera en la capital deja heridos", "Medio A", s="politica_mx", u="https://a.mx/1"),
                   nota("El Congreso aprueba la reforma educativa en lo general", "Medio B", s="politica_mx", u="https://a.mx/2"),
                   nota("Senado discute el presupuesto para el próximo año", "Medio C", s="politica_mx", u="https://a.mx/3")]}
    items = S.elegir_titulares(n, "politica_mx", 3, ahora=AHORA)
    assert [i["medio"] for i in items] == ["Medio B", "Medio C"]
    assert S.emoji_de("Nueva ruta de vuelo a Cancún", "🍽️") == "✈️"
    assert S.emoji_de("Sin coincidencias aquí", "🍽️") == "🍽️"
    g = S.guion(S.config()["temas"][0], items, "2026-11-26")
    assert g["escenas"][-2]["voz"].startswith("Y para cerrar")
    assert g["escenas"][1]["voz"].startswith("Número uno")
    assert all(e["total"] == 2 for e in g["escenas"])
