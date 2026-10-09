#!/usr/bin/env python3
"""Niveles de alerta volcánica oficiales.

  · Popocatépetl: Semáforo de Alerta Volcánica de CENAPRED, leído del reporte diario que CENAPRED publica en
    gob.mx («Monitoreo del volcán Popocatépetl hoy …»). Se toma la frase «El Semáforo de Alerta Volcánica del
    Popocatépetl se encuentra en AMARILLO FASE 2» de la descripción del artículo. Si no aparece, no se inventa.
  · Estados Unidos (Alaska, Hawái, Cascadas, Yellowstone…): niveles de USGS (NORMAL/ADVISORY/WATCH/WARNING)
    y código de aviación (GREEN/YELLOW/ORANGE/RED) de los volcanes con alerta elevada, con sus coordenadas.
Salida: vivos/volcanes_alerta.json (cada 3 h como máximo).
"""
import html
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "volcanes_alerta.json")
GOBMX = "https://www.gob.mx"
LISTA_CENAPRED = GOBMX + "/cenapred/archivo/articulos?idiom=es"
USGS_ELEVADOS = "https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes"
USGS_VOLCAN = "https://volcanoes.usgs.gov/hans-public/api/volcano/getVolcano/{vnum}"
CADA_H = 3


def ultimo_reporte_popo(texto_lista):
    """Ruta del reporte diario más reciente (la lista llega como JavaScript con comillas escapadas)."""
    rutas = re.findall(r'href=\\?"(/cenapred/(?:es/)?articulos/monitoreo-del-volcan-popocatepetl-hoy-[^"\\?]+)', texto_lista)
    return rutas[0] if rutas else None


def semaforo_de(texto_articulo):
    """«AMARILLO FASE 2» → ("Amarillo", 2); None si la frase no aparece."""
    t = html.unescape(texto_articulo)
    m = re.search(r"Sem[aá]foro de Alerta Volc[aá]nica[^.]{0,80}?\b(VERDE|AMARILLO|ROJO)\s+FASE\s+(\d)", t, re.I)
    if not m:
        return None
    return m.group(1).capitalize(), int(m.group(2))


def fecha_de_ruta(ruta):
    m = re.search(r"hoy-(\d{1,2})-de-([a-z]+)-de-(\d{4})", ruta or "")
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    if not m or m.group(2) not in meses:
        return None
    return f"{m.group(3)}-{meses.index(m.group(2)) + 1:02d}-{int(m.group(1)):02d}"


def popocatepetl():
    if not F.permitido_por_robots(LISTA_CENAPRED):
        raise PermissionError("robots.txt de gob.mx no lo permite")
    ruta = ultimo_reporte_popo(F.get(LISTA_CENAPRED, timeout=40).decode("utf-8", "replace"))
    if not ruta:
        raise RuntimeError("no se encontró el reporte diario en la lista de CENAPRED")
    url = GOBMX + ruta + "?idiom=es"
    s = semaforo_de(F.get(url, timeout=40).decode("utf-8", "replace"))
    if not s:
        raise RuntimeError("el reporte no menciona el semáforo")
    return {"volcan": "Popocatépetl", "semaforo": s[0], "fase": s[1], "texto": f"{s[0]} Fase {s[1]}", "fecha": fecha_de_ruta(ruta), "url": url,
            "fuente": "CENAPRED (reporte diario en gob.mx)"}


def usgs():
    elevados = json.loads(F.get(USGS_ELEVADOS, timeout=40))
    out = []
    for v in elevados[:30]:
        info = {}
        if v.get("vnum"):
            try:
                info = json.loads(F.get(USGS_VOLCAN.format(vnum=v["vnum"]), timeout=30))
            except Exception:  # noqa: BLE001
                info = {}
            time.sleep(0.5)
        if info.get("latitude") is None:
            continue
        out.append({"volcan": v.get("volcano_name"), "lat": info["latitude"], "lon": info["longitude"], "elevacion_m": info.get("elevation_meters"),
                    "nivel": v.get("alert_level"), "codigo_aviacion": v.get("color_code"), "enviado_utc": v.get("sent_utc"),
                    "observatorio": v.get("obs_fullname"), "url": v.get("notice_url") or info.get("volcano_url"), "fuente": "USGS"})
    return out


def main():
    if os.path.exists(OUT):
        gen = json.load(open(OUT, encoding="utf-8")).get("generado_utc", "")
        if gen and datetime.now(timezone.utc) - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=CADA_H):
            print("volcanes: datos recientes; se conservan")
            return 0
    previo = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    salida, estado = {"mexico": previo.get("mexico", []), "usgs": previo.get("usgs", [])}, {}
    try:
        salida["mexico"] = [popocatepetl()]
        estado["cenapred"] = "ok"
    except Exception as e:  # noqa: BLE001
        estado["cenapred"] = f"error: {e}"[:160]
    try:
        salida["usgs"] = usgs()
        estado["usgs"] = f"ok ({len(salida['usgs'])} con alerta elevada)"
    except Exception as e:  # noqa: BLE001
        estado["usgs"] = f"error: {e}"[:160]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fuentes": estado, **salida},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"volcanes: {estado}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
