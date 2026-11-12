"""Noticiero en video: selección de notas, guion, voz y metadatos de YouTube (sin red ni ffmpeg)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "noticiero_video"))
import guion as G  # noqa: E402
import subir as S  # noqa: E402


def nota(i, resumen, pais="MEX", sev=3, area="politica", **k):
    return {"id": f"n{i}", "resumen": resumen, "fuente": f"Medio {i}", "url": f"https://ejemplo.mx/{i}", "fecha_utc": "2026-11-11T10:00:00Z",
            "severidad": sev, "pais_iso3": pais, "area": area, "automatico": False, **k}


def test_fecha_larga_y_numeros_para_la_voz():
    assert G.fecha_larga("2026-11-11") == "miércoles 11 de noviembre de 2026"
    assert G.para_voz("FIX 18.67 y 3.75%") == "FIX 18 punto 67 y 3 punto 75 por ciento"
    assert G.para_voz("11 000 casos") == "11000 casos"


def test_descarta_plantillas_automaticas_y_repetidas():
    ds = [
        nota(1, "Energía y recursos en México (Norteamérica). Nota en español de Zeta Tijuana."),
        nota(2, "El gobierno de Baja California Sur usa herramientas de geolocalización para combatir la extorsión, que creció 44 % en 2026.", sev=4),
        nota(3, "Señal automática de GDELT con texto de plantilla sobre protestas en una ciudad del país.", automatico=True),
        nota(4, "Colombia, a tres meses del terremoto, critica la falta de una estrategia de reconstrucción en Pereira.", pais="COL", area="desastres"),
        nota(5, "Tres meses después del terremoto en Colombia, un fotógrafo denuncia que el fondo de reconstrucción no llegó.", pais="COL", area="sociedad"),
        nota(6, "Rusia expulsó a un diplomático de Moldavia como represalia en medio de la tensión entre ambos gobiernos.", pais="MDA", area="diplomacia"),
    ]
    mx = G.elegir(ds, 5)
    assert [x["id"] for x in mx] == ["n2", "n4", "n6"]
    assert G.elegir(ds, 5, excluir_pais="MEX")[0]["id"] == "n4"


def test_candidatos_une_destacados_y_secciones_sin_repetir():
    rep = {"destacados": [nota(1, "x" * 70)], "secciones": [{"eventos": [nota(1, "x" * 70), nota(2, "y" * 70)]}]}
    assert [x["id"] for x in G.candidatos(rep)] == ["n1", "n2"]


NOTI = {"generado_utc": "2026-11-12T00:00:00Z", "notas": [
    {"t": "Banxico recorta su tasa de interés a 6.75 por ciento", "u": "https://a.mx/1", "m": "El Economista", "f": "2026-11-11T20:00:00Z", "s": ["economia", "indicadores"]},
    {"t": "Banxico baja la tasa de interés a 6.75 por ciento, informa el banco central", "u": "https://b.mx/1", "m": "El Financiero", "f": "2026-11-11T19:00:00Z", "s": ["economia"]},
    {"t": "La inflación de octubre sube en Estados Unidos", "u": "https://c.mx/1", "m": "Expansión", "f": "2026-11-11T18:00:00Z", "s": ["economia"]},
    {"t": "Nvidia Preparing To Fire Huang After Affair Report", "u": "https://d.com/1", "m": "ZeroHedge", "f": "2026-11-11T21:00:00Z", "s": ["tecnologia"]},
    {"t": "El CEO de Nvidia, Jensen Huang, enfrenta presión de la junta", "u": "https://e.mx/1", "m": "Infobae", "f": "2026-11-11T21:30:00Z", "s": ["empresas"]},
    {"t": "There are no tropical cyclones at this time.", "u": "https://nhc/1", "m": "NHC", "f": "2026-11-11T22:00:00Z", "s": ["clima"]},
    {"t": "Frente frío número 12 traerá lluvias y descenso de temperatura al norte de México", "u": "https://f.mx/1", "m": "SMN", "f": "2026-11-11T22:00:00Z", "s": ["clima"]},
    {"t": "Nota vieja de política", "u": "https://g.mx/1", "m": "X", "f": "2026-11-05T10:00:00Z", "s": ["politica_mx"]},
]}
CALOR = {"features": [
    {"properties": {"name": "Ciudad de Mexico", "serie": [["2026-11-12", 20.3, 13.8, 20.3, 30, 2.9]]}},
    {"properties": {"name": "Madrid", "onda_calor": False, "serie": [["2026-11-12", 15.2, 6.1, 15, 30, 2]]}},
    {"properties": {"name": "Hermosillo", "onda_calor": True, "calor_nivel": 1, "serie": [["2026-11-12", 36, 20, 37, 30, 2]]},
     "geometry": {"type": "Point", "coordinates": [-110.96, 29.07]}},
    {"properties": {"name": "Wau", "onda_calor": True, "calor_nivel": 3, "serie": [["2026-11-12", 40, 25, 41, 30, 2]]},
     "geometry": {"type": "Point", "coordinates": [28.0, 7.7]}},
]}
CICLONES = {"features": [{"properties": {"storm_name": "PENA-26"}}, {"properties": {"storm_name": "PENA-26"}}]}


def test_candidatos_por_seccion_lo_relevante_sin_repetir_ni_vacios():
    c = G.candidatos_seccion(NOTI)
    assert "politica_mx" not in c, "nota de hace 6 días fuera de la ventana de 36 h"
    assert [n["titulo"] for n in c["clima"]] == ["Frente frío número 12 traerá lluvias y descenso de temperatura al norte de México"]
    eco = c["economia"]
    assert eco[0]["url"] == "https://a.mx/1" and eco[0]["eco"] == 2, "la más repetida por otros medios va primero"
    assert len(eco) == 2, "las dos notas de Banxico son el mismo tema: una sola candidata"
    elegidas = G.elegir_sin_ia(c)
    assert sum(1 for n in elegidas if "Nvidia" in n["titulo"]) == 1, "la historia de Nvidia no se repite en dos secciones"
    assert all(G.en_espanol(n["titulo"]) for n in elegidas)


def test_guion_completo_con_noticiero_clima_economia_portafolio_y_descripcion():
    elegidas = G.elegir_sin_ia(G.candidatos_seccion(NOTI))
    elegidas[0] = {**elegidas[0], "resumen": "El Banco de México redujo su tasa de referencia y mencionó la evolución reciente de la inflación."}
    ind = {"indicadores": [{"id": "mx_fix", "puntos": [["2026-11-10", 18.6678]]}, {"id": "mx_tasa", "puntos": [["2026-11-11", 6.25]]}]}
    port = {"noticias": {"instrumentos_con_noticias": 87}, "report": {"comprar": [{"ticker": "X"}]}}
    g = G.guion("2026-11-12", elegidas, ind, port, {"calor": CALOR, "ciclones": CICLONES})
    tipos = [e["tipo"] for e in g["escenas"]]
    assert tipos[0] == "portada" and tipos[-1] == "cierre" and "clima" in tipos and "economia" in tipos and "portafolio" in tipos
    assert g["titulo"].startswith("Brújula Diaria · Jueves 12 de noviembre de 2026")
    clima = next(e for e in g["escenas"] if e["tipo"] == "clima")
    assert clima["mx"] == [("Ciudad de México", 20, 14)] and clima["ciclones"] == ["Pena"] and clima["alertas"] == ["Onda de calor: Hermosillo"]
    assert "no es un aviso oficial" in clima["voz"]
    secs = [e.get("seccion") for e in g["escenas"]]
    assert secs[tipos.index("clima") - 1] == "clima", "el bloque del clima va justo después de la sección Clima"
    eco = next(e for e in g["escenas"] if e["tipo"] == "economia")
    assert eco["filas"][0]["valor"] == "18.67 pesos por dólar" and "18 punto 67" in eco["voz"]
    port_e = next(e for e in g["escenas"] if e["tipo"] == "portafolio")
    assert "No es asesoría" in port_e["voz"] and "comprar" not in port_e["voz"].lower()
    primera = next(e for e in g["escenas"] if e["tipo"] == "nota")
    assert primera["voz"].startswith("Economía. El Banco de México redujo") and "Fuente: El Economista" in primera["voz"]
    assert "https://a.mx/1" in g["descripcion"] and "MET Norway" in g["descripcion"] and "voz es sintética" in g["descripcion"]
    import json
    json.dumps(g, ensure_ascii=False)  # sin conjuntos internos


def test_redactar_con_ia_elige_valida_y_cae_a_titulares_en_espanol():
    import redactar as R
    c = G.candidatos_seccion(NOTI)
    llamadas = []

    def pedir(url, seccion, lista):
        llamadas.append(seccion)
        if seccion == "Economía":
            return '{"elegida": 1, "resumen": "El Banco de México redujo su tasa de interés de referencia en un cuarto de punto, hasta seis punto setenta y cinco por ciento."}'
        if seccion == "Tecnología":
            return '{"elegida": 1, "resumen": "Nvidia Preparing To Fire Huang After Affair Report"}'  # copia del título: se rechaza
        if seccion == "Clima y desastres":
            return '{"elegida": null}'  # ninguna corresponde: la sección se omite
        return '{"elegida": 9, "resumen": "x"}'  # número inexistente

    elegidas = R.elegir_y_redactar(c, "http://ia", pedir_fn=pedir)
    por_sec = {n["seccion"]: n for n in elegidas}
    assert por_sec["economia"]["resumen"].startswith("El Banco de México redujo")
    assert "tecnologia" not in por_sec, "resumen inválido y título en inglés: no se lee"
    assert "clima" not in por_sec
    assert R.elegir_y_redactar(c, None) == G.elegir_sin_ia(c)
    assert R.valida("Texto con enlace https://x.com y suficientes palabras para pasar el mínimo de diez palabras aquí", "t") is None


def test_metadatos_youtube_privado_y_voz_sintetica_declarada():
    m = S.metadatos({"titulo": "t" * 150}, "d", "public")
    assert len(m["snippet"]["title"]) == 100 and m["snippet"]["categoryId"] == "25"
    assert m["status"]["containsSyntheticMedia"] is True
    assert m["status"]["privacyStatus"] == "private", "solo administración: nunca público aunque se pida"


def test_subir_sin_llaves_no_hace_nada(monkeypatch, tmp_path):
    for k in ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN"):
        monkeypatch.delenv(k, raising=False)
    assert S.subir(str(tmp_path)) is None


def test_sin_llaves_en_el_codigo():
    raiz = os.path.join(os.path.dirname(__file__), "..")
    for f in ("tools/noticiero_video/guion.py", "tools/noticiero_video/render.py", "tools/noticiero_video/subir.py", "tools/noticiero_video/autorizar.py", ".github/workflows/noticiero-video.yml"):
        t = open(os.path.join(raiz, f), encoding="utf-8").read()
        assert "GOCSPX-" not in t and "1//0" not in t, f
    wf = open(os.path.join(raiz, ".github/workflows/noticiero-video.yml"), encoding="utf-8").read()
    assert "${{ github.event.inputs.fecha }}" not in wf.split("run:")[-1], "la fecha manual va por variable de entorno"


def test_permiso_caducado_da_aviso_claro():
    """Con la app en modo Prueba el refresh token dura 7 días: Google responde invalid_grant y se avisa qué hacer."""
    import io
    import urllib.error
    import pytest
    import subir

    def abrir(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 400, "Bad Request", {}, io.BytesIO(b'{"error": "invalid_grant"}'))

    with pytest.raises(subir.PermisoCaducado):
        subir.token_de_acceso("id", "secreto", "token", abrir=abrir)
    assert "autorizar.py" in subir.AVISO_CADUCO and "YT_REFRESH_TOKEN" in subir.AVISO_CADUCO
    assert subir.AVISO_CADUCO.startswith("::error")


def test_explica_los_403_de_youtube_en_espanol():
    import json
    import subir
    cuerpo = json.dumps({"error": {"code": 403, "message": "The request cannot be completed",
                                   "errors": [{"reason": "youtubeSignupRequired", "domain": "youtube.header"}]}})
    motivo, texto = subir.explicar_error(cuerpo)
    assert motivo == "youtubeSignupRequired" and "canal" in texto
    motivo, texto = subir.explicar_error(json.dumps({"error": {"message": "x", "details": [{"reason": "SERVICE_DISABLED"}]}}))
    assert motivo == "SERVICE_DISABLED" and "Biblioteca" in texto
    assert subir.explicar_error("no es json") == ("", "")


def test_el_video_no_menciona_dominus():
    """El canal es independiente del proyecto: ni el guion, ni las pantallas, ni las etiquetas dicen DOMINUS."""
    import os
    base = os.path.join(os.path.dirname(__file__), "..", "tools", "noticiero_video")
    for nombre in ("guion.py", "render.py", "subir.py"):
        assert "dominus" not in open(os.path.join(base, nombre), encoding="utf-8").read().lower(), nombre


def test_escenas_animadas_deterministas_y_sin_recursos_externos():
    """La plantilla se graba cuadro por cuadro (aTiempo congela las animaciones) y no carga nada de internet."""
    base = os.path.join(os.path.dirname(__file__), "..", "tools", "noticiero_video")
    html = open(os.path.join(base, "plantilla.html"), encoding="utf-8").read()
    assert "window.aTiempo" in html and "getAnimations" in html and "window.escena" in html
    assert "http://" not in html and "https://" not in html and "<script src" not in html
    js = open(os.path.join(base, "grabar.mjs"), encoding="utf-8").read()
    assert "aTiempo" in js and "image2pipe" in js
    wf = open(os.path.join(base, "..", "..", ".github", "workflows", "noticiero-video.yml"), encoding="utf-8").read()
    assert "playwright@" in wf and "PLAYWRIGHT_MODULE" in wf
