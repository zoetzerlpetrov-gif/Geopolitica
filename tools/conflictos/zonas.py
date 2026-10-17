#!/usr/bin/env python3
"""Zonas de conflicto: polígonos de cada conflicto de config/conflictos.json a partir de Natural Earth 1:10m admin-1
(dominio público). Une las regiones de cada conflicto (o el país completo) y simplifica a ~2 km.
Salida: data/base/conflictos.geojson (estática; se vuelve a generar al cambiar la lista).
Uso: python3 tools/conflictos/zonas.py [ruta_admin1.geojson]
"""
import json
import os
import sys
import unicodedata
import urllib.request

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"
SALIDA = os.path.join(ROOT, "data", "base", "conflictos.geojson")


def norm(t):
    return unicodedata.normalize("NFD", str(t or "")).encode("ascii", "ignore").decode().lower().replace("'", "").strip()


def redondear(c):
    return [round(c[0], 3), round(c[1], 3)] if isinstance(c[0], (int, float)) else [redondear(x) for x in c]


def construir(admin1, cfg):
    por_pais = {}
    for f in admin1["features"]:
        p = f["properties"]
        por_pais.setdefault(p.get("adm0_a3"), []).append(f)
    feats, faltan = [], []
    for c in cfg["conflictos"]:
        partes = []
        for iso3 in c.get("paises", []):
            partes += [shape(f["geometry"]) for f in por_pais.get(iso3, [])]
        for iso3, nombres in (c.get("regiones") or {}).items():
            idx = {norm(f["properties"].get("name")): f for f in por_pais.get(iso3, [])}
            for n in nombres:
                f = idx.get(norm(n))
                if f:
                    partes.append(shape(f["geometry"]))
                else:
                    faltan.append(f"{c['id']}: {iso3}/{n}")
        if not partes:
            continue
        g = unary_union([p.buffer(0) for p in partes]).simplify(0.02, preserve_topology=True)
        m = mapping(g)
        props = {k: c[k] for k in ("id", "nombre", "desde", "intensidad", "partes", "resumen") if k in c}
        props.update({"paises": sorted(set(c.get("paises", [])) | set((c.get("regiones") or {}).keys())), "palabras": c.get("palabras", []),
                      "videos": c.get("videos", c["nombre"]), "nota_regiones": c.get("nota_regiones", ""), "opacidad": 0.35})
        # Punto para la etiqueta: dentro de la región más grande del conflicto.
        mayor = max(getattr(g, "geoms", [g]), key=lambda x: x.area)
        rp = mayor.representative_point()
        props["etiqueta"] = [round(rp.x, 3), round(rp.y, 3)]
        feats.append({"type": "Feature", "geometry": {"type": m["type"], "coordinates": redondear(json.loads(json.dumps(m["coordinates"])))}, "properties": props})
    return {"type": "FeatureCollection", "revisado": cfg.get("revisado"), "nota": cfg.get("nota"), "fuente": "Natural Earth 1:10m admin-1 (dominio público); lista curada propia",
            "features": feats}, faltan


def main(ruta=None):
    if ruta:
        admin1 = json.load(open(ruta, encoding="utf-8"))
    else:
        with urllib.request.urlopen(NE, timeout=300) as r:
            admin1 = json.loads(r.read())
    cfg = json.load(open(os.path.join(ROOT, "config", "conflictos.json"), encoding="utf-8"))
    fc, faltan = construir(admin1, cfg)
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    json.dump(fc, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"conflictos: {len(fc['features'])} zonas; regiones no encontradas: {faltan or 'ninguna'}; {os.path.getsize(SALIDA) // 1024} KB")
    return 1 if faltan else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else None))
