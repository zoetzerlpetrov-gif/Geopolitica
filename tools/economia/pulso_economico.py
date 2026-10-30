#!/usr/bin/env python3
"""Sección Economía (solo admin, economia.html): indicadores de México, EUA y la UE e índices «curiosos».

Basado en la idea de Pulso Ciudadano, pero independiente: este proceso baja cada serie directo de su fuente (FRED, Eurostat,
INEGI, Banxico, The Economist, Fed de Nueva York) según config/economia.json. Si una fuente falla, se conserva el último
dato bueno de esa serie y se anota el error. Respeta robots.txt (ingest/fuentes.py). Las llaves salen de GitHub Secrets:
INEGI_TOKEN y BANXICO_API_KEY.

Uso: python3 tools/economia/pulso_economico.py <carpeta>   → <carpeta>/indicadores.json
"""
import csv
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

ANIOS = 10
BIGMAC = "https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/output-data/big-mac-full-index.csv"
GSCPI = "https://www.newyorkfed.org/medialibrary/research/interactives/gscpi/downloads/gscpi_data.xlsx"


def bajar(url, headers=None, timeout=60):
    """Descarga solo si el robots.txt del sitio lo permite (mismo agente que el resto del proyecto)."""
    if not F.permitido_por_robots(url):
        raise PermissionError("el robots.txt del sitio no lo permite")
    if not headers:
        return F.get(url, timeout=timeout)
    req = urllib.request.Request(url, headers={"User-Agent": F.UA, **headers})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def recorte(puntos, hoy=None):
    """Últimos 10 años, ordenados y sin repetidos."""
    hoy = hoy or date.today()
    corte = f"{hoy.year - ANIOS}-{hoy.month:02d}-01"
    vistos = {}
    for f, v in puntos:
        if f >= corte and v is not None:
            vistos[f] = round(float(v), 6)
    return sorted(vistos.items())


def mensual(puntos):
    """Series diarias → último dato de cada mes (las gráficas son mensuales)."""
    por_mes = {}
    for f, v in puntos:
        por_mes[f[:7]] = (f, v)
    return [por_mes[k] for k in sorted(por_mes)]


# ------------------------------------------------------------------ lectores (sin red: reciben el texto)
def leer_fred(texto):
    filas = list(csv.reader(io.StringIO(texto)))[1:]
    out = []
    for f in filas:
        try:
            out.append((f[0], float(f[1])))
        except (ValueError, IndexError):
            continue
    return out


def leer_eurostat(js):
    tiempos = js["dimension"]["time"]["category"]["index"]
    orden = sorted(tiempos, key=tiempos.get)
    out = []
    # Con todas las demás dimensiones fijas en un valor, la posición del dato es la del periodo.
    for k, v in sorted(((int(k), v) for k, v in (js.get("value") or {}).items())):
        if v is None or k >= len(orden):
            continue
        per = orden[k]
        if "-Q" in per:
            f = f"{per[:4]}-{(int(per[-1]) - 1) * 3 + 1:02d}-01"
        elif len(per) == 7 and per[4] == "-":
            f = per + "-01"
        else:
            f = per[:4] + "-01-01"
        out.append((f, v))
    return out


def leer_banxico(js):
    out = []
    for d in (js.get("bmx", {}).get("series") or [{}])[0].get("datos") or []:
        try:
            dd, mm, aa = d["fecha"].split("/")
            out.append((f"{aa}-{mm}-{dd}", float(str(d["dato"]).replace(",", ""))))
        except (ValueError, KeyError):
            continue
    return out


def leer_inegi(js, trimestral=False):
    """Observaciones nacionales. En series trimestrales INEGI escribe «2026/02» = 2.º trimestre → 2026-04-01."""
    serie = (js.get("Series") or [{}])[0]
    out = []
    for o in serie.get("OBSERVATIONS") or []:
        if o.get("COBER_GEO") not in (None, "", "0", "00"):
            continue
        per = str(o.get("TIME_PERIOD", "")).replace("/", "-")
        try:
            anio, mes = int(per[:4]), int(per[5:7]) if len(per) >= 7 else 1
            if trimestral:
                mes = (mes - 1) * 3 + 1
            out.append((f"{anio}-{mes:02d}-01", float(o["OBS_VALUE"])))
        except (ValueError, KeyError, TypeError):
            continue
    return sorted(out)


def leer_bigmac(texto, iso, campo="USD_raw"):
    out = []
    for f in csv.DictReader(io.StringIO(texto)):
        if f.get("iso_a3") == iso and f.get(campo) not in (None, ""):
            v = float(f[campo])
            out.append((f["date"], round(v * 100, 2) if campo == "USD_raw" else v))
    return out


def leer_gscpi(contenido):
    """Hoja «GSCPI Monthly Data» del archivo de la Fed de NY (formato .xls antiguo)."""
    import xlrd
    libro = xlrd.open_workbook(file_contents=contenido)
    hoja = next((libro.sheet_by_name(n) for n in libro.sheet_names() if "monthly" in n.lower()), libro.sheet_by_index(0))
    out = []
    for r in range(hoja.nrows):
        c0, c1 = hoja.cell(r, 0), hoja.cell(r, 1) if hoja.ncols > 1 else None
        if c1 is None or c1.ctype != xlrd.XL_CELL_NUMBER:
            continue
        if c0.ctype == xlrd.XL_CELL_DATE:
            d = xlrd.xldate_as_datetime(c0.value, libro.datemode)
            out.append((d.strftime("%Y-%m-01"), c1.value))
        elif isinstance(c0.value, str) and c0.value[:2].isdigit():
            try:
                d = datetime.strptime(c0.value.strip()[:11], "%d-%b-%Y")
                out.append((d.strftime("%Y-%m-01"), c1.value))
            except ValueError:
                continue
    return out


# ------------------------------------------------------------------ transformaciones
def anual(puntos):
    """Índice → % de cambio contra el mismo mes del año anterior."""
    por = dict(puntos)
    out = []
    for f, v in puntos:
        prev = por.get(f"{int(f[:4]) - 1}{f[4:]}")
        if prev:
            out.append((f, round((v / prev - 1) * 100, 3)))
    return out


def derivar(op, a, b):
    db = dict(b)
    out = []
    for f, v in a:
        if f in db and db[f] is not None:
            if op == "cociente" and db[f]:
                out.append((f, round(v / db[f], 4)))
            elif op == "suma":
                out.append((f, round(v + db[f], 3)))
    return out


# ------------------------------------------------------------------ descarga por tipo de fuente
class Descargas:
    def __init__(self, inegi_token="", banxico_token=""):
        self.inegi_token, self.banxico_token = inegi_token, banxico_token
        self._cache = {}

    def una_vez(self, url, fn):
        if url not in self._cache:
            self._cache[url] = fn()
        return self._cache[url]

    def serie(self, fuente):
        t = fuente["tipo"]
        if t == "fred":
            return leer_fred(bajar(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={fuente['id']}").decode("utf-8"))
        if t == "eurostat":
            q = urllib.parse.urlencode({"format": "JSON", "lang": "en", **fuente["params"], "sinceTimePeriod": f"{date.today().year - ANIOS}"})
            return leer_eurostat(json.loads(bajar(f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{fuente['dataset']}?{q}")))
        if t == "banxico":
            if not self.banxico_token:
                raise RuntimeError("falta el secreto BANXICO_API_KEY")
            ini = f"{date.today().year - ANIOS}-01-01"
            return leer_banxico(json.loads(bajar(f"https://www.banxico.org.mx/SieAPIRest/service/v1/series/{fuente['id']}/datos/{ini}/{date.today()}",
                                                 headers={"Bmx-Token": self.banxico_token, "Accept": "application/json"})))
        if t == "inegi":
            if not self.inegi_token:
                raise RuntimeError("falta el secreto INEGI_TOKEN")
            url = (f"https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR/{fuente['id']}/es/0/false/"
                   f"{fuente.get('fuente_inegi', 'BISE')}/2.0/{self.inegi_token}?type=json")
            return leer_inegi(json.loads(bajar(url)), trimestral=fuente.get("trimestral", False))
        if t == "bigmac":
            texto = self.una_vez(BIGMAC, lambda: bajar(BIGMAC).decode("utf-8"))
            return leer_bigmac(texto, fuente["iso"], fuente.get("campo", "USD_raw"))
        if t == "gscpi":
            return leer_gscpi(self.una_vez(GSCPI, lambda: bajar(GSCPI)))
        raise ValueError(f"fuente desconocida: {t}")


def construir(cfg, previo, descargas, pausa=0.3):
    """Baja cada indicador; si falla, conserva los puntos anteriores. Luego calcula los derivados."""
    prev = {i["id"]: i for i in (previo or {}).get("indicadores", [])}
    salida = {}
    for ind in cfg["indicadores"]:
        reg = {"id": ind["id"]}
        try:
            pts = descargas.serie(ind["fuente"])
            if ind["fuente"].get("tipo") in ("fred", "banxico") and ind.get("frecuencia") == "diaria":
                pts = mensual(pts)
            if ind.get("transform") == "anual":
                pts = anual(pts)
            pts = recorte(pts)
            if not pts:
                raise ValueError("la fuente no devolvió datos")
            reg.update(puntos=pts, actualizado_utc=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
        except Exception as e:  # noqa: BLE001
            viejo = prev.get(ind["id"], {})
            reg.update(puntos=viejo.get("puntos", []), actualizado_utc=viejo.get("actualizado_utc"),
                       error=f"{type(e).__name__}: {str(e)[:160]}", conservado=bool(viejo.get("puntos")))
        salida[ind["id"]] = reg
        print(f"{ind['id']:<22} {len(reg['puntos']):>4} puntos {reg['puntos'][-1] if reg['puntos'] else ''} {reg.get('error', '')}", flush=True)
        time.sleep(pausa)
    for d in cfg.get("derivados", []):
        a, b = salida.get(d["a"], {}).get("puntos", []), salida.get(d["b"], {}).get("puntos", [])
        pts = derivar(d["operacion"], [tuple(x) for x in a], [tuple(x) for x in b])
        salida[d["id"]] = {"id": d["id"], "puntos": pts, "actualizado_utc": max(filter(None, [salida.get(d["a"], {}).get("actualizado_utc"), salida.get(d["b"], {}).get("actualizado_utc")]), default=None)}
        if not pts:
            salida[d["id"]]["error"] = "sin fechas en común entre sus dos series"
    errores = [f"{k}: {v['error']}" for k, v in salida.items() if v.get("error")]
    return {"generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "indicadores": list(salida.values()), "errores": errores}


def main(args):
    carpeta = args[0] if args else os.path.join(ROOT, "economia")
    os.makedirs(carpeta, exist_ok=True)
    ruta = os.path.join(carpeta, "indicadores.json")
    cfg = json.load(open(os.path.join(ROOT, "config", "economia.json"), encoding="utf-8"))
    try:
        previo = json.load(open(ruta, encoding="utf-8"))
    except (OSError, ValueError):
        previo = None
    res = construir(cfg, previo, Descargas(os.environ.get("INEGI_TOKEN", ""), os.environ.get("BANXICO_API_KEY", "")))
    json.dump(res, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    ok = sum(1 for i in res["indicadores"] if i["puntos"])
    print(f"{ok}/{len(res['indicadores'])} indicadores con datos; {len(res['errores'])} con error")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
