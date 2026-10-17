#!/usr/bin/env python3
"""Global Fishing Watch (GFW): barcos que apagan su AIS a propósito y encuentros en alta mar (posibles transbordos).

Fuente: API v3 de Global Fishing Watch (`gateway.api.globalfishingwatch.org/v3/events`), con la llave del secreto
SAUL_PRIVATE_GLOBALFISHINGWATCH (nunca en el código). Uso no comercial con atribución a Global Fishing Watch.
- «Apagados de AIS» (dataset public-global-gaps-events): huecos en la señal AIS que GFW clasifica como apagado
  INTENCIONAL (el barco tenía buena recepción satelital y dejó de transmitir). Se guardan los de 12 h a 30 días.
  Apagar el AIS es una señal de alerta (pesca ilegal, contrabando, evasión de sanciones), NO una prueba.
- «Encuentros» (public-global-encounters-events): dos barcos juntos en alta mar varias horas a baja velocidad. Los de
  barco de pesca con buque de carga refrigerada («transbordo») o los que GFW marca con riesgo potencial son los que
  más interesan para investigar pesca ilegal y contrabando.
- «Merodeo de buques refrigerados» (public-global-loitering-events, tipo CARRIER): un buque de carga refrigerada casi
  quieto lejos de puerto durante horas, que es como esperan a los pesqueros para un transbordo.
- «Pesca aparente en aguas de México» (public-global-fishing-events dentro de la zona económica exclusiva de México,
  región 8429 de Marine Regions): se marcan los barcos de bandera extranjera y los que pescan dentro de áreas
  naturales protegidas donde la pesca está prohibida.
- «Visitas a puertos de México» (public-global-port-visits-events): barcos de pesca, carga refrigerada, apoyo y
  abastecimiento que entraron a puertos mexicanos; se agrupan por puerto.
- «Detecciones de radar sin AIS» (4Wings, public-global-sar-presence, sin coincidencia con AIS) en la zona económica
  de México, 30 días, en celdas de 0.1°: barcos que el satélite Sentinel-1 vio pero que no transmitían su posición.
- Revisión de cada barco de las capas (identidad en registros y «insights» de GFW, un año): si estuvo en listas de
  pesca ilegal (IUU) de organizaciones regionales, cuántas veces pescó en áreas protegidas sin pesca o en zonas sin
  autorización conocida, historial de nombres y banderas, IMO, eslora y dueños según registros públicos. Se guarda en
  caché (vivos/gfw_barcos.json) y se renueva cada 7 días, con un tope de barcos por corrida.
Se guarda solo lo del barco (nombre, MMSI, bandera, tipo, registro), fechas, posiciones y duración.
Ventana: 14 días (radar: 30). Se consulta una vez al día. Salidas: vivos/gfw_*.geojson y vivos/gfw_barcos.json.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_APAGADOS = os.path.join(ROOT, "vivos", "gfw_apagados.geojson")
OUT_ENCUENTROS = os.path.join(ROOT, "vivos", "gfw_encuentros.geojson")
OUT_MERODEO = os.path.join(ROOT, "vivos", "gfw_merodeo.geojson")
OUT_PESCA_MX = os.path.join(ROOT, "vivos", "gfw_pesca_mx.geojson")
OUT_PUERTOS_MX = os.path.join(ROOT, "vivos", "gfw_puertos_mx.geojson")
OUT_RADAR_MX = os.path.join(ROOT, "vivos", "gfw_radar_mx.geojson")
OUT_BARCOS = os.path.join(ROOT, "vivos", "gfw_barcos.json")
GW = "https://gateway.api.globalfishingwatch.org/v3"
ZEE_MEXICO = 8429  # «Mexican Exclusive Economic Zone» en public-eez-areas (consultado el 2026-10-17)
DIAS_RADAR = 30
MAX_REVISIONES = 150  # barcos revisados por corrida (identidad + insights)
DIAS_REVISION = 7
API = "https://gateway.api.globalfishingwatch.org/v3/events"
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
DIAS = 14
POR_PAGINA = 500
MAX_PAGINAS = 12
MAX_GUARDADOS = 1500  # los más recientes; el mapa no necesita más y el archivo queda ligero
TIPO_BARCO = {"fishing": "pesca", "carrier": "carga refrigerada (transbordo)", "cargo": "carga", "tanker": "petrolero/tanquero", "passenger": "pasaje",
              "support": "apoyo", "bunker": "abastecimiento de combustible", "gear": "arte de pesca (boya)", "other": "otro", "seismic_vessel": "sísmico"}


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def viejo(ruta, horas, ahora):
    try:
        gen = json.load(open(ruta, encoding="utf-8")).get("generado_utc", "")
        return ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) >= timedelta(hours=horas)
    except (OSError, ValueError):
        return True


def pedir(token, dataset, desde, hasta, offset):
    q = urllib.parse.urlencode({"datasets[0]": dataset, "start-date": desde, "end-date": hasta, "limit": POR_PAGINA, "offset": offset})
    req = urllib.request.Request(f"{API}?{q}", headers={"Authorization": f"Bearer {token}", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())


def llamar(token, url, cuerpo=None, timeout=90):
    h = {"Authorization": f"Bearer {token}", "User-Agent": UA}
    if cuerpo is not None:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=json.dumps(cuerpo).encode() if cuerpo is not None else None, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def eventos_post(token, cuerpo, llamar=llamar):
    """Eventos con filtros en el cuerpo (región, tipos de barco, confianza), paginados."""
    out, offset = [], 0
    for _ in range(MAX_PAGINAS):
        d = llamar(token, f"{GW}/events?offset={offset}&limit={POR_PAGINA}", cuerpo)
        out += d.get("entries", [])
        offset = d.get("nextOffset")
        if not offset or offset >= (d.get("total") or 0):
            break
        time.sleep(1)
    return out


def eventos(token, dataset, desde, hasta, pedir=pedir):
    out, offset = [], 0
    for _ in range(MAX_PAGINAS):
        d = pedir(token, dataset, desde, hasta, offset)
        out += d.get("entries", [])
        offset = d.get("nextOffset")
        if not offset or offset >= (d.get("total") or 0):
            break
        time.sleep(1)
    return out


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def barco(v):
    v = v or {}
    return {"nombre": (v.get("name") or "").strip(), "mmsi": v.get("ssvid") or "", "bandera": v.get("flag") or "",
            "tipo": TIPO_BARCO.get(v.get("type") or "", v.get("type") or ""), "gfw_id": v.get("id") or ""}


def fecha(t):
    return (t or "")[:19] + "Z" if t else ""


def apagados(entradas, desde_dt):
    """Huecos intencionales de 12 h a 30 días que terminaron dentro de la ventana."""
    feats = []
    for e in entradas:
        g = e.get("gap") or {}
        if ((e.get("vessel") or {}).get("type") or "") == "gear":
            continue  # boyas y redes con transmisor: no son barcos
        horas = num(g.get("durationHours"))
        if not g.get("intentionalDisabling") or horas is None or not 12 <= horas <= 24 * 30:
            continue
        if fecha(e.get("end")) < iso(desde_dt):
            continue
        off, on = g.get("offPosition") or {}, g.get("onPosition") or {}
        lon, lat = num(off.get("lon")), num(off.get("lat"))
        if lon is None or lat is None:
            continue
        props = {"kind": "apagado", **barco(e.get("vessel")), "apagado_utc": fecha(e.get("start")), "encendido_utc": fecha(e.get("end")),
                 "horas": round(horas), "distancia_km": round(num(g.get("distanceKm")) or 0), "vel_implicita_nudos": round(num(g.get("impliedSpeedKnots")) or 0, 1),
                 "lon_encendido": num(on.get("lon")), "lat_encendido": num(on.get("lat"))}
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]}, "properties": props})
    return sorted(feats, key=lambda f: f["properties"]["encendido_utc"], reverse=True)[:MAX_GUARDADOS]


def encuentros(entradas, desde_dt):
    """Encuentros de la ventana; se marcan los de transbordo (pesca ↔ carga refrigerada) y los de riesgo potencial.
    GFW publica un evento por cada barco del par: se deja uno por par."""
    feats, vistos = [], set()
    for e in entradas:
        enc = e.get("encounter") or {}
        if fecha(e.get("end")) < iso(desde_dt):
            continue
        par = (e.get("id") or "").split(".")[0]
        if par in vistos:
            continue
        vistos.add(par)
        p = e.get("position") or {}
        lon, lat = num(p.get("lon")), num(p.get("lat"))
        if lon is None or lat is None:
            continue
        tipo = enc.get("type") or ""
        transbordo = "carrier" in tipo
        if tipo == "fishing-fishing" and not enc.get("potentialRisk"):
            continue  # dos pesqueros juntos suele ser pesca en pareja; se dejan solo si GFW marca riesgo
        horas = None
        try:
            horas = round((datetime.fromisoformat(e["end"].replace("Z", "+00:00")) - datetime.fromisoformat(e["start"].replace("Z", "+00:00"))).total_seconds() / 3600, 1)
        except (KeyError, ValueError, AttributeError):
            pass
        a, b = barco(e.get("vessel")), barco(enc.get("vessel"))
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]}, "properties": {
            "kind": "encuentro", "inicio_utc": fecha(e.get("start")), "fin_utc": fecha(e.get("end")), "horas": horas, "tipo_encuentro": tipo,
            "transbordo": transbordo, "riesgo": bool(enc.get("potentialRisk")), "dist_costa_km": (e.get("distances") or {}).get("startDistanceFromShoreKm"),
            "barco_a": a, "barco_b": b}})
    return sorted(feats, key=lambda f: f["properties"]["fin_utc"], reverse=True)[:MAX_GUARDADOS]


def horas_entre(a, b):
    try:
        return round((datetime.fromisoformat(b.replace("Z", "+00:00")) - datetime.fromisoformat(a.replace("Z", "+00:00"))).total_seconds() / 3600, 1)
    except (TypeError, ValueError, AttributeError):
        return None


def punto(lon, lat, props):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]}, "properties": props}


def merodeo(entradas, desde_dt):
    """Buques de carga refrigerada casi quietos lejos de puerto (posible espera para transbordo), de 2 h a 30 días."""
    feats = []
    for e in entradas:
        lo = e.get("loitering") or {}
        horas = num(lo.get("totalTimeHours"))
        if horas is None or not 2 <= horas <= 24 * 30 or fecha(e.get("end")) < iso(desde_dt):
            continue
        p = e.get("position") or {}
        lon, lat = num(p.get("lon")), num(p.get("lat"))
        if lon is None or lat is None:
            continue
        reg = e.get("regions") or {}
        feats.append(punto(lon, lat, {"kind": "merodeo", **barco(e.get("vessel")), "inicio_utc": fecha(e.get("start")), "fin_utc": fecha(e.get("end")),
            "horas": round(horas), "vel_media_nudos": round(num(lo.get("averageSpeedKnots")) or 0, 2),
            "dist_costa_km": round(num(lo.get("averageDistanceFromShoreKm")) or 0), "alta_mar": bool(reg.get("highSeas")), "zee": (reg.get("eez") or [])[:2]}))
    return sorted(feats, key=lambda f: f["properties"]["fin_utc"], reverse=True)[:MAX_GUARDADOS]


AUTORIZACION = {"authorized": "con autorización pública", "unmatched": "sin autorización pública conocida", "pending_info": "sin información de autorización",
                "partially_matched": "autorización parcial"}


def pesca_mexico(entradas, desde_dt):
    """Pesca aparente dentro de la zona económica de México; marca bandera extranjera y áreas protegidas sin pesca."""
    feats = []
    for e in entradas:
        if fecha(e.get("end")) < iso(desde_dt):
            continue
        p = e.get("position") or {}
        lon, lat = num(p.get("lon")), num(p.get("lat"))
        if lon is None or lat is None:
            continue
        v, fi, reg = e.get("vessel") or {}, e.get("fishing") or {}, e.get("regions") or {}
        bandera = v.get("flag") or ""
        feats.append(punto(lon, lat, {"kind": "pesca", **barco(v), "inicio_utc": fecha(e.get("start")), "fin_utc": fecha(e.get("end")),
            "horas": horas_entre(e.get("start"), e.get("end")), "extranjero": bool(bandera) and bandera != "MEX",
            "anp_sin_pesca": bool(reg.get("mpaNoTake")), "riesgo": bool(fi.get("potentialRisk")),
            "autorizacion": AUTORIZACION.get(fi.get("vesselPublicAuthorizationStatus") or "", fi.get("vesselPublicAuthorizationStatus") or "")}))
    return sorted(feats, key=lambda f: f["properties"]["fin_utc"], reverse=True)[:MAX_GUARDADOS]


def puertos_mexico(entradas, desde_dt, max_visitas=25):
    """Visitas a puertos de México agrupadas por puerto (las que terminaron en la ventana y duraron menos de 60 días)."""
    puertos = {}
    for e in entradas:
        pv = e.get("port_visit") or {}
        a = pv.get("startAnchorage") or {}
        h = horas_entre(e.get("start"), e.get("end"))
        if not a.get("id") or fecha(e.get("end")) < iso(desde_dt) or h is None or h > 24 * 60:
            continue
        lon, lat = num(a.get("lon")), num(a.get("lat"))
        if lon is None or lat is None:
            continue
        pu = puertos.setdefault(a["id"], {"nombre": (a.get("name") or a["id"]).title(), "lon": lon, "lat": lat, "visitas": []})
        b = barco(e.get("vessel"))
        pu["visitas"].append({**{k: b[k] for k in ("nombre", "mmsi", "bandera", "tipo", "gfw_id")}, "llegada_utc": fecha(e.get("start")), "salida_utc": fecha(e.get("end")), "horas": h})
    feats = []
    for pid, pu in puertos.items():
        vis = sorted(pu["visitas"], key=lambda x: x["salida_utc"], reverse=True)
        ext = [x for x in vis if x["bandera"] and x["bandera"] != "MEX"]
        feats.append(punto(pu["lon"], pu["lat"], {"kind": "puerto", "id": pid, "nombre": pu["nombre"], "visitas_total": len(vis), "extranjeros": len(ext),
            "banderas": sorted({x["bandera"] for x in ext}), "visitas": vis[:max_visitas]}))
    return sorted(feats, key=lambda f: -f["properties"]["visitas_total"])


def radar_mexico(reporte):
    """Celdas de 0.1° con detecciones de radar (Sentinel-1) sin coincidencia con AIS."""
    feats = []
    for ent in reporte.get("entries") or []:
        for celdas in ent.values():
            for c in celdas or []:
                lon, lat, n = num(c.get("lon")), num(c.get("lat")), num(c.get("detections"))
                if lon is None or lat is None or not n:
                    continue
                feats.append(punto(lon, lat, {"kind": "radar", "detecciones": int(n), "primera_utc": fecha(c.get("entryTimestamp")), "ultima_utc": fecha(c.get("exitTimestamp"))}))
    return sorted(feats, key=lambda f: -f["properties"]["detecciones"])[:MAX_GUARDADOS]


# ---------------------------------------------------------------- revisión de barcos (identidad + insights)

def resumen_identidad(v):
    """Respuesta de /vessels → nombres, banderas con fechas, IMO, eslora, dueños según registros e IUU del registro."""
    propias = sorted(v.get("selfReportedInfo") or [], key=lambda x: x.get("transmissionDateFrom") or "")
    reg = v.get("registryInfo") or []
    nombres = []
    for x in propias + reg:
        n = " ".join((x.get("shipname") or "").split())
        if n and n not in nombres:
            nombres.append(n)
    banderas = []
    for x in propias:
        f = x.get("flag") or ""
        if f and (not banderas or banderas[-1]["bandera"] != f):
            banderas.append({"bandera": f, "desde": (x.get("transmissionDateFrom") or "")[:10], "hasta": (x.get("transmissionDateTo") or "")[:10]})
        elif f:
            banderas[-1]["hasta"] = (x.get("transmissionDateTo") or "")[:10]
    iuu_registro = any(((ex.get("iuuStatus") or {}).get("value")) for r in reg for ex in (r.get("extraFields") or []))
    r0 = next((r for r in reg if r.get("latestVesselInfo")), reg[0] if reg else {})
    duenos = [{"nombre": " ".join((o.get("name") or "").split()), "bandera": o.get("flag") or "", "desde": (o.get("dateFrom") or "")[:10], "hasta": (o.get("dateTo") or "")[:10]}
              for o in (v.get("registryOwners") or []) if o.get("name")]
    return {"nombres": nombres[:6], "banderas": banderas[-6:], "imo": r0.get("imo") or next((x.get("imo") for x in propias if x.get("imo")), "") or "",
            "indicativo": r0.get("callsign") or "", "eslora_m": r0.get("lengthM"), "tonelaje_gt": r0.get("tonnageGt"), "duenos": duenos[:4], "iuu_registro": iuu_registro}


def resumen_insights(d):
    pesca = (d.get("apparentFishing") or {}).get("periodSelectedCounters") or {}
    iuu = ((d.get("vesselIdentity") or {}).get("iuuVesselList") or {})
    gap = ((d.get("gap") or {}).get("periodSelectedCounters") or {})
    return {"iuu_veces": iuu.get("totalTimesListed") or 0, "iuu_en_el_anio": iuu.get("totalTimesListedInThePeriod") or 0,
            "pesca_eventos": pesca.get("events") or 0, "pesca_anp_sin_pesca": pesca.get("eventsInNoTakeMPAs") or 0,
            "pesca_sin_autorizacion": pesca.get("eventsInRFMOWithoutKnownAuthorization") or 0, "apagados_anio": gap.get("eventsGapOff") or 0}


def ids_a_revisar(capas):
    """Ids de GFW de las capas, en orden de prioridad (encuentros y merodeo, pesca extranjera, apagados largos)."""
    orden = []
    def add(b):
        if b and b.get("gfw_id") and b["gfw_id"] not in orden:
            orden.append(b["gfw_id"])
    for f in capas.get("encuentros", []):
        add(f["properties"].get("barco_a")); add(f["properties"].get("barco_b"))
    for f in capas.get("merodeo", []):
        add(f["properties"])
    for f in capas.get("pesca", []):
        if f["properties"].get("extranjero") or f["properties"].get("anp_sin_pesca"):
            add(f["properties"])
    for f in sorted(capas.get("apagados", []), key=lambda f: -f["properties"]["horas"]):
        if f["properties"]["horas"] >= 72:
            add(f["properties"])
    return orden


def revisar(token, ids, cache, ahora, llamar=llamar, maximo=MAX_REVISIONES):
    """Actualiza `cache` (id → revisión) para los ids sin revisar o con más de DIAS_REVISION días. Devuelve cuántos revisó."""
    limite = iso(ahora - timedelta(days=DIAS_REVISION))
    pendientes = [i for i in ids if (cache.get(i) or {}).get("revisado_utc", "") < limite][:maximo]
    desde, hasta = (ahora - timedelta(days=365)).strftime("%Y-%m-%d"), ahora.strftime("%Y-%m-%d")
    for k in range(0, len(pendientes), 20):
        lote = pendientes[k:k + 20]
        q = urllib.parse.urlencode([("datasets[0]", "public-global-vessel-identity:latest")] + [(f"ids[{j}]", v) for j, v in enumerate(lote)])
        try:
            for v in llamar(token, f"{GW}/vessels?{q}").get("entries") or []:
                vid = next((x.get("id") for x in (v.get("selfReportedInfo") or []) if x.get("id") in lote), None)
                for x in (v.get("combinedSourcesInfo") or []):
                    vid = vid or (x.get("vesselId") if x.get("vesselId") in lote else None)
                if vid:
                    cache[vid] = {**(cache.get(vid) or {}), **resumen_identidad(v)}
        except Exception as e:  # noqa: BLE001
            print(f"gfw identidad: {e}")
        time.sleep(0.5)
    for vid in pendientes:
        cuerpo = {"includes": ["FISHING", "GAP", "VESSEL-IDENTITY-IUU-VESSEL-LIST"], "startDate": desde, "endDate": hasta,
                  "vessels": [{"datasetId": "public-global-vessel-identity:latest", "vesselId": vid}]}
        try:
            cache[vid] = {**(cache.get(vid) or {}), **resumen_insights(llamar(token, f"{GW}/insights/vessels", cuerpo)), "revisado_utc": iso(ahora)}
        except Exception as e:  # noqa: BLE001
            print(f"gfw insights {vid}: {e}")
        time.sleep(0.3)
    return len(pendientes)


def alerta(rev):
    """Texto corto de alerta para la ficha (o vacío)."""
    if not rev:
        return ""
    partes = []
    if rev.get("iuu_veces") or rev.get("iuu_registro"):
        partes.append("estuvo en una lista de pesca ilegal (IUU)")
    if rev.get("pesca_anp_sin_pesca"):
        partes.append(f"{rev['pesca_anp_sin_pesca']} eventos de pesca en áreas protegidas sin pesca")
    if rev.get("pesca_sin_autorizacion"):
        partes.append(f"{rev['pesca_sin_autorizacion']} eventos de pesca sin autorización conocida")
    if len(rev.get("banderas") or []) >= 3:
        partes.append(f"{len(rev['banderas'])} banderas distintas")
    return "; ".join(partes)


def adjuntar(capas, cache):
    """Pone la revisión dentro de cada barco de las capas (para que la ficha no tenga que buscarla)."""
    def poner(b):
        rev = cache.get((b or {}).get("gfw_id") or "")
        if rev:
            b["revision"] = {k: v for k, v in rev.items() if k != "revisado_utc"}
            b["alerta"] = alerta(rev)
    for nombre, feats in capas.items():
        for f in feats:
            p = f["properties"]
            if nombre == "encuentros":
                poner(p.get("barco_a")); poner(p.get("barco_b"))
                p["alerta"] = "; ".join(x for x in ((p.get("barco_a") or {}).get("alerta"), (p.get("barco_b") or {}).get("alerta")) if x)
            elif nombre == "puertos":
                for v in p.get("visitas", []):
                    poner(v)
                p["con_alerta"] = sum(1 for v in p.get("visitas", []) if v.get("alerta"))
            else:
                poner(p)


def guardar(ruta, feats, ahora, nota):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": iso(ahora), "fuente": "Global Fishing Watch (API v3), uso no comercial", "nota": nota,
               "features": feats}, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


def main():
    token = os.environ.get("GFW_TOKEN", "").strip()
    if not token:
        print("gfw: sin llave (secreto SAUL_PRIVATE_GLOBALFISHINGWATCH); se omite")
        return 0
    ahora = datetime.now(timezone.utc)
    salidas = {"apagados": OUT_APAGADOS, "encuentros": OUT_ENCUENTROS, "merodeo": OUT_MERODEO, "pesca": OUT_PESCA_MX, "puertos": OUT_PUERTOS_MX, "radar": OUT_RADAR_MX}
    if not any(viejo(r, 24, ahora) for r in salidas.values()):
        print("gfw: datos recientes")
        return 0
    desde_dt = ahora - timedelta(days=DIAS)
    desde, hasta = desde_dt.strftime("%Y-%m-%d"), ahora.strftime("%Y-%m-%d")
    zee = {"dataset": "public-eez-areas", "id": ZEE_MEXICO}
    pasos = {
        "apagados": (lambda: apagados(eventos(token, "public-global-gaps-events:latest", desde, hasta), desde_dt),
                     "Apagados intencionales de AIS de 12 h a 30 días (señal de alerta, no prueba)"),
        "encuentros": (lambda: encuentros(eventos(token, "public-global-encounters-events:latest", desde, hasta), desde_dt),
                       "Encuentros entre barcos en el mar; transbordo = pesca con carga refrigerada"),
        "merodeo": (lambda: merodeo(eventos_post(token, {"datasets": ["public-global-loitering-events:latest"], "startDate": desde, "endDate": hasta,
                                                         "vesselTypes": ["CARRIER"]}), desde_dt),
                    "Buques de carga refrigerada casi quietos lejos de puerto (posible espera para transbordo)"),
        "pesca": (lambda: pesca_mexico(eventos_post(token, {"datasets": ["public-global-fishing-events:latest"], "startDate": desde, "endDate": hasta,
                                                            "region": zee}), desde_dt),
                  "Pesca aparente en la zona económica exclusiva de México"),
        "puertos": (lambda: puertos_mexico(eventos_post(token, {"datasets": ["public-global-port-visits-events:latest"], "startDate": desde, "endDate": hasta,
                                                                "region": zee, "confidences": ["3", "4"],
                                                                "vesselTypes": ["FISHING", "CARRIER", "SUPPORT", "BUNKER"]}), desde_dt),
                    "Visitas de barcos de pesca, carga refrigerada, apoyo y abastecimiento a puertos de México"),
        "radar": (lambda: radar_mexico(llamar(token, f"{GW}/4wings/report?spatial-resolution=LOW&temporal-resolution=ENTIRE"
                                              f"&datasets[0]=public-global-sar-presence:latest&date-range={(ahora - timedelta(days=DIAS_RADAR)).strftime('%Y-%m-%d')},{hasta}"
                                              "&format=JSON&filters[0]=matched='false'", {"region": zee}, timeout=180)),
                  "Detecciones de radar Sentinel-1 sin coincidencia con AIS en la zona económica de México (30 días, celdas de 0.1°)"),
    }
    capas, notas = {}, {}
    for nombre, (fn, nota) in pasos.items():
        try:
            capas[nombre], notas[nombre] = fn(), nota
            print(f"gfw {nombre}: {len(capas[nombre])} elementos")
        except urllib.error.HTTPError as e:
            print(f"gfw {nombre}: HTTP {e.code} {e.read()[:200]!r}; se conserva el anterior")
        except Exception as e:  # noqa: BLE001
            print(f"gfw {nombre}: error {e}; se conserva el anterior")
    try:
        cache = json.load(open(OUT_BARCOS, encoding="utf-8")).get("barcos", {})
    except (OSError, ValueError):
        cache = {}
    ids = ids_a_revisar(capas)
    n = revisar(token, ids, cache, ahora)
    vigentes = set(ids)
    cache = {k: v for k, v in cache.items() if k in vigentes}
    adjuntar(capas, cache)
    print(f"gfw revisión: {n} barcos revisados, {len(cache)} en caché, {sum(1 for v in cache.values() if alerta(v))} con alerta")
    for nombre, feats in capas.items():
        if feats or not os.path.exists(salidas[nombre]):
            guardar(salidas[nombre], feats, ahora, notas[nombre])
    json.dump({"generado_utc": iso(ahora), "barcos": cache}, open(OUT_BARCOS, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
