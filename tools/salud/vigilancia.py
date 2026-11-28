"""Vigilancia de brotes para Brújula Diaria y los shorts: qué virus, bacterias o enfermedades conviene tener en la mira hoy.

Lee los dos archivos de tools/salud/salud.py (vivos/salud_oficial.geojson: OMS, CDC y ECDC; vivos/salud_noticias.geojson:
señales en noticias de GDELT) y elige los focos más relevantes:
  1. graves (ébola, Marburgo, enfermedad de causa no determinada, superbacterias…) o incidentes de laboratorio;
  2. nuevos: el foco apareció en las últimas `horas` (aunque tenga pocas notas: un brote que apenas empieza);
  3. con más notas o con aviso oficial de nivel alto.
Solo usa enfermedad, lugar, fechas, número de notas y la fuente (nunca el texto de los artículos).
"""
import json
import os
import unicodedata
from datetime import datetime, timedelta, timezone

GRAVES = {"grave", "laboratorio"}
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _paises():
    try:
        g = json.load(open(os.path.join(RAIZ, "config", "gazetteer.json"), encoding="utf-8"))["paises"]
        return {k: v.get("es") or v.get("en") or k for k, v in g.items()}
    except (OSError, ValueError, KeyError):
        return {}


PAISES = _paises()


def _base(t):
    return "".join(c for c in unicodedata.normalize("NFD", str(t).lower()) if unicodedata.category(c) != "Mn").strip()


def lugar_corto(lugar, iso3=""):
    """«Kano, Kano, Nigeria» → «Kano, Nigeria»; el país en español cuando se conoce (sin repetir)."""
    partes = [x.strip() for x in str(lugar or "").split(",") if x.strip()]
    pais = PAISES.get(iso3 or "", "")
    primero = partes[0] if partes else ""
    if pais and primero and _base(primero) != _base(pais) and _base(pais) not in _base(primero):
        return f"{primero}, {pais}"
    return pais or primero


def _fecha(t):
    try:
        return datetime.fromisoformat(str(t).replace("Z", "+00:00"))
    except ValueError:
        return None


def _lista(v):
    if isinstance(v, list):
        return v
    try:
        return json.loads(v) if isinstance(v, str) and v.startswith("[") else []
    except ValueError:
        return []


def focos(oficial, noticias, ahora=None, horas=72, n=5):
    """Lista ordenada de dicts {enfermedad, lugar, grupo, grave, nuevo, notas, fuente, url, fecha, oficial}."""
    ahora = ahora or datetime.now(timezone.utc)
    limite = ahora - timedelta(hours=horas)
    out = []
    for f in (noticias or {}).get("features", []):
        p = f.get("properties") or {}
        fin, ini = _fecha(p.get("date")), _fecha(p.get("desde") or p.get("date"))
        if not fin or fin < limite or not p.get("enfermedad"):
            continue
        enlaces = _lista(p.get("enlaces"))
        out.append({"enfermedad": p["enfermedad"], "lugar": lugar_corto(p.get("state"), p.get("pais_iso3")), "pais_iso3": p.get("pais_iso3") or "", "grupo": p.get("grupo") or "otra",
                    "grave": (p.get("grupo") in GRAVES) or bool(p.get("severe")), "nuevo": bool(ini and ini >= limite), "notas": int(p.get("notas") or 1),
                    "fuente": p.get("source") or "", "url": p.get("url") or (enlaces[0].get("url") if enlaces else ""), "fecha": fin, "oficial": False,
                    "nivel": 0, "kind": p.get("kind") or ""})
    for f in (oficial or {}).get("features", []):
        p = f.get("properties") or {}
        fecha = _fecha(p.get("date"))
        if not fecha or fecha < limite or not p.get("enfermedad"):
            continue
        out.append({"enfermedad": p["enfermedad"], "lugar": lugar_corto(p.get("lugar"), p.get("pais_iso3")), "pais_iso3": p.get("pais_iso3") or "", "grupo": p.get("grupo") or "otra",
                    "grave": p.get("grupo") in GRAVES or (p.get("nivel") or 0) >= 3, "nuevo": True, "notas": 1,
                    "fuente": (p.get("fuente") or "").split(" · ")[0], "url": p.get("url") or "", "fecha": fecha, "oficial": True, "nivel": p.get("nivel") or 0,
                    "kind": p.get("enf_id") or ""})
    # Una sola entrada por enfermedad y país (gana la oficial, luego la de más notas).
    vistos, unicos = set(), []
    for x in sorted(out, key=lambda x: (not x["oficial"], -x["notas"])):
        k = (x["enfermedad"], x["pais_iso3"] or x["lugar"])
        if k not in vistos:
            vistos.add(k)
            unicos.append(x)
    # Primero los dos focos graves que más se mencionan (brotes en curso); luego los nuevos, aunque apenas empiecen.
    en_curso = sorted((x for x in unicos if x["grave"] and not x["nuevo"]), key=lambda x: (-(x["nivel"] or 0), -x["notas"]))[:2]
    nuevos = sorted((x for x in unicos if x["nuevo"]), key=lambda x: (eco(x, unicos), not x["grave"], -(x["nivel"] or 0), -x["notas"], -x["fecha"].timestamp()))
    resto = sorted((x for x in unicos if x not in en_curso and x not in nuevos), key=lambda x: -x["notas"])
    return (en_curso + nuevos + resto)[:n]


# Lo que justifica un short de alerta aunque no sea el día de Salud: algo desconocido, un incidente de laboratorio,
# una superbacteria o un aviso oficial de nivel alto que apareció en los últimos días.
ALERTA = {"indeterminada", "laboratorio", "superbacteria", "ebola", "marburgo", "nipah", "viruela", "hemorragica"}


def eco(x, lista):
    """Un foco nuevo y pequeño de una enfermedad que ya tiene un brote grande en otro país suele ser una mención
    (restricciones de viaje, ayuda, vacunas), no un contagio local: no dispara la alerta, aunque sigue en la lista."""
    return any(y is not x and y["enfermedad"] == x["enfermedad"] and not y["nuevo"] and y["notas"] >= 5 * max(1, x["notas"]) for y in lista)


def alerta(lista):
    """Focos nuevos que ameritan un short de «Vigilancia de brotes» hoy."""
    return [x for x in lista if x["nuevo"] and not eco(x, lista) and (x.get("kind") in ALERTA or (x["oficial"] and (x.get("nivel") or 0) >= 3))]


def frase(x):
    """«Ébola en Congo (República Democrática del): 123 notas en noticias» o «Chikungunya en Honduras: aviso de CDC»."""
    lugar = f" en {x['lugar']}" if x.get("lugar") else ""
    if x["oficial"]:
        detalle = f"aviso de {x['fuente']}" if x.get("fuente") else "aviso oficial"
    else:
        detalle = "primeras notas, apenas empieza" if x["nuevo"] and x["notas"] <= 3 else f"{x['notas']} notas en noticias"
    return f"{x['enfermedad']}{lugar}: {detalle}"


def voz(lista):
    """Texto para la voz del noticiero (sin cifras de casos: solo lo que se sabe con certeza)."""
    if not lista:
        return ""
    partes = "; ".join(frase(x) for x in lista)
    return ("Vigilancia de brotes en el mundo, para tenerlos en la mira. " + partes + ". "
            "Son señales de noticias y avisos oficiales; para decisiones de salud, consulta a la autoridad sanitaria de tu país.")
