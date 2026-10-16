#!/usr/bin/env python3
"""Listas oficiales públicas para apoyar investigaciones de fraude, corrupción y personas buscadas.

1. SAT, artículo 69-B del Código Fiscal de la Federación (EFOS: empresas que facturan operaciones simuladas).
   El SAT publica por ley el listado completo (http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv)
   con RFC, nombre, situación (Presunto, Desvirtuado, Definitivo, Sentencia favorable) y oficios/fechas de publicación
   en el DOF. Se guarda solo eso, para el buscador de la sección Herramientas. Se descarga una vez por semana.
   Una empresa «Presunta» aún puede desvirtuar; «Desvirtuado» y «Sentencia favorable» significan que NO quedó firme.
2. FBI Wanted (`api.fbi.gov/wanted/v1/list`, API pública del FBI): personas buscadas, desaparecidas y casos sin
   resolver que el propio FBI publica para pedir ayuda al público. Se guarda solo el nombre, la categoría, la oficina,
   el texto de recompensa (si lo hay), la fecha y el ENLACE a la ficha oficial; nada de fotos, descripciones físicas ni
   detalles. Se actualiza a diario: si el FBI retira una ficha, aquí desaparece también.
Salidas: vivos/efos_69b.json y vivos/buscados_fbi.json. Si una fuente falla se conserva el archivo anterior.
"""
import csv
import io
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_EFOS = os.path.join(ROOT, "vivos", "efos_69b.json")
OUT_FBI = os.path.join(ROOT, "vivos", "buscados_fbi.json")
URL_SAT = "http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv"
URL_FBI = "https://api.fbi.gov/wanted/v1/list"
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
CATEGORIA_FBI = {"ten": "Los diez más buscados", "default": "Buscado", "vicap": "Casos violentos sin resolver (ViCAP)", "information": "Se busca información"}


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def viejo(ruta, horas, ahora):
    try:
        gen = json.load(open(ruta, encoding="utf-8")).get("generado_utc", "")
        return ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) >= timedelta(hours=horas)
    except (OSError, ValueError):
        return True


def get(url, timeout=120):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout) as r:
        return r.read()


def efos_de(texto):
    """CSV del SAT (latin-1 ya decodificado) → (fecha de corte, filas [rfc, nombre, situación, presunto DOF, desvirtuado DOF, definitivo DOF, sentencia DOF])."""
    filas = list(csv.reader(io.StringIO(texto)))
    corte = re.search(r"actualizada al ([^;,\"]+)", texto[:500])
    i0 = next((k for k, f in enumerate(filas) if len(f) > 3 and f[1].strip().upper() == "RFC"), None)
    if i0 is None:
        raise ValueError("no se encontró el encabezado del listado")
    out = []
    for f in filas[i0 + 1:]:
        if len(f) < 16 or not re.fullmatch(r"[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}", f[1].strip().upper()):
            continue
        out.append([f[1].strip().upper(), " ".join(f[2].split()), f[3].strip(), f[7].strip(), f[11].strip(), f[15].strip(), f[19].strip() if len(f) > 19 else ""])
    return (corte.group(1).strip() if corte else ""), out


def actualizar_efos(ahora):
    if not viejo(OUT_EFOS, 24 * 7, ahora):
        return "efos 69-B: datos recientes"
    corte, filas = efos_de(get(URL_SAT).decode("latin-1"))
    if len(filas) < 1000:
        return f"efos 69-B: solo {len(filas)} filas; se conserva el anterior"
    json.dump({"generado_utc": iso(ahora), "fuente": "SAT, listado completo del artículo 69-B del CFF", "url": URL_SAT, "corte_sat": corte,
               "campos": ["rfc", "nombre", "situacion", "dof_presunto", "dof_desvirtuado", "dof_definitivo", "dof_sentencia_favorable"], "filas": filas},
              open(OUT_EFOS, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return f"efos 69-B: {len(filas)} contribuyentes (corte del SAT: {corte})"


def fbi_de(items):
    out = []
    for it in items:
        url = it.get("url") or ""
        titulo = " ".join((it.get("title") or "").split())
        if not url.startswith("https://www.fbi.gov/") or not titulo:
            continue
        recompensa = re.sub(r"<[^>]+>", " ", it.get("reward_text") or "")
        out.append({"nombre": titulo, "temas": it.get("subjects") or [], "categoria": CATEGORIA_FBI.get(it.get("poster_classification") or "", ""),
                    "oficinas": it.get("field_offices") or [], "recompensa": " ".join(recompensa.split())[:160], "publicado": (it.get("publication") or "")[:10], "url": url})
    return out


def actualizar_fbi(ahora):
    if not viejo(OUT_FBI, 24, ahora):
        return "fbi: datos recientes"
    items, pagina = [], 1
    while pagina <= 40:
        d = json.loads(get(f"{URL_FBI}?pageSize=50&page={pagina}", timeout=60))
        lote = d.get("items") or []
        items += lote
        if not lote or len(items) >= (d.get("total") or 0):
            break
        pagina += 1
        time.sleep(1)
    fichas = fbi_de(items)
    if len(fichas) < 100:
        return f"fbi: solo {len(fichas)} fichas; se conserva el anterior"
    json.dump({"generado_utc": iso(ahora), "fuente": "FBI Wanted API (api.fbi.gov)", "fichas": fichas},
              open(OUT_FBI, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return f"fbi: {len(fichas)} fichas"


def main():
    ahora = datetime.now(timezone.utc)
    os.makedirs(os.path.join(ROOT, "vivos"), exist_ok=True)
    for paso in (actualizar_efos, actualizar_fbi):
        try:
            print(paso(ahora))
        except Exception as e:  # noqa: BLE001  se conserva el archivo anterior
            print(f"{paso.__name__}: error {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
