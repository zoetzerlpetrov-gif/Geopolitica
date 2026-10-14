#!/usr/bin/env python3
"""Avisos náuticos vigentes de seguridad y emergencia (radioavisos NAVAREA, HYDROPAC y HYDROLANT).

Fuente: Maritime Safety Information de la NGA (EUA), `msi.nga.mil/api/publications/broadcast-warn` (dominio público;
robots.txt lo permite). Son los avisos por radio que reciben los barcos: cada uno con número, zona NAVAREA, fecha y
texto con coordenadas. De los ~400 vigentes se guardan solo los de emergencia o seguridad (los de plataformas
petroleras, cables o faros se omiten):
  - Piratería, robo armado, abordajes, ataques, aproximaciones sospechosas, secuestros.
  - Minas, misiles, cohetes, ejercicios de tiro y operaciones peligrosas (militares o espaciales).
  - Embarcaciones a la deriva, naufragios, personas al agua o búsqueda y rescate.
  - Interferencia de GPS / GNSS.
La antigua base ASAM de piratería de la NGA ya no responde en su API (404 desde octubre de 2026); UKMTO y el ICC IMB
no ofrecen una API pública: sus incidentes llegan al mapa por las noticias (subcategoría «Incidentes marítimos»).
Salida: vivos/avisos_nauticos.geojson.
"""
import json
import os
import re
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "avisos_nauticos.geojson")
API = "https://msi.nga.mil/api/publications/broadcast-warn?output=json&status=A"
# (categoría, severidad 1–5, patrones del texto en inglés)
CATEGORIAS = [
    ("pirateria", "Piratería, robo armado o ataque", 4, r"PIRAC|PIRATE|ARMED ROBBERY|HIJACK|BOARDED|BOARDING|ATTACK|SUSPICIOUS APPROACH|SUSPICIOUS VESSEL|SKIFF"),
    ("minas_misiles", "Minas, misiles o explosivos", 4, r"\bMINES?\b|MINEFIELD|MISSILE|UNEXPLODED|ORDNANCE|EXPLOSIVE"),
    ("rescate", "Embarcación a la deriva, naufragio o búsqueda y rescate", 3, r"ADRIFT|DERELICT|CAPSIZED|SUNK|SANK|MAN OVERBOARD|PERSONS? IN (?:THE )?WATER|OVERDUE|MISSING|DISTRESS|SEARCH AND RESCUE|\bSAR\b|ABANDONED"),
    ("gnss", "Interferencia de GPS / GNSS", 3, r"\bGPS\b|\bGNSS\b|JAMMING|INTERFERENCE|SPOOFING"),
    ("militar_espacial", "Tiro, ejercicios militares, cohetes o restos espaciales", 2, r"GUNNERY|LIVE FIR|FIRING EXERCISE|MILITARY EXERCISE|NAVAL EXERCISE|ROCKET|SPACE DEBRIS|HAZARDOUS OPERATIONS|LAUNCH"),
]
COORD = re.compile(r"(\d{1,2})-(\d{1,2}(?:\.\d+)?)\s*([NS])\s+(\d{1,3})-(\d{1,2}(?:\.\d+)?)\s*([EW])")
ZONAS = {"P": "HYDROPAC (Pacífico)", "A": "HYDROLANT (Atlántico)", "C": "HYDROARC (Ártico)", "4": "NAVAREA IV (Atlántico occidental y Caribe)",
         "12": "NAVAREA XII (Pacífico oriental)"}


def coordenadas(texto):
    out = []
    for la, lam, ns, lo, lom, ew in COORD.findall(texto):
        lat = (int(la) + float(lam) / 60) * (1 if ns == "N" else -1)
        lon = (int(lo) + float(lom) / 60) * (1 if ew == "E" else -1)
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            out.append([round(lon, 3), round(lat, 3)])
    return out


def categoria(texto):
    for cid, nombre, sev, patron in CATEGORIAS:
        if re.search(patron, texto):
            return cid, nombre, sev
    return None


def a_features(aviso):
    texto = aviso.get("text") or ""
    cat = categoria(texto)
    pts = coordenadas(texto)
    if not cat or not pts:
        return []
    cid, nombre, sev = cat
    ident = f"{aviso.get('navArea')} {aviso.get('msgNumber')}/{aviso.get('msgYear')}"
    props = {"id": ident, "categoria": cid, "categoria_texto": nombre, "sev": sev, "zona": ZONAS.get(str(aviso.get("navArea")), f"NAVAREA {aviso.get('navArea')}"),
             "subregion": aviso.get("subregion") or "", "emitido": aviso.get("issueDate") or "", "autoridad": aviso.get("authority") or "",
             "texto": re.sub(r"\s+", " ", texto).strip()[:1200], "url": "https://msi.nga.mil/NavWarnings", "fuente": "NGA Maritime Safety Information"}
    feats = []
    if len(pts) >= 3 and re.search(r"BOUND|AREA|WITHIN", texto) and pts[0] != pts[-1]:
        feats.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [pts + [pts[0]]]}, "properties": {**props, "kind": "area"}})
    # Un punto por coordenada (hasta 12) para poder tocarlo en el mapa.
    for c in pts[:12]:
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": c}, "properties": {**props, "kind": "punto"}})
    return feats


def main():
    try:
        if not F.permitido_por_robots(API):
            raise PermissionError("robots.txt no lo permite")
        avisos = json.loads(F.get(API, timeout=90)).get("broadcast-warn") or []
    except Exception as e:  # noqa: BLE001
        print(f"avisos náuticos: sin datos ({e}); se conserva el archivo anterior")
        return 0
    feats = [f for a in avisos for f in a_features(a)]
    por_cat = {}
    for f in feats:
        if f["properties"]["kind"] == "punto":
            por_cat[f["properties"]["categoria"]] = por_cat.get(f["properties"]["categoria"], set()) | {f["properties"]["id"]}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "vigentes": len(avisos),
               "features": feats}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"avisos náuticos: {len(avisos)} vigentes; de seguridad: { {k: len(v) for k, v in por_cat.items()} }")
    return 0


if __name__ == "__main__":
    sys.exit(main())
