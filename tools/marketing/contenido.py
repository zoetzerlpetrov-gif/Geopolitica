#!/usr/bin/env python3
"""Borradores de publicaciones para redes sociales a partir de los datos del día (marketing.html, solo admin).

No inventa nada: cada borrador sale de un archivo de vivos/ que ya generó otro proceso y lleva la cifra, la fuente y el
enlace. Plantillas fijas (sin IA) para que el texto diga exactamente lo que dice el dato. La administración revisa,
edita y publica desde la página; nada se publica solo desde aquí.

Temas: comercio sin país (ONU vs Banxico), petróleo a Cuba (Pemex ante la SEC), señales de seguridad (SESNSP),
CO₂ en Mauna Loa (NOAA), alertas del Monitor México (Banxico), cisnes blancos y negros, y una herramienta del proyecto
que rota cada día (config/marketing.json → evergreen).
Salida: vivos/marketing_borradores.json (cada corrida; conserva 30 días).
"""
import json
import os
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
VIVOS = os.path.join(ROOT, "vivos")
OUT = os.path.join(VIVOS, "marketing_borradores.json")
CONFIG = os.path.join(ROOT, "config", "marketing.json")
DIAS_CONSERVA = 30
LIMITES = {"x": 280, "bluesky": 300, "threads": 500}


def leer(nombre):
    try:
        with open(os.path.join(VIVOS, nombre), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def num(v, d=1):
    s = f"{v:,.{d}f}" if isinstance(v, (int, float)) else str(v)
    return s.rstrip("0").rstrip(".") if "." in s and d else s


def enlace(sitio, ruta, canal, tema):
    base = sitio.rstrip("/") + "/"
    q = urllib.parse.urlencode({"utm_source": canal, "utm_medium": "social", "utm_campaign": tema[:24]})
    frag = ruta if ruta.startswith("#") else ""
    return f"{base}{'' if frag else ruta}?{q}{frag}"


def recortar(texto, limite):
    return texto if len(texto) <= limite else texto[: limite - 1].rsplit(" ", 1)[0] + "…"


def textos(b, sitio):
    """Un texto por red a partir de titular, cuerpo, fuente y hashtags del borrador."""
    tags = " ".join(f"#{h}" for h in b["hashtags"])
    out = {}
    for canal in ("x", "bluesky", "threads", "linkedin", "facebook", "telegram", "whatsapp", "instagram", "tiktok"):
        url = enlace(sitio, b["ruta"], canal, b["tema"])
        if canal in LIMITES:
            fijo = f"\n\nFuente: {b['fuente_corta']}\n{url}"
            if canal != "bluesky":
                fijo += f"\n{tags}"
            # X cuenta cualquier enlace como 23 caracteres; Bluesky y Threads lo cuentan completo.
            disponible = LIMITES[canal] - len(fijo) + (len(url) - 23 if canal == "x" else 0)
            cuerpo = recortar(f"{b['titular']}\n{b['corto']}", max(disponible, 40))
            out[canal] = cuerpo + fijo
        elif canal == "linkedin":
            out[canal] = f"{b['titular']}\n\n{b['largo']}\n\n¿Por qué importa? {b['por_que']}\n\nFuente: {b['fuente']} ({b['fuente_url']})\nVer los datos: {url}\n\n{tags}"
        elif canal in ("instagram", "tiktok"):
            # Sin enlaces clicables en la descripción: se manda a la biografía; más hashtags que en otras redes.
            extra = " ".join(f"#{h}" for h in [*b["hashtags"], "OSINT", "DatosAbiertos" if "DatosAbiertos" not in b["hashtags"] else "Inteligencia"])
            out[canal] = f"{b['titular']}\n\n{b['corto'] if canal == 'tiktok' else b['largo']}\n\nFuente: {b['fuente']}.\nDatos y mapa: enlace en la biografía.\n\n{extra}"
        elif canal == "facebook":
            out[canal] = f"{b['titular']}\n\n{b['largo']}\n\nFuente: {b['fuente']}.\n{url}"
        else:
            out[canal] = f"*{b['titular']}*\n{b['corto']}\nFuente: {b['fuente_corta']}\n{url}"
    return out


def b_comercio(d):
    c = (d or {}).get("comercio") or {}
    meses = c.get("meses") or {}
    if not meses:
        return None
    p = sorted(meses)[-1]
    m = meses[p]
    if m.get("sin_pais_pct") is None:
        return None
    mes = f"{['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][int(p[4:6]) - 1]} de {p[:4]}"
    return {"tema": "comercio_sin_pais", "pilar": "contraste", "audiencias": ["periodistas", "analistas", "empresas"], "ruta": "",
            "titular": f"El {num(m['sin_pais_pct'])} % del valor petrolero que México reportó a la ONU en {mes} no dice a qué país fue",
            "corto": f"De {num(m.get('total'), 0)} millones de dólares en exportaciones petroleras, {num(m.get('sin_pais'), 0)} millones aparecen con destino reservado.",
            "largo": f"En {mes}, México reportó a la ONU (UN Comtrade) {num(m.get('total'), 0)} millones de dólares en exportaciones del capítulo 27 (petróleo y derivados). "
                     f"De ese total, {num(m.get('sin_pais'), 0)} millones ({num(m['sin_pais_pct'])} %) aparecen como «otras áreas» sin país, y Estados Unidos {num(m.get('eua'), 0)} millones. "
                     f"Banxico registra {num(m.get('banxico_petroleras'), 0)} millones en exportaciones petroleras del mismo mes.",
            "por_que": "Reservar el país de destino es una práctica de confidencialidad que usan varios países para el crudo. No prueba que se oculte algo, pero impide verificar destinos con la estadística oficial.",
            "fuente": "UN Comtrade y Banxico (SIE)", "fuente_corta": "UN Comtrade / Banxico", "fuente_url": "https://comtradeplus.un.org/",
            "hashtags": ["DatosAbiertos", "Petróleo", "México"]}


def b_pemex_cuba(d):
    ps = (d or {}).get("periodos") or []
    if not ps:
        return None
    p = ps[-1]
    total = (p.get("crudo_kbd") or 0) + (p.get("petroliferos_kbd") or 0)
    previo = next((x for x in reversed(ps[:-1]) if x["periodo"].startswith("Año")), None)
    comp = f" En {previo['periodo'].replace('Año ', '')} el promedio fue de {num((previo.get('crudo_kbd') or 0) + (previo.get('petroliferos_kbd') or 0))} mil barriles diarios." if previo else ""
    return {"tema": "pemex_cuba", "pilar": "dato", "audiencias": ["periodistas", "analistas", "publico"], "ruta": "",
            "titular": f"Pemex reportó a la SEC envíos a Cuba de {num(total)} mil barriles diarios ({p['periodo']})",
            "corto": f"Valor reportado: {num(p.get('usd_millones'))} millones de dólares.{comp}",
            "largo": f"En su reporte {p.get('forma')} a la SEC de EUA (presentado el {p.get('presentado')}), Pemex informó que su filial que exporta a Cuba envió "
                     f"{num(p.get('crudo_kbd'))} mil barriles diarios de crudo y {num(p.get('petroliferos_kbd'))} mil de petrolíferos en el periodo «{p['periodo']}», "
                     f"por {num(p.get('usd_millones'))} millones de dólares.{comp}",
            "por_que": "En la estadística de la ONU el destino del crudo mexicano aparece reservado; el reporte de Pemex a la SEC es la cifra oficial disponible por país. Son datos de la propia empresa, no una auditoría.",
            "fuente": "Pemex, reporte a la SEC", "fuente_corta": "Pemex ante la SEC", "fuente_url": p.get("fuente", ""),
            "hashtags": ["Pemex", "Cuba", "DatosAbiertos"]}


NOMBRES_DELITO = {"homicidio_doloso": "homicidio doloso", "feminicidio": "feminicidio", "otros_vida": "«otros delitos contra la vida»",
                  "secuestro": "secuestro", "extorsion": "extorsión", "homicidio_culposo": "homicidio culposo", "lesiones_dolosas": "lesiones dolosas",
                  "trata": "trata de personas", "trafico_menores": "tráfico de menores", "rapto": "rapto"}


def b_seguridad(d):
    s = (d or {}).get("seguridad") or {}
    sen = [x for x in (s.get("senales") or []) if x.get("cambio_baja_pct") is not None and x.get("cambio_sube_pct") is not None]
    if not sen:
        return None
    x = max(sen, key=lambda z: abs(z["cambio_sube_pct"]) + abs(z["cambio_baja_pct"]))
    baja, sube = NOMBRES_DELITO.get(x["baja"], x["baja"]), NOMBRES_DELITO.get(x["sube"], x["sube"])
    return {"tema": "seguridad_categorias", "pilar": "contraste", "audiencias": ["periodistas", "analistas", "publico"], "ruta": "",
            "titular": f"{baja.capitalize()} {num(x['cambio_baja_pct'])} % y {sube} +{num(x['cambio_sube_pct'])} % ({x.get('periodo', '')})",
            "corto": "Cuando una categoría baja y su vecina sube en el mismo periodo, vale la pena revisar cómo se registran los casos.",
            "largo": f"Según las víctimas del fuero común del SESNSP, {baja} cambió {num(x['cambio_baja_pct'])} % y {sube} {num(x['cambio_sube_pct'])} % en {x.get('periodo', '')}. "
                     "Un movimiento así puede venir de un cambio real, de un cambio de metodología o de que los casos se registren en otra categoría.",
            "por_que": "Una baja en un delito puede ser real o puede ser una reclasificación. Ver las categorías vecinas juntas ayuda a distinguirlo. No prueba manipulación por sí sola.",
            "fuente": "SESNSP, datos abiertos de incidencia delictiva", "fuente_corta": "SESNSP",
            "fuente_url": s.get("pagina", "https://www.gob.mx/sesnsp"), "hashtags": ["Seguridad", "DatosAbiertos", "México"]}


def b_co2(d):
    m = ((d or {}).get("series") or {}).get("mauna_loa")
    if not m or m.get("ppm") is None:
        return None
    return {"tema": "co2_mauna_loa", "pilar": "dato", "audiencias": ["publico", "analistas"], "ruta": "#b-humedad",
            "titular": f"CO₂ en Mauna Loa: {num(m['ppm'], 2)} ppm en {m['mes']}",
            "corto": f"{num(m.get('aumento_ppm'), 2)} ppm más que un año antes ({m.get('mes_anterior')}).",
            "largo": f"El observatorio de Mauna Loa (NOAA) midió {num(m['ppm'], 2)} partes por millón de dióxido de carbono en {m['mes']}, "
                     f"{num(m.get('aumento_ppm'), 2)} ppm más que en {m.get('mes_anterior')}. En DOMINUS también puedes ver el CO₂, el metano y el monóxido de carbono estimados por ciudad (CAMS de Copernicus).",
            "por_que": "Es la serie de CO₂ más larga del mundo (desde 1958) y la referencia para medir el ritmo del cambio climático.",
            "fuente": "NOAA Global Monitoring Laboratory", "fuente_corta": "NOAA GML", "fuente_url": m.get("url", "https://gml.noaa.gov/ccgg/trends/"),
            "hashtags": ["Clima", "CO2"]}


def b_monitor(d):
    al = (d or {}).get("alertas") or []
    if not al:
        return None
    a = al[0]
    nombre = a.get("nombre") or a.get("id")
    return {"tema": "monitor_mx", "pilar": "dato", "audiencias": ["empresas", "analistas", "periodistas"], "ruta": "",
            "titular": f"Banxico: cambio fuera de lo normal en «{nombre}»",
            "corto": f"{a.get('texto') or a.get('tipo') or ''} ({a.get('periodo', '')}).".strip(),
            "largo": f"El Monitor México de DOMINUS compara cada serie de Banxico con su promedio de 12 meses. «{nombre}» marcó una alerta ({a.get('tipo', '')}) en {a.get('periodo', '')}. "
                     "Las cifras son preliminares y pueden revisarse.",
            "por_que": "Un salto o una caída fuerte en una serie oficial puede anticipar cambios en comercio, remesas o inversión, o revelar un cambio de registro.",
            "fuente": "Banco de México, SIE", "fuente_corta": "Banxico SIE", "fuente_url": "https://www.banxico.org.mx/SieInternet/",
            "hashtags": ["Economía", "Banxico", "México"]}


def b_cisne(d):
    ev = [e for e in (d or {}).get("eventos", []) if e.get("nivel") in ("alto", "elevado")]
    if not ev:
        return None
    e = max(ev, key=lambda z: (z["nivel"] == "alto", z.get("menciones_72h") or 0))
    f0 = (e.get("fuentes") or [[]])[0]
    f0 = [f0] if isinstance(f0, str) else list(f0)
    pct = f"{num((e.get('prob_base_12m') or 0) * 100, 2)} %" if e.get("prob_base_12m") else "sin tasa histórica publicada"
    return {"tema": "cisne", "pilar": "metodo", "audiencias": ["analistas", "empresas"], "ruta": "",
            "titular": f"Señales {'altas' if e['nivel'] == 'alto' else 'elevadas'} sobre «{e['nombre']}»",
            "corto": f"{e.get('menciones_72h')} titulares en 72 h. Probabilidad base a 12 meses: {pct}.",
            "largo": f"En el monitor de cisnes blancos y negros de DOMINUS, «{e['nombre']}» tiene un nivel de señales {e['nivel']}: {e.get('menciones_72h')} titulares en 72 horas. "
                     f"Su probabilidad base a 12 meses, según la tasa histórica publicada, es {pct}. Las señales sirven para priorizar la atención, no son un pronóstico.",
            "por_que": "Separar la frecuencia histórica de un evento del ruido de las noticias evita sobrerreaccionar o ignorar riesgos reales.",
            "fuente": f0[0] if f0 else "Tasas históricas publicadas", "fuente_corta": "DOMINUS (cisnes)", "fuente_url": f0[1] if len(f0) > 1 else "",
            "hashtags": ["Riesgo", "Inteligencia"]}


def b_evergreen(cfg, hoy):
    ev = cfg.get("evergreen") or []
    if not ev:
        return None
    e = ev[hoy.timetuple().tm_yday % len(ev)]
    return {"tema": "herramienta_" + "".join(ch for ch in e["titulo"].lower().replace(" ", "_") if ch.isalnum() or ch == "_")[:16], "pilar": e["pilar"], "audiencias": ["publico", "analistas"], "ruta": e.get("ruta", ""),
            "titular": e["titulo"], "corto": e["texto"][:200], "largo": e["texto"], "por_que": "Herramienta gratuita en la versión Demo de DOMINUS.",
            "fuente": "DOMINUS OSINT", "fuente_corta": "DOMINUS", "fuente_url": "", "hashtags": e.get("hashtags", [])}


def generar(cfg, datos, hoy):
    sitio = cfg.get("sitio") or "https://dominusosint.com/"
    candidatos = [b_comercio(datos.get("contraste_mx")), b_pemex_cuba(datos.get("pemex_cuba")), b_seguridad(datos.get("contraste_mx")),
                  b_co2(datos.get("co2")), b_monitor(datos.get("monitor_mx")), b_cisne(datos.get("cisnes")), b_evergreen(cfg, hoy)]
    out = []
    for b in filter(None, candidatos):
        b["id"] = f"{hoy:%Y%m%d}-{b['tema']}"
        b["fecha"] = hoy.strftime("%Y-%m-%d")
        b["textos"] = textos(b, sitio)
        out.append(b)
    return out


def combinar(previos, nuevos, hoy):
    """Conserva 30 días; un tema por día (el nuevo reemplaza al del mismo día)."""
    limite = (hoy - timedelta(days=DIAS_CONSERVA)).strftime("%Y-%m-%d")
    por_id = {b["id"]: b for b in previos if b.get("fecha", "") >= limite}
    por_id.update({b["id"]: b for b in nuevos})
    return sorted(por_id.values(), key=lambda b: (b["fecha"], b["tema"]), reverse=True)


def main():
    hoy = datetime.now(timezone.utc)
    try:
        cfg = json.load(open(CONFIG, encoding="utf-8"))
    except (OSError, ValueError):
        cfg = {}
    datos = {n: leer(f"{n}.json") for n in ("contraste_mx", "pemex_cuba", "co2", "monitor_mx", "cisnes")}
    nuevos = generar(cfg, datos, hoy)
    previos = (leer("marketing_borradores.json") or {}).get("borradores", [])
    todos = combinar(previos, nuevos, hoy)
    os.makedirs(VIVOS, exist_ok=True)
    json.dump({"generado_utc": hoy.strftime("%Y-%m-%dT%H:%M:%SZ"), "nota": "Borradores automáticos a partir de datos oficiales. Revisar antes de publicar.",
               "borradores": todos}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"Marketing: {len(nuevos)} borradores nuevos ({', '.join(b['tema'] for b in nuevos)}); {len(todos)} en 30 días")
    return 0


if __name__ == "__main__":
    sys.exit(main())
