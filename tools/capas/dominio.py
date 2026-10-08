"""Capas de coropleta: dominio o disputa de grupos armados (UCDP) y religiones por país (Pew vía OWID).

Dominio y disputa (UCDP, CC BY 4.0, Universidad de Uppsala):
  Se descargan los eventos georreferenciados más recientes: el GED anual y los «Candidate» mensuales
  (los enlaces se leen de https://ucdp.uu.se/downloads/ porque cambian con cada versión). Se agregan los
  últimos 24 meses en celdas de 1° × 1°. En cada celda se cuenta, por actor NO estatal (cárteles,
  insurgencias, yihadistas, milicias), el número de eventos más sus muertes estimadas:
    dominio  = un actor reúne ≥ 70 % del peso de la celda
    disputa  = ningún actor llega al 70 % (dos o más grupos pelean la zona)
  Solo celdas con 3 o más eventos. Es violencia registrada, no control territorial: un grupo puede
  controlar una zona sin violencia visible. Se dice así en la ficha.

Religiones (Pew Research Center 2020, publicado por Our World in Data, CC BY 4.0):
  Se busca en la página de religión de OWID los gráficos de participación por religión y se arma, por
  país, el porcentaje de cristianos, musulmanes, hindúes, budistas, judíos, religiones populares o
  tradicionales (incluye chamanismo, animismo y prácticas indígenas), otras religiones (bahaí, sij,
  jainismo, sintoísmo, taoísmo, wicca y otras) y sin afiliación (ateos, agnósticos y «ninguna»).
  Pew no mide por separado brujería ni esoterismo: quedan dentro de «populares» u «otras».
"""
import csv
import io
import json
import re
import zipfile
from collections import defaultdict
from datetime import datetime, timedelta, timezone

UCDP_PAGINA = "https://ucdp.uu.se/downloads/"
VENTANA_MESES = 24
UMBRAL_DOMINIO = 0.7
MIN_EVENTOS = 3


# ---------------------------------------------------------------- UCDP
def enlaces_ucdp(html, base=UCDP_PAGINA):
    """Del HTML de la página de descargas: (zip CSV del GED anual más reciente, [CSV Candidate mensuales])."""
    from urllib.parse import urljoin
    hrefs = re.findall(r'href="([^"]+)"', html)
    absol = lambda h: urljoin(base, h)  # noqa: E731
    ged = sorted({absol(h) for h in hrefs if re.search(r"ged\d+-csv\.zip$", h, re.I)}, key=lambda u: int(re.search(r"ged(\d+)", u, re.I).group(1)))
    cand = sorted({absol(h) for h in hrefs if re.search(r"candidate.*\.csv$", h, re.I) or re.search(r"GEDEvent_v\d+_\d+_\d+\.csv$", h, re.I)})
    return (ged[-1] if ged else None), cand


def es_estatal(actor):
    return actor.lower().startswith("government of")


def actores_no_estatales(fila):
    """Actores no estatales de un evento según su tipo de violencia (1 estatal, 2 no estatal, 3 unilateral)."""
    t = str(fila.get("type_of_violence", ""))
    a, b = fila.get("side_a", "") or "", fila.get("side_b", "") or ""
    if t == "1":
        return [x for x in (a, b) if x and not es_estatal(x)]
    if t == "2":
        return [x for x in (a, b) if x]
    if t == "3":
        return [a] if a and not es_estatal(a) else []
    return []


def leer_eventos(textos_csv, desde):
    """Filas de uno o más CSV (texto) con fecha de inicio ≥ desde (date)."""
    vistos = set()
    for texto in textos_csv:
        for f in csv.DictReader(io.StringIO(texto)):
            try:
                d = datetime.strptime((f.get("date_start") or "")[:10], "%Y-%m-%d").date()
                lat, lon = float(f["latitude"]), float(f["longitude"])
            except (KeyError, ValueError):
                continue
            if d < desde or f.get("id") in vistos:
                continue
            vistos.add(f.get("id"))
            yield {"lat": lat, "lon": lon, "actores": actores_no_estatales(f), "muertes": int(float(f.get("best") or 0)),
                   "pais": f.get("country", ""), "fecha": d.isoformat()}


def agregar_celdas(eventos, paso=1.0):
    """Celdas de `paso` grados con peso por actor (1 por evento + muertes estimadas)."""
    celdas = defaultdict(lambda: {"peso": defaultdict(float), "eventos": 0, "muertes": 0, "paises": defaultdict(int), "ultima": ""})
    for e in eventos:
        if not e["actores"]:
            continue
        k = (int(e["lon"] // paso), int(e["lat"] // paso))
        c = celdas[k]
        c["eventos"] += 1
        c["muertes"] += e["muertes"]
        c["paises"][e["pais"]] += 1
        c["ultima"] = max(c["ultima"], e["fecha"])
        for a in e["actores"]:
            c["peso"][a] += (1 + e["muertes"]) / len(e["actores"])
    return celdas


def clasificar_celda(c):
    total = sum(c["peso"].values())
    top = sorted(c["peso"].items(), key=lambda x: -x[1])
    principal, peso = top[0]
    return {"estado": "dominio" if peso / total >= UMBRAL_DOMINIO else "disputa", "principal": principal,
            "actores": [[a, round(100 * p / total)] for a, p in top[:4]]}


PALETA = ["#C0392B", "#8E44AD", "#2471A3", "#D35400", "#117A65", "#B7950B", "#6C3483", "#1F618D", "#A04000", "#196F3D",
          "#922B21", "#5B2C6F", "#21618C", "#9A7D0A", "#0E6655", "#784212"]


def cobertura_dominio(celdas, paso=1.0, minimo=MIN_EVENTOS):
    """Features de polígono (celdas) con color por actor principal; los 16 actores con más peso tienen color propio."""
    peso_actor = defaultdict(float)
    for c in celdas.values():
        for a, p in c["peso"].items():
            peso_actor[a] += p
    colores = {a: PALETA[i] for i, (a, _) in enumerate(sorted(peso_actor.items(), key=lambda x: -x[1])[:len(PALETA)])}
    out = []
    for (x, y), c in celdas.items():
        if c["eventos"] < minimo:
            continue
        k = clasificar_celda(c)
        o, s_ = round(x * paso, 3), round(y * paso, 3)
        geom = {"type": "Polygon", "coordinates": [[[o, s_], [o + paso, s_], [o + paso, s_ + paso], [o, s_ + paso], [o, s_]]]}
        pais = max(c["paises"].items(), key=lambda kv: kv[1])[0]
        out.append({"type": "Feature", "geometry": geom, "properties": {
            "id": f"ucdp:{x}_{y}", "n": k["principal"] if k["estado"] == "dominio" else f"Disputa: {', '.join(a for a, _ in k['actores'][:2])}",
            "st": f"conflicto_{k['estado']}", "p": pais, "x": f"{c['eventos']} eventos · {c['muertes']} muertes estimadas",
            "color": colores.get(k["principal"], "#7f8c8d") if k["estado"] == "dominio" else "#4D4D4D",
            "actores": json.dumps(k["actores"], ensure_ascii=False), "eventos": c["eventos"], "muertes": c["muertes"], "ultima": c["ultima"], "z": 1}})
    return out


def desde_ventana(hoy=None, meses=VENTANA_MESES):
    hoy = hoy or datetime.now(timezone.utc).date()
    return hoy - timedelta(days=round(meses * 30.44))


def textos_de_zip(datos):
    with zipfile.ZipFile(io.BytesIO(datos)) as z:
        return [z.read(n).decode("utf-8", "replace") for n in z.namelist() if n.lower().endswith(".csv")]


# ---------------------------------------------------------------- Religiones (OWID / Pew)
OWID_RELIGION = "https://ourworldindata.org/religion"
CATEGORIAS = [  # (id, nombre, patrón para reconocer el gráfico o la columna de OWID)
    ("cristianismo", "Cristianismo", r"christian"),
    ("islam", "Islam", r"muslim|islam"),
    ("hinduismo", "Hinduismo", r"hindu"),
    ("budismo", "Budismo", r"buddhis"),
    ("judaismo", "Judaísmo", r"jew|judaism"),
    ("populares", "Religiones populares o tradicionales (chamanismo, animismo, prácticas indígenas)", r"folk|traditional"),
    ("otras", "Otras religiones (bahaí, sij, jainismo, sintoísmo, taoísmo, wicca…)", r"other.religion"),
    ("sin_religion", "Sin afiliación (ateos, agnósticos, «ninguna»)", r"unaffiliated|no.religio|nonreligious|none"),
]


def slugs_religion(html):
    """Slugs de gráficos de OWID relacionados con religión que aparecen en la página del tema."""
    slugs = set(re.findall(r'/grapher/([a-z0-9-]+)', html))
    return sorted(s for s in slugs if re.search(r"religio|christian|muslim|hindu|buddhis|jew|unaffiliated|folk", s))


def categoria_de(texto):
    t = texto.lower()
    for cid, _, rx in CATEGORIAS:
        if re.search(rx, t):
            return cid
    return None


def leer_csv_owid(texto, slug):
    """CSV de OWID (Entity, Code, Year, valor…) → {iso3: {categoria: % del año más reciente}}."""
    out = defaultdict(dict)
    filas = list(csv.DictReader(io.StringIO(texto)))
    if not filas:
        return out
    valores = [c for c in filas[0] if c not in ("Entity", "Code", "Year", "entity", "code", "year")]
    ultimo = {}
    for f in filas:
        iso = f.get("Code") or f.get("code") or ""
        if len(iso) != 3:
            continue
        anio = int(f.get("Year") or f.get("year") or 0)
        for col in valores:
            cat = categoria_de(col) or categoria_de(slug)
            v = f.get(col)
            if not cat or v in (None, ""):
                continue
            try:
                num = float(v)
            except ValueError:
                continue
            if anio >= ultimo.get((iso, cat), -1):
                ultimo[(iso, cat)] = anio
                out[iso][cat] = num
    return out


def normalizar_porcentajes(shares):
    """Si vienen como fracciones (≤ 1) se pasan a %; se redondea a 1 decimal."""
    total = sum(shares.values())
    factor = 100 if total and total <= 1.5 else 1
    return {k: round(v * factor, 1) for k, v in shares.items()}


def features_religion(paises_fc, por_pais, anio="2020"):
    out = []
    for f in paises_fc["features"]:
        iso = f["properties"].get("iso3")
        s = por_pais.get(iso)
        if not s:
            continue
        s = normalizar_porcentajes(s)
        mayor = max(s.items(), key=lambda kv: kv[1])
        out.append({"type": "Feature", "geometry": f["geometry"], "properties": {
            "id": f"rel:{iso}", "n": f["properties"].get("nombre") or iso, "st": f"religion_{mayor[0]}", "p": iso,
            "x": f"{mayor[1]:.0f} % {dict((c, n) for c, n, _ in CATEGORIAS)[mayor[0]].split(' (')[0].lower()}",
            "porcentajes": json.dumps(s, ensure_ascii=False), "anio": anio, "z": 0}})
    return out
