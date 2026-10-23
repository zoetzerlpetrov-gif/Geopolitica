"""Bienes raíces: dónde suben o bajan los precios, por tipo de inmueble.

- Por país (BIS, Banco de Pagos Internacionales; reutilizable citando la fuente):
  WS_SPP (vivienda, nominal y real, cambio anual), WS_DPP (series detalladas: casas, departamentos, terrenos
  residenciales) y WS_CPP (inmuebles comerciales: oficinas, locales, industriales y bodegas, terrenos comerciales).
- México por estado (SHF, Sociedad Hipotecaria Federal): valor mediano por m² de los inmuebles valuados para crédito
  (casa, departamento, condominio, vivienda económica-social y media-residencial), trimestral desde 2018.
- Inmuebles en seguimiento: la lista del repositorio InmuebleWarRoom (config/inmuebles_seguimiento.json) con su nivel
  de riesgo y una revisión automática de cercanía a volcanes y a límites de placas.

Todo es cambio en 12 meses del mismo indicador (mismo trimestre o mes del año anterior). Es nominal (sin descontar
inflación) salvo donde se indica «real».
"""
import csv
import io
import math
import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict

BIS_SPP = "https://stats.bis.org/api/v1/data/WS_SPP/Q..N+R.771/all?startPeriod={desde}&format=csv"
BIS_DPP = "https://stats.bis.org/api/v1/data/WS_DPP/all/all?startPeriod={desde}&format=csv"
BIS_CPP = "https://stats.bis.org/api/v1/data/WS_CPP/all/all?startPeriod={desde}&format=csv"
SHF_PAGINA = "https://www.gob.mx/shf/documentos/indicadores-sociedad-hipotecaria-federal"

# Tipos de inmueble → (subtipo del catálogo, nombre).
TIPOS_PAIS = {
    "vivienda": ("inm_vivienda", "Vivienda (todas)"),
    "casas": ("inm_casas", "Casas"),
    "departamentos": ("inm_departamentos", "Departamentos"),
    "terrenos": ("inm_terrenos", "Terrenos"),
    "oficinas": ("inm_oficinas", "Oficinas"),
    "locales": ("inm_locales", "Locales comerciales"),
    "oficinas_locales": ("inm_oficinas_locales", "Oficinas y locales"),
    "bodegas": ("inm_bodegas", "Industriales y bodegas"),
    "comercial": ("inm_comercial", "Comercial (todos los tipos)"),
}
TIPOS_MX = {  # palabra en el nombre del archivo de SHF → (subtipo, nombre)
    "casa-habitaci": ("mx_casa", "Casa"),
    "departamento": ("mx_departamento", "Departamento"),
    "condominio": ("mx_condominio", "Condominio"),
    "econ_mica-social": ("mx_economica", "Vivienda económica y social"),
    "media-residencial": ("mx_media_residencial", "Vivienda media y residencial"),
}
# Cambio anual (%) → color. Rojo = sube (se calienta), azul = baja.
RAMPA = [(-5, "#2166AC", "baja más de 5 %"), (-1, "#67A9CF", "baja 1 % a 5 %"), (1, "#D9D9D9", "estable (±1 %)"),
         (5, "#EF8A62", "sube 1 % a 5 %"), (None, "#B2182B", "sube más de 5 %")]


def color_cambio(pct):
    for tope, color, etq in RAMPA:
        if tope is None or pct < tope:
            return color, etq
    return RAMPA[-1][1], RAMPA[-1][2]


def _norm(t):
    return "".join(c for c in unicodedata.normalize("NFD", str(t or "")) if unicodedata.category(c) != "Mn").lower().strip()


# ---------- BIS ----------

def leer_series_bis(texto):
    """CSV del BIS → {clave_serie: {"area", "freq", "titulo", "valor", "obs": [(periodo, valor)]}}."""
    out = {}
    for r in csv.DictReader(io.StringIO(texto)):
        try:
            v = float(r["OBS_VALUE"])
        except (KeyError, TypeError, ValueError):
            continue
        dims = [r.get(k, "") for k in ("FREQ", "REF_AREA", "COVERED_AREA", "RE_TYPE", "RE_VINTAGE", "COMPILING_ORG", "PRICED_UNIT",
                                        "ADJUST_CODED", "VALUE", "UNIT_MEASURE")]
        k = "|".join(dims)
        s = out.setdefault(k, {"area": r.get("REF_AREA", ""), "freq": r.get("FREQ", ""), "titulo": r.get("TITLE_GRP") or r.get("TITLE_TS") or "",
                               "valor": r.get("VALUE", ""), "obs": []})
        s["obs"].append((r["TIME_PERIOD"], v))
    for s in out.values():
        s["obs"].sort()
    return out


def periodo_anterior(per):
    """Mismo periodo del año anterior: 2026-Q2 → 2025-Q2, 2026-05 → 2025-05, 2026 → 2025, 2026-S1 → 2025-S1."""
    m = re.match(r"^(\d{4})(.*)$", per)
    return f"{int(m.group(1)) - 1}{m.group(2)}" if m else None


def cambio_anual(obs, es_porcentaje=False):
    """(cambio %, periodo, periodo anterior) del último dato frente al mismo periodo del año anterior.
    Si la serie YA es una variación anual (unidad 771 del BIS), se devuelve tal cual."""
    if not obs:
        return None
    per, v = obs[-1]
    if es_porcentaje:
        return round(v, 1), per, periodo_anterior(per)
    previo = dict(obs).get(periodo_anterior(per))
    if not previo:
        return None
    return round((v / previo - 1) * 100, 1), per, periodo_anterior(per)


def tipo_de_serie(titulo, dataset):
    """Título de la serie del BIS → tipo de inmueble (o None si no es comparable: rentas, inversión, agrícola)."""
    t = titulo.lower()
    if any(x in t for x in ("rental", "investment", "agricultural", "capital growth", "structures only")):
        return None
    if dataset == "CPP":
        if "land" in t:
            return "terrenos"
        if "industrial" in t or "warehouse" in t:
            return "bodegas"
        if "office" in t and ("retail" in t or "shop" in t):
            return "oficinas_locales"
        if "office" in t:
            return "oficinas"
        if "retail" in t or "shop" in t:
            return "locales"
        if "all" in t or "commercial property price" in t:
            return "comercial"
        return None
    if "land" in t:
        return "terrenos"
    if "flat" in t or "apartment" in t or "condominium" in t:
        return "departamentos"
    if "house" in t:
        return "casas"
    return None


def _puntaje(titulo):
    """Prefiere series de todo el país y sin desglose de nuevas/usadas."""
    t = titulo.lower()
    return (("whole country" in t or "all urban" in t) * 4 + ("new " not in t and "existing" not in t) * 2
            - any(x in t for x in ("city", "cities", "tokyo", "london", "paris", "madrid", "berlin", "lima", "bogota", "makati", "athens",
                                    "istanbul", "warsaw", "rabat", "reykjavik", "jakarta", "toronto", "metropolitan", "region")))


def por_pais_y_tipo(spp, dpp, cpp, iso2_a_iso3):
    """{iso3: {tipo: {"cambio", "periodo", "titulo", "real"?}}} con la mejor serie de cada país y tipo."""
    out = defaultdict(dict)
    # Vivienda total: WS_SPP ya trae la variación anual nominal (N) y real (R).
    viv = defaultdict(dict)
    for s in spp.values():
        iso, c = iso2_a_iso3.get(s["area"]), cambio_anual(s["obs"], es_porcentaje=True)
        if iso and c and (s["valor"] not in viv[iso] or c[1] > viv[iso][s["valor"]][1]):
            viv[iso][s["valor"]] = c
    for iso, d in viv.items():
        if "N" in d:
            out[iso]["vivienda"] = {"cambio": d["N"][0], "periodo": d["N"][1], "titulo": "Precios de vivienda, serie seleccionada por el BIS",
                                    **({"real": d["R"][0]} if "R" in d and d["R"][1] == d["N"][1] else {})}
    candidatos = defaultdict(list)
    for dataset, series in (("DPP", dpp), ("CPP", cpp)):
        for s in series.values():
            iso, tipo = iso2_a_iso3.get(s["area"]), tipo_de_serie(s["titulo"], dataset)
            c = cambio_anual(s["obs"])
            if iso and tipo and c:
                candidatos[(iso, tipo)].append((c[1][:4], _puntaje(s["titulo"]), c, s["titulo"]))
    for (iso, tipo), cs in candidatos.items():
        anio, _, c, titulo = max(cs, key=lambda x: (x[0], x[1]))
        out[iso][tipo] = {"cambio": c[0], "periodo": c[1], "titulo": titulo}
    return dict(out)


def features_paises(paises_fc, datos):
    out = []
    for f in paises_fc["features"]:
        iso = f["properties"].get("iso3")
        tipos = datos.get(iso)
        if not tipos:
            continue
        nombre = f["properties"].get("nombre") or iso
        resumen = " · ".join(f"{TIPOS_PAIS[t][1]}: {d['cambio']:+.1f} %" for t, d in tipos.items())
        for t, d in tipos.items():
            color, etq = color_cambio(d["cambio"])
            real = f" (real, descontando inflación: {d['real']:+.1f} %)" if d.get("real") is not None else ""
            out.append({"type": "Feature", "geometry": f["geometry"], "properties": {
                "id": f"inm:{iso}:{t}", "n": nombre, "st": TIPOS_PAIS[t][0], "p": iso, "color": color, "rango": etq, "z": 0,
                "x": f"{TIPOS_PAIS[t][1]}: {d['cambio']:+.1f} % en 12 meses al {d['periodo']}{real}. Serie: {d['titulo']}. Todos los tipos con dato: {resumen}"}})
    return out


# ---------- SHF (México por estado) ----------

def leer_xlsx(datos):
    """Primera hoja de un .xlsx → lista de filas (valores como texto o número). Sin dependencias."""
    z = zipfile.ZipFile(io.BytesIO(datos))
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    compartidas = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns):
            compartidas.append("".join(t.text or "" for t in si.iter(f"{{{ns['m']}}}t")))
    hoja = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))[0]
    filas = []
    for row in ET.fromstring(z.read(hoja)).iter(f"{{{ns['m']}}}row"):
        fila = {}
        for c in row.findall("m:c", ns):
            col = re.match(r"[A-Z]+", c.get("r")).group(0)
            idx = 0
            for ch in col:
                idx = idx * 26 + ord(ch) - 64
            v = c.find("m:v", ns)
            if v is None:
                is_ = c.find("m:is", ns)
                fila[idx - 1] = "".join(t.text or "" for t in is_.iter(f"{{{ns['m']}}}t")) if is_ is not None else None
                continue
            fila[idx - 1] = compartidas[int(v.text)] if c.get("t") == "s" else float(v.text)
        filas.append([fila.get(i) for i in range(max(fila) + 1)] if fila else [])
    return filas


def leer_shf(filas):
    """Filas del Excel de SHF → {entidad: [(trimestre «2026.T2», mediana por m², preliminar)]}. Columna de mediana: la que
    dice «mediano». SHF marca las cifras preliminares con « /p» («2026.T2 /p»); la marca se separa del trimestre."""
    if not filas:
        return {}
    cab = [str(c or "").lower() for c in filas[0]]
    col_med = next((i for i, c in enumerate(cab) if "mediano" in c), 6)
    out = defaultdict(list)
    for f in filas[1:]:
        if len(f) <= col_med or not f[0] or not f[1] or not isinstance(f[col_med], float):
            continue
        m = re.match(r"^(\d{4}\.T[1-4])\s*(/p)?", str(f[0]).strip())
        if m:  # las filas de notas al pie no tienen trimestre
            out[str(f[1]).strip()].append((m.group(1), f[col_med], bool(m.group(2))))
    return {k: sorted(v) for k, v in out.items()}


def enlaces_shf(html):
    """Página de indicadores de SHF → {sufijo de tipo: url del .xlsx}."""
    out = {}
    for h in re.findall(r'href="([^"]+\.xlsx)"', html):
        for clave in TIPOS_MX:
            if clave in h:
                out[clave] = h if h.startswith("http") else "https://www.gob.mx" + h
    return out


ALIAS_ESTADOS = {"distrito federal": "ciudad de mexico", "mexico city": "ciudad de mexico", "estado de mexico": "mexico",
                 "coahuila de zaragoza": "coahuila", "michoacan de ocampo": "michoacan", "veracruz de ignacio de la llave": "veracruz",
                 "queretaro de arteaga": "queretaro"}


def clave_estado(nombre):
    n = _norm(nombre)
    return ALIAS_ESTADOS.get(n, n)


def features_mx(estados_fc, shf_por_tipo):
    """Polígonos de los estados de México × tipo de vivienda, con color por el cambio anual de la mediana por m²."""
    out = []
    for f in estados_fc["features"]:
        nombre = f["properties"].get("name") or f["properties"].get("nombre")
        k = clave_estado(nombre)
        for clave, (st, etq_tipo) in TIPOS_MX.items():
            serie = {clave_estado(e): v for e, v in shf_por_tipo.get(clave, {}).items()}.get(k)
            if not serie:
                continue
            per, v, prelim = serie[-1]
            previo = {x[0]: x[1] for x in serie}.get(f"{int(per[:4]) - 1}{per[4:]}")
            if not previo:
                continue
            pct = round((v / previo - 1) * 100, 1)
            color, etq = color_cambio(pct)
            out.append({"type": "Feature", "geometry": f["geometry"], "properties": {
                "id": f"inm_mx:{k}:{st}", "n": nombre, "st": st, "p": "MEX", "color": color, "rango": etq, "z": 0,
                "x": f"{etq_tipo}: mediana de ${v:,.0f} por m² en {per.replace('.', ' ')} ({pct:+.1f} % frente a un año antes; nominal{'; cifra preliminar' if prelim else ''}). "
                     "Valor de avalúos para crédito, no precio de oferta."}})
    return out


# ---------- Inmuebles en seguimiento (InmuebleWarRoom) ----------

def distancia_km(lat1, lon1, lat2, lon2):
    r = math.radians
    a = math.sin(r(lat2 - lat1) / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lon2 - lon1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


def revision_geologica(lat, lon, volcanes, limites):
    """Volcán holoceno más cercano y distancia al límite de placas más cercano (km). Es una revisión gruesa."""
    v = min(((distancia_km(lat, lon, vla, vlo), n) for vlo, vla, n in volcanes), default=(None, ""))
    lim = min((distancia_km(lat, lon, la, lo) for lo, la in limites), default=None)
    notas = []
    if v[0] is not None:
        notas.append(f"volcán holoceno más cercano: {v[1]} a {v[0]:.0f} km")
    if lim is not None:
        notas.append(f"límite de placas tectónicas a {lim:.0f} km")
    alerta = (v[0] is not None and v[0] < 30) or (lim is not None and lim < 50)
    return "; ".join(notas), alerta


RIESGO_ST = {"green": "inm_riesgo_bajo", "yellow": "inm_riesgo_moderado", "orange": "inm_riesgo_medio", "red": "inm_riesgo_alto"}


def features_seguimiento(props_lista, volcanes, limites):
    out = []
    for p in props_lista:
        geo, alerta = revision_geologica(p["lat"], p["lng"], volcanes, limites)
        precio = f"{p['priceLocal']} (≈ {p['priceUSD']:,} USD · {p['priceMXN']:,} MXN)" if p.get("priceUSD") else p.get("priceLocal", "")
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [p["lng"], p["lat"]]}, "properties": {
            "id": f"iwr:{p['id']}", "n": f"{p['type']} · {p['city']}", "st": RIESGO_ST.get(p.get("riskLevel"), "inm_riesgo_moderado"), "p": "",
            "z": 2, "x": precio, "tipo": p["type"], "pais_n": p["country"], "riesgo": p.get("riskNotes", ""), "mercado": p.get("pricePosition", ""),
            "legal": p.get("legalNote", ""), "terreno": p.get("landM2"), "construccion": p.get("constM2"), "ciudad": p.get("nearestCity", ""),
            "aeropuerto": p.get("nearestAirport", ""), "geo": geo, "geo_alerta": alerta, "url": p.get("link", "")}})
    return out


def nivel_geologico(lat, lon, volcanes, limites):
    """Nivel automático (solo geología gruesa) cuando el inmueble no trae uno revisado a mano:
    alto si hay volcán holoceno a < 15 km o límite de placas a < 25 km; medio < 30 / < 50 km; moderado < 80 / < 150 km."""
    v = min((distancia_km(lat, lon, vla, vlo) for vlo, vla, _ in volcanes), default=9e9)
    lim = min((distancia_km(lat, lon, la, lo) for lo, la in limites), default=9e9)
    if v < 15 or lim < 25:
        return "red"
    if v < 30 or lim < 50:
        return "orange"
    if v < 80 or lim < 150:
        return "yellow"
    return "green"


def _precio_txt(desde, hasta, moneda):
    if desde is None:
        return "Sin precio publicado"
    f = lambda n: f"{n:,.0f}".replace(",", " ")  # noqa: E731
    return f"desde {f(desde)} {moneda}" + (f" hasta {f(hasta)} {moneda}" if hasta and hasta != desde else "")


def features_ara_sadasi(devs, volcanes, limites):
    """Desarrollos de ARA y SADASI (data/developments.json del repositorio InmueblesAraSadasi de la persona dueña)."""
    out = []
    for d in devs:
        if d.get("lat") is None or d.get("lon") is None:
            continue
        geo, alerta = revision_geologica(d["lat"], d["lon"], volcanes, limites)
        modelos = "; ".join(f"{m.get('nombre', '')}: {m['precio']:,} MXN" for m in (d.get("modelos") or []) if m.get("precio"))[:400]
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [d["lon"], d["lat"]]}, "properties": {
            "id": f"aras:{d.get('id', d.get('name'))}", "n": f"{d.get('developer', '')} {d.get('name', '')} · {d.get('city', '')}", "p": "MEX",
            "st": RIESGO_ST[nivel_geologico(d["lat"], d["lon"], volcanes, limites)], "z": 4,
            "x": _precio_txt(d.get("precio_min"), d.get("precio_max"), "MXN"), "tipo": "Casa o departamento nuevo", "pais_n": "México",
            "desarrolladora": d.get("developer", ""), "proyecto": d.get("name", ""), "zona": f"{d.get('city', '')}, {d.get('state', '')}",
            "modelos": modelos, "nuevo": True, "rehab": "no", "origen": "ARA/SADASI", "auto": True,
            "legal": "Mexicano: sin restricción (la zona restringida de costas y fronteras solo aplica a extranjeros).",
            "geo": geo, "geo_alerta": alerta, "url": d.get("url", "")}})
    return out


def features_desarrollos(datos, volcanes, limites):
    """Desarrollos y ofertas por país (config/inmuebles_desarrollos/*.json): precio publicado, si es nuevo o requiere
    rehabilitación, desarrolladora y si una persona mexicana puede comprar."""
    out = []
    for archivo in datos:
        paises = archivo.get("paises", {})
        for d in archivo.get("inmuebles", []):
            if d.get("lat") is None or d.get("lon") is None:
                continue
            reglas = (paises.get(d.get("pais_iso3")) or {}).get("compra_mexicanos") or {}
            geo, alerta = revision_geologica(d["lat"], d["lon"], volcanes, limites)
            m2 = d.get("m2_desde")
            out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [d["lon"], d["lat"]]}, "properties": {
                "id": f"des:{d['id']}", "n": f"{(d.get('tipo') or '').capitalize()} · {d.get('proyecto') or d.get('ciudad', '')} · {d.get('ciudad', '')}",
                "p": d.get("pais_iso3", ""), "st": RIESGO_ST[nivel_geologico(d["lat"], d["lon"], volcanes, limites)], "z": 4,
                "x": _precio_txt(d.get("precio_desde"), d.get("precio_hasta"), d.get("moneda", "")), "tipo": d.get("tipo", ""),
                "pais_n": (paises.get(d.get("pais_iso3")) or {}).get("nombre", d.get("pais_iso3", "")),
                "desarrolladora": d.get("desarrolladora", ""), "proyecto": d.get("proyecto", ""),
                "zona": ", ".join(x for x in (d.get("zona"), d.get("ciudad"), d.get("estado")) if x),
                "construccion": m2, "construccion_max": d.get("m2_hasta"), "recamaras": d.get("recamaras", ""), "entrega": d.get("entrega", ""),
                "nuevo": bool(d.get("nuevo")), "rehab": d.get("rehabilitacion", "desconocido"), "origen": "Desarrollos por país", "auto": True,
                "compra": reglas.get("puede", ""), "legal": (reglas.get("detalle") or "")[:500], "costa": (reglas.get("costa") or "")[:400],
                "precision": d.get("precision", ""), "visto": d.get("visto", ""), "zona_objetivo": d.get("zona_objetivo", ""), "fuente_t": d.get("fuente", ""), "nota": (d.get("nota") or "")[:400],
                "geo": geo, "geo_alerta": alerta, "url": d.get("url", "")}})
    return out
