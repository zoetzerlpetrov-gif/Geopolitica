"""Sonda temporal (se borra antes del PR): qué RSS de medios mexicanos responden, si robots.txt los permite y
cuántos titulares de la capa «Carreteras y calles» traen."""
import collections
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
sys.path.insert(0, os.path.join(ROOT, "tools", "crimen"))
import fuentes as F  # noqa: E402
import vial  # noqa: E402

CANDIDATOS = [
    ("t21", "https://t21.com.mx/feed/"), ("transporte_mx", "https://www.transporte.mx/feed/"), ("tyt", "https://www.tyt.com.mx/feed/"),
    ("eluniversal", "https://www.eluniversal.com.mx/arc/outboundfeeds/rss/?outputType=xml"),
    ("eluniversal_estados", "https://www.eluniversal.com.mx/arc/outboundfeeds/rss/category/estados/?outputType=xml"),
    ("eluniversal_metropoli", "https://www.eluniversal.com.mx/arc/outboundfeeds/rss/category/metropoli/?outputType=xml"),
    ("milenio", "https://www.milenio.com/rss"), ("elfinanciero", "https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml"),
    ("excelsior", "https://www.excelsior.com.mx/rss.xml"), ("proceso", "https://www.proceso.com.mx/arc/outboundfeeds/rss/?outputType=xml"),
    ("jornada_sociedad", "https://www.jornada.com.mx/rss/sociedad.xml?v=1"), ("jornada_capital", "https://www.jornada.com.mx/rss/capital.xml?v=1"),
    ("sdp", "https://www.sdpnoticias.com/arc/outboundfeeds/rss/?outputType=xml"), ("razon", "https://www.razon.com.mx/arc/outboundfeeds/rss/?outputType=xml"),
    ("radioformula", "https://www.radioformula.com.mx/arc/outboundfeeds/rss/?outputType=xml"), ("24horas", "https://www.24-horas.mx/feed/"),
    ("quadratin", "https://www.quadratin.com.mx/feed/"), ("quadratin_edomex", "https://edomex.quadratin.com.mx/feed/"),
    ("quadratin_cdmx", "https://mexico.quadratin.com.mx/feed/"), ("quadratin_oaxaca", "https://oaxaca.quadratin.com.mx/feed/"),
    ("quadratin_yucatan", "https://www.quadratinyucatan.com.mx/feed/"), ("quadratin_hidalgo", "https://hidalgo.quadratin.com.mx/feed/"),
    ("elsoldemexico", "https://www.elsoldemexico.com.mx/rss.xml"), ("elsoldepuebla", "https://www.elsoldepuebla.com.mx/rss.xml"),
    ("elsoldetoluca", "https://www.elsoldetoluca.com.mx/rss.xml"), ("elsoldehidalgo", "https://www.elsoldehidalgo.com.mx/rss.xml"),
    ("elsoldeirapuato", "https://www.elsoldeirapuato.com.mx/rss.xml"), ("elsoldesanluis", "https://www.elsoldesanluis.com.mx/rss.xml"),
    ("diariodequeretaro", "https://www.diariodequeretaro.com.mx/rss.xml"), ("elsoldeleon", "https://www.elsoldeleon.com.mx/rss.xml"),
    ("informador", "https://www.informador.mx/rss/ultimas-noticias.xml"), ("informador_jalisco", "https://www.informador.mx/rss/jalisco.xml"),
    ("elsiglo", "https://www.elsiglodetorreon.com.mx/rss/ultimas.xml"), ("zocalo", "https://www.zocalo.com.mx/feed/"),
    ("lasillarota", "https://lasillarota.com/rss/"), ("eleconomista", "https://www.eleconomista.com.mx/rss/ultimas-noticias"),
    ("posta", "https://www.posta.com.mx/rss/"), ("expreso", "https://expreso.press/feed/"), ("elimparcial", "https://www.elimparcial.com/rss/"),
    ("noroeste", "https://www.noroeste.com.mx/rss/"), ("mvsnoticias", "https://mvsnoticias.com/arc/outboundfeeds/rss/?outputType=xml"),
    ("elheraldo", "https://heraldodemexico.com.mx/rss/"), ("diariodeyucatan", "https://www.yucatan.com.mx/feed"),
    ("debate", "https://www.debate.com.mx/rss/feed.xml"), ("elnorte_atom", "https://www.elnorte.com/rss/portada.xml"),
    ("abc_mty", "https://abcnoticias.mx/feed/"), ("telediario", "https://www.telediario.mx/rss"), ("contrareplica", "https://www.contrareplica.mx/rss"),
]
CRIMEN_TXT = re.compile(r"\b(rob|asalt|bloque|caseta|transportist|tr[aá]iler|combi|pasajer)", re.I)

for clave, url in CANDIDATOS:
    try:
        if not F.permitido_por_robots(url):
            print(f"SONDA {clave}: robots.txt NO permite")
            continue
        datos = F.get(url, timeout=30)
        try:
            cands = F.parsear_rss(datos, {"nombre": clave, "tipo": "noticia"})
        except Exception:  # noqa: BLE001
            limpio = re.sub(rb"<(/?)([A-Za-z0-9_]+):", rb"<\1\2_", datos)
            limpio = re.sub(rb'\s[A-Za-z0-9_]+:([A-Za-z0-9_]+)="', rb' \1="', limpio)
            cands = F.parsear_rss(limpio, {"nombre": clave, "tipo": "noticia"})
        tipos = collections.Counter(vial.clasificar(c["titulo"]) for c in cands)
        tipos.pop(None, None)
        relevantes = [c["titulo"][:110] for c in cands if CRIMEN_TXT.search(c["titulo"])][:6]
        fechas = sorted(c.get("fecha_utc") or "" for c in cands)
        print(f"SONDA {clave}: ok {len(cands)} titulares; vial {dict(tipos)}; rango {fechas[0][:16] if fechas else ''}..{fechas[-1][:16] if fechas else ''}")
        for r in relevantes:
            print(f"SONDA   · {r}")
    except Exception as e:  # noqa: BLE001
        print(f"SONDA {clave}: error {str(e)[:120]}")
