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
Se guarda solo lo del barco (nombre, MMSI, bandera, tipo), fechas, posiciones y duración; nada de personas.
Ventana: 14 días. Se consulta una vez al día. Salidas: vivos/gfw_apagados.geojson y vivos/gfw_encuentros.geojson.
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
            "tipo": TIPO_BARCO.get(v.get("type") or "", v.get("type") or "")}


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
    if not viejo(OUT_APAGADOS, 24, ahora) and not viejo(OUT_ENCUENTROS, 24, ahora):
        print("gfw: datos recientes")
        return 0
    desde_dt = ahora - timedelta(days=DIAS)
    desde, hasta = desde_dt.strftime("%Y-%m-%d"), ahora.strftime("%Y-%m-%d")
    for dataset, ruta, fn, nota in [
        ("public-global-gaps-events:latest", OUT_APAGADOS, apagados, "Apagados intencionales de AIS de 12 h a 30 días (señal de alerta, no prueba)"),
        ("public-global-encounters-events:latest", OUT_ENCUENTROS, encuentros, "Encuentros entre barcos en el mar; transbordo = pesca con carga refrigerada")]:
        try:
            crudos = eventos(token, dataset, desde, hasta)
            feats = fn(crudos, desde_dt)
            if feats or not os.path.exists(ruta):
                guardar(ruta, feats, ahora, nota)
            print(f"gfw {dataset}: {len(crudos)} eventos leídos, {len(feats)} guardados")
        except urllib.error.HTTPError as e:
            print(f"gfw {dataset}: HTTP {e.code} {e.read()[:200]!r}; se conserva el anterior")
        except Exception as e:  # noqa: BLE001
            print(f"gfw {dataset}: error {e}; se conserva el anterior")
    return 0


if __name__ == "__main__":
    sys.exit(main())
