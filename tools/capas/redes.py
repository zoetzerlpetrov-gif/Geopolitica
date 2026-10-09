"""Vías férreas y autopistas principales (Natural Earth 1:10 m, dominio público).

Natural Earth es una generalización cartográfica: trae las líneas que se verían en un mapa mundial
(25 mil tramos de vía y 56 mil de carretera), no cada vía de patio o camino rural. Para el monitor eso
basta: muestra los corredores que unen ciudades, puertos y fronteras.

Vías férreas: Natural Earth no trae nombres; sí trae si la línea está electrificada y si es de vía doble
o múltiple (atributos «electric» y «mult_track», 0 = no o sin dato).
Autopistas: tipo «Major Highway» o «Beltway» (periférico) o marcadas como vía rápida (expressway = 1).
La propiedad «name» suele ser el número de ruta (p. ej. «57D» en México).
El zoom mínimo sale de «scalerank» (1 = se ve desde lejos, 10 = solo de cerca).
"""


def zoom_de_escala(scalerank):
    """scalerank de Natural Earth (≈ 3-10) → zoom mínimo en el mapa (2-7)."""
    try:
        r = int(scalerank)
    except (TypeError, ValueError):
        return 6
    return max(2, min(7, r - 3))


def tramos(geom):
    """LineString o MultiLineString → lista de LineString redondeadas (el mapa filtra por LineString)."""
    if not geom:
        return []
    if geom["type"] == "LineString":
        partes = [geom["coordinates"]]
    elif geom["type"] == "MultiLineString":
        partes = geom["coordinates"]
    else:
        return []
    out = []
    for p in partes:
        pts = [[round(float(c[0]), 4), round(float(c[1]), 4)] for c in p]
        if len(pts) >= 2:
            out.append({"type": "LineString", "coordinates": pts})
    return out


def _medio(linea):
    c = linea["coordinates"]
    return c[len(c) // 2]


def features_ferrocarriles(fc, feat, pais_de=lambda lon, lat: ""):
    out = []
    for i, f in enumerate(fc.get("features", [])):
        p = f.get("properties") or {}
        if p.get("featurecla") not in ("Railroad", "Railroad ferry"):
            continue
        if p.get("featurecla") == "Railroad ferry":
            st = "ferrocarril_transbordador"
        elif (p.get("electric") or 0) > 0:
            st = "ferrocarril_electrificado"
        else:
            st = "ferrocarril_sin_electrificar"
        vias = "vía doble o múltiple" if (p.get("mult_track") or 0) > 0 else ""
        for j, linea in enumerate(tramos(f.get("geometry"))):
            out.append(feat(linea, {"id": f"ne:fc{i}-{j}", "n": "", "st": st, "p": pais_de(*_medio(linea)), "x": vias},
                            zoom_de_escala(p.get("scalerank"))))
    return out


def es_autopista(p):
    return p.get("featurecla") == "Road" and (p.get("expressway") == 1 or p.get("type") in ("Major Highway", "Beltway"))


def features_autopistas(fc, feat):
    out = []
    for i, f in enumerate(fc.get("features", [])):
        p = f.get("properties") or {}
        if not es_autopista(p):
            continue
        st = "autopista" if p.get("expressway") == 1 else "carretera_troncal"
        nombre = p.get("label") or p.get("name") or ""
        extra = " · ".join(x for x in [p.get("level") or "", "de cuota" if p.get("toll") == 1 else ""] if x)
        for j, linea in enumerate(tramos(f.get("geometry"))):
            out.append(feat(linea, {"id": f"ne:rd{i}-{j}", "n": str(nombre), "st": st, "p": p.get("sov_a3") or "", "x": extra},
                            zoom_de_escala(p.get("scalerank"))))
    return out
