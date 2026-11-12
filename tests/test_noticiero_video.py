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


def test_guion_completo_con_economia_portafolio_y_descripcion():
    mx_txt = ["Trabajadores del seguro social pidieron detener sanciones en cuatro entidades durante una protesta laboral.",
              "La exportación de vehículos ligeros cayó en octubre frente al mismo mes del año anterior, según la industria.",
              "Pacientes oncológicos de Tijuana denuncian cuatro meses sin medicamentos ni estudios de laboratorio."]
    gl_txt = ["Francia aprobó su presupuesto anual tras una votación cerrada en la Asamblea Nacional.",
              "Japón elevó su alerta por erupción en un volcán del sur y evacuó a residentes cercanos.",
              "Brasil anunció un plan de reforestación amazónica financiado por un fondo internacional."]
    rmx = {"destacados": [nota(i, t, area=f"m{i}") for i, t in enumerate(mx_txt)]}
    rgl = {"destacados": [nota(10 + i, t, pais=p, area=f"a{i}") for i, (t, p) in enumerate(zip(gl_txt, ["FRA", "JPN", "BRA"]))]}
    ind = {"indicadores": [{"id": "mx_fix", "puntos": [["2026-11-10", 18.6678]]}, {"id": "mx_tasa", "puntos": [["2026-11-11", 6.25]]}]}
    port = {"noticias": {"instrumentos_con_noticias": 87}, "report": {"comprar": [{"ticker": "X"}]}}
    g = G.guion("2026-11-11", rmx, rgl, ind, port)
    tipos = [e["tipo"] for e in g["escenas"]]
    assert tipos[0] == "portada" and tipos[-1] == "cierre" and "economia" in tipos and "portafolio" in tipos
    assert g["notas"] == 6 and g["titulo"].startswith("Brújula Diaria · Miércoles 11 de noviembre de 2026")
    eco = next(e for e in g["escenas"] if e["tipo"] == "economia")
    assert eco["filas"][0]["valor"] == "18.67 pesos por dólar" and "18 punto 67" in eco["voz"]
    port_e = next(e for e in g["escenas"] if e["tipo"] == "portafolio")
    assert "No es asesoría" in port_e["voz"] and "comprar" not in port_e["voz"].lower() and "X" not in port_e["texto"].split()
    assert "https://ejemplo.mx/10" in g["descripcion"] and "voz es sintética" in g["descripcion"]
    assert all(len(e["voz"]) < 1500 for e in g["escenas"])


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
