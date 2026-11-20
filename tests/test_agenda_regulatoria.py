"""Agenda regulatoria (próximas reformas), prioridad de avisos en el Noticiero y bloque «Lo que viene» del video."""
import json
import os
import sys
from datetime import datetime, timezone

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(RAIZ, "tools", "normativa"))
sys.path.insert(0, os.path.join(RAIZ, "tools", "noticiero"))
sys.path.insert(0, os.path.join(RAIZ, "tools", "noticiero_video"))
import agenda as A  # noqa: E402
import monitor as M  # noqa: E402
import noticiero as N  # noqa: E402
import guion as G  # noqa: E402

AHORA = datetime(2026, 11, 20, 12, tzinfo=timezone.utc)


def _vivos(tmp_path, notas, dias):
    v, s = tmp_path / "vivos", tmp_path / "normativa"
    v.mkdir(); s.mkdir()
    (v / "noticiero.json").write_text(json.dumps({"notas": notas}), encoding="utf-8")
    (v / "dof.json").write_text(json.dumps({"dias": dias}), encoding="utf-8")
    return str(s), str(v)


def test_nom_exige_dependencia_emisora():
    assert M.sigla_de({"sigla": "NOM-019", "nombre": "NOM-019-STPS-2011, Comisiones"}) == "NOM-019-STPS"
    assert M.sigla_de({"sigla": "NOM-151", "nombre": "Firma electrónica"}) is None
    assert M.sigla_de({"sigla": "LGSM", "nombre": "Ley General de Sociedades Mercantiles"}) == "LGSM"


def test_agenda_detecta_etapas_agrupa_y_solo_avanza(tmp_path):
    notas = [
        {"t": "Senado avala reforma a la Ley Federal de Telecomunicaciones", "u": "https://a.mx/1", "m": "a.mx", "f": "2026-11-19T10:00:00Z", "s": ["oficial_mx"]},
        {"t": "Presentan iniciativa para reformar la Ley de Aguas Nacionales", "u": "https://b.mx/2", "m": "b.mx", "f": "2026-11-19T11:00:00Z", "s": ["politica_mx"]},
        {"t": "Banxico: minutas de política monetaria y reforma", "u": "https://c.mx/3", "m": "c.mx", "f": "2026-11-19T11:00:00Z", "s": ["oficial_mx"]},
        {"t": "Congreso de Sonora aprueba reforma a la ley de predial", "u": "https://d.mx/4", "m": "d.mx", "f": "2026-11-19T11:00:00Z", "s": ["oficial_mx"]},
        {"t": "Spain passes new law", "u": "https://e.es/5", "m": "e.es", "f": "2026-11-19T11:00:00Z", "s": ["geopolitica"]},
    ]
    dias = {"2026-11-18": [["1", "Aviso", "SENER", "Aviso de consulta pública del Proyecto de Norma Oficial Mexicana PROY-NOM-041-ENER/SE-2025, Eficiencia"]]}
    sal, viv = _vivos(tmp_path, notas, dias)
    d = A.construir(sal, viv, AHORA)
    por = {s["titulo"][:20]: s for s in d["senales"]}
    assert len(d["senales"]) == 4  # sin Banxico ni la nota de España
    assert por["Senado avala reforma"]["etapa"] == "aprobada_camara"
    assert por["Presentan iniciativa"]["etapa"] == "iniciativa"
    assert por["Congreso de Sonora a"]["ambito"] == "estatal"
    nom = por["Aviso de consulta pú"]
    assert nom["etapa"] == "consulta" and "energia_electrica" in nom["sectores"]
    # Una nota posterior sobre la misma ley sube la etapa (y nunca la baja); el historial se conserva.
    notas2 = [{"t": "Comisiones aprueban dictamen de la Ley de Aguas Nacionales", "u": "https://f.mx/6", "m": "f.mx", "f": "2026-11-20T09:00:00Z", "s": ["politica_mx"]}]
    (tmp_path / "vivos" / "noticiero.json").write_text(json.dumps({"notas": notas2}), encoding="utf-8")
    d2 = A.construir(sal, viv, AHORA)
    aguas = [s for s in d2["senales"] if "Aguas" in s["titulo"]]
    assert len(aguas) == 1 and aguas[0]["etapa"] == "dictamen" and len(aguas[0]["notas"]) == 2
    assert len(d2["senales"]) == 4


def test_agenda_marca_publicada_cuando_sale_en_el_dof(tmp_path):
    notas = [{"t": "Nueva Ley de Inversión Extranjera: cambios", "u": "https://a.mx/1", "m": "a.mx", "f": "2026-11-19T10:00:00Z", "s": ["oficial_mx"]}]
    sal, viv = _vivos(tmp_path, notas, {})
    s0 = A.construir(sal, viv, AHORA)["senales"][0]
    bit = {"entradas": [{"id": "MEX:dof:1", "fecha": "2026-11-20", "leyes": [{"nombre": n} for n in s0["leyes"]]}]}
    (tmp_path / "normativa" / "bitacora.json").write_text(json.dumps(bit), encoding="utf-8")
    s1 = A.construir(sal, viv, AHORA)["senales"][0]
    assert s0["leyes"] and s1["estado"] == "publicada" and s1["publicada_el"] == "2026-11-20"


def test_unir_prioriza_avisos_y_limita_repetidos():
    cfg = {"secciones": [{"id": "oficial_mx", "max": 4, "prioridad": "vincula|l[ií]nea", "repetidos": {"banxico": 2}}]}
    lim = N.limites_de(cfg)
    notas = [{"t": f"Banxico dato {i}", "u": f"https://x.mx/b{i}", "m": "x", "f": f"2026-11-20T1{i}:00:00Z", "s": ["oficial_mx"], "via": "rss"} for i in range(6)]
    notas.append({"t": "Último día para vincular tu línea celular a la CURP", "u": "https://x.mx/l", "m": "y", "f": "2026-11-19T01:00:00Z", "s": ["oficial_mx"], "via": "rss"})
    notas.append({"t": "Otra nota general", "u": "https://x.mx/o", "m": "z", "f": "2026-11-20T00:30:00Z", "s": ["oficial_mx"], "via": "rss"})
    out = N.unir([], notas, AHORA, limites=lim)
    titulos = [n["t"] for n in out]
    assert "Último día para vincular tu línea celular a la CURP" in titulos  # la más antigua, pero prioritaria
    assert sum(t.startswith("Banxico") for t in titulos) == 2
    assert len(out) <= 4


def test_config_oficial_mx_capta_registro_de_lineas():
    cfg = json.load(open(os.path.join(RAIZ, "config", "noticiero.json"), encoding="utf-8"))
    s = next(x for x in cfg["secciones"] if x["id"] == "oficial_mx")
    rx = N._rx(s["gkg"])
    for t in ["Registro de celular con CURP: a quién le toca en noviembre", "Suspenderán las líneas que no estén registradas",
              "¿Tu chip es solo de datos? Esto pasará el 1 de diciembre", "Sube el precio de la tortilla en la CDMX"]:
        assert rx.search(t), t


def test_video_avisos_primero_y_bloque_lo_que_viene():
    notas = [{"t": f"Banxico recorta la tasa {i}", "u": f"https://m{i}.mx/b", "m": f"m{i}", "f": "2026-11-20T10:00:00Z", "s": ["oficial_mx"]} for i in range(4)]
    notas.append({"t": "Último aviso: suspenderán las líneas celulares sin registro de CURP", "u": "https://z.mx/l", "m": "z", "f": "2026-11-20T09:00:00Z", "s": ["oficial_mx"]})
    c = G.candidatos_seccion({"notas": notas}, ahora_iso="2026-11-20T12:00:00Z")
    assert "suspenderán las líneas" in c["oficial_mx"][0]["titulo"]
    ag = {"senales": [{"estado": "en curso", "titulo": "Senado avala reforma X", "url": "https://a.mx/1", "medio": "a", "detectado": "2026-11-19",
                       "etapa_nombre": "Aprobada en una cámara (minuta)", "probabilidad": 0.8, "horizonte_meses": "1–3"},
                      {"estado": "publicada", "titulo": "Vieja", "url": "https://a.mx/2", "detectado": "2026-11-19", "probabilidad": 0.9}]}
    out = G.notas_agenda(ag, "2026-11-20")
    assert len(out) == 1 and out[0]["seccion"] == "agenda" and "estimación" in out[0]["resumen"] and "80 por ciento" in out[0]["resumen"]
    eleg = [{"seccion": "politica_mx"}, {"seccion": "dof"}, {"seccion": "economia"}]
    assert [n["seccion"] for n in G.con_agenda(eleg, out)] == ["politica_mx", "dof", "agenda", "economia"]


def test_temas_de_todas_las_areas_y_por_dependencia():
    assert "familia_civil" in A.temas_de("Reforma al Código Civil: divorcio y custodia de hijos")
    assert "trabajo" in A.temas_de("Iniciativa obliga a empresas a contratar 5% de jóvenes; reforma a la Ley Federal del Trabajo")
    assert "telecom_internet" in A.temas_de("Senado avala reforma de telecomunicaciones y registro de líneas celulares")
    assert A.temas_de("PROY-NOM-041-ENER/SE-2025, ventiladores")[0] == "energia"
    assert "animales" in A.temas_de("Nueva Ley de Bienestar Animal") and "derechos_sociales" not in A.temas_de("Nueva Ley de Bienestar Animal")


def test_entrada_en_vigor_futura_y_periodo_de_sesiones():
    assert A.fecha_vigor("Reforma laboral entrará en vigor en enero de 2027", AHORA) == "2027-01"
    assert A.fecha_vigor("Será obligatorio a partir de marzo", AHORA) == "2027-03"
    assert A.fecha_vigor("Senado aprueba reforma", AHORA) is None
    p = A.proximo_periodo(AHORA)
    assert p == {"inicio": "2026-09-01", "fin": "2026-12-15", "en_curso": True}
    assert A.proximo_periodo(datetime(2026, 12, 20, tzinfo=timezone.utc))["inicio"] == "2027-02-01"


def test_desmentido_aparece_y_matiza(tmp_path):
    notas = [
        {"t": "Proponen reforma a la Ley Federal del Trabajo para que empresas contraten 60% de mujeres", "u": "https://a.mx/1", "m": "a.mx", "f": "2026-11-18T10:00:00Z", "s": ["reformas_mx"]},
        {"t": "Es falso que la reforma a la Ley Federal del Trabajo obligue a contratar 60% de mujeres en México", "u": "https://v.es/2", "m": "Maldita.es", "tipo": "Verificador de datos", "f": "2026-11-19T10:00:00Z", "s": ["conspiracion"]},
        {"t": "Reforma entrará en vigor en enero de 2027: nueva ley de plataformas digitales", "u": "https://c.mx/3", "m": "c.mx", "f": "2026-11-19T10:00:00Z", "s": ["reformas_mx"]},
    ]
    sal, viv = _vivos(tmp_path, notas, {})
    d = A.construir(sal, viv, AHORA)
    trab = [s for s in d["senales"] if "60%" in s["titulo"]]
    assert len(trab) == 1 and trab[0]["verificaciones"] and trab[0]["confirmacion"].startswith("desmentida")
    vig = [s for s in d["senales"] if s["etapa"] == "por_entrar_en_vigor"][0]
    assert vig["vigor_desde"] == "2027-01" and vig["ventana"] == ["2027-01", "2027-01"]


def test_gdelt_tolera_limite_y_convierte_titulares():
    import json as _j
    ok = _j.dumps({"articles": [{"title": "Senado aprueba reforma al Código Civil", "url": "https://x.mx/1", "domain": "x.mx", "seendate": "20261119T101500Z", "sourcecountry": "Mexico"}]}).encode()
    notas, err = A.desde_gdelt(lambda u: ok, "3months", dormir=lambda s: None)
    assert err is None and notas[0]["f"] == "2026-11-19" and notas[0]["s"] == ["gdelt_mx"]
    notas, err = A.desde_gdelt(lambda u: b"Please limit requests to one every 5 seconds", "3months", dormir=lambda s: None)
    assert notas == [] and "limitó" in err
