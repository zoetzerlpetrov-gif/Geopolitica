"""Respuestas propuestas a comentarios de YouTube (tools/noticiero_video/comentarios.py, comentarios.html)."""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "noticiero_video"))
import comentarios as C  # noqa: E402

CANAL = "UCcanal"


def hilo(i, texto, video="v1", likes=0, respondido=False, autor="UCotro"):
    replies = {"comments": [{"snippet": {"authorChannelId": {"value": CANAL}}}]} if respondido else {}
    return {"id": f"h{i}", "replies": replies, "snippet": {"videoId": video, "topLevelComment": {"id": f"c{i}", "snippet": {
        "textOriginal": texto, "likeCount": likes, "publishedAt": "2026-11-20T10:00:00Z", "authorChannelId": {"value": autor},
        "authorDisplayName": "Persona"}}}}


def test_clasificacion_local():
    assert C.clasificar_local("Eres un pendejo") == "ofensivo"
    assert C.clasificar_local("Gana dinero aquí https://estafa.com") == "spam"
    assert C.clasificar_local("¿De dónde sale el dato del FIX?") == "ok"


def test_propone_sin_datos_personales_y_respeta_tope_y_respondidos():
    hilos = [hilo(1, "¿De dónde sale el dato del FIX?", likes=5), hilo(2, "Eres un idiota"), hilo(3, "Ya me respondieron", respondido=True),
             hilo(4, "Comentario del propio canal", autor=CANAL)] + [hilo(10 + k, f"Pregunta número {k} sobre la nota", likes=k) for k in range(12)]
    pedir = lambda url, texto, ctx: json.dumps({"categoria": "ok", "respuesta": "Gracias por ver Brújula Diaria; el dato del FIX lo publica el Banco de México y está en la descripción."})
    out = C.proponer(hilos, CANAL, {"v1": "Brújula Diaria"}, "http://ia", pedir_fn=pedir)
    ok = [b for b in out if b["categoria"] == "ok"]
    ret = [b for b in out if b["categoria"] == "retenido"]
    assert len(ok) == C.MAX_POR_VIDEO and ok[0]["comentario"] == "c21"  # 13 válidos: los 10 con más «me gusta»
    assert [b["comentario"] for b in ret] == ["c2"] and ret[0]["motivo"] == "ofensivo"
    assert not any(b["comentario"] in ("c3", "c4") for b in out)
    for b in out:  # solo identificadores, categoría y texto propuesto: nada del autor ni del comentario
        assert set(b) <= {"comentario", "hilo", "video", "categoria", "motivo", "borrador", "me_gusta", "fecha", "retenido_en_youtube"}
        assert "Persona" not in json.dumps(b) and "idiota" not in json.dumps(b)


def test_respuestas_de_la_ia_validadas_y_previos_reutilizados():
    assert C.interpretar('{"categoria": "ok", "respuesta": "Visita https://x.com"}') == ("ok", None)
    assert C.interpretar('{"categoria": "ok", "respuesta": "Te recomiendo invertir en Nvidia porque sube mucho hoy"}')[1] is None
    assert C.interpretar('{"categoria": "ofensivo", "respuesta": ""}') == ("ofensivo", None)
    previo = {"comentario": "c1", "hilo": "h1", "video": "v1", "categoria": "ok", "borrador": "Texto ya propuesto antes.", "me_gusta": 0, "fecha": ""}
    llamadas = []
    out = C.proponer([hilo(1, "Hola")], CANAL, {}, "http://ia", pedir_fn=lambda *a: llamadas.append(a) or "{}", previos=[previo])
    assert out == [previo] and not llamadas


def test_contexto_del_video_con_guion_o_descripcion():
    g = {"titulo": "Brújula Diaria · 20 nov", "escenas": [{"encabezado": "Divisas", "texto": "El peso se aprecia."}, {"encabezado": "Cierre", "texto": ""}]}
    assert "Divisas: El peso se aprecia." in C.contexto_video(g)
    assert C.contexto_video(None, {"snippet": {"title": "T", "description": "D"}}) == "T\nD"


def test_pagina_permiso_y_publicacion():
    html = open(os.path.join(ROOT, "comentarios.html"), encoding="utf-8").read()
    assert 'name="robots" content="noindex"' in html and "js/comentarios.js" in html and "js/vista_enlaces.js" in html
    planes = json.load(open(os.path.join(ROOT, "config", "planes.json"), encoding="utf-8"))
    assert any(x.get("href") == "comentarios.html" for x in planes["solo_admin"])
    pages = open(os.path.join(ROOT, ".github", "workflows", "pages.yml"), encoding="utf-8").read()
    assert "comentarios.html" in pages and "datos-comentarios" in pages
    autorizar = open(os.path.join(ROOT, "tools", "noticiero_video", "autorizar.py"), encoding="utf-8").read()
    assert "youtube.upload" in autorizar and "youtube.force-ssl" in autorizar
