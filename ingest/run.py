#!/usr/bin/env python3
"""Ingesta horaria (Fase 2): GDELT + RSS + ReliefWeb -> eventos clasificados.

Pasos de cada corrida (en este orden):
  1. Descarga candidatos de cada fuente. Si una falla, se anota en run-log.json y se sigue con las demás.
  2. Geocodifica: coordenada de GDELT -> país (punto en polígono); RSS -> primer país del título; sin
     coordenada -> centroide del país.
  3. Clasifica con el clasificador por reglas (ingest/classify.py). El área sugerida por la fuente
     (código CAMEO de GDELT, "crisis humanitaria" de ReliefWeb) suma como evidencia extra.
  4. Une con los eventos de la corrida anterior que siguen dentro de la ventana (72 h).
  5. Agrupa duplicados: mismo país, menos de 36 h y títulos parecidos (Jaccard >= 0.6) -> un evento
     con varias fuentes.
  6. Dimensiones: delta, nivel_alerta, correlaciones (ingest/dimensiones.py).
  7. Escribe events.json, run-log.json, indice-paises.json e historial diario (90 días) y valida.

Del contenido de terceros solo se guarda título, fuente, fecha y enlace. El resumen lo redacta el sistema.

Uso:  python3 ingest/run.py --salida eventos     (la carpeta puede traer la corrida anterior)
"""
import argparse
import copy
import glob
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import Clasificador, normalizar  # noqa: E402
from dimensiones import enriquecer, indice_inestabilidad  # noqa: E402
from geo import Gazetteer, Paises  # noqa: E402
import fuentes as F  # noqa: E402
from validate import validar  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CRON = "17 * * * *"
JACCARD_MIN = 0.6
DEDUP_HORAS = 36
HIST_MAX_DIA = 2000      # registros compactos por día en el historial
BONO_SUGERIDA = 2.0      # puntos que suma el área sugerida por la fuente

# Palabras que suben la severidad de un titular de RSS/ReliefWeb (base 2).
GRAVES = ["muertos", "muertes", "asesinados", "killed", "dead", "deaths", "masacre", "massacre", "bombardeo",
          "airstrike", "airstrikes", "invasion", "invasión", "golpe de estado", "coup", "estado de emergencia",
          "state of emergency", "pandemia", "pandemic", "terremoto", "earthquake", "genocidio", "genocide"]
MEDIAS = ["ataque", "attack", "sanciones", "sanctions", "protestas", "protests", "misil", "missile", "huelga",
          "strike", "aranceles", "tariffs", "evacuación", "evacuation", "brote", "outbreak", "ciberataque", "cyberattack"]

# Notas fuera de tema (deportes, espectáculos) que los feeds generales mezclan con lo internacional.
# Se descartan salvo que el título sea grave (muertos, ataque…): «Ataque en un estadio deja 20 muertos» sí pasa.
FUERA_DE_TEMA = ["cricket", "futbol", "football", "soccer", "rugby", "tenis", "tennis", "golf", "nba", "nfl", "mlb",
                 "formula 1", "grand prix", "gran premio", "boxeo", "boxing", "ufc", "liga mx", "champions league",
                 "premier league", "seleccion de futbol", "pelicula", "peliculas", "film festival", "box office", "taquilla",
                 "album", "concierto", "cantante", "singer", "actriz", "actress", "celebrity", "reality show", "grammy", "emmy",
                 "messi", "ronaldo"]


def fuera_de_tema(titulo, texto):
    t = normalizar(titulo)
    return any(f" {normalizar(p).strip()} " in t for p in FUERA_DE_TEMA) and severidad_texto(texto) < 4


# Socios con efecto directo en México por área (regla simple, documentada en docs/INDICADORES.md).
SOCIOS_MX = {"USA", "CAN", "CHN", "GTM", "BLZ", "HND", "SLV", "CUB", "VEN", "COL"}
# Seguridad no entra: con ella, casi cualquier hecho policial en EUA se marcaba como impacto para México.
AREAS_MX = {"geoeconomia", "energia", "demografia", "infraestructura", "salud_nrbq"}
TEXTO_MX = {
    "geoeconomia": "posible efecto en comercio, aranceles o tipo de cambio",
    "energia": "posible efecto en precios o suministro de energía",
    "demografia": "posible efecto en flujos migratorios o remesas",
    "infraestructura": "posible efecto en cadenas logísticas o conectividad",
    "salud_nrbq": "posible efecto en vigilancia sanitaria y fronteras",
}


def ahora_utc():
    return datetime.now(timezone.utc).replace(microsecond=0)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def fecha(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def id_evento(c):
    """Estable entre corridas (el mismo enlace da el mismo id), necesario para calcular el delta."""
    prefijo = {"base_datos": "db", "analisis": "an", "red_social": "rs"}.get(c["tipo_fuente"], "nt")
    if c["fuente"].startswith("GDELT"):
        prefijo = "gd"
    return f"{prefijo}-{hashlib.sha1(c['url'].encode()).hexdigest()[:14]}"


def tokens(titulo):
    return {w for w in normalizar(titulo).split() if len(w) > 3}


def jaccard(a, b):
    return len(a & b) / len(a | b) if a and b else 0.0


def severidad_texto(texto):
    t = normalizar(texto)
    if any(f" {normalizar(p).strip()} " in t for p in GRAVES):
        return 4
    if any(f" {normalizar(p).strip()} " in t for p in MEDIAS):
        return 3
    return 2


def impacto_mexico(iso3, area, secundarias, texto, gaz, severidad=3):
    """Regla: evento en México, que lo menciona, o en un socio directo, en un área sensible y con
    severidad ≥ 3 (con severidad 1–2 la regla marcaba decenas de hechos menores en EUA)."""
    if iso3 == "MEX":
        return "Ocurre en México."
    # "New Mexico" / "Nuevo México" es un estado de EUA, no una mención de México.
    t = re.sub(r"(?<= )(new|nuevo) mexico(?= )", "", normalizar(texto))
    if " mexico " in t or " mexicano " in t or " mexican " in t:
        return "Menciona a México de forma directa."
    if iso3 in SOCIOS_MX and severidad >= 3:
        for a in [area, *secundarias]:
            if a in AREAS_MX:
                nombre = gaz.paises.get(iso3, {}).get("es", iso3)
                return f"{nombre} es socio o vecino directo: {TEXTO_MX[a]} (regla automática, sin verificar)."
    return None


def resumen_sistema(c, cls, gaz):
    """Resumen propio de máximo 2 frases. Nunca copia texto del artículo."""
    if c.get("resumen"):
        return c["resumen"][:400]
    pais = gaz.paises.get(c["pais_iso3"], {}).get("es") if c["pais_iso3"] else None
    lugar = f" sobre {pais}" if pais else ""
    return (f"Nota de {c['fuente']}{lugar} clasificada automáticamente en el área "
            f"«{cls['nombre_area']}». Abre el enlace para leer la fuente original.")[:400]


def geocodificar(c, gaz, paises):
    if c["lat"] is not None and c["lon"] is not None:
        c["pais_iso3"] = c["pais_iso3"] or paises.de(c["lon"], c["lat"])
    if not c["pais_iso3"]:
        c["pais_iso3"] = gaz.pais_en_texto(c["titulo"])
    if c["pais_iso3"] and c["lat"] is None:
        lon, lat = gaz.centroide(c["pais_iso3"])
        c["lon"], c["lat"] = lon, lat
    if c["pais_iso3"] and c["pais_iso3"] not in gaz.paises:
        c["pais_iso3"] = None
    if c["lon"] is not None:
        c["lon"] = round(((c["lon"] + 540) % 360) - 180, 3)  # siempre en [-180, 180]
    return c


def clasificar(c, clasificador, nombres):
    puntajes, subtemas, _ = clasificador.puntuar(c["texto_clasificar"])
    if c.get("area_sugerida"):
        puntajes[c["area_sugerida"]] = puntajes.get(c["area_sugerida"], 0) + BONO_SUGERIDA
    if not puntajes:
        return None
    orden = sorted(puntajes, key=lambda a: (-puntajes[a], clasificador.areas.index(a)))
    principal, top = orden[0], puntajes[orden[0]]
    secundarias = [a for a in orden[1:] if puntajes[a] >= 0.35 * top][:3]
    segundo = puntajes[orden[1]] if len(orden) > 1 else 0.0
    confianza = round(max(0.05, min(1.0, 0.5 * (top - segundo) / top + 0.5 * min(1.0, top / 6))), 2)
    subs = sorted(set().union(*(subtemas.get(a, set()) for a in [principal, *secundarias])))
    return {"area_principal": principal, "areas_secundarias": secundarias, "subtemas": subs,
            "confianza": confianza, "nombre_area": nombres[principal]}


def a_evento(c, clasificador, nombres, gaz):
    cls = clasificar(c, clasificador, nombres)
    if cls is None:
        return None
    sev = c["severidad"] or severidad_texto(c["texto_clasificar"])
    return {
        "id": id_evento(c), "fecha_utc": c["fecha_utc"], "titulo": c["titulo"],
        "resumen": resumen_sistema(c, cls, gaz), "fuente": c["fuente"], "url": c["url"],
        "tipo_fuente": c["tipo_fuente"], "pais_iso3": c["pais_iso3"],
        "region": gaz.region(c["pais_iso3"]) if c["pais_iso3"] else None,
        "lat": c["lat"], "lon": c["lon"],
        "area_principal": cls["area_principal"], "areas_secundarias": cls["areas_secundarias"],
        "subtemas": cls["subtemas"], "actores": c["actores"][:6], "severidad": int(sev),
        "confianza_clasificacion": cls["confianza"], "verificado": False,
        "impacto_mexico": impacto_mexico(c["pais_iso3"], cls["area_principal"], cls["areas_secundarias"], c["texto_clasificar"], gaz, int(sev)),
        "fuentes": [{"fuente": c["fuente"], "url": c["url"], "tipo_fuente": c["tipo_fuente"], "fecha_utc": c["fecha_utc"]}],
        "estado_dato": "retrasado",
    }


def deduplicar(eventos):
    """Agrupa eventos del mismo país, a menos de 36 h y con títulos parecidos. Se queda con el de mayor
    severidad como principal y suma las fuentes de los demás. `verificado` = 2 o más medios distintos."""
    eventos = sorted(eventos, key=lambda e: (-e["severidad"], e["fecha_utc"]))
    grupos = {}  # país -> [(evento, tokens)]
    orden = []
    por_url = {}
    for e in eventos:
        t = tokens(e["titulo"])
        destino = por_url.get(e["url"])  # mismo enlace: GDELT codifica varios eventos por artículo
        # Una nota sin país se compara con todos los grupos; una con país, con los de su país y los sin país.
        if destino:
            candidatos = []
        elif e["pais_iso3"] is None:
            candidatos = [x for lista in grupos.values() for x in lista]
        else:
            candidatos = grupos.get(e["pais_iso3"], []) + grupos.get(None, [])
        for g, gt in candidatos:
            if (jaccard(t, gt) >= JACCARD_MIN
                    and abs((fecha(g["fecha_utc"]) - fecha(e["fecha_utc"])).total_seconds()) <= DEDUP_HORAS * 3600):
                destino = g
                break
        if destino is None:
            grupos.setdefault(e["pais_iso3"], []).append((e, t))
            orden.append(e)
            por_url[e["url"]] = e
            continue
        ya = {(f["fuente"], f["url"]) for f in destino["fuentes"]}
        for f in e["fuentes"]:
            if (f["fuente"], f["url"]) not in ya:
                destino["fuentes"].append(f)
        por_url[e["url"]] = destino
        if destino["pais_iso3"] is None and e["pais_iso3"]:  # el grupo toma la ubicación de la nota que sí la trae
            for k in ("pais_iso3", "region", "lat", "lon"):
                destino[k] = e[k]
        destino["actores"] = list(dict.fromkeys(destino["actores"] + e["actores"]))[:6]
    for g in orden:
        g["verificado"] = len({f["fuente"] for f in g["fuentes"]}) >= 2
    return orden


def unir_con_anteriores(nuevos, anteriores, limite):
    """Los eventos nuevos reemplazan al mismo id; los anteriores siguen si están dentro de la ventana."""
    por_id = {e["id"]: copy.deepcopy(e) for e in anteriores if fecha(e["fecha_utc"]) >= limite}
    for e in nuevos:
        previo = por_id.get(e["id"])
        if previo:  # conserva fuentes acumuladas en corridas previas (o de otro feed con el mismo enlace)
            ya = {(f["fuente"], f["url"]) for f in e["fuentes"]}
            e["fuentes"] += [f for f in previo["fuentes"] if (f["fuente"], f["url"]) not in ya]
            e["verificado"] = len({f["fuente"] for f in e["fuentes"]}) >= 2
        por_id[e["id"]] = e
    return list(por_id.values())


def priorizar(eventos, maximo):
    """Si hay más eventos que el máximo, quedan los más graves y, a igual severidad, los más recientes."""
    if len(eventos) > maximo:
        eventos = sorted(eventos, key=lambda e: (e["severidad"], len(e["fuentes"]), e["fecha_utc"]), reverse=True)[:maximo]
    return sorted(eventos, key=lambda e: e["fecha_utc"], reverse=True)


def compacto(e):
    return {k: e[k] for k in ("id", "fecha_utc", "titulo", "url", "fuente", "tipo_fuente", "pais_iso3", "lat", "lon",
                              "area_principal", "severidad", "nivel_alerta", "impacto_mexico")}


def indice_historial(carpeta):
    """Lista de días disponibles (para que el mapa los pida bajo demanda): [{dia, total, bytes}]."""
    dias = []
    for ruta in sorted(glob.glob(os.path.join(carpeta, "*.json"))):
        with open(ruta, encoding="utf-8") as f:
            total = json.load(f)["total"]
        dias.append({"dia": os.path.basename(ruta)[:10], "total": total, "bytes": os.path.getsize(ruta)})
    return dias


def actualizar_historial(carpeta, eventos, hoy, dias):
    """Un archivo por día (historial/AAAA-MM-DD.json) con registros compactos; se borran los de más de 90 días."""
    os.makedirs(carpeta, exist_ok=True)
    por_dia = {}
    for e in eventos:
        por_dia.setdefault(e["fecha_utc"][:10], []).append(compacto(e))
    corte = (hoy - timedelta(days=dias)).strftime("%Y-%m-%d")
    for dia, nuevos in por_dia.items():
        if dia < corte:
            continue
        ruta = os.path.join(carpeta, f"{dia}.json")
        previos = []
        if os.path.exists(ruta):
            with open(ruta, encoding="utf-8") as f:
                previos = json.load(f)["eventos"]
        todos = {r["id"]: r for r in previos}
        todos.update({r["id"]: r for r in nuevos})
        lista = sorted(todos.values(), key=lambda r: (-r["severidad"], r["fecha_utc"]))[:HIST_MAX_DIA]
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump({"dia": dia, "total": len(lista), "eventos": lista}, f, ensure_ascii=False, separators=(",", ":"))
    borrados = 0
    for ruta in glob.glob(os.path.join(carpeta, "*.json")):
        if os.path.basename(ruta)[:10] < corte:
            os.remove(ruta)
            borrados += 1
    return borrados


def leer_historial(carpeta, desde):
    out = []
    for ruta in sorted(glob.glob(os.path.join(carpeta, "*.json"))):
        if os.path.basename(ruta)[:10] >= desde:
            with open(ruta, encoding="utf-8") as f:
                out += json.load(f)["eventos"]
    return out


def proxima_corrida(t):
    base = t.replace(minute=17, second=0)
    return base if base > t else base + timedelta(hours=1)


def recolectar(cfg, appname):
    """Corre cada fuente y devuelve (candidatos, salud por fuente)."""
    candidatos, salud = [], []

    def correr(fid, nombre, fn):
        t0 = time.time()
        try:
            r = fn()
            salud.append({"id": fid, "nombre": nombre, "estado": "ok" if r else "vacia", "eventos": len(r),
                          "segundos": round(time.time() - t0, 1), "error": None})
            candidatos.extend(r)
        except Exception as e:  # noqa: BLE001  una fuente caída no detiene la corrida
            salud.append({"id": fid, "nombre": nombre, "estado": "error", "eventos": 0,
                          "segundos": round(time.time() - t0, 1), "error": f"{type(e).__name__}: {e}"[:300]})
        print(f"  {fid}: {salud[-1]['estado']} ({salud[-1]['eventos']})" + (f" · {salud[-1]['error']}" if salud[-1]["error"] else ""))

    if cfg["gdelt"]["habilitada"]:
        correr("gdelt", "GDELT 2.0", lambda: F.gdelt(cfg["gdelt"]))
    for feed in (f for f in cfg["rss"] if f.get("habilitada", True)):
        correr(feed["id"], feed["nombre"], lambda feed=feed: F.rss(feed))
    if cfg["reliefweb"]["habilitada"]:
        if appname:
            correr("reliefweb", "ReliefWeb (OCHA)", lambda: F.reliefweb(cfg["reliefweb"], appname))
        else:
            salud.append({"id": "reliefweb", "nombre": "ReliefWeb (OCHA)", "estado": "omitida", "eventos": 0,
                          "segundos": 0, "error": "Falta el secreto RELIEFWEB_APPNAME"})
    return candidatos, salud


def procesar(candidatos, anteriores, cfg, t, gaz, paises, clasificador, taxonomy):
    """Lógica pura (sin red): candidatos -> lista final de eventos. Se prueba en tests/test_ingesta.py."""
    nombres = {a["id"]: a["nombre"] for a in taxonomy["areas"]}
    limite = t - timedelta(hours=cfg["ventana_horas"])
    sin_clasificar = []
    eventos, descartados = [], {"fuera_de_ventana": 0, "fuera_de_tema": 0, "sin_clasificar": 0, "ejemplos": sin_clasificar}
    for c in candidatos:
        f = fecha(c["fecha_utc"])
        if f < limite:
            descartados["fuera_de_ventana"] += 1
            continue
        if f > t + timedelta(minutes=10):  # relojes mal configurados en algunos feeds
            c["fecha_utc"] = iso(t)
        if not c["fuente"].startswith("GDELT") and fuera_de_tema(c["titulo"], c["texto_clasificar"]):
            descartados["fuera_de_tema"] += 1
            continue
        e = a_evento(geocodificar(c, gaz, paises), clasificador, nombres, gaz)
        if e is None:
            descartados["sin_clasificar"] += 1
            if len(sin_clasificar) < 15:  # solo título y fuente, para revisar palabras clave faltantes
                sin_clasificar.append({"titulo": c["titulo"], "fuente": c["fuente"], "url": c["url"]})
            continue
        eventos.append(e)
    # Se deduplica después de unir: una nota nueva puede ser la misma historia que un evento anterior.
    todos = priorizar(deduplicar(unir_con_anteriores(eventos, anteriores, limite)), cfg["max_eventos_publicados"])
    enriquecer(todos, anteriores=anteriores, estado_dato="retrasado")
    return todos, descartados


def calidad(eventos):
    """Indicadores de calidad de la corrida (se muestran en la pestaña «Calidad» del mapa)."""
    n = len(eventos) or 1
    por_area = {}
    for e in eventos:
        por_area[e["area_principal"]] = por_area.get(e["area_principal"], 0) + 1
    return {
        "eventos": len(eventos),
        "sin_pais": sum(1 for e in eventos if not e["pais_iso3"]),
        "confianza_baja": sum(1 for e in eventos if e["confianza_clasificacion"] < 0.3),
        "verificados": sum(1 for e in eventos if e["verificado"]),
        "con_varias_fuentes": sum(1 for e in eventos if len(e["fuentes"]) > 1),
        "impacto_mexico": sum(1 for e in eventos if e["impacto_mexico"]),
        "confianza_media": round(sum(e["confianza_clasificacion"] for e in eventos) / n, 2),
        "por_area": dict(sorted(por_area.items(), key=lambda x: -x[1])),
        "por_tipo_fuente": {t: sum(1 for e in eventos if e["tipo_fuente"] == t) for t in ("noticia", "base_datos", "analisis", "red_social")},
    }


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", default="eventos", help="carpeta de salida (rama datos-eventos)")
    args = ap.parse_args(argv)
    os.makedirs(args.salida, exist_ok=True)
    with open(os.path.join(ROOT, "config", "fuentes.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    with open(os.path.join(ROOT, "config", "taxonomy.json"), encoding="utf-8") as f:
        taxonomy = json.load(f)

    t = ahora_utc()
    ruta_ev = os.path.join(args.salida, "events.json")
    anteriores = []
    if os.path.exists(ruta_ev):
        with open(ruta_ev, encoding="utf-8") as f:
            previo = json.load(f)
        if previo.get("modo") == "produccion":
            anteriores = previo["eventos"]
    print(f"Corrida {iso(t)} · eventos anteriores: {len(anteriores)}")

    candidatos, salud = recolectar(cfg, os.environ.get("RELIEFWEB_APPNAME", "").strip())
    eventos, descartados = procesar(candidatos, anteriores, cfg, t, Gazetteer(), Paises(), Clasificador(taxonomy), taxonomy)
    ejemplos = descartados.pop("ejemplos")  # títulos sin área: van aparte en el run-log

    data = {"version_esquema": "1.0", "generado_utc": iso(t), "modo": "produccion", "total": len(eventos), "eventos": eventos}
    errores = validar(data, taxonomy)
    if errores:
        print("✗ La validación falló; no se publica nada:")
        for e in errores[:30]:
            print("  -", e)
        # Solo para el resumen del workflow; el paso de publicación no corre si la ingesta falla.
        with open(os.path.join(args.salida, "corrida-fallida.json"), "w", encoding="utf-8") as f:
            json.dump({"generado_utc": iso(t), "fuentes": salud, "errores_validacion": errores[:30]}, f, ensure_ascii=False, indent=1)
        return 1

    with open(ruta_ev, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    borrados = actualizar_historial(os.path.join(args.salida, "historial"), eventos, t, cfg["historial_dias"])
    with open(os.path.join(args.salida, "historial-indice.json"), "w", encoding="utf-8") as f:
        json.dump({"generado_utc": iso(t), "dias": indice_historial(os.path.join(args.salida, "historial"))}, f, ensure_ascii=False)
    recientes = leer_historial(os.path.join(args.salida, "historial"), (t - timedelta(days=30)).strftime("%Y-%m-%d"))
    with open(os.path.join(args.salida, "indice-paises.json"), "w", encoding="utf-8") as f:
        json.dump({"generado_utc": iso(t), "nota": "Indicador propio (docs/INDICADORES.md). Base: historial de 30 días.",
                   "paises": indice_inestabilidad(recientes, t)}, f, ensure_ascii=False, indent=1)
    nuevos = sum(1 for e in eventos if e["delta"] == "nuevo")
    log = {
        "generado_utc": iso(t), "modo": "produccion", "cron": CRON, "intervalo_minutos": 60,
        "proxima_ejecucion_utc": iso(proxima_corrida(t)), "eventos_total": len(eventos), "eventos_nuevos": nuevos,
        "candidatos": len(candidatos), "descartados": descartados, "historial_borrados": borrados,
        "calidad": calidad(eventos), "ejemplos_sin_clasificar": ejemplos,
        "fuentes": salud, "errores": [f"{s['id']}: {s['error']}" for s in salud if s["estado"] == "error"],
    }
    with open(os.path.join(args.salida, "run-log.json"), "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=1)
    print(f"✓ {len(eventos)} eventos ({nuevos} nuevos) · candidatos {len(candidatos)} · descartados {descartados}")
    if all(s["estado"] in ("error", "omitida") for s in salud):
        print("✗ Todas las fuentes fallaron")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
