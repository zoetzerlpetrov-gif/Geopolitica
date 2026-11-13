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
    assert G.para_voz("FIX 18.67 y 3.75%") == "fix 18 punto 67 y 3 punto 75 por ciento"  # FIX se dice «fix», no deletreado
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
    port = [{"ticker": "V", "name": "Visa", "ok": True, "current_price": 352.1, "currency": "USD", "sparkline_12m": [340.0, 350.0, 352.1],
             "news": [{"title": "Visa incorpora una red nueva de pagos", "publisher": "El Economista", "link": "https://e.mx/v", "date": "2026-11-12T10:00:00+00:00"}]},
            {"ticker": "X", "name": "Vieja", "ok": True, "current_price": 1.0, "currency": "USD", "sparkline_12m": [1.0, 2.0],
             "news": [{"title": "Nota vieja", "publisher": "M", "link": "https://m/x", "date": "2026-10-01T10:00:00+00:00"}]}]
    import guion as _G
    _orig = _G.mercados
    _G.mercados = lambda p, ahora_iso=None, **k: _orig(p, ahora_iso="2026-11-12T12:00:00Z", **k)
    try:
        g = G.guion("2026-11-12", elegidas, ind, port, {"calor": CALOR, "ciclones": CICLONES})
    finally:
        _G.mercados = _orig
    tipos = [e["tipo"] for e in g["escenas"]]
    assert tipos[0] == "portada" and tipos[-1] == "cierre" and "clima" in tipos and "economia" in tipos and "mercados" in tipos
    merc = next(e for e in g["escenas"] if e["tipo"] == "mercados")
    assert [f["ticker"] for f in merc["filas"]] == ["V"], "solo instrumentos con noticia de las últimas 48 h"
    assert "sube 0 punto 60 por ciento" in merc["voz"] and "352 punto 10 dólares" in merc["voz"] and "No es asesoría" in merc["voz"]
    assert "#BrújulaDiaria" in g["descripcion"] and "inteligencia artificial" in g["descripcion"]
    assert g["titulo"].startswith("Brújula Diaria · Jueves 12 de noviembre de 2026")
    clima = next(e for e in g["escenas"] if e["tipo"] == "clima")
    assert clima["mx"] == [("Ciudad de México", 20, 14)] and clima["ciclones"] == ["Pena"] and clima["alertas"] == ["Onda de calor: Hermosillo"]
    assert "no es un aviso oficial" in clima["voz"]
    secs = [e.get("seccion") for e in g["escenas"]]
    assert secs[tipos.index("clima") - 1] == "clima", "el bloque del clima va justo después de la sección Clima"
    eco = next(e for e in g["escenas"] if e["tipo"] == "economia")
    assert eco["filas"][0]["valor"] == "18.67 pesos por dólar" and "18 punto 67" in eco["voz"]
    assert "comprar" not in merc["voz"].lower()
    primera = next(e for e in g["escenas"] if e["tipo"] == "nota")
    assert primera["voz"].startswith("Economía. El Banco de México redujo") and "Fuente" not in primera["voz"]  # la fuente solo en pantalla
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


def test_voz_de_brujula_es_kokoro_ef_dora_con_respaldo_piper(monkeypatch, tmp_path):
    import render as R
    wf = open(os.path.join(os.path.dirname(__file__), "..", ".github", "workflows", "noticiero-video.yml"), encoding="utf-8").read()
    assert 'VOZ_MOTOR: "kokoro:ef_dora"' in wf and "kokoro==" in wf and "espeak-ng" in wf
    usados = []
    monkeypatch.setenv("VOZ_MOTOR", "kokoro:ef_dora")
    monkeypatch.setattr(R, "voz_kokoro", lambda t, w, v: usados.append(v) or True)
    assert R.voz("Hola", str(tmp_path / "a.wav"), None) and usados == ["ef_dora"]

    def falla(*a):
        raise RuntimeError("sin modelo")
    monkeypatch.setattr(R, "voz_kokoro", falla)
    monkeypatch.setattr(R.shutil, "which", lambda n: None)  # sin Piper tampoco: no hay voz, pero no truena
    assert R.voz("Hola", str(tmp_path / "b.wav"), None) is False


def test_voz_dominios_numeros_y_pronunciacion():
    assert G.medio_para_voz("razon.com.mx") == "razon punto com punto eme equis"
    assert G.convencion("https://www.lafm.com.co/x") == "eu" and G.convencion("https://expansion.mx/a") == "mx" and G.convencion("El Economista") == "mx"
    assert G.para_voz(G.normalizar_numeros("Gasto de 3.830 millones y alza de 3,5 %", "eu")) == "Gasto de 3830 millones y alza de 3 punto 5 por ciento"
    assert G.para_voz("Ingresos por 3,830 millones y FIX de 18.62") == "Ingresos por 3830 millones y fix de 18 punto 62"
    v = G.para_voz("El Dow Jones sube y el nearshoring atrae stablecoins")
    assert "Dau Yons" in v and "nírchoring" in v and "esteibolcoins" in v
    assert G.cierre_frase("Titular sin punto") == "Titular sin punto." and G.cierre_frase("Ya tiene.") == "Ya tiene."


def test_cifras_del_dia_junto_a_la_nota_y_pausa_antes_de_fuente():
    ind = {"grupos": [{"datos": [{"id": "SF43718", "corto": "Dólar FIX", "valor": 18.6192, "previo": 18.6678, "unidad": "MXN por USD", "fecha": "2026-11-11"},
                                 {"id": "SF61745", "corto": "Tasa objetivo Banxico", "valor": 6.25, "previo": 6.5, "unidad": "%", "fecha": "2026-11-12"}]}]}
    d = G.datos_por_seccion(ind)
    assert "18.6192 MXN (-0.26 %)" in d["forex"]["texto"] and "baja 0.26 %" in d["forex"]["voz"]
    assert "-0.25 pts" in d["indicadores"]["texto"] and "baja 0.25 puntos" in d["indicadores"]["voz"]
    n = [{"seccion": "forex", "seccion_nombre": "Divisas", "titulo": "El peso cae ante el dólar por la inflación en EU", "medio": "excelsior.com.mx", "url": "https://excelsior.com.mx/1"}]
    v = G.con_resumen(n, {}, d)[0]["voz"]
    assert v.index("Titular") if "Titular" in v else True
    assert v.startswith("El peso cae ante el dólar por la inflación en Estados Unidos. ‖ Dato del día: el dólar fix está en 18 punto 62 pesos")
    assert "excelsior" not in v and "Fuente" not in v  # sin «medio publica» ni fuente en la voz
    r = G.con_resumen(n, {"https://excelsior.com.mx/1": "El peso perdió frente al dólar tras el dato de inflación de EUA"}, {})[0]["voz"]
    assert r == "El peso perdió frente al dólar tras el dato de inflación de Estados Unidos."  # EUA se dice completo


def test_hashtags_y_efectos():
    h = G.hashtags([{"seccion": "cripto"}, {"seccion": "nearshoring"}, {"seccion": "cripto"}]).split()
    assert h[0] == "#BrújulaDiaria" and "#Criptomonedas" in h and "#Nearshoring" in h and len(h) <= 15 and len(set(h)) == len(h)
    import render as R
    esc = [{"tipo": "portada"}, {"tipo": "nota", "seccion": "a"}, {"tipo": "nota", "seccion": "a"}, {"tipo": "nota", "seccion": "b"}, {"tipo": "cierre"}]
    assert [R.efecto_de(esc, i) for i in range(5)] == ["intro", "seccion", "nota", "seccion", "cierre"]


def test_frases_de_mercados_validadas():
    import redactar as R
    filas = [{"titulo": "Nvidia shares jump after earnings beat", "medio": "Reuters", "url": "u1"},
             {"titulo": "Apple to buy back stock", "medio": "CNBC", "url": "u2"}]
    def pedir(url, titulo, medio):
        return '{"resumen": "Las acciones de Nvidia suben tras reportar resultados mejores a lo esperado"}' if "Nvidia" in titulo \
            else '{"resumen": "Conviene comprar Apple ahora porque recomprará acciones propias"}'  # recomendación: se rechaza
    out = R.frases_titulares(filas, "http://ia", pedir_fn=pedir)
    assert list(out) == ["u1"] and R.frases_titulares(filas, None) == {}


def test_miles_con_punto_en_la_redaccion_de_la_ia():
    assert G.miles_redaccion("bajan de los 4.000 dólares") == "bajan de los 4,000 dólares"
    assert G.miles_redaccion("un enlace de 7.300 millones y 1.234.567 personas") == "un enlace de 7,300 millones y 1,234,567 personas"
    assert G.miles_redaccion("el euro en 1.1081 y el FIX en 18.62; 0.125 %") == "el euro en 1.1081 y el FIX en 18.62; 0.125 %"
    assert "4000 dólares" in G.para_voz(G.miles_redaccion("4.000 dólares"))


def test_la_misma_cifra_se_dice_una_sola_vez():
    datos = {"cripto": {"texto": "Bitcoin: 71,670 USD", "voz": "Dato del día: el bitcóin está en 71670 dólares."}}
    datos["blockchain"] = datos["cripto"]
    notas = [{"url": f"https://x.com/{i}", "medio": "x.com", "titulo": "t", "seccion": s} for i, s in enumerate(["cripto", "blockchain"])]
    out = G.con_resumen(notas, {n["url"]: "Resumen propio de la nota." for n in notas}, datos)
    assert out[0]["dato"] and not out[1]["dato"]
    assert "Dato del día" in out[0]["voz"] and "Dato del día" not in out[1]["voz"]


def test_miles_en_divisas_y_cripto_solo_antes_de_millones():
    assert G.miles_redaccion("el euro en 1.108 dólares", "forex") == "el euro en 1.108 dólares"
    assert G.miles_redaccion("cayó en 14.200 millones de dólares", "cbdc") == "cayó en 14,200 millones de dólares"
    assert G.miles_redaccion("Munich Re ganó 5.700 millones de euros", "eventos_impacto") == "Munich Re ganó 5,700 millones de euros"


def test_cada_cifra_una_sola_vez_aunque_cambie_la_combinacion():
    ind = {"grupos": [{"datos": [{"id": "SF43718", "corto": "Dólar FIX", "valor": 18.62, "previo": 18.66, "unidad": "MXN por USD", "fecha": "2026-11-11"},
                                 {"id": "EURUSD", "corto": "EUR/USD", "valor": 1.1081, "previo": 1.11, "unidad": "USD", "fecha": "2026-11-12"}]}]}
    notas = [{"url": f"https://x.mx/{s}", "medio": "x.mx", "titulo": "t", "seccion": s} for s in ("economia", "forex")]
    out = G.con_resumen(notas, {n["url"]: "Resumen propio de la nota del día." for n in notas}, G.datos_por_seccion(ind))
    assert "FIX" in out[0]["dato"] and "FIX" not in out[1]["dato"] and "EUR/USD" in out[1]["dato"]
    assert "10 nov" not in out[0]["dato"] and "11 nov" in out[0]["dato"]


def test_politica_incluye_lo_que_se_le_senala_al_gobierno_e_infantil_sobre_ninos():
    noti = {"generado_utc": "2026-11-12T12:00:00Z", "notas": [
        {"t": "Sheinbaum inaugura hospital en Oaxaca", "m": "A", "u": "u1", "f": "2026-11-12T10:00:00Z", "s": ["politica_mx"]},
        {"t": "Sheinbaum inaugura un hospital del IMSS en Oaxaca", "m": "B", "u": "u2", "f": "2026-11-12T10:00:00Z", "s": ["politica_mx"]},
        {"t": "ASF detecta desvío millonario en Segalmex y empresas fantasma de funcionarios", "m": "C", "u": "u3", "f": "2026-11-12T09:00:00Z", "s": ["economia"]},
        {"t": "Cold snaps put sea turtles at risk", "m": "Science News Explores", "u": "u4", "f": "2026-11-12T09:00:00Z", "s": ["infantil"]},
        {"t": "UNICEF alerta por niñas y niños sin escuela", "m": "BBC Newsround", "u": "u5", "f": "2026-11-12T08:00:00Z", "s": ["infantil"]},
    ]}
    c = G.candidatos_seccion(noti)
    assert [n["url"] for n in c["politica_mx_critica"]] == ["u3"] and "corrupción" in c["politica_mx_critica"][0]["tema"]
    assert [n["url"] for n in c["infantil"]] == ["u5"]
    assert G.CORTO["conspiracion"] == "Teorías de conspiración"


def test_diario_oficial_resumen_e_implicacion():
    bit = {"entradas": [
        {"id": "MEX:dof:1", "pais": "MEX", "fecha": "2026-11-11", "nivel": "ley", "impacto": "alto", "emisor": "PODER EJECUTIVO SECRETARIA DE GOBERNACION",
         "titulo": "Decreto por el que se reforman diversas disposiciones de la Ley Federal del Trabajo.", "url": "https://dof.gob.mx/1"},
        {"id": "MEX:dof:2", "pais": "MEX", "fecha": "2026-11-12", "nivel": "decreto", "impacto": "medio", "emisor": "X",
         "titulo": "Decreto por el que se declara de utilidad pública y se ordena la ocupación temporal de un predio", "url": "https://dof.gob.mx/2"},
        {"id": "MEX:dof:3", "pais": "MEX", "fecha": "2026-11-11", "nivel": "acuerdo", "impacto": "bajo", "emisor": "SHCP",
         "titulo": "Acuerdo por el cual se dan a conocer los montos de los estímulos fiscales aplicables a la gasolina, semana 1", "url": "https://dof.gob.mx/3"},
        {"id": "MEX:dof:4", "pais": "MEX", "fecha": "2026-11-12", "nivel": "acuerdo", "impacto": "bajo", "emisor": "SHCP",
         "titulo": "Acuerdo por el cual se dan a conocer los montos de los estímulos fiscales aplicables a la gasolina, semana 2", "url": "https://dof.gob.mx/4"},
        {"id": "MEX:dof:5", "pais": "MEX", "fecha": "2026-10-01", "nivel": "ley", "impacto": "alto", "emisor": "X", "titulo": "Ley vieja", "url": "u"},
    ]}
    d = G.notas_dof(bit, "2026-11-12")
    assert [n["url"] for n in d] == ["https://dof.gob.mx/1", "https://dof.gob.mx/4"]  # sin el predio, sin repetir, sin la vieja
    assert d[0]["emisor"] == "SECRETARIA DE GOBERNACION"
    import redactar as RD
    r = RD.redactar_dof(d, "http://ia", pedir_fn=lambda url, t, e: '{"resumen": "Se reforma la Ley Federal del Trabajo; '
                        'cambian obligaciones para empresas y personas trabajadoras, según el decreto publicado."}')
    assert r[0]["resumen"].startswith("Se reforma")
    elegidas = [{"seccion": "politica_mx"}, {"seccion": "geopolitica"}]
    assert [n["seccion"] for n in G.con_dof(elegidas, r)] == ["politica_mx", "dof", "dof", "geopolitica"]
    v = G.con_resumen(r, {r[0]["url"]: r[0]["resumen"]}, {})
    assert v[1]["titular"] and "Fuente" not in v[0]["voz"]


def test_sin_menos_cero_plural_y_fecha_mensual():
    ind = {"grupos": [{"datos": [{"id": "SF43718", "corto": "Dólar FIX", "valor": 18.6188, "previo": 18.6189, "unidad": "MXN por USD", "fecha": "2026-11-12"},
                                 {"id": "SF43936", "corto": "CETES 28 días", "valor": 6.2, "previo": 6.5, "unidad": "%", "fecha": "2026-11-12"}]}]}
    d = G.datos_por_seccion(ind)
    assert "(sin cambio)" in d["economia"]["texto"] and "-0.00" not in d["economia"]["texto"]
    assert "los CETES a 28 días están en" in d["bonos"]["voz"]
    filas = G.bloque_economia({"indicadores": [{"id": "mx_inflacion", "puntos": [["2026-10-01", 3.75]]}, {"id": "mx_tasa", "puntos": [["2026-11-12", 6.25]]}]})
    voz = " ".join(f["voz"] for f in filas)
    assert "dato de octubre de 2026" in voz and "dato del jueves 12 de noviembre de 2026" in voz


def test_estados_unidos_byd_y_nearshoring_en_voz():
    p = G.pronunciar
    assert p("Aranceles de EE.UU. y EE. UU. contra BYD") == "Aranceles de Estados Unidos y Estados Unidos contra bi güai di"
    assert p("La Fed de EUA y el déficit de EU") == "La Fed de Estados Unidos y el déficit de Estados Unidos"
    assert p("El nearshoring en México") == "El nírchoring en México"  # la voz en español no tiene «sh»: «ch» es lo más cercano
    assert p("EUROPA y BYDX sin cambio") == "EUROPA y BYDX sin cambio"
