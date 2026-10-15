"""Todos los lugares de culto de OpenStreetMap (amenity=place_of_worship), por religión, en todo el mundo.

Son ~2 millones (solo los cristianos pasan del millón), demasiados para una sola corrida de Overpass. El mundo se
parte en cajas; cada corrida descarga las cajas más antiguas mientras haya plazo y guarda cada una en
capas/culto_cajas/<caja>.json.gz (se conserva entre corridas en la rama datos-capas). El mapa se arma con todas las
cajas guardadas: en pocas corridas queda completo y después se renueva por partes. Si una caja es demasiado pesada,
se parte en 4.

Se guarda solo: id de OSM, coordenada, religión (subtipo), nombre y denominación. Datos © colaboradores de
OpenStreetMap, licencia ODbL.
"""
import gzip
import json
import os
import re
import time

# Subtipo por etiqueta religion=* (y denomination=* para separar el catolicismo).
GRUPOS = [
    ("pc_islam", r"^(muslim|islam)"),
    ("pc_judaismo", r"^(jewish|judaism)"),
    ("pc_hinduismo", r"^hindu"),
    ("pc_budismo", r"^buddhis"),
    ("pc_sintoismo", r"^shinto"),
    ("pc_sijismo", r"^sikh"),
    ("pc_taoismo", r"^(taoist|taoism|chinese_folk|confucian)"),
    ("pc_jainismo", r"^jain"),
    ("pc_bahai", r"^bahai"),
    ("pc_ocultismo", r"^(satanism|satanist|luciferian|thelema|occult)"),
    ("pc_paganismo", r"^(pagan|heathen|neopagan|wicca|druid|asatru|rodnover|hellenism|kemet)"),
    ("pc_afro_espiritismo", r"^(voodoo|vodou|santeria|candomble|umbanda|spiritis|spiritualis|ifa|yoruba|kardec)"),
]
CATOLICA = re.compile(r"catholic|cat[oó]lic|maronite|chaldean|melkite|uniate", re.I)
# Zoom mínimo por subtipo: los más numerosos aparecen solo al acercarse a una ciudad (así el archivo no crece de más).
ZOOM_MIN = {"pc_catolicismo": 10, "pc_cristianismo": 10, "pc_islam": 9, "pc_otras": 9, "pc_hinduismo": 7, "pc_budismo": 7, "pc_sintoismo": 7}
CRISTIANOS = {"pc_catolicismo", "pc_cristianismo"}
LATS = [-60, -30, -10, 10, 25, 35, 45, 55, 85]
MAX_NIVEL = 3


def subtipo(tags):
    rel = (tags.get("religion") or "").strip().lower()
    if rel == "christian":
        return "pc_catolicismo" if CATOLICA.search(tags.get("denomination") or "") else "pc_cristianismo"
    for st, rx in GRUPOS:
        if re.search(rx, rel):
            return st
    return "pc_otras"  # otras religiones, multiconfesionales o sin religión indicada


def cajas_base():
    """96 cajas: 8 franjas de latitud (más finas donde hay más templos) × 12 de 30° de longitud."""
    return [(s, w, n, w + 30) for s, n in zip(LATS, LATS[1:]) for w in range(-180, 180, 30)]


def clave(caja):
    return ",".join(f"{x:g}" for x in caja)


def caja_de(k):
    return tuple(float(x) for x in k.split(","))


def dividir(caja):
    s, w, n, e = caja
    ml, mo = (s + n) / 2, (w + e) / 2
    return [(s, w, ml, mo), (s, mo, ml, e), (ml, w, n, mo), (ml, mo, n, e)]


def filas(elementos):
    """Elementos de Overpass → filas compactas [id, lon, lat, subtipo, nombre, denominación o religión]."""
    out = []
    for el in elementos:
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        if lat is None:
            continue
        t = el.get("tags", {})
        st = subtipo(t)
        x = t.get("denomination") or ("" if st != "pc_otras" else t.get("religion", ""))
        out.append([f"{el['type'][0]}{el['id']}", round(lon, 5), round(lat, 5), st, (t.get("name:es") or t.get("name") or "")[:80], x[:40]])
    return out


class Cajas:
    """Estado de la rotación: {clave: {"t": fecha ISO de la última descarga, "n": objetos, "nivel": divisiones}}."""

    def __init__(self, carpeta):
        self.carpeta = carpeta
        os.makedirs(carpeta, exist_ok=True)
        self.ruta = os.path.join(carpeta, "estado.json")
        try:
            self.estado = json.load(open(self.ruta, encoding="utf-8"))
        except (OSError, ValueError):
            self.estado = {}
        if not self.estado:
            self.estado = {clave(c): {"t": "", "n": 0, "nivel": 0} for c in cajas_base()}

    def guardar(self):
        json.dump(self.estado, open(self.ruta, "w", encoding="utf-8"), indent=0)

    def archivo(self, k):
        return os.path.join(self.carpeta, k.replace(",", "_") + ".json.gz")

    def pendientes(self):
        """Primero las nunca descargadas; luego de la más antigua a la más reciente."""
        return sorted(self.estado, key=lambda k: self.estado[k]["t"])

    def poner(self, k, fs, ahora):
        with gzip.open(self.archivo(k), "wt", encoding="utf-8") as f:
            json.dump(fs, f, ensure_ascii=False, separators=(",", ":"))
        self.estado[k].update({"t": ahora, "n": len(fs)})

    def partir(self, k):
        nivel = self.estado[k]["nivel"] + 1
        del self.estado[k]
        if os.path.exists(self.archivo(k)):
            os.remove(self.archivo(k))
        for c in dividir(caja_de(k)):
            self.estado[clave(c)] = {"t": "", "n": 0, "nivel": nivel}

    def todas(self):
        out = []
        for k, v in self.estado.items():
            if v["t"] and os.path.exists(self.archivo(k)):
                with gzip.open(self.archivo(k), "rt", encoding="utf-8") as f:
                    out += json.load(f)
        return out

    def al_dia(self, dias=25):
        """True si todas las cajas tienen datos de hace menos de `dias` días."""
        from datetime import datetime, timedelta, timezone
        limite = (datetime.now(timezone.utc) - timedelta(days=dias)).strftime("%Y-%m-%dT%H:%M:%SZ")
        return bool(self.estado) and all(v["t"] and v["t"] >= limite for v in self.estado.values())

    def completas(self):
        return sum(1 for v in self.estado.values() if v["t"]), len(self.estado)


def actualizar(cajas, consultar, plazo_s, ahora, pausa=5):
    """Descarga cajas mientras quede plazo. `consultar(q)` → elementos (lanza excepción si falla).
    Devuelve (cajas descargadas, cajas partidas, errores)."""
    fin = time.time() + plazo_s
    hechas, partidas, errores = 0, 0, []
    while time.time() < fin:
        pend = [k for k in cajas.pendientes() if time.time() < fin]
        if not pend:
            break
        k = pend[0]
        if cajas.estado[k]["t"][:10] >= ahora[:10]:
            break  # todas se renovaron hoy
        s, w, n, e = caja_de(k)
        q = f'[out:json][timeout:180];nwr["amenity"="place_of_worship"]({s},{w},{n},{e});out center tags;'
        try:
            cajas.poner(k, filas(consultar(q)), ahora)
            hechas += 1
        except TimeoutError:
            break
        except Exception as ex:  # noqa: BLE001
            if cajas.estado[k]["nivel"] < MAX_NIVEL:
                cajas.partir(k)
                partidas += 1
            else:
                cajas.estado[k]["t"] = ahora  # se reintenta en la próxima vuelta de la rotación
                errores.append(f"{k}: {ex}"[:120])
        cajas.guardar()
        time.sleep(pausa)
    return hechas, partidas, errores
