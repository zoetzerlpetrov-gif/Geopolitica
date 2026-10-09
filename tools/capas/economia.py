"""Capas de economía y finanzas por país (coropletas): lista fiscal de la UE, recaudación de impuestos, tasas de
política monetaria de los bancos centrales y nodos de Bitcoin.

1. Lista de la UE de jurisdicciones no cooperativas a efectos fiscales (Consejo de la UE). Se revisa en febrero y
   octubre; aquí va escrita a mano con su fecha y enlace (la página del Consejo bloquea a programas con 403 y la
   de la Comisión, que sí lo permite, la publica como texto). Anexo I = no cooperativas; Anexo II = con
   compromisos pendientes. Es una lista política: otros índices (Tax Justice Network) señalan también a países
   de la UE, Suiza o EUA, que esta lista no evalúa por diseño.
2. Recaudación tributaria (% del PIB), Banco Mundial GC.TAX.TOTL.GD.ZS (CC BY 4.0).
3. Tasa de política monetaria, BIS (Banco de Pagos Internacionales), serie WS_CBPOL mensual (fin de mes).
   La zona euro (XM) se aplica a sus 21 miembros. Reutilizable citando al BIS.
4. Nodos de Bitcoin alcanzables, Bitnodes (instantánea más reciente; robots.txt lo permite). El país de cada
   nodo se calcula con DB-IP Lite (CC BY 4.0); los nodos de Tor (.onion) no tienen país y se cuentan aparte.
   Mide infraestructura, no dinero ni usuarios: un nodo puede estar en un centro de datos de otro país.
"""
import csv
import io
from collections import defaultdict

FECHA_LISTA_UE = "2026-10-09"
URL_LISTA_UE = "https://taxation-customs.ec.europa.eu/tax-common-eu-list_en"
# Situación al 9 de octubre de 2026 (página de la Comisión Europea, «Text version»).
ANEXO_I = {"ASM": "Samoa Americana", "AIA": "Anguila", "GUM": "Guam", "PLW": "Palaos", "RUS": "Rusia", "TCA": "Islas Turcas y Caicos",
           "VIR": "Islas Vírgenes de EUA", "VUT": "Vanuatu"}
ANEXO_II = {"VGB": "Islas Vírgenes Británicas", "BRN": "Brunéi", "SWZ": "Esuatini", "GRL": "Groenlandia", "JOR": "Jordania", "MNE": "Montenegro",
            "MAR": "Marruecos", "PAN": "Panamá", "TUR": "Turquía", "VNM": "Vietnam"}

RECAUDACION = [
    ("recaudacion_1", 10, "Menos del 10 % del PIB", "#f1eef6"),
    ("recaudacion_2", 15, "10 % a 15 %", "#d0d1e6"),
    ("recaudacion_3", 20, "15 % a 20 %", "#a6bddb"),
    ("recaudacion_4", 25, "20 % a 25 %", "#74a9cf"),
    ("recaudacion_5", 30, "25 % a 30 %", "#2b8cbe"),
    ("recaudacion_6", None, "30 % del PIB o más", "#045a8d"),
]

TASAS = [
    ("tasa_1", 1, "Menos de 1 %", "#e8f3ea"),
    ("tasa_2", 3, "1 % a 3 %", "#bfe0c3"),
    ("tasa_3", 5, "3 % a 5 %", "#f6e08a"),
    ("tasa_4", 8, "5 % a 8 %", "#f3b25d"),
    ("tasa_5", 12, "8 % a 12 %", "#e07b3c"),
    ("tasa_6", 20, "12 % a 20 %", "#c0392b"),
    ("tasa_7", None, "20 % o más", "#6e1423"),
]

NODOS = [
    ("btc_1", 10, "1 a 9 nodos", "#fff3d6"),
    ("btc_2", 50, "10 a 49", "#fde0a0"),
    ("btc_3", 200, "50 a 199", "#f9b65a"),
    ("btc_4", 1000, "200 a 999", "#f08a24"),
    ("btc_5", 5000, "1,000 a 4,999", "#c45a10"),
    ("btc_6", None, "5,000 o más", "#7a3305"),
]

EURO = ["AUT", "BEL", "BGR", "HRV", "CYP", "EST", "FIN", "FRA", "DEU", "GRC", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD", "PRT", "SVK", "SVN", "ESP"]
BIS_API = "https://stats.bis.org/api/v1/data/WS_CBPOL/M./all?startPeriod={desde}&format=csv"
BITNODES = "https://bitnodes.io/api/v1/snapshots/latest/"


def _rango(v, rangos):
    for st, tope, etq, color in rangos:
        if tope is None or v < tope:
            return st, etq, color
    return rangos[-1][0], rangos[-1][2], rangos[-1][3]


def _centroide(geom):
    """Punto aproximado (promedio de vértices del anillo exterior más grande), para territorios pequeños."""
    polis = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    anillo = max((p[0] for p in polis), key=len)
    return [round(sum(c[0] for c in anillo) / len(anillo), 3), round(sum(c[1] for c in anillo) / len(anillo), 3)]


def features_lista_ue(paises_fc):
    """Polígono + punto de cada jurisdicción (muchas son islas que a escala mundial no se ven)."""
    out = []
    for f in paises_fc["features"]:
        iso = f["properties"].get("iso3")
        if iso in ANEXO_I:
            st, txt = "ue_no_cooperativa", "Anexo I: no cooperativa"
        elif iso in ANEXO_II:
            st, txt = "ue_compromisos", "Anexo II: compromisos pendientes"
        else:
            continue
        nombre = f["properties"].get("nombre") or ANEXO_I.get(iso) or ANEXO_II.get(iso)
        props = {"id": f"ue_fiscal:{iso}", "n": nombre, "st": st, "p": iso, "x": f"{txt} (lista del {FECHA_LISTA_UE})", "z": 0}
        out.append({"type": "Feature", "geometry": f["geometry"], "properties": props})
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": _centroide(f["geometry"])}, "properties": {**props, "id": props["id"] + ":p"}})
    return out


def leer_bis(texto):
    """CSV del BIS → {ref_area: [(periodo, valor), …]} ordenado por periodo."""
    out = defaultdict(list)
    for r in csv.DictReader(io.StringIO(texto)):
        try:
            v = float(r["OBS_VALUE"])
        except (KeyError, TypeError, ValueError):
            continue
        out[r["REF_AREA"]].append((r["TIME_PERIOD"], v, r.get("SOURCE_REF") or ""))
    return {k: sorted(v) for k, v in out.items()}


def tasas_por_pais(series, iso2_a_iso3):
    """{iso3: (valor, periodo, cambio_12m o None, banco)}; la zona euro se copia a sus miembros sin serie más reciente."""
    out = {}
    for area, s in series.items():
        if not s:
            continue
        per, v, banco = s[-1]
        anio, mes = int(per[:4]), int(per[5:7])
        hace = f"{anio - 1:04d}-{mes:02d}"
        previo = next((x[1] for x in s if x[0] == hace), None)
        dato = (v, per, None if previo is None else round(v - previo, 2), banco)
        if area == "XM":
            for iso in EURO:
                if iso not in out or out[iso][1] < per:
                    out[iso] = (*dato[:3], "Banco Central Europeo (zona euro)")
            continue
        iso = iso2_a_iso3.get(area)
        if iso and (iso not in out or out[iso][1] <= per):
            out[iso] = dato
    return out


def features_tasas(paises_fc, tasas):
    out = []
    for f in paises_fc["features"]:
        iso = f["properties"].get("iso3")
        if iso not in tasas:
            continue
        v, per, cambio, banco = tasas[iso]
        st, etq, color = _rango(v, TASAS)
        mov = "" if cambio is None else " · sin cambio en 12 meses" if cambio == 0 else f" · {'subió' if cambio > 0 else 'bajó'} {abs(cambio):g} punto{'' if abs(cambio) == 1 else 's'} en 12 meses"
        out.append({"type": "Feature", "geometry": f["geometry"], "properties": {
            "id": f"tasa:{iso}", "n": f["properties"].get("nombre") or iso, "st": st, "p": iso, "color": color, "rango": etq, "z": 0,
            "x": f"{v:g} % al cierre de {per}{mov} · {banco}".strip(" ·")}})
    return out


def nodos_por_pais(nodos, geo, iso2_a_iso3):
    """Claves «ip:puerto» de Bitnodes → ({iso3: n}, nodos_tor, sin_pais)."""
    por, tor, sin = defaultdict(int), 0, 0
    for clave in nodos:
        host = clave.rsplit(":", 1)[0].strip("[]")
        if host.endswith(".onion"):
            tor += 1
            continue
        iso = iso2_a_iso3.get(geo.pais(host) or "")
        if iso:
            por[iso] += 1
        else:
            sin += 1
    return dict(por), tor, sin


def features_nodos(paises_fc, por, total, tor, fecha):
    out = []
    for f in paises_fc["features"]:
        iso = f["properties"].get("iso3")
        n = por.get(iso)
        if not n:
            continue
        st, etq, color = _rango(n, NODOS)
        out.append({"type": "Feature", "geometry": f["geometry"], "properties": {
            "id": f"btc:{iso}", "n": f["properties"].get("nombre") or iso, "st": st, "p": iso, "color": color, "rango": etq, "z": 0,
            "x": f"{n:,} nodos alcanzables ({n / max(1, total) * 100:.1f} % de {total:,}; {tor:,} más en Tor sin país) · Bitnodes {fecha}"}})
    return out
