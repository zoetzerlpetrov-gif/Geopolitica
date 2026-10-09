"""Catálogo de satélites para la ficha (GCAT) y órbitas de SatNOGS DB.

Por qué no CelesTrak: su robots.txt (consultado el 2026-10-09) prohíbe a programas automáticos las rutas
/NORAD/elements/gp*.php, /pub/ y todos los .csv, que son las que dan TLE y el SATCAT. Mientras no haya
permiso explícito, la descarga queda apagada (variable CELESTRAK_PERMITIDO=1 la reactiva).

GCAT (General Catalog of Artificial Space Objects, Jonathan McDowell, planet4589.org) — CC BY 4.0, cita
obligatoria «data from GCAT (J. McDowell, planet4589.org/space/gcat)». Su robots.txt permite /space/gcat/.
Trae, por objeto: tipo (carga útil, etapa de cohete, basura, componente), país y organización dueña,
fecha de lanzamiento y de reingreso, estado, masa, medidas, fabricante y plataforma. No trae TLE.

SatNOGS DB (Libre Space Foundation) — CC BY-SA 4.0; robots.txt solo prohíbe /admin/. Trae TLE de ~1,700
satélites (sobre todo pequeños, universitarios y de radioaficionados) tomados de Space-Track y otros.
"""
import re

GCAT_SATCAT = "https://planet4589.org/space/gcat/tsv/cat/satcat.tsv"
GCAT_ORGS = "https://planet4589.org/space/gcat/tsv/tables/orgs.tsv"
SATNOGS_TLE = "https://db.satnogs.org/api/tle/?format=json"
CITA_GCAT = "GCAT (J. McDowell, planet4589.org/space/gcat), CC BY 4.0"

TIPO = {"P": "Carga útil (satélite)", "R": "Etapa de cohete", "D": "Basura o fragmento", "C": "Componente desprendido", "S": "Objeto suborbital", "X": "Otro"}
ESTADO = {"O": "En órbita", "OX": "En órbita (fuera de servicio o perdido el contacto)", "R": "Reingresó", "L": "Aterrizó / recuperado",
          "D": "Desorbitado", "DK": "Acoplado a otro objeto", "AO": "En órbita (unido a otro objeto)", "N": "Sin dato de órbita",
          "E": "Escapó de la órbita terrestre", "AR": "Reingresó unido a otro objeto"}

# Telescopios espaciales en órbita terrestre con TLE (los de L2, como JWST, Gaia o Euclid, no tienen TLE).
TELESCOPIOS = r"\b(HST|HUBBLE|CXO|CHANDRA|FERMI|GLAST|SWIFT|NUSTAR|TESS|XMM|INTEGRAL|XRISM|IXPE|EINSTEIN PROBE|SVOM|HXMT|INSIGHT-HXMT|ASTROSAT|NICER|AGILE|SPEKTR|CHEOPS|NEOSSAT|SPHEREX|CSST|XUANWU)\b"


def _num(s):
    s = (s or "").strip().rstrip("?")
    try:
        return float(s)
    except ValueError:
        return None


def leer_tsv(texto):
    """TSV de GCAT (primera línea «#Columna…», comentarios con «#») → lista de dicts con valores sin espacios."""
    lineas = texto.splitlines()
    if not lineas:
        return []
    cab = lineas[0].lstrip("#").split("\t")
    return [{k: v.strip() for k, v in zip(cab, l.split("\t"))} for l in lineas[1:] if l and not l.startswith("#")]


def nombres_orgs(filas):
    """orgs.tsv → {código: nombre corto en inglés} (se usa para países y organizaciones dueñas)."""
    out = {}
    for f in filas:
        cod = f.get("Code")
        if cod:
            # GCAT escribe «-» en las columnas sin dato: se toma la primera que tenga nombre.
            out[cod] = next((f[k] for k in ("ShortEName", "EName", "ShortName", "Name") if f.get(k) not in (None, "", "-")), cod)
    return out


def fila_compacta(f):
    """Una fila del satcat de GCAT → arreglo corto para el navegador.
    [tipo, país, organización, lanzamiento, reingreso, estado, masa_kg, «largo×diámetro×envergadura m», fabricante, plataforma, nombre_carga]"""
    medidas = [_num(f.get(k)) for k in ("Length", "Diameter", "Span")]
    dims = "×".join(f"{m:g}" for m in medidas if m) if any(medidas) else ""
    masa = _num(f.get("Mass")) or _num(f.get("TotMass"))
    limpio = lambda k: "" if f.get(k, "-") in ("-", "") else f[k]  # noqa: E731
    return [(f.get("Type") or "X")[:1], limpio("State"), limpio("Owner"), limpio("LDate"), limpio("DDate"), limpio("Status"),
            round(masa) if masa else None, dims, limpio("Manufacturer"), limpio("Bus"), limpio("PLName")]


def catalogo_para(filas, noradas):
    """Solo los objetos que el mapa dibuja (por número NORAD), repartidos en 10 archivos por el último dígito."""
    partes = {str(d): {} for d in range(10)}
    usados = set()
    for f in filas:
        n = (f.get("Satcat") or "").lstrip("0")
        if n and n in noradas:
            partes[n[-1]][n] = fila_compacta(f)
            usados.update(x for x in (f.get("State"), f.get("Owner"), f.get("Manufacturer")) if x and x != "-")
    return partes, usados


def tle_satnogs(lista):
    """Respuesta de /api/tle/ → {norad: [nombre, línea1, línea2]}."""
    out = {}
    for x in lista or []:
        l1, l2, n = (x.get("tle1") or "").strip(), (x.get("tle2") or "").strip(), x.get("norad_cat_id")
        if n and l1.startswith("1 ") and l2.startswith("2 "):
            out[str(n)] = [re.sub(r"^0 ", "", (x.get("tle0") or "").strip()) or str(n), l1, l2]
    return out


def norad(tle):
    return tle[2][2:7].strip().lstrip("0")


def edad_dias(l1, hoy_jd):
    """Días desde la época del TLE (columnas 19-32 de la línea 1: AAddd.dddddddd)."""
    try:
        aa, dia = int(l1[18:20]), float(l1[20:32])
    except ValueError:
        return 9999
    anio = 2000 + aa if aa < 57 else 1900 + aa
    # Día juliano del 1 de enero a las 0 h (calendario gregoriano); el día 1.0 del TLE es ese instante.
    a = anio - 1
    jd_1ene = 1721425.5 + 365 * a + a // 4 - a // 100 + a // 400
    return hoy_jd - (jd_1ene + dia - 1)


def renovar(grupos, frescos, hoy_jd, max_dias=30):
    """Sustituye TLE viejos por los frescos (mismo NORAD) y descarta los de más de `max_dias` días:
    con esa antigüedad SGP4 puede errar cientos de km y el punto engañaría más de lo que informa."""
    out, renovados, descartados = {}, 0, 0
    for g, lista in grupos.items():
        nueva = []
        for t in lista:
            n = norad(t)
            if n in frescos:
                t = [t[0], frescos[n][1], frescos[n][2]]
                renovados += 1
            if edad_dias(t[1], hoy_jd) > max_dias:
                descartados += 1
                continue
            nueva.append(t)
        out[g] = nueva
    return out, renovados, descartados


def telescopios(grupos):
    vistos, out = set(), []
    for lista in grupos.values():
        for t in lista:
            if re.search(TELESCOPIOS, t[0].upper()) and norad(t) not in vistos and "DEB" not in t[0] and "R/B" not in t[0]:
                vistos.add(norad(t))
                out.append(t)
    return out
