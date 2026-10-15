#!/usr/bin/env python3
"""Apagones y cortes de agua en el mundo, a partir de noticias (GDELT GKG 2.1).

Por qué así: no existe una fuente abierta y mundial de cortes de luz o de agua. Las que hay son por país o por empresa
(p. ej. poweroutage.us, de pago y con su API bloqueada a robots; los avisos de CFE o de los organismos de agua se
publican como comunicados). GDELT lee medios de todo el mundo cada 15 min; aquí se buscan titulares que informen de un
apagón o de un corte de agua y se ubican por el lugar que nombra el titular (igual que los tornados).

Se reusan los mismos archivos GKG que acaba de descargar tools/clima/tornados.py (caché en la carpeta temporal de la
corrida), así no se baja nada dos veces. Se acumulan 7 días en vivos/cortes.geojson.

Qué se guarda: título, enlace, medio, fecha, lugar y coordenadas; nunca el texto del artículo. Son SEÑALES por verificar:
la empresa eléctrica o el organismo de agua confirman la zona y la duración.
"""
import json
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
import tornados as T  # noqa: E402

OUT = os.path.join(T.ROOT, "vivos", "cortes.geojson")
DIAS = 7

LUZ = re.compile(r"apag[oó]n|apag[aã]o|corte[s]? de (luz|energ[ií]a|electricidad|corriente)|sin (luz|electricidad|energ[ií]a el[eé]ctrica)|"
                 r"falla[s]? (el[eé]ctrica|en el suministro el[eé]ctrico)|power (outage|cut|failure)|outages? (hit|leave|affect)|without (power|electricity)|"
                 r"\bblackout|black-out|load[- ]shedding|grid (collapse|failure)|coupures? de courant|panne (d'électricité|de courant)|stromausfall|"
                 r"interruzione (di corrente|elettrica)|queda de energia|falta de energia|\bloadshedding", re.I)
AGUA = re.compile(r"(corte|cortes|falta|suspensi[oó]n|desabasto|escasez|racionamiento|tandeo)( de| del)? (suministro de )?agua|sin agua\b|"
                  r"water (outage|cut|shortage|supply (cut|disruption|interrupted|suspended))|without (running )?water|boil[- ]water|"
                  r"coupures? d'eau|wasserausfall|falta d'?[aá]gua|interruzione idrica|crisi idrica", re.I)
# Usos que no son cortes de servicio: apagón «informativo», cortinas, fechas sin vuelos, videojuegos, etc.
NO_ES = re.compile(r"apag[oó]n (anal[oó]gico|informativo|digital|de internet|de las redes)|media blackout|news blackout|blackout (curtain|date|period|poetry|"
                   r"tuesday|drunk|game)|call of duty|black ops|blackout(s)? (of|on) (coverage|games?)|\bfilm\b|\bpel[ií]cula\b|tv blackout|"
                   r"blackout rule|internet blackout|blackout de internet|smartphone|iphone", re.I)
PROGRAMADO = re.compile(r"programad|planned|scheduled|mantenimiento|maintenance|aviso de corte|habr[aá] corte|will be (cut|without)|tandeo", re.I)
GRANDE = re.compile(r"millones|millions?\b|miles de|thousands|hundreds of thousands|cientos de miles|nationwide|todo el pa[ií]s|nacional|masivo|massive|"
                    r"widespread|generalizado|\b\d{2,3}(,\d{3})+\b|\b\d+(\.\d+)? ?(mil|k)\b", re.I)


def tipo_de_titulo(titulo):
    luz, agua = bool(LUZ.search(titulo)), bool(AGUA.search(titulo))
    if not (luz or agua) or NO_ES.search(titulo):
        return None
    return "LUZ Y AGUA" if luz and agua else "LUZ" if luz else "AGUA"


def fila_a_feature(f, flujo, nom=None):
    """Fila del GKG → feature o None (mismas reglas de ubicación que los tornados)."""
    if len(f) < 27:
        return None
    titulo = T.titulo_de(f[26])
    kind = tipo_de_titulo(titulo) if titulo else None
    if not kind:
        return None
    cuerpo = re.split(r"\s[|–—-]\s(?=[^|–—-]*$)", titulo)[0] if re.search(r"\s[|–—-]\s", titulo) else titulo
    t = T.norm(cuerpo)
    locs = [l for l in T.lugares(f[10]) if l[0] != "1" and T.en_titulo(l[1].split(",")[0], t)]
    iso = ""
    if locs:
        tipo, nombre, _, lat, lon, _ = T.elegir_lugar(locs, None, cuerpo)
    else:
        u = (nom or T.nomenclator()).ubicar(cuerpo)
        if not u:
            return None
        nombre, lat, lon, prec, iso = u
        tipo = {"ciudad": "4", "estado": "2", "país": "1"}[prec]
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    try:
        fecha = datetime.strptime(f[1], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return None
    url = f[4] if f[4].startswith("http") else ""
    if not url:
        return None
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3)]},
            "properties": {"title": titulo[:220], "url": url, "source": f[3], "date": fecha, "kind": kind,
                           "severe": bool(GRANDE.search(titulo)), "programado": bool(PROGRAMADO.search(titulo)),
                           "state": nombre, "precision": {"1": "país", "2": "estado", "5": "estado"}.get(tipo, "ciudad"), "pais_iso3": iso,
                           "via": f"GDELT GKG ({'nota traducida al inglés por GDELT' if flujo == 'traducido' else 'nota en inglés'}); lugar nombrado en el titular"}}


def tipo_grupo(ns):
    tipos = {n["properties"]["kind"] for n in ns}
    return "LUZ Y AGUA" if "LUZ Y AGUA" in tipos or {"LUZ", "AGUA"} <= tipos else tipos.pop()


def main(archivos=4):
    previos, relleno = [], False
    if os.path.exists(OUT):
        d = json.load(open(OUT, encoding="utf-8"))
        previos, relleno = d.get("notas", []), d.get("relleno_12h", False)
    if not relleno:
        archivos = max(archivos, 48)  # una sola vez: 12 h hacia atrás
    nuevos, errores = [], []
    for flujo, url in T.FLUJOS.items():
        try:
            for u in T.archivos_gkg(url, archivos):
                try:
                    nuevos += [ft for ft in (fila_a_feature(fila, flujo) for fila in T.filas_gkg(u)) if ft]
                except Exception as e:  # noqa: BLE001
                    errores.append(f"{u.rsplit('/', 1)[-1]}: {e}"[:120])
        except Exception as e:  # noqa: BLE001
            errores.append(f"{flujo}: {e}"[:160])
    notas = T.unir(previos, nuevos, datetime.now(timezone.utc), DIAS)
    feats = T.agrupar(notas, radio_km=150, horas=48, tipo_de=tipo_grupo)
    for f in feats:  # un grupo es «programado» solo si todas sus notas lo son
        f["properties"]["programado"] = all(n["programado"] for n in notas_de(f, notas))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "fuente": "GDELT GKG 2.1 (noticias de todo el mundo; señales por verificar)", "errores": errores[:10], "relleno_12h": True,
               "features": feats, "notas": notas}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"cortes: {len(nuevos)} notas nuevas, {len(notas)} en {DIAS} días, {len(feats)} zonas; errores: {len(errores)}")
    for f in feats[:15]:
        p = f["properties"]
        print(f"   {p['date']} {p['kind']} {p['state']} · {p['notas']} notas · {p['title'][:90]}")
    return 0


def notas_de(f, notas):
    urls = {e["url"] for e in f["properties"].get("enlaces", [])}
    return [n["properties"] for n in notas if n["properties"]["url"] in urls]


if __name__ == "__main__":
    sys.exit(main(int(sys.argv[1]) if len(sys.argv) > 1 else 4))
