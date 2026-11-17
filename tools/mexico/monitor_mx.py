#!/usr/bin/env python3
"""Monitor México: movimientos que reporta Banxico (SIE) y alertas cuando un dato se sale de lo normal.

Lee las series de config/monitor_mx.json desde la API del Sistema de Información Económica de Banxico (secreto
BANXICO_API_KEY, encabezado Bmx-Token; pide de 20 en 20 con pausa):
  * Remesas por entidad federativa (trimestral, millones de USD).
  * Remesas por país de origen y envíos de México por país de destino (trimestral).
  * Indicadores: tipo de cambio, tasa objetivo, inflación, reserva, remesas del mes, balanza comercial y petrolera
    (incluidas exportaciones petroleras a países distintos de EUA), turismo, inversión directa y deuda externa.
Para cada serie compara el último dato con el promedio de los 12 periodos anteriores (4 si es trimestral) y marca:
  «salto» (5 veces o más), «desplome» (20 % o menos del promedio), «a cero» (antes había y ahora es 0) y
  «reaparece» (venía en cero y vuelve). Banxico advierte que las cifras recientes son preliminares.
Salida: vivos/monitor_mx.json (una vez al día como máximo; lo llama «Datos en movimiento»). Si falla, se conserva lo anterior.
"""
import json
import os
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CONFIG = os.path.join(ROOT, "config", "monitor_mx.json")
OUT = os.path.join(ROOT, "vivos", "monitor_mx.json")
API = "https://www.banxico.org.mx/SieAPIRest/service/v1/series/{ids}/datos/{ini}/{fin}"
AGENTE = "DOMINUS-OSINT monitor (github.com/zoetzerlpetrov-gif/Geopolitica)"
LOTE = 20
PAUSA = 1.0
CADA_H = 20
ANIOS = 4
SALTO, DESPLOME = 5.0, 0.2


def fecha_iso(f):
    """«dd/mm/aaaa» de Banxico → «aaaa-mm-dd»."""
    d, m, a = f.split("/")
    return f"{a}-{m}-{d}"


def leer(js):
    """Respuesta del SIE → {id: [(fecha, valor), …]} sin «N/E» ni vacíos."""
    out = {}
    for s in (js or {}).get("bmx", {}).get("series") or []:
        puntos = []
        for d in s.get("datos") or []:
            try:
                puntos.append((fecha_iso(d["fecha"]), float(str(d["dato"]).replace(",", ""))))
            except (ValueError, KeyError):
                continue
        out[s.get("idSerie")] = sorted(puntos)
    return out


def periodo(fecha, trimestral):
    a, m = fecha[:4], int(fecha[5:7])
    return f"{a}-T{(m - 1) // 3 + 1}" if trimestral else f"{a}-{m:02d}"


def ultimo_por_periodo(puntos, trimestral=False, diaria=False, suma=False):
    """Diarias: último dato de cada mes, o la suma del mes si es una variación diaria (reserva);
    mensuales y trimestrales tal cual."""
    if not diaria:
        return [(periodo(f, trimestral), v) for f, v in puntos]
    meses = {}
    for f, v in puntos:
        meses[f[:7]] = round(meses.get(f[:7], 0) + v, 3) if suma else v
    return sorted(meses.items())


def alerta(serie, n_prev):
    """[(periodo, valor)] → dict con último, promedio previo, razón y tipo de alerta (o None)."""
    if not serie:
        return None
    per, ult = serie[-1]
    previos = [v for _, v in serie[-1 - n_prev:-1]]
    prom = sum(previos) / len(previos) if previos else None
    anio = next((v for p, v in serie if p == (f"{int(per[:4]) - 1}{per[4:]}")), None)
    tipo = None
    if prom is not None and len(previos) >= max(3, n_prev // 2):
        if prom > 0 and ult >= SALTO * prom:
            tipo = "salto"
        elif prom > 0 and ult == 0:
            tipo = "a cero"
        elif prom > 0 and 0 <= ult <= DESPLOME * prom:
            tipo = "desplome"
        elif prom == 0 and ult > 0 and all(v == 0 for v in previos[-3:]):
            tipo = "reaparece"
    return {"periodo": per, "valor": ult, "promedio_previo": round(prom, 3) if prom is not None else None,
            "razon": round(ult / prom, 1) if prom else None, "mismo_periodo_anio_anterior": anio, "alerta": tipo}


def descargar(ids, token, ini, fin, pedir=None):
    datos, errores = {}, []
    for i in range(0, len(ids), LOTE):
        lote = ids[i:i + LOTE]
        url = API.format(ids=",".join(lote), ini=ini, fin=fin)
        try:
            if pedir:
                js = pedir(url)
            else:
                req = urllib.request.Request(url, headers={"User-Agent": AGENTE, "Bmx-Token": token, "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=90) as r:
                    js = json.loads(r.read())
            datos.update(leer(js))
        except Exception as e:  # noqa: BLE001  un lote con error no detiene a los demás
            errores.append(f"lote {lote[0]}…: {type(e).__name__}")
        if not pedir:
            time.sleep(PAUSA)
    return datos, errores


def construir(cfg, datos):
    def serie(s, trimestral):
        return ultimo_por_periodo(datos.get(s["id"]) or [], trimestral=trimestral, diaria=s.get("periodo") == "Diaria", suma=s.get("agregar") == "suma")

    indicadores, alertas = [], []
    for s in cfg.get("indicadores", []):
        tri = s.get("periodo") == "Trimestral"
        ser = [(p, round(v * s.get("escala", 1), 3)) for p, v in serie(s, tri)]
        a = alerta(ser, 4 if tri else 12)
        indicadores.append({**{k: s[k] for k in ("id", "nombre", "unidad", "grupo", "periodo")}, "serie": ser[-24:], **(a or {})})
        if a and a["alerta"] and s.get("periodo") != "Diaria":
            alertas.append({"que": s["nombre"], "donde": "México", "unidad": s["unidad"], **a})

    def capa(lista, etiqueta, unidad="millones de USD"):
        fs = []
        for s in lista:
            ser = serie({"id": s["id"]}, True)
            if not ser or not s.get("coord"):
                continue
            a = alerta(ser, 4)
            fs.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": s["coord"]},
                       "properties": {"id": s["id"], "nombre": s["nombre"], "iso3": s.get("iso3", ""), "serie": ser[-12:], **a}})
            if a["alerta"] and (a["promedio_previo"] or 0) >= 1 or (a["alerta"] == "reaparece" and a["valor"] >= 1):
                alertas.append({"que": etiqueta, "donde": s["nombre"], "unidad": unidad, **a})
        return {"type": "FeatureCollection", "features": fs}

    capas = {"remesas_estado": capa(cfg.get("remesas_estado", []), "Remesas recibidas"),
             "remesas_pais_origen": capa(cfg.get("remesas_pais_origen", []), "Remesas recibidas desde"),
             "remesas_pais_destino": capa(cfg.get("remesas_pais_destino", []), "Remesas enviadas desde México hacia")}
    orden = {"salto": 0, "a cero": 1, "reaparece": 2, "desplome": 3}
    alertas.sort(key=lambda x: (orden.get(x["alerta"], 9), -(x["razon"] or 0)))
    return indicadores, capas, alertas


def main(ahora=None, pedir=None):
    ahora = ahora or datetime.now(timezone.utc)
    try:
        previo = json.load(open(OUT, encoding="utf-8"))
        if ahora - datetime.strptime(previo["generado_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=CADA_H):
            print("monitor México: aún vigente")
            return 0
    except (OSError, ValueError, KeyError):
        pass
    token = os.environ.get("BANXICO_API_KEY", "")
    if not token and not pedir:
        print("monitor México: falta el secreto BANXICO_API_KEY")
        return 0
    cfg = json.load(open(CONFIG, encoding="utf-8"))
    ids = [s["id"] for k in ("indicadores", "remesas_estado", "remesas_pais_origen", "remesas_pais_destino") for s in cfg.get(k, [])]
    hoy = ahora.date()
    datos, errores = descargar(sorted(set(ids)), token, date(hoy.year - ANIOS, 1, 1).isoformat(), hoy.isoformat(), pedir)
    if not datos:
        print("monitor México: sin datos; se conserva lo anterior. " + "; ".join(errores[:3]))
        return 0
    indicadores, capas, alertas = construir(cfg, datos)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": "Banco de México, Sistema de Información Económica (SIE)",
                   "nota": "Cifras preliminares sujetas a revisión. Alertas: último dato contra el promedio de los 12 meses (o 4 trimestres) anteriores.",
                   "indicadores": indicadores, "capas": capas, "alertas": alertas, "series_recibidas": len(datos), "series_pedidas": len(set(ids)),
                   "errores": errores}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"monitor México: {len(datos)} de {len(set(ids))} series; {len(alertas)} alertas" + (f"; errores: {len(errores)}" if errores else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
