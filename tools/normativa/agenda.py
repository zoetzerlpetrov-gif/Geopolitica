#!/usr/bin/env python3
"""Agenda regulatoria de México: lo que el gobierno y el Congreso planean cambiar ANTES de que se publique en el DOF.

Fuentes (todas ya disponibles en el proyecto y permitidas):
  1. Sumario del DOF (vivos/dof.json): proyectos de Norma Oficial Mexicana (PROY-NOM) en consulta pública, avisos de
     consulta, programas de normalización y de mejora regulatoria. Son reglas que todavía no están vigentes.
  2. Titulares del monitor de noticias (vivos/noticiero.json): iniciativas, dictámenes, aprobaciones en comisiones o en
     una cámara y minutas. Solo título, enlace, medio y fecha (nunca el texto de la nota).
La Gaceta Parlamentaria (gaceta.diputados.gob.mx) responde 403 a su robots.txt: por la regla del proyecto se trata como
prohibida y NO se consulta. SIL y CONAMER quedan como fuentes por incorporar cuando se verifique su acceso.

Cada señal se clasifica por etapa del proceso y lleva una probabilidad de publicación en el DOF que es una ESTIMACIÓN
heurística (etapa + origen), no un pronóstico oficial. La agenda conserva su historial (nunca borra): cuando una ley de la
agenda aparece después publicada en la bitácora normativa, la señal se marca «publicada» para medir el acierto.
Uso: python3 tools/normativa/agenda.py normativa vivos
"""
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
import monitor as M  # noqa: E402  (catálogo, índice de leyes y sectores, normalización)

# Etapas, de la más temprana a la más cercana al DOF, con su probabilidad estimada de publicarse y el horizonte típico.
ETAPAS = {
    "consulta": {"nombre": "Proyecto en consulta pública", "prob": 0.75, "meses": "1–6"},
    "iniciativa": {"nombre": "Iniciativa presentada", "prob": 0.15, "meses": "3–18"},
    "iniciativa_ejecutivo": {"nombre": "Iniciativa del Ejecutivo federal", "prob": 0.7, "meses": "1–6"},
    "dictamen": {"nombre": "Dictamen en comisiones", "prob": 0.6, "meses": "1–4"},
    "aprobada_camara": {"nombre": "Aprobada en una cámara (minuta)", "prob": 0.8, "meses": "1–3"},
    "aprobada_congreso": {"nombre": "Aprobada por el Congreso; falta publicar en el DOF", "prob": 0.93, "meses": "0–1"},
    "programa": {"nombre": "Programa de normalización o mejora regulatoria", "prob": 0.5, "meses": "3–12"},
    "anunciada": {"nombre": "Ley o reforma nueva en discusión pública", "prob": 0.45, "meses": "1–9"},
}
# Orden del proceso (para que la etapa de una señal solo avance).
ORDEN = ["programa", "iniciativa", "anunciada", "consulta", "iniciativa_ejecutivo", "dictamen", "aprobada_camara", "aprobada_congreso"]
ESTADOS_MX = r"aguascalientes|baja california( sur)?|campeche|chiapas|chihuahua|coahuila|colima|durango|guanajuato|guerrero|hidalgo|jalisco|(estado de )?m[eé]xico|edomex|michoac[aá]n|morelos|nayarit|nuevo le[oó]n|oaxaca|puebla|quer[eé]taro|quintana roo|san luis potos[ií]|sinaloa|sonora|tabasco|tamaulipas|tlaxcala|veracruz|yucat[aá]n|zacatecas|la ciudad de m[eé]xico|cdmx"
ESTATAL = re.compile(rf"congreso (de|del) ({ESTADOS_MX})\b|congreso (local|estatal|capitalino|mexiquense|jalisciense|poblano)", re.I)
LEY_NOMBRE = re.compile(r"\b(ley(?: general| federal| nacional| org[aá]nica)? (?:de|del|para|contra|sobre)(?: la| los| las| el)? [A-ZÁÉÍÓÚÑa-záéíóúñ]+(?: [A-ZÁÉÍÓÚÑa-záéíóúñ]+){0,2})", re.I)
# Sector de un PROY-NOM según la dependencia que lo emite (la clave va después del número: PROY-NOM-041-ENER/SE-2025).
SECTOR_DEPENDENCIA = {"ENER": ["energia_electrica"], "NUCL": ["energia_electrica"], "CRE": ["energia_electrica"], "ASEA": ["hidrocarburos"],
                      "SESH": ["hidrocarburos"], "SECRE": ["energia_electrica"], "SICT": ["logistica", "transporte_pasajeros"], "SCT": ["logistica", "transporte_pasajeros"],
                      "SCFI": ["comercio_minorista"], "SSA": ["salud_hospitales", "farmaceutico"], "SSA1": ["farmaceutico", "alimentos"], "SSA2": ["salud_hospitales"],
                      "SEMARNAT": ["residuos_reciclaje"], "CONAGUA": ["agua_saneamiento"], "SAG": ["agropecuario"], "FITO": ["agropecuario"],
                      "ZOO": ["agropecuario"], "PESC": ["pesca_acuicultura"], "SEDATU": ["inmobiliario_desarrollo", "construccion"], "STPS": ["manufactura_immex"],
                      "SEGOB": [], "SE": ["manufactura_immex"], "IFT": ["telecom"], "CNBV": ["bancos"]}
PALABRAS_VACIAS = set("para por con sin sobre entre ante tras desde hasta como cual cuando donde este esta estos estas todo toda todos todas nueva nuevo nuevas nuevos ley leyes reforma reformas iniciativa senado congreso diputados camara aprueba aprueban avala avalan mexico tendras estos cambios contempla establece".split())
VERIFICADOR = re.compile(r"verificador", re.I)
DOF_CONSULTA = re.compile(r"proyecto de norma oficial mexicana|proy-nom|consulta p[uú]blica|anteproyecto", re.I)
DOF_PROGRAMA = re.compile(r"programa nacional de infraestructura de la calidad|programa (anual )?de mejora regulatoria|suplemento del programa", re.I)
DOF_RESPUESTAS = re.compile(r"respuestas? a los comentarios", re.I)

LEGISLATIVO = re.compile(r"\b(ley|leyes|constituci[oó]n|constitucional|c[oó]digo|reforma|decreto)\b", re.I)
NO_LEGISLATIVO = re.compile(r"banxico|banco de m[eé]xico|minutas? de (pol[ií]tica monetaria|la fed|banxico)|fed\b|tasa de inter[eé]s", re.I)
ETAPA_NOTICIA = [
    ("anunciada", None),  # se resuelve abajo: «nueva ley …» sin verbo de etapa
    ("aprobada_congreso", re.compile(r"(congreso|senado|c[aá]mara de diputados|diputados|senadores)\s+(aprueba|aprueban|avala|avalan)n?\b.*\b(en lo general y en lo particular|env[ií]a al ejecutivo|para su publicaci[oó]n)|turna(n|da)? al ejecutivo|declaratoria de validez", re.I)),
    ("aprobada_camara", re.compile(r"(senado|c[aá]mara de diputados|diputados|senadores|pleno|congreso)\s+(aprueba|aprueban|avala|avalan)|minuta|aprobad[ao] en el (pleno|senado)", re.I)),
    ("dictamen", re.compile(r"dictamen|comisi[oó]n(es)? (aprueba|aprueban|avala|avalan)|aprueban? en comisi", re.I)),
    ("iniciativa_ejecutivo", re.compile(r"(sheinbaum|presidenta|ejecutivo federal|el gobierno federal)\b.{0,60}\b(env[ií]a|presenta|propone|enviar[aá]|presentar[aá])\b.{0,40}\b(iniciativa|reforma|ley)|iniciativa (de|del) (la presidenta|ejecutivo)", re.I)),
    ("iniciativa", re.compile(r"iniciativa|propone(n)? (una )?(reforma|ley)|presenta(n)? (una )?(reforma|propuesta de ley)|buscan? reformar", re.I)),
]


def _id(*partes):
    return "AG:" + hashlib.sha1("|".join(partes).encode("utf-8")).hexdigest()[:12]


def clave_tema(titulo, url):
    """Las notas sobre la misma ley se agrupan en una sola señal (p. ej. cinco titulares de la Ley de Bienestar Animal)."""
    m = LEY_NOMBRE.search(titulo or "")
    return M.norm(m.group(1)) if m else (url or M.norm(titulo))


def sectores_nom(titulo):
    out = set()
    for deps in re.findall(r"NOM-\d{3}(?:-\d)?-([A-Z0-9/]+)", titulo or ""):
        for d in deps.split("/"):
            out.update(SECTOR_DEPENDENCIA.get(re.sub(r"\d+$", "", d), SECTOR_DEPENDENCIA.get(d, [])))
    return out


def palabras(titulo):
    return {w for w in re.findall(r"[a-zñ]{5,}", M.norm(titulo)) if w not in PALABRAS_VACIAS}


def senal(fecha, fuente, etapa, titulo, url, medio, cats, idx, ambito="federal"):
    leyes, sectores = M.cruzar("MEX", titulo, idx, cats)
    sectores = sorted(set(sectores) | sectores_nom(titulo))
    e = ETAPAS[etapa]
    tema = clave_tema(titulo, url) if fuente.startswith("Monitor") else (url + "|" + M.norm(titulo)[:80])
    return {"id": _id(ambito, tema), "detectado": fecha, "actualizado": fecha, "fuente": fuente, "ambito": ambito, "etapa": etapa,
            "etapa_nombre": e["nombre"], "probabilidad": e["prob"], "horizonte_meses": e["meses"], "titulo": M.limpiar(titulo)[:300],
            "url": url, "medio": medio, "leyes": [l["nombre"] for l in leyes[:5]], "sectores": sectores, "estado": "en curso",
            "notas": [{"t": M.limpiar(titulo)[:300], "u": url, "m": medio, "f": fecha}]}


def desde_dof(dof, desde, cats, idx):
    for f, items in sorted((dof or {}).get("dias", {}).items()):
        if f < desde:
            continue
        for cod, _tipo, _dep, texto in items:
            if DOF_RESPUESTAS.search(texto):
                continue  # respuesta a comentarios: la norma definitiva viene después, ya está en curso
            etapa = "consulta" if DOF_CONSULTA.search(texto) else "programa" if DOF_PROGRAMA.search(texto) else None
            if etapa:
                yield senal(f, "Diario Oficial de la Federación (sumario)", etapa, texto,
                            f"https://dof.gob.mx/index.php?year={f[:4]}&month={f[5:7]}&day={f[8:10]}", "DOF", cats, idx)


def es_de_mexico(n):
    """Solo medios o secciones de México (evita leyes de otros países con el mismo nombre)."""
    medio, secs = str(n.get("m") or ""), [str(x) for x in (n.get("s") or [])]
    return (medio.endswith(".mx") or "méxico" in medio.lower() or "mexico" in medio.lower() or any(x.endswith("_mx") for x in secs)
            or "méxico" in str(n.get("t") or "").lower())


def desde_noticias(noticiero, cats, idx):
    for n in (noticiero or {}).get("notas", []):
        t = n.get("t") or ""
        if not LEGISLATIVO.search(t) or NO_LEGISLATIVO.search(t) or VERIFICADOR.search(str(n.get("tipo") or "")) or not es_de_mexico(n):
            continue
        etapa = next((k for k, rx in ETAPA_NOTICIA if rx and rx.search(t)), None)
        if not etapa and re.search(r"\bnueva ley\b|\breforma (a|al|de) la (ley|constituci)", t, re.I):
            etapa = "anunciada"
        if not etapa:
            continue
        fecha = str(n.get("f") or "")[:10] or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        yield senal(fecha, "Monitor de noticias (titular)", etapa, t, n.get("u") or "", n.get("m") or "", cats, idx,
                    "estatal" if ESTATAL.search(t) else "federal")


def marcar_publicadas(agenda, bitacora, ventana_dias=540):
    """Una señal en curso pasa a «publicada» si después aparece en la bitácora del DOF una publicación de la misma ley."""
    pub = [(e.get("fecha") or "", set(e.get("leyes_nombres") or [l.get("nombre") for l in e.get("leyes", []) if isinstance(l, dict)] or []))
           for e in (bitacora or {}).get("entradas", []) if str(e.get("id", "")).startswith("MEX:dof:")]
    for s in agenda:
        if s.get("estado") != "en curso" or not s.get("leyes"):
            continue
        limite = (datetime.strptime(s["detectado"], "%Y-%m-%d") + timedelta(days=ventana_dias)).strftime("%Y-%m-%d")
        for fecha, leyes in pub:
            if s["detectado"] <= fecha <= limite and leyes & set(s["leyes"]):
                s["estado"], s["publicada_el"] = "publicada", fecha
                break


def resumen(agenda):
    curso = [s for s in agenda if s["estado"] == "en curso"]
    por_sector = {}
    for s in curso:
        for sec in s["sectores"] or ["sin sector"]:
            por_sector[sec] = por_sector.get(sec, 0) + 1
    return {"en_curso": len(curso), "federal": sum(1 for s in curso if s.get("ambito") != "estatal"),
            "estatal": sum(1 for s in curso if s.get("ambito") == "estatal"), "publicadas": sum(1 for s in agenda if s["estado"] == "publicada"),
            "alta_probabilidad": sum(1 for s in curso if s["probabilidad"] >= 0.7), "por_sector": dict(sorted(por_sector.items(), key=lambda x: -x[1]))}


def nombres_sectores():
    try:
        sec = json.load(open(os.path.join(M.ROOT, "config", "auditorias.json"), encoding="utf-8"))["sectores"]
        return {k: v.get("nombre", k) for k, v in sec.items()}
    except (OSError, ValueError, KeyError):
        return {}


def construir(salida, vivos, ahora=None):
    ahora = ahora or datetime.now(timezone.utc)
    leer = lambda p: json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None
    previa = (leer(os.path.join(salida, "agenda.json")) or {}).get("senales", [])
    cats, claves = M.cargar_catalogo()
    idx = M.indice(cats, claves)
    desde = (ahora - timedelta(days=45 if previa else 180)).strftime("%Y-%m-%d")
    nuevas = list(desde_dof(leer(os.path.join(vivos, "dof.json")), desde, cats, idx)) + list(desde_noticias(leer(os.path.join(vivos, "noticiero.json")), cats, idx))
    por_id = {s["id"]: s for s in previa}
    agregadas = 0
    for s in nuevas:
        if s["id"] not in por_id and s["fuente"].startswith("Monitor"):
            # Mismo tema con otro titular (≥2 palabras significativas en común, mismo ámbito, ≤30 días): se agrupa.
            ps = palabras(s["titulo"])
            for v in por_id.values():
                if (v["fuente"].startswith("Monitor") and v.get("estado") == "en curso" and v.get("ambito") == s["ambito"]
                        and abs((datetime.strptime(v.get("actualizado") or v["detectado"], "%Y-%m-%d") - datetime.strptime(s["detectado"], "%Y-%m-%d")).days) <= 30
                        and len(ps & set().union(*[palabras(n["t"]) for n in v.get("notas", [])] or [set()])) >= 2):
                    s["id"] = v["id"]
                    break
        if s["id"] in por_id:
            v = por_id[s["id"]]
            urls = {x.get("u") for x in v.setdefault("notas", [])}
            if s["url"] not in urls:
                v["notas"] = (v["notas"] + s["notas"])[-8:]
                v["actualizado"] = max(v.get("actualizado") or v["detectado"], s["detectado"])
            # La etapa solo avanza (una nota posterior puede decir que ya se aprobó).
            if ORDEN.index(s["etapa"]) > ORDEN.index(v["etapa"]) and v.get("estado") == "en curso":
                v.update({k: s[k] for k in ("etapa", "etapa_nombre", "probabilidad", "horizonte_meses", "titulo", "url", "medio")})
            for k in ("leyes", "sectores"):
                v[k] = sorted(set(v.get(k) or []) | set(s[k]))[:8]
        else:
            por_id[s["id"]] = s
            agregadas += 1
    agenda = sorted(por_id.values(), key=lambda s: (s.get("actualizado") or s["detectado"], s["probabilidad"]), reverse=True)
    marcar_publicadas(agenda, leer(os.path.join(salida, "bitacora.json")))
    datos = {"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "agregadas_hoy": agregadas, "resumen": resumen(agenda),
             "fuentes": {"DOF (sumario)": "ok" if os.path.exists(os.path.join(vivos, "dof.json")) else "sin datos",
                         "Monitor de noticias": "ok" if os.path.exists(os.path.join(vivos, "noticiero.json")) else "sin datos",
                         "Gaceta Parlamentaria": "omitida: su robots.txt responde 403 (se trata como prohibido)",
                         "SIL (Segob) y CONAMER": "por incorporar: verificar acceso desde GitHub Actions"},
             "nota": "La probabilidad es una estimación por etapa del proceso y origen, no un pronóstico oficial. Confirma siempre en la fuente.",
             "etapas": ETAPAS, "sectores_nombres": nombres_sectores(), "senales": agenda}
    os.makedirs(salida, exist_ok=True)
    with open(os.path.join(salida, "agenda.json"), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    return datos


if __name__ == "__main__":
    d = construir(sys.argv[1] if len(sys.argv) > 1 else "normativa", sys.argv[2] if len(sys.argv) > 2 else "vivos")
    print(f"Agenda regulatoria: {d['resumen']['en_curso']} señales en curso ({d['agregadas_hoy']} nuevas hoy), "
          f"{d['resumen']['alta_probabilidad']} con probabilidad alta, {d['resumen']['publicadas']} ya publicadas en el DOF.")
