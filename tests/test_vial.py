"""Capa «Carreteras y calles» (tools/crimen/vial.py), sin red."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "crimen"))
import vial as V  # noqa: E402

C = {"a1": 6, "a1t": (12, 13, 14), "a2": 16, "a2t": (22, 23, 24), "codigo": 26, "raiz": 28, "articulos": 33, "geo_tipo": 51, "lugar": 52,
     "lat": 56, "lon": 57, "fecha": 59, "url": 60}


def test_clasificar_titulares_reales():
    casos = {
        "Roban tractocamión con mercancía en la autopista México-Puebla": "robo_carga",
        "Maestros de la CNTE marchan en Oaxaca": "protesta",
        "Reportan robo a transporte de carga en la México-Querétaro": "robo_carga",
        "Asaltan a pasajeros de combi en Ecatepec; hay un herido": "robo_publico",
        "Aumenta el robo de vehículos en Guanajuato durante septiembre": "robo_vehiculo",
        "Normalistas toman casetas en Guerrero y dan paso libre": "caseta",
        "Transportistas mantienen bloqueo de la autopista Arco Norte": "bloqueo",
        "Narcobloqueos y quema de vehículos en Culiacán": "bloqueo",
        "Marcha contra la reforma judicial en la Ciudad de México": "protesta",
        "Cuba denuncia el bloqueo económico de Estados Unidos": None,
        "La marcha de la economía mexicana en el tercer trimestre": None,
        "Cargo theft rises at Laredo border crossing": "robo_carga",
        # Formas frecuentes que antes no entraban (los tres tipos salían en cero, oct 2026)
        "Asaltan combi en Ecatepec": "robo_publico",
        "Asalto en camión urbano de Monterrey": "robo_publico",
        "Asaltan a operador de tractocamión en Celaya": "robo_carga",
        "Robo al autotransporte de carga sube 10% en Guanajuato": "robo_carga",
        "Saqueo de tren en Celaya": "robo_carga",
        "Normalistas liberan casetas en Guerrero": "caseta",
        "Manifestantes toman la caseta de Palo Blanco": "caseta",
        "Le roban la cartera en el Metro": None,
        "Asaltan a la tienda de conveniencia en Toluca": None,
        "Asalto múltiple en la Orizaba-Puebla: cuatro familias se quedan sin vehículos": "robo_vehiculo",
        "Cae en 9 meses robo a vehículos de carga 21%": "robo_carga",
    }
    for titulo, esperado in casos.items():
        assert V.clasificar(titulo) == esperado, titulo


def test_severidad_sube_con_violencia():
    assert V.severidad("protesta", "Marcha pacífica en Oaxaca") == 2
    assert V.severidad("robo_publico", "Asaltan combi y matan a un pasajero, dejan un muerto") == 4
    assert V.severidad("bloqueo", "Narcobloqueo en Culiacán") == 4


def test_de_titular_exige_lugar_fino():
    estado = lambda t: (-101.0, 21.0, "Guanajuato", "MEX", "estado")
    pais = lambda t: (-102.0, 23.0, "México (sin lugar en el título)", "MEX", "país")
    f = V.de_titular("Aumenta el robo de vehículos en Guanajuato", "https://x/1", "Medio", "2026-10-21T10:00:00Z", estado, "RSS")
    assert f["properties"]["st"] == "robo_vehiculo" and f["properties"]["lugar"] == "Guanajuato" and f["geometry"]["coordinates"] == [-101.0, 21.0]
    assert V.de_titular("Aumenta el robo de vehículos en el país", "https://x/2", "Medio", "2026-10-21T10:00:00Z", pais, "RSS") is None


class Paises:
    def de(self, lon, lat):
        return "MEX" if lon < -86 else "FRA"


def fila(codigo, geo="4", articulos="6", lon="2.35", url="https://lemonde.fr/2026/10/21/farmers-block-highways-around-paris-in-protest"):
    f = [""] * 61
    f[C["raiz"]], f[C["codigo"]], f[C["geo_tipo"]], f[C["articulos"]] = "14", codigo, geo, articulos
    f[C["lat"]], f[C["lon"]], f[C["lugar"]], f[C["fecha"]] = "48.85", lon, "Paris, France", "20261021100000"
    f[C["url"]] = url
    return f


def slug(u):
    return u.rsplit("/", 1)[-1].replace("-", " ")


def test_eventos_cameo_14():
    f = V.evento_protesta(fila("144"), Paises(), C, slug)
    assert f["properties"]["st"] == "bloqueo" and f["properties"]["cameo"] == "144" and f["properties"]["pais_iso3"] == "FRA"
    assert V.evento_protesta(fila("145"), Paises(), C, slug)["properties"]["st"] == "protesta_violenta"
    assert V.evento_protesta(fila("141"), Paises(), C, slug)["properties"]["st"] == "protesta"
    assert V.evento_protesta(fila("141", geo="1"), Paises(), C, slug) is None  # solo el país: no se pinta
    assert V.evento_protesta(fila("141", articulos="2"), Paises(), C, slug) is None  # poca cobertura fuera de México
    assert V.evento_protesta(fila("141", articulos="1", lon="-99.1"), Paises(), C, slug) is not None  # México: basta una nota
    # Codificación errónea de GDELT: el enlace no habla de protesta.
    assert V.evento_protesta(fila("141", url="https://theregister.com/2026/10/21/jensen-huang-sends-the-robot-ducks"), Paises(), C, slug) is None
    assert V.evento_protesta(fila("142", url="https://siasat.com/jamia-students-indefinite-hunger-strike"), Paises(), C, slug) is not None
