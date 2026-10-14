#!/usr/bin/env python3
"""Zonas posiblemente afectadas: estados, provincias o regiones donde ocurren eventos de severidad media a extrema de las últimas 48 h.

Cómo se decide (sin IA, reglas verificables):
  1. Se toman los eventos publicados con severidad ≥ 3 de las últimas 48 h que tienen país, solo de medios y fuentes
     oficiales (sin señales automáticas de GDELT ni redes sociales).
  2. Si el título o el resumen NOMBRA un estado, provincia o región de ese país (con mayúscula inicial, como nombre
     propio), esa división se marca: motivo «mencionada en la nota».
  3. Si no nombra ninguna pero el evento trae coordenadas propias (no el centro del país que se usa cuando la nota
     solo dice el país), se marca la división donde cae el punto: motivo «ubicación de la fuente».
  4. Por división: número de eventos, severidad máxima y hasta 8 eventos (título, fuente, fecha, enlace).
Es una aproximación: «mencionada» no significa que toda la división esté afectada, y una nota puede nombrar un
estado por otra razón. Los polígonos oficiales (cono de huracán, zona de tsunami, avisos MeteoAlarm) están en
sus propias capas.

Polígonos: Natural Earth 1:10m admin-1 (dominio público), simplificados a ~2 km y guardados en caché
(~/.cache/admin1/poligonos.json; se generan una vez con shapely).
Uso: python3 tools/zonas_afectadas.py --eventos eventos/events.json --salida eventos/zonas_afectadas.geojson
"""
import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"
CACHE = os.path.expanduser("~/.cache/admin1/poligonos.json")
SEV_MIN = 3
HORAS = 48
MAX_EVENTOS = 8
# Nombres de divisiones que también son palabras comunes en titulares.
COMUNES = {"centro", "central", "norte", "sur", "este", "oeste", "north", "south", "east", "west", "capital", "union", "distrito",
           "federal", "nacional", "national", "national capital", "mexico", "amazonas", "georgia", "victoria", "valle", "santa", "san",
           "guerrero", "hidalgo", "morelos", "colima", "durango", "campeche", "tabasco", "zacatecas", "independencia", "libertad"}


def norm(t):
    t = unicodedata.normalize("NFKD", str(t or "").lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


# ---------------------------------------------------------------- polígonos
def construir_cache(destino=CACHE, tolerancia=0.02):
    """Descarga Natural Earth admin-1 y guarda polígonos simplificados con sus nombres (requiere shapely)."""
    import urllib.request
    from shapely.geometry import mapping, shape
    fc = json.load(urllib.request.urlopen(NE, timeout=300))
    out = []
    for f in fc["features"]:
        p = f["properties"]
        if not p.get("adm0_a3") or not f.get("geometry"):
            continue
        g = shape(f["geometry"]).simplify(tolerancia, preserve_topology=True)
        if g.is_empty:
            continue
        nombres = []
        for k in ("name", "name_es", "name_en", "name_local", "gn_name", "woe_name"):
            v = (p.get(k) or "").strip()
            if v and v not in nombres:
                nombres.append(v)
        for v in (p.get("name_alt") or "").split("|"):
            if len(v.strip()) > 3 and v.strip() not in nombres:
                nombres.append(v.strip())
        gj = json.loads(json.dumps(mapping(g)))
        out.append({"nombres": nombres, "iso3": p["adm0_a3"], "region": (p.get("region") or "").strip(), "tipo": p.get("type_en") or "",
                    "bbox": [round(x, 3) for x in g.bounds], "geometry": {"type": gj["type"], "coordinates": _redondear(gj["coordinates"])}})
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    json.dump(out, open(destino, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return out


def _redondear(c):
    return [round(c[0], 3), round(c[1], 3)] if isinstance(c[0], (int, float)) else [_redondear(x) for x in c]


def _en_anillo(x, y, anillo):
    dentro = False
    j = len(anillo) - 1
    for i in range(len(anillo)):
        xi, yi = anillo[i][0], anillo[i][1]
        xj, yj = anillo[j][0], anillo[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            dentro = not dentro
        j = i
    return dentro


def contiene(geom, x, y):
    polis = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    for poli in polis:
        if poli and _en_anillo(x, y, poli[0]) and not any(_en_anillo(x, y, h) for h in poli[1:]):
            return True
    return False


class Divisiones:
    def __init__(self, polis, nombres_pais=None):
        self.polis = polis
        self.por_pais = {}
        for i, p in enumerate(polis):
            self.por_pais.setdefault(p["iso3"], []).append(i)
        # Nombre del país (y sus variantes) → no cuenta como nombre de división: «México» el estado ≠ el país.
        self.nombres_pais = nombres_pais or {}
        self._claves = {}

    def claves(self, iso3):
        """[(nombre normalizado, nombre original, índices)] de las divisiones del país, incluidas sus regiones."""
        if iso3 in self._claves:
            return self._claves[iso3]
        excluir = COMUNES | {norm(n) for n in self.nombres_pais.get(iso3, [])}
        mapa = {}
        for i in self.por_pais.get(iso3, []):
            p = self.polis[i]
            for n in p["nombres"]:
                k = norm(n)
                if len(k) >= 4 and k not in excluir:
                    mapa.setdefault(k, (n, set()))[1].add(i)
            r = norm(p.get("region"))
            if len(r) >= 4 and r not in excluir:
                mapa.setdefault(r, (p["region"], set()))[1].add(i)
        # Las frases más largas primero: «Baja California Sur» antes que «Baja California».
        self._claves[iso3] = sorted(((k, n, ids) for k, (n, ids) in mapa.items()), key=lambda x: -len(x[0]))
        return self._claves[iso3]

    def mencionadas(self, iso3, texto):
        """{índice de división: nombre tal como aparece en la nota} (palabra completa y con mayúscula en el original)."""
        t = f" {norm(texto)} "
        plano = unicodedata.normalize("NFKD", texto)
        plano = "".join(c for c in plano if not unicodedata.combining(c))
        encontrados, usados = {}, []
        for k, nombre, ids in self.claves(iso3):
            pos = t.find(f" {k} ")
            if pos < 0 or any(a <= pos < b for a, b in usados):
                continue
            # Nombre de organización, no de lugar: «Cártel de Sinaloa», «Cartel del Golfo», «Sinaloa Cartel».
            despues = t[pos + len(k) + 1:]
            if re.search(r"(?:cartel|carteles|clan) del? $", t[:pos + 1]) or despues.startswith(" cartel"):
                continue
            # Nombre de un medio: «The New York Times», «Washington Post», «Chicago Tribune».
            if re.match(r" (?:times|post|tribune|herald|journal|daily|chronicle|gazette) ", despues):
                continue
            m = re.search(rf"(?i)\b{re.escape(nombre.split()[0][:4])}", plano)
            if m and not plano[m.start()].isupper():
                continue
            usados.append((pos, pos + len(k) + 1))
            for i in ids:
                encontrados.setdefault(i, nombre)
        return encontrados

    def en_punto(self, iso3, lon, lat):
        for i in self.por_pais.get(iso3, []):
            b = self.polis[i]["bbox"]
            if b[0] <= lon <= b[2] and b[1] <= lat <= b[3] and contiene(self.polis[i]["geometry"], lon, lat):
                return i
        return None


# ---------------------------------------------------------------- zonas
def _fecha(s):
    try:
        return datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


# Qué tipo de hecho afecta a la zona, según palabras del título y resumen (sin acentos). El primero que coincide gana.
TEMAS = [
    ("Huracán, ciclón o tormenta tropical", r"huracan|ciclon|tifon|tormenta tropical|depresion tropical|hurricane|cyclone|typhoon|tropical storm"),
    ("Sismo o tsunami", r"sismo|terremoto|temblor|tsunami|earthquake|quake"),
    ("Erupción volcánica", r"volcan|erupcion|ceniza|eruption|volcano"),
    ("Inundaciones o lluvias", r"inundac|lluvias|desbord|deslave|alud|flood|landslide|heavy rain"),
    ("Incendio", r"incendio|wildfire|\bfire\b|forest fire"),
    ("Ataque con misiles, drones o bombardeo", r"misil|dron|bombarde|ataque aereo|missile|drone|airstrike|shelling|strikes? on"),
    ("Terrorismo", r"terroris|atentado|explosivo|terror attack|suicide bomb"),
    ("Violencia armada o crimen organizado", r"balacera|enfrentamiento|asesina|homicid|ejecut|cartel|sicari|tiroteo|gunman|shooting|killed|clashes|emboscada"),
    ("Secuestro o desaparición", r"secuestr|desaparec|levanton|kidnap|abduct"),
    ("Crisis de agua, energía o combustible", r"crisis de agua|sin agua|sequia|apagon|desabasto|huachicol|gasolina|blackout|drought|water crisis"),
    ("Protestas, bloqueos o disturbios", r"protest|manifest|marcha|bloqueo|paro|huelga|disturbio|riot|strike|demonstrat"),
    ("Brote o emergencia sanitaria", r"brote|epidemia|dengue|colera|sarampion|outbreak|epidemic|cholera"),
    ("Accidente de transporte", r"descarril|choque|accidente|aterrizaje de emergencia|naufrag|crash|derail|collision"),
]


def tema_de(texto, area=None, nombres_area=None):
    t = f" {norm(texto)} "
    for nombre, patron in TEMAS:
        if re.search(patron, t):
            return nombre
    return (nombres_area or {}).get(area) or "Otro hecho de severidad media o alta"


def de_medio(e):
    """Solo notas de medios y fuentes oficiales: las señales automáticas de GDELT son plantillas («Coerción: New York
    City (India)») con ubicaciones poco fiables, y las publicaciones de redes sociales no están verificadas."""
    return not str(e.get("fuente") or "").startswith("GDELT") and e.get("tipo_fuente") != "red_social"


def zonas(eventos, div, ahora, centroides=None, sev_min=SEV_MIN, horas=HORAS, nombres_area=None):
    centroides = centroides or {}
    desde = ahora - timedelta(hours=horas)
    agg = {}
    for e in eventos:
        f = _fecha(e.get("fecha_utc"))
        iso = e.get("pais_iso3")
        if not iso or (e.get("severidad") or 0) < sev_min or not f or f < desde or f > ahora + timedelta(hours=1):
            continue
        if not de_medio(e):
            continue
        texto = f"{e.get('titulo', '')}. {e.get('resumen', '')}"
        ids = div.mencionadas(iso, texto)
        motivo = "la nota nombra"
        if not ids and e.get("lat") is not None and e.get("lon") is not None:
            c = centroides.get(iso)
            if not c or abs(c[0] - e["lon"]) > 0.05 or abs(c[1] - e["lat"]) > 0.05:
                i = div.en_punto(iso, e["lon"], e["lat"])
                if i is not None:
                    ids, motivo = {i: None}, "las coordenadas de la fuente caen aquí"
        tema = tema_de(texto, e.get("area_principal"), nombres_area)
        for i, lugar in ids.items():
            z = agg.setdefault(i, {"eventos": [], "motivos": set(), "sev": 0, "temas": {}})
            z["sev"] = max(z["sev"], e["severidad"])
            z["motivos"].add(motivo)
            z["temas"][tema] = z["temas"].get(tema, 0) + 1
            z["eventos"].append({"id": e["id"], "titulo": e.get("titulo"), "fuente": e.get("fuente"), "url": e.get("url"),
                                 "fecha_utc": e.get("fecha_utc"), "severidad": e["severidad"], "area": e.get("area_principal"), "tema": tema,
                                 "por_que": f"{motivo} «{lugar}»" if lugar else motivo})
    feats = []
    for i, z in agg.items():
        p = div.polis[i]
        evs = sorted(sorted(z["eventos"], key=lambda x: x["fecha_utc"] or "", reverse=True), key=lambda x: -x["severidad"])
        feats.append({"type": "Feature", "geometry": p["geometry"],
                      "properties": {"id": f"{p['iso3']}-{p['nombres'][0]}", "nombre": p["nombres"][0], "iso3": p["iso3"], "tipo": p.get("tipo", ""), "sev_max": z["sev"],
                                     "n_eventos": len(evs), "motivo": " y ".join(sorted(z["motivos"])), "eventos": evs[:MAX_EVENTOS],
                                     "temas": sorted(z["temas"].items(), key=lambda x: -x[1]),
                                     "resumen": "Posible afectación por: " + "; ".join(f"{t} ({n})" for t, n in sorted(z["temas"].items(), key=lambda x: -x[1]))}})
    feats.sort(key=lambda f: (-f["properties"]["sev_max"], -f["properties"]["n_eventos"]))
    return feats


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--eventos", default="eventos/events.json")
    ap.add_argument("--salida", default="eventos/zonas_afectadas.geojson")
    ap.add_argument("--poligonos", default=CACHE)
    a = ap.parse_args(argv)
    polis = json.load(open(a.poligonos, encoding="utf-8")) if os.path.exists(a.poligonos) else construir_cache(a.poligonos)
    gaz = json.load(open(os.path.join(ROOT, "config", "gazetteer.json"), encoding="utf-8"))["paises"]
    nombres = {iso: [p.get("es"), p.get("en")] for iso, p in gaz.items()}
    centroides = {iso: (p["lon"], p["lat"]) for iso, p in gaz.items() if p.get("lat") is not None}
    datos = json.load(open(a.eventos, encoding="utf-8"))
    ahora = datetime.now(timezone.utc)
    tax = json.load(open(os.path.join(ROOT, "config", "taxonomy.json"), encoding="utf-8"))
    nombres_area = {a["id"]: a["nombre"] for a in tax["areas"]}
    feats = zonas(datos.get("eventos", []), Divisiones(polis, nombres), ahora, centroides, nombres_area=nombres_area)
    json.dump({"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "criterio": f"severidad ≥ {SEV_MIN}, últimas {HORAS} h",
               "features": feats}, open(a.salida, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"zonas afectadas: {len(feats)} divisiones")
    return 0


if __name__ == "__main__":
    sys.exit(main())
