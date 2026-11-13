"""Brújula Diaria: patrocinios separados de las noticias, declarados y con reglas fijas (sin red)."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "noticiero_video"))
import patrocinio as P  # noqa: E402
import subir as S  # noqa: E402

REGLAS = {"max_por_video": 2, "categorias_prohibidas": ["tabaco", "politica_electoral"]}


def camp(**k):
    base = {"activo": True, "marca": "Café Sierra", "posicion": "pausa", "voz": "Café de altura de Oaxaca, en tu tienda.",
            "pantalla": "Café de altura", "enlace": "https://cafe.ejemplo/", "contrato": "OI-1", "categoria": "alimentos",
            "desde": "2026-12-01", "hasta": "2026-12-31"}
    return {**base, **k}


def guion():
    return {"fecha": "2026-12-02", "titulo": "Brújula Diaria", "descripcion": "Brújula Diaria · miércoles.\nResto\n\n#BrújulaDiaria", "escenas": [
        {"tipo": "portada"}, {"tipo": "nota", "seccion": "a", "texto": "Uno"}, {"tipo": "nota", "seccion": "a", "texto": "Café Sierra exporta"},
        {"tipo": "nota", "seccion": "b", "texto": "Tres"}, {"tipo": "economia"}, {"tipo": "mercados", "filas": [{"nombre": "Apple", "ticker": "AAPL"}]},
        {"tipo": "cierre"}]}


def test_el_ejemplo_del_repositorio_esta_apagado_y_sin_campanias_el_video_no_cambia():
    cfg = P.leer()
    assert cfg["campanias"] and not any(c["activo"] for c in cfg["campanias"])
    g = P.aplicar(guion(), cfg)
    assert g["patrocinio"] is False and [e["tipo"] for e in g["escenas"]].count("patrocinio") == 0
    assert "promoción pagada" not in g["descripcion"]


def test_vigencia_dias_maximo_y_reglas():
    cfg = {"reglas": REGLAS, "campanias": [camp(), camp(marca="B", dias=["lun"]), camp(marca="C", hasta="2026-12-01"),
                                           camp(marca="D", categoria="tabaco"), camp(marca="E", contrato=""),
                                           camp(marca="F", voz="Última hora: rendimiento seguro"), camp(marca="G"), camp(marca="H")]}
    assert [c["marca"] for c in P.vigentes(cfg, "2026-12-02")] == ["Café Sierra", "G"]  # miércoles; máximo 2
    assert P.problemas(camp(enlace="http://x"), REGLAS) and P.problemas(camp(posicion="dentro_de_nota"), REGLAS)
    assert P.problemas(camp(voz="x" * 400), REGLAS)


def test_escena_propia_declarada_y_fuera_de_las_notas():
    cfg = {"reglas": REGLAS, "campanias": [camp(), camp(marca="Banco Norte", posicion="apertura")]}
    g = P.aplicar(guion(), cfg)
    tipos = [e["tipo"] for e in g["escenas"]]
    assert tipos[1] == "patrocinio" and tipos[tipos.index("economia") - 1] == "patrocinio"  # apertura y pausa antes de Indicadores
    p = [e for e in g["escenas"] if e["tipo"] == "patrocinio"]
    assert all(e["voz"].startswith(f"Mensaje patrocinado por {e['marca']}.") and e["encabezado"] == "Publicidad" for e in p)
    assert "Seguimos con las noticias" in p[0]["voz"]
    nota = next(e for e in g["escenas"] if e.get("texto") == "Café Sierra exporta")
    assert nota["aviso_patrocinador"] == "Café Sierra patrocina este programa"  # conflicto a la vista
    lineas = g["descripcion"].split("\n")
    assert lineas[1].startswith("Incluye promoción pagada de Café Sierra, Banco Norte")
    assert "https://cafe.ejemplo/" in g["descripcion"] and "hoy hay notas o datos sobre Café Sierra" in g["descripcion"]
    assert g["patrocinio"] and S.metadatos(g, g["descripcion"])["paidProductPlacementDetails"] == {"hasPaidProductPlacement": True}
    assert "paidProductPlacementDetails" not in S.metadatos({"titulo": "x"}, "d")


def test_pausa_sin_indicadores_no_parte_una_seccion():
    esc = [{"tipo": "portada"}] + [{"tipo": "nota", "seccion": s} for s in "aaabbb"] + [{"tipo": "cierre"}]
    out = P.insertar(esc, [camp()])
    i = [e["tipo"] for e in out].index("patrocinio")
    assert out[i - 1].get("seccion") != out[i + 1].get("seccion")


def test_logo_solo_de_la_carpeta_de_patrocinios(tmp_path):
    raiz = tmp_path
    (raiz / "assets" / "patrocinios").mkdir(parents=True)
    (raiz / "assets" / "patrocinios" / "l.png").write_bytes(b"\x89PNG\r\n")
    (raiz / "otro.png").write_bytes(b"x")
    assert P.logo_data("assets/patrocinios/l.png", str(raiz)).startswith("data:image/png;base64,")
    assert P.logo_data("otro.png", str(raiz)) is None and P.logo_data("assets/patrocinios/../../otro.png", str(raiz)) is None
    assert P.logo_data("assets/patrocinios/no.png", str(raiz)) is None and P.logo_data(None) is None
    json.dumps(P.escena(camp()))  # serializable para grabar.mjs
