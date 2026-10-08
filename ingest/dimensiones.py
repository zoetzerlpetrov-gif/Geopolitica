#!/usr/bin/env python3
"""Dimensiones transversales de eventos: nivel_alerta, delta, índice de inestabilidad y correlación.

Todas son reglas fijas y transparentes (sin IA). Las fórmulas están documentadas en docs/INDICADORES.md
y probadas en tests/test_dimensiones.py. El Índice de Inestabilidad es un INDICADOR PROPIO de este
proyecto: no es comparable con índices académicos ni de agencias de riesgo.
"""
import math
from datetime import datetime, timezone

# ---------------------------------------------------------------- nivel_alerta
AREAS_CRITICAS = {"seguridad", "salud_nrbq", "infraestructura"}


def nivel_alerta(ev, delta=None):
    """FLASH | PRIORIDAD | RUTINA.

    FLASH      severidad 5
               o severidad 4 en un área crítica (seguridad, salud NRBQ, infraestructura)
                 confirmada por 3 o más fuentes.
    PRIORIDAD  severidad 3 o más
               o severidad 2 con impacto para México
               o el evento escaló respecto de la corrida anterior (delta = "escala").
    RUTINA     todo lo demás.
    """
    sev = ev["severidad"]
    fuentes = len(ev.get("fuentes", []))
    if sev >= 5 or (sev == 4 and ev["area_principal"] in AREAS_CRITICAS and fuentes >= 3):
        return "FLASH"
    if sev >= 3 or (sev >= 2 and ev.get("impacto_mexico")) or (delta or ev.get("delta")) == "escala":
        return "PRIORIDAD"
    return "RUTINA"


# ---------------------------------------------------------------- delta
def delta(ev, anterior):
    """nuevo | escala | desescala | sin_cambio, comparando con el mismo id en la corrida anterior.

    escala      sube la severidad, o se suman 2 o más fuentes nuevas (más cobertura).
    desescala   baja la severidad.
    """
    if anterior is None:
        return "nuevo"
    if ev["severidad"] > anterior["severidad"]:
        return "escala"
    if ev["severidad"] < anterior["severidad"]:
        return "desescala"
    if len(ev.get("fuentes", [])) - len(anterior.get("fuentes", [])) >= 2:
        return "escala"
    return "sin_cambio"


# ---------------------------------------------------------------- índice de inestabilidad
PESO_AREA = {
    "seguridad": 1.0, "identidad": 0.6, "instituciones": 0.6, "salud_nrbq": 0.5, "infraestructura": 0.5,
    "demografia": 0.4, "geoeconomia": 0.4, "energia": 0.3, "clima": 0.3, "tecnologia": 0.3,
    "geografia": 0.3, "regional": 0.2, "riesgo": 0.2,
}
VIDA_MEDIA_DIAS = 7.0     # un evento de hace 7 días pesa la mitad que uno de hoy
VENTANA_DIAS = 30         # solo cuentan los últimos 30 días
K_SATURACION = 25.0       # con A = 25 el índice vale 63; con A = 75, 95


def _fecha(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def indice_inestabilidad(eventos, ahora=None):
    """Índice 0–100 por país:
        A = Σ  severidad² × peso_área × 0.5^(edad_días / 7)     (eventos de los últimos 30 días)
        índice = 100 × (1 − e^(−A / 25))
    Devuelve {iso3: {"indice": int, "eventos": n, "A": float}}."""
    ahora = ahora or datetime.now(timezone.utc)
    acum = {}
    for ev in eventos:
        iso = ev.get("pais_iso3")
        if not iso:
            continue
        edad = (ahora - _fecha(ev["fecha_utc"])).total_seconds() / 86400
        if edad < 0 or edad > VENTANA_DIAS:
            continue
        a = ev["severidad"] ** 2 * PESO_AREA.get(ev["area_principal"], 0.3) * 0.5 ** (edad / VIDA_MEDIA_DIAS)
        d = acum.setdefault(iso, {"A": 0.0, "eventos": 0})
        d["A"] += a
        d["eventos"] += 1
    return {iso: {"indice": round(100 * (1 - math.exp(-d["A"] / K_SATURACION))), "eventos": d["eventos"], "A": round(d["A"], 2)}
            for iso, d in sorted(acum.items())}


# ---------------------------------------------------------------- correlación entre áreas
RADIO_KM = 300
VENTANA_HORAS = 72
MAX_CORRELACIONES = 10


def distancia_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def correlacionar(eventos, radio_km=RADIO_KM, ventana_h=VENTANA_HORAS):
    """Une eventos de ÁREAS PRINCIPALES DISTINTAS que ocurren a menos de radio_km y dentro de ventana_h.
    Devuelve {id: [ids correlacionados]} (máx. 10 por evento, los más cercanos primero).
    Usa una rejilla de 3°×3° para no comparar todos contra todos."""
    celda = 3.0
    rejilla = {}
    con_pos = [e for e in eventos if e.get("lat") is not None and e.get("lon") is not None]
    for e in con_pos:
        rejilla.setdefault((int(e["lat"] // celda), int(e["lon"] // celda)), []).append(e)
    out = {}
    for e in con_pos:
        ci, cj = int(e["lat"] // celda), int(e["lon"] // celda)
        t = _fecha(e["fecha_utc"])
        cand = []
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for o in rejilla.get((ci + di, cj + dj), []):
                    if o["id"] == e["id"] or o["area_principal"] == e["area_principal"]:
                        continue
                    if abs((_fecha(o["fecha_utc"]) - t).total_seconds()) > ventana_h * 3600:
                        continue
                    d = distancia_km(e["lat"], e["lon"], o["lat"], o["lon"])
                    if d <= radio_km:
                        cand.append((d, o["id"]))
        if cand:
            out[e["id"]] = [i for _, i in sorted(cand)[:MAX_CORRELACIONES]]
    return out


def enriquecer(eventos, anteriores=None, estado_dato="retrasado"):
    """Agrega delta, nivel_alerta, estado_dato y correlaciones a cada evento (modifica en sitio)."""
    previos = {e["id"]: e for e in (anteriores or [])}
    corr = correlacionar(eventos)
    for ev in eventos:
        d = delta(ev, previos.get(ev["id"]))
        ev["delta"] = d
        ev["nivel_alerta"] = nivel_alerta(ev, d)
        ev.setdefault("estado_dato", estado_dato)
        ev["correlaciones"] = corr.get(ev["id"], [])
        ev.setdefault("relaciones", {"entidades": [], "zonas": [], "personas": []})
    return eventos
