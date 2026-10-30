#!/usr/bin/env python3
"""Precios en México (solo admin, economia.html → «Precios México»).

Fuentes (todas oficiales y con robots.txt que lo permite):
  SNIIM (Secretaría de Economía)  Precios al mayoreo en pesos por kilo en la Central de Abasto de Iztapalapa (CDMX):
                                  frutas, hortalizas y granos. Historia desde 2015; luego solo se piden los últimos 45 días.
  Comisión Reguladora de Energía  Precio de gasolina regular, premium y diésel en cada gasolinera (publicación diaria);
                                  se guarda el promedio nacional de cada día, así la historia crece día con día.
  INEGI (API, INEGI_TOKEN)        INPC general y sus agregados: mercancías, servicios, agropecuarios, energéticos.
  Archivo manual (opcional)       config/inpc_genericos/*.csv: índices del INPC por genérico (tortilla, cerveza, leche,
                                  electricidad…) exportados a mano de la herramienta «Índices de precios» de INEGI.
Si una fuente falla se conserva su último dato bueno.

Uso: python3 tools/economia/precios_mx.py <carpeta>   → <carpeta>/precios_mx.json
"""
import csv
import glob
import html
import io
import json
import os
import re
import statistics
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.dirname(__file__))
import pulso_economico as PE  # noqa: E402  (bajar con robots.txt y lector de INEGI)

DESDE = 2015
SNIIM = "https://www.economia-sniim.gob.mx/nuevo/Consultas/MercadosNacionales/PreciosDeMercado/Agricolas/"
DESTINO_ID, DESTINO = "100", "DF: Central de Abasto de Iztapalapa DF"
CRE = "https://publicacionexterna.azurewebsites.net/publicaciones/prices"
PAUSA = 1.5
ESPERAS = (20, 60, 120)  # segundos antes de reintentar cuando el SNIIM responde 5xx (servidor saturado)

# (id, nombre, categoría, patrón del nombre en la lista del SNIIM). El primero que coincida es el que se usa.
HORTALIZAS = [
    ("jitomate_saladette", "Jitomate saladette", "Verduras", r"^Jitomate Saladette - Primera"),
    ("jitomate_bola", "Jitomate bola", "Verduras", r"^Jitomate Bola - Primera"),
    ("tomate_verde", "Tomate verde", "Verduras", r"^Tomate Verde - Primera"),
    ("cebolla_bola", "Cebolla bola", "Verduras", r"^Cebolla Bola - Primera"),
    ("papa", "Papa alpha", "Verduras", r"^Papa Alpha - Primera"),
    ("chile_serrano", "Chile serrano", "Verduras", r"^Chile Serrano - Primera"),
    ("chile_jalapeno", "Chile jalapeño", "Verduras", r"^Chile Jalape"),
    ("chile_poblano", "Chile poblano", "Verduras", r"^Chile Poblano - Primera"),
    ("zanahoria", "Zanahoria", "Verduras", r"^Zanahoria"),
    ("calabacita", "Calabacita italiana", "Verduras", r"^Calabacita Italiana - Primera"),
    ("pepino", "Pepino", "Verduras", r"^Pepino"),
    ("lechuga", "Lechuga romanita", "Verduras", r"^Lechuga Romanita"),
    ("ajo", "Ajo blanco", "Verduras", r"^Ajo Blanco - Primera"),
    ("aguacate_hass", "Aguacate hass", "Frutas", r"^Aguacate Hass - Primera"),
    ("limon_semilla", "Limón con semilla", "Frutas", r"^Lim(?:ó|&#243;|o)n con semilla"),
    ("limon_persa", "Limón persa (sin semilla)", "Frutas", r"^Lim(?:ó|&#243;|o)n (?:sin semilla|Persa)"),
    ("platano", "Plátano tabasco", "Frutas", r"^Pl(?:á|&#225;|a)tano Tabasco"),
    ("naranja", "Naranja valencia", "Frutas", r"^Naranja Valencia"),
    ("manzana", "Manzana golden", "Frutas", r"^Manzana Golden"),
    ("papaya", "Papaya maradol", "Frutas", r"^Papaya Maradol"),
    ("mango", "Mango ataulfo", "Frutas", r"^Mango Ataulfo"),
    ("pina", "Piña", "Frutas", r"^Pi(?:ñ|&#241;)a"),
    ("sandia", "Sandía", "Frutas", r"^Sand(?:í|&#237;)a"),
    ("fresa", "Fresa", "Frutas", r"^Fresa"),
    ("uva", "Uva", "Frutas", r"^Uva"),
]
GRANOS = [
    ("frijol_negro", "Frijol negro", "Granos", r"^Frijol Negro - "),
    ("frijol_pinto", "Frijol pinto", "Granos", r"^Frijol Pinto - "),
    ("frijol_flor_mayo", "Frijol flor de mayo", "Granos", r"^Frijol Flor de mayo - "),
    ("arroz", "Arroz pulido Sinaloa", "Granos", r"^Arroz pulido Sinaloa - "),
    ("garbanzo", "Garbanzo", "Granos", r"^Garbanzo"),
    ("lenteja", "Lenteja", "Granos", r"^Lenteja"),
    ("cafe_molido", "Café molido", "Granos", r"^Caf(?:é|&#233;|e) molido"),
]
INPC = [  # (id, nombre, id de INEGI en BIE-BISE)
    ("inpc_general", "INPC general", "910392"),
    ("inpc_mercancias", "Mercancías", "910394"),
    ("inpc_servicios", "Servicios", "910395"),
    ("inpc_agropecuarios", "Agropecuarios (frutas, verduras, carnes, huevo)", "910397"),
    ("inpc_energeticos", "Energéticos y tarifas del gobierno (gasolina, gas, luz, agua)", "910398"),
]


def num(t):
    try:
        return float(str(t).replace(",", "").replace("$", "").strip())
    except ValueError:
        return None


# ------------------------------------------------------------------ SNIIM
def con_reintentos(bajar, esperas=None):
    """Envuelve «bajar»: si el servidor responde 5xx o no contesta, espera y reintenta (sin insistir con 4xx)."""
    def envuelta(url, *a, **k):
        for espera in (*(ESPERAS if esperas is None else esperas), None):
            try:
                return bajar(url, *a, **k)
            except Exception as e:  # noqa: BLE001
                codigo = getattr(e, "code", None)
                if espera is None or (codigo is not None and codigo < 500) or isinstance(e, PermissionError):
                    raise
                time.sleep(espera)
    return envuelta


def opciones_producto(pagina_html):
    """Lista desplegable de productos: [(id, nombre)]."""
    sel = re.search(r'id="ddlProducto".*?</select>', pagina_html, re.S)
    return [(v, html.unescape(n).strip()) for v, n in re.findall(r'<option[^>]*value="([^"]*)"[^>]*>([^<]*)</option>', sel.group(0) if sel else "")
            if v not in ("-1", "")]


def elegir(opciones, patron):
    for v, n in opciones:
        if re.search(patron, n, re.I):
            return v, n
    return None, None


def filas_sniim(pagina_html):
    """Filas de precios: (fecha ISO, precio frecuente). Toma el tercer número de la fila (mín, máx, frecuente)."""
    out = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", pagina_html, re.S | re.I):
        celdas = [html.unescape(re.sub(r"<[^>]+>", " ", c)).replace("\xa0", " ").strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S | re.I)]
        if not celdas or not re.fullmatch(r"\d{2}/\d{2}/\d{4}", celdas[0]):
            continue
        nums = [x for x in (num(c) for c in celdas[1:]) if x is not None]
        if len(nums) >= 3:
            v = nums[2] if nums[2] > 0 else nums[1]
        elif nums:
            v = nums[-1]
        else:
            continue
        d, m, a = celdas[0].split("/")
        if v and v > 0:
            out.append((f"{a}-{m}-{d}", v))
    return out


def mensual_promedio(diarios):
    """Precio por día (promedio de los orígenes) → promedio mensual."""
    por_dia = {}
    for f, v in diarios:
        por_dia.setdefault(f, []).append(v)
    por_mes = {}
    for f, vs in por_dia.items():
        por_mes.setdefault(f[:7], []).append(statistics.mean(vs))
    return [(f"{k}-01", round(statistics.mean(v), 2)) for k, v in sorted(por_mes.items())]


def url_resultados(pagina, prod_id, ini, fin):
    q = {"fechaInicio": ini.strftime("%d/%m/%Y"), "fechaFinal": fin.strftime("%d/%m/%Y"), "ProductoId": prod_id, "OrigenId": "-1", "Origen": "Todos",
         "DestinoId": DESTINO_ID, "Destino": DESTINO, "PreciosPorId": "2", "RegistrosPorPagina": "5000"}
    return SNIIM + pagina + "?" + urllib.parse.urlencode(q)


def serie_sniim(pagina_consulta, pagina_resultados, prod_id, previos, hoy, bajar):
    """Desde 2015 si no hay historia; si la hay, solo los últimos 45 días y se mezcla con lo anterior."""
    diarios = []
    if previos and previos[0][0][:4] <= str(DESDE):
        tramos = [(hoy - timedelta(days=45), hoy)]
    else:
        tramos = [(date(a, 1, 1), min(date(a, 12, 31), hoy)) for a in range(DESDE, hoy.year + 1)]
    for ini, fin in tramos:
        diarios += filas_sniim(bajar(url_resultados(pagina_resultados, prod_id, ini, fin)).decode("utf-8", "replace"))
        time.sleep(PAUSA)
    nuevos = dict(mensual_promedio(diarios))
    base = {f: v for f, v in (previos or [])}
    base.update(nuevos)
    return sorted(base.items())


# ------------------------------------------------------------------ CRE (gasolina)
def promedios_cre(xml_bytes):
    raiz = ET.fromstring(xml_bytes)
    vals = {}
    for gp in raiz.iter("gas_price"):
        v = num(gp.text)
        if v and 5 < v < 60:
            vals.setdefault(gp.get("type"), []).append(v)
    return {k: (round(statistics.mean(v), 2), len(v)) for k, v in vals.items()}


# ------------------------------------------------------------------ INPC por genérico (archivo manual)
_MESES = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6, "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12}


def _periodo(t):
    t = str(t).strip().lower()
    m = re.match(r"^(\d{4})[/-](\d{1,2})$", t)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-01"
    m = re.match(r"^([a-z]{3})[a-z]*\.?\s*(\d{4})$", t)
    if m and m.group(1) in _MESES:
        return f"{m.group(2)}-{_MESES[m.group(1)]:02d}-01"
    return None


def leer_genericos(texto):
    """CSV exportado de INEGI: una columna de periodo y una columna por genérico (o al revés). Devuelve {nombre: puntos}."""
    filas = [f for f in csv.reader(io.StringIO(texto)) if any(c.strip() for c in f)]
    series = {}
    # Formato 1: periodos en la primera columna, encabezados con los nombres.
    enc = next((f for f in filas if sum(1 for c in f[1:] if c.strip() and num(c) is None) >= 1 and not _periodo(f[0])), None)
    if enc:
        for f in filas:
            p = _periodo(f[0])
            if not p:
                continue
            for nombre, c in zip(enc[1:], f[1:]):
                v = num(c)
                if nombre.strip() and v is not None:
                    series.setdefault(nombre.strip(), []).append((p, v))
    # Formato 2: periodos en la fila de encabezado y un genérico por fila.
    if not series:
        cab = next((f for f in filas if sum(1 for c in f if _periodo(c)) >= 3), None)
        if cab:
            per = [_periodo(c) for c in cab]
            for f in filas:
                if f is cab or not f or not f[0].strip():
                    continue
                pts = [(p, num(c)) for p, c in zip(per, f) if p and num(c) is not None]
                if pts:
                    series[f[0].strip()] = pts
    return {k: sorted(v) for k, v in series.items() if len(v) >= 3}


# ------------------------------------------------------------------ armado
def construir(previo, bajar=PE.bajar, inegi_token="", hoy=None, carpeta_genericos=None):
    hoy = hoy or date.today()
    prev = {s["id"]: s for s in (previo or {}).get("series", [])}
    series, errores = [], []
    bajar_sniim = con_reintentos(bajar)

    def agrega(sid, nombre, grupo, unidad, fuente, enlace, frecuencia, fn, nota=""):
        reg = {"id": sid, "nombre": nombre, "grupo": grupo, "unidad": unidad, "fuente": fuente, "enlace": enlace, "frecuencia": frecuencia, "nota": nota}
        try:
            pts = fn()
            if not pts:
                raise ValueError("la fuente no devolvió datos")
            reg["puntos"] = [list(p) for p in pts]
        except Exception as e:  # noqa: BLE001
            reg["puntos"] = prev.get(sid, {}).get("puntos", [])
            reg["error"] = f"{type(e).__name__}: {str(e)[:160]}"
            errores.append(f"{nombre}: {reg['error']}")
        series.append(reg)
        print(f"{sid:<22} {len(reg['puntos']):>4} {reg['puntos'][-1] if reg['puntos'] else ''} {reg.get('error', '')}", flush=True)

    for consulta, resultados, lista, unidad in (("ConsultaFrutasYHortalizas.aspx", "ResultadosConsultaFechaFrutasYHortalizas.aspx", HORTALIZAS, "pesos por kg (mayoreo)"),
                                                ("ConsultaGranos.aspx", "ResultadosConsultaFechaGranos.aspx", GRANOS, "pesos por kg (mayoreo)")):
        try:
            opciones = opciones_producto(bajar_sniim(SNIIM + consulta).decode("utf-8", "replace"))
        except Exception as e:  # noqa: BLE001
            opciones = []
            errores.append(f"SNIIM {consulta}: {type(e).__name__}")
        for sid, nombre, grupo, patron in lista:
            pid, nombre_sniim = elegir(opciones, patron)
            fn = (lambda pid=pid, sid=sid: serie_sniim(consulta, resultados, pid, [tuple(x) for x in prev.get(sid, {}).get("puntos", [])], hoy, bajar_sniim)) if pid else \
                 (lambda patron=patron: (_ for _ in ()).throw(LookupError(f"producto no encontrado en la lista del SNIIM ({patron})")))
            agrega(sid, nombre, grupo, unidad, f"SNIIM · Central de Abasto CDMX{' · ' + nombre_sniim if nombre_sniim else ''}",
                   "https://www.economia-sniim.gob.mx/nuevo/", "mensual (promedio de precios diarios)", fn)

    # Gasolina: el promedio de hoy se agrega a la historia guardada.
    try:
        prom = promedios_cre(bajar(CRE, timeout=120))
    except Exception as e:  # noqa: BLE001
        prom = {}
        errores.append(f"CRE: {type(e).__name__}")
    for tipo, nombre in (("regular", "Gasolina regular (Magna)"), ("premium", "Gasolina premium"), ("diesel", "Diésel")):
        sid = f"gasolina_{tipo}"
        hist = {p[0]: p[1] for p in prev.get(sid, {}).get("puntos", [])}
        if tipo in prom:
            hist[hoy.isoformat()] = prom[tipo][0]
        agrega(sid, nombre, "Combustibles", "pesos por litro (promedio nacional)", "Comisión Reguladora de Energía · precios por gasolinera",
               "https://www.gob.mx/cre", "diaria (desde que se empezó a guardar)", lambda hist=hist: sorted(hist.items()),
               nota=f"Promedio de {prom[tipo][1]:,} gasolineras." if tipo in prom else "")

    for sid, nombre, ind in INPC:
        def fn(ind=ind):
            if not inegi_token:
                raise RuntimeError("falta el secreto INEGI_TOKEN")
            url = (f"https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR/{ind}/es/0/false/BIE-BISE/2.0/{inegi_token}?type=json")
            return [p for p in PE.leer_inegi(json.loads(bajar(url))) if p[0][:4] >= str(DESDE)]
        agrega(sid, nombre, "Índices de precios (INPC)", "índice (2.ª quincena de julio de 2018 = 100)", f"INEGI · INPC · {ind}",
               "https://www.inegi.org.mx/temas/inpc/", "mensual", fn)

    for ruta in sorted(glob.glob(os.path.join(carpeta_genericos or os.path.join(ROOT, "config", "inpc_genericos"), "*.csv"))):
        try:
            for nombre, pts in leer_genericos(open(ruta, encoding="utf-8-sig", errors="replace").read()).items():
                sid = "gen_" + re.sub(r"[^a-z0-9]+", "_", nombre.lower()).strip("_")[:40]
                agrega(sid, nombre, "INPC por producto y servicio (archivo de INEGI)", "índice (2.ª quincena de julio de 2018 = 100)",
                       f"INEGI · Índices de precios · {os.path.basename(ruta)}", "https://www.inegi.org.mx/app/indicesdeprecios/", "mensual",
                       lambda pts=pts: [p for p in pts if p[0][:4] >= str(DESDE)])
        except Exception as e:  # noqa: BLE001
            errores.append(f"{os.path.basename(ruta)}: {type(e).__name__}: {str(e)[:120]}")

    return {"generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "series": series, "errores": errores}


def main(args):
    carpeta = args[0] if args else os.path.join(ROOT, "economia")
    os.makedirs(carpeta, exist_ok=True)
    ruta = os.path.join(carpeta, "precios_mx.json")
    try:
        previo = json.load(open(ruta, encoding="utf-8"))
    except (OSError, ValueError):
        previo = None
    res = construir(previo, inegi_token=os.environ.get("INEGI_TOKEN", ""))
    json.dump(res, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    ok = sum(1 for s in res["series"] if s["puntos"])
    print(f"{ok}/{len(res['series'])} series con datos; {len(res['errores'])} errores")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
