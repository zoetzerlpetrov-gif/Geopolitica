"""Grandes establecimientos de México (DENUE del INEGI): plantas, oficinas, hospitales, centros comerciales… de empresas
que coticen o no en bolsa. Se piden por estado los estratos 6 (101 a 250 personas ocupadas) y 7 (251 o más) con la API
del DENUE (llave gratuita del INEGI en el secreto INEGI_DENUE_API_KEY).

Solo se guardan datos del establecimiento: nombre, razón social, actividad, tamaño, municipio y estado, sitio web y
coordenadas. No se guardan teléfono ni correo (no hacen falta para el mapa). Licencia: términos de libre uso de la
información del INEGI, con crédito.
"""
import json
import re

API = "https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarAreaActEstr/{edo}/0/0/0/0/0/0/0/0/0/{ini}/{fin}/0/{estrato}/{llave}"
ESTADOS = [f"{i:02d}" for i in range(1, 33)]
ESTRATOS = {"7": ("denue_251", "251 o más personas"), "6": ("denue_101", "101 a 250 personas")}
LOTE = 5000


def url(edo, estrato, llave, ini=1, fin=LOTE):
    return API.format(edo=edo, estrato=estrato, llave=llave, ini=ini, fin=fin)


def limpiar(t):
    return re.sub(r"\s+", " ", str(t or "")).strip()


def establecimientos(filas, estrato):
    """Filas de la API → [dict] con lo que va al mapa (sin teléfono ni correo)."""
    st, tam = ESTRATOS[estrato]
    out = []
    for f in filas or []:
        try:
            lat, lon = float(f.get("Latitud")), float(f.get("Longitud"))
        except (TypeError, ValueError):
            continue
        if not (14 <= lat <= 33 and -119 <= lon <= -86):
            continue
        nombre = limpiar(f.get("Nombre")) or limpiar(f.get("Razon_social"))
        if not nombre:
            continue
        out.append({"id": f"denue:{f.get('Id') or f.get('CLEE')}", "n": nombre.title() if nombre.isupper() else nombre, "st": st,
                    "razon": limpiar(f.get("Razon_social")), "act": limpiar(f.get("Clase_actividad")), "tam": tam,
                    "lugar": limpiar(f.get("Ubicacion")).title(), "web": limpiar(f.get("Sitio_internet")).lower(),
                    "lat": round(lat, 5), "lon": round(lon, 5)})
    return out


def leer(texto):
    """La API devuelve una lista JSON; si no hay resultados puede devolver un texto o un objeto."""
    try:
        d = json.loads(texto)
    except ValueError:
        return []
    return d if isinstance(d, list) else []
