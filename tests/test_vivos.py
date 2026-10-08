"""Reglas de clasificación de aeronaves y buques y privacidad de las instantáneas en movimiento."""
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "vivos"))
import actualizar as v  # noqa: E402


def test_avion_sancionado_tiene_prioridad():
    assert v._subtipo_avion("AAL100", False, False, "EP-ABC", {"EPABC"}) == "sancionada"

def test_avion_en_tierra():
    assert v._subtipo_avion("AMX123", False, True, None, set()) == "en_tierra"

def test_avion_de_estado_por_indicativo():
    assert v._subtipo_avion("SAM44", True, False, None, set()) == "estado"

def test_avion_militar():
    assert v._subtipo_avion("RCH123", True, False, None, set()) == "militar"

def test_avion_carga_y_comercial():
    assert v._subtipo_avion("FDX1234", False, False, None, set()) == "carga"
    assert v._subtipo_avion("AMX0410", False, False, None, set()) == "civil_comercial"

def test_aviacion_general():
    assert v._subtipo_avion("XBABC", False, False, None, set()) == "aviacion_general"

def test_buque_por_codigo_ais():
    assert v._subtipo_buque(84, None, set()) == "tanqueros"
    assert v._subtipo_buque(70, None, set()) == "carga"
    assert v._subtipo_buque(35, None, set()) == "militares"
    assert v._subtipo_buque(None, None, set()) == "otros"

def test_buque_sancionado_por_imo():
    assert v._subtipo_buque(80, 9187629, {"9187629"}) == "sancionados"

def test_campos_de_aeronaves_sin_propietario():
    src = open(os.path.join(ROOT, "tools", "vivos", "actualizar.py"), encoding="utf-8").read()
    assert v.CAMPOS_AVION == ["hex", "indicativo", "lon", "lat", "alt_m", "rumbo", "vel_kmh", "subtipo", "pais", "edad_s",
                              "vs_ms", "squawk", "cat", "tipo_av", "matricula", "ruta"]
    assert "ownOp" not in src and "owner" not in src.lower().replace("dueño", "")


# ---------------- Fichas de vuelo: campos extra, rutas y rastros ----------------
import json  # noqa: E402

ESTADO_OPENSKY = ["0d0d0d", "AMX0410 ", "Mexico", 1, 1000, -99.1, 19.4, 9000.0, False, 230.0, 45.0, -5.2, None, 9100.0, "7700", False, 0, 6]


def test_fila_opensky_trae_velocidad_vertical_squawk_y_categoria():
    f = v.fila_opensky(ESTADO_OPENSKY, 1010, set())
    assert len(f) == len(v.CAMPOS_AVION)
    d = dict(zip(v.CAMPOS_AVION, f))
    assert d["indicativo"] == "AMX0410" and d["alt_m"] == 9100 and d["vel_kmh"] == 828
    assert d["vs_ms"] == -5.2 and d["squawk"] == "7700" and d["cat"] == "A5" and d["ruta"] == ""


def test_fila_adsblol_excluye_privacidad_y_convierte_unidades():
    base = {"hex": "ae1234", "flight": "RCH123 ", "lat": 30.0, "lon": -90.0, "alt_baro": 30000, "gs": 450, "track": 90,
            "baro_rate": 1000, "squawk": "1234", "category": "A5", "t": "C17", "r": "05-5140"}
    f = v.fila_adsblol(base, set())
    d = dict(zip(v.CAMPOS_AVION, f))
    assert d["vs_ms"] == 5.1 and d["vel_kmh"] == 833 and d["tipo_av"] == "C17" and d["subtipo"] == "militar"
    assert v.fila_adsblol({**base, "dbFlags": 8}, set()) is None   # LADD
    assert v.fila_adsblol({**base, "dbFlags": 4}, set()) is None   # PIA


ROUTESET = [
    {"callsign": "AMX0410", "airport_codes": "MMMX-KJFK", "plausible": 1,
     "_airports": [{"icao": "MMMX", "iata": "MEX", "name": "Benito Juárez Intl", "location": "Mexico City", "countryiso2": "MX", "lat": 19.436, "lon": -99.072},
                   {"icao": "KJFK", "iata": "JFK", "name": "John F Kennedy Intl", "location": "New York", "countryiso2": "US", "lat": 40.64, "lon": -73.78}]},
    {"callsign": "XXX1", "airport_codes": "unknown", "plausible": 0, "_airports": []},
]


def test_parsear_routeset():
    rutas, aps = v.parsear_routeset(ROUTESET)
    assert rutas == {"AMX0410": ["MMMX", "KJFK"], "XXX1": []}
    assert aps["MMMX"][:3] == ["Benito Juárez Intl", "Mexico City", "MX"] and aps["KJFK"][5] == "JFK"


def test_elegir_tramo_de_ruta_con_escala():
    aps = {"MMMX": ["", "", "", 19.4, -99.1, ""], "MMMY": ["", "", "", 25.8, -100.1, ""], "KORD": ["", "", "", 41.98, -87.9, ""]}
    # Avión entre Monterrey y Chicago → tramo MMMY-KORD.
    assert v.elegir_tramo(["MMMX", "MMMY", "KORD"], aps, 33.0, -94.0) == ("MMMY", "KORD")
    assert v.elegir_tramo(["MMMX", "MMMY", "KORD"], aps, 22.0, -99.5) == ("MMMX", "MMMY")


def test_rutas_y_rastros_nunca_para_aviacion_general(tmp_path, monkeypatch):
    monkeypatch.setattr(v, "OUT", str(tmp_path))
    privada = ["a1b2c3", "N123AB", -99.0, 19.0, 3000, 90, 300, "aviacion_general", "United States", 0, 0, "", "A1", "", "", ""]
    comercial = ["a00001", "AMX0410", -99.0, 19.0, 9000, 45, 800, "civil_comercial", "Mexico", 0, 0, "", "A3", "", "", ""]
    filas = {f[0]: f for f in (privada, comercial)}
    v.actualizar_rastros(filas, 600000)
    v.actualizar_rastros({k: [*f[:3], f[3] + 1, *f[4:]] for k, f in filas.items()}, 601200)
    r = json.load(open(tmp_path / "rastros" / "a.json"))["r"]
    assert "a1b2c3" not in r and len(r["a00001"]) == 2
    assert v.CON_RUTA.isdisjoint({"aviacion_general", "en_tierra"}) and "aviacion_general" not in v.CON_RASTRO


def test_rastro_descarta_posiciones_de_mas_de_3_horas(tmp_path, monkeypatch):
    monkeypatch.setattr(v, "OUT", str(tmp_path))
    f = ["b00001", "UAL1", 0.0, 0.0, 9000, 0, 800, "civil_comercial", "", 0, 0, "", "", "", "", ""]
    v.actualizar_rastros({"b00001": f}, 0)
    v.actualizar_rastros({}, 4 * 3600)
    assert json.load(open(tmp_path / "rastros" / "b.json"))["r"] == {}


def test_parsear_adsbdb():
    d = {"response": {"flightroute": {"callsign": "AMX410",
         "origin": {"icao_code": "MMMX", "iata_code": "MEX", "name": "Mexico City Intl", "municipality": "Mexico City", "country_iso_name": "MX", "latitude": 19.43, "longitude": -99.07},
         "destination": {"icao_code": "KJFK", "iata_code": "JFK", "name": "JFK Intl", "municipality": "New York", "country_iso_name": "US", "latitude": 40.64, "longitude": -73.78}}}}
    codigos, aps = v.parsear_adsbdb(d)
    assert codigos == ["MMMX", "KJFK"] and aps["KJFK"][1] == "New York"
    assert v.parsear_adsbdb({"response": "unknown callsign"}) == ([], {})


# ---------------- Buques: datos estáticos, bandera, valores «no disponible» y rastros ----------------
def test_bandera_por_mid_del_mmsi():
    assert v.bandera_mmsi(345070300) == "MX"
    assert v.bandera_mmsi(636019825) == "LR"
    assert v.bandera_mmsi(353136000) == "PA"
    assert v.bandera_mmsi(111345678) == ""   # aeronave SAR, no buque
    assert v.bandera_mmsi(99123) == ""


def test_posicion_ais_con_valores_no_disponibles():
    assert v.posicion_de_mensaje({"Longitude": 181, "Latitude": 91}) is None
    p = v.posicion_de_mensaje({"Longitude": -96.1234, "Latitude": 19.2, "TrueHeading": 511, "Cog": 87.6, "Sog": 102.3, "NavigationalStatus": 1})
    assert p == (-96.123, 19.2, 88, 0, 1)
    assert v.posicion_de_mensaje({"Longitude": 1, "Latitude": 1, "TrueHeading": 511, "Cog": 360})[2] == 0


def test_estatico_y_fila_de_buque():
    s = {"Name": "MAR@@@@", "CallSign": "XCAB ", "ImoNumber": 9187629, "Type": 70, "Dimension": {"A": 150, "B": 30, "C": 14, "D": 14},
         "MaximumStaticDraught": 9.4, "Destination": "MX ZLO@@@", "Eta": {"Month": 10, "Day": 9, "Hour": 24, "Minute": 60}}
    e = v.estatico_de_mensaje(s, 1000)
    assert (e["nombre"], e["indicativo"], e["eslora"], e["manga"], e["destino"], e["eta"]) == ("MAR", "XCAB", 180, 28, "MX ZLO", "10-09")
    f = v.fila_buque(345070300, "", (-104.3, 19.05, 90, 12.5, 0), 30, e, set())
    d = dict(zip(v.CAMPOS_BUQUE, f))
    assert d["subtipo"] == "carga" and d["nombre"] == "MAR" and d["bandera"] == "MX" and d["calado_m"] == 9.4
    assert len(f) == len(v.CAMPOS_BUQUE)
    # Sin datos estáticos: campos vacíos, nunca error
    assert dict(zip(v.CAMPOS_BUQUE, v.fila_buque(1, "X", (0.1, 0.1, 0, 0, 15), 0, None, set())))["subtipo"] == "otros"


def test_eta_ais():
    assert v.eta_ais({"Month": 0, "Day": 0, "Hour": 24, "Minute": 60}) == ""
    assert v.eta_ais({"Month": 3, "Day": 7, "Hour": 5, "Minute": 30}) == "03-07 05:30"


def test_cache_estatica_caduca():
    c = {"1": {"t": 0}, "2": {"t": 100 * 3600}}
    assert list(v.depurar_estaticos(c, 100 * 3600)) == ["2"]


def test_rastros_de_buques_sin_recreo(tmp_path, monkeypatch):
    monkeypatch.setattr(v, "OUT", str(tmp_path))
    carga = v.fila_buque(345070301, "A", (-104.3, 19.05, 90, 12.5, 0), 0, {"tipo": 70}, set())
    yate = v.fila_buque(345070311, "B", (-104.3, 19.05, 90, 5, 0), 0, {"tipo": 37}, set())
    v.actualizar_rastros_buques([carga, yate], 600000)
    r = json.load(open(tmp_path / "rastros-buques" / "1.json"))["r"]
    assert list(r) == ["345070301"] and r["345070301"][0] == [-104.3, 19.05, 12.5, 10000]
    v.actualizar_rastros_buques([], 600000 + 7 * 3600)
    assert json.load(open(tmp_path / "rastros-buques" / "1.json"))["r"] == {}


def test_conservar_buques_no_oidos_hasta_2_horas():
    nueva = v.fila_buque(1, "A", (0.1, 0.1, 0, 5, 0), 10, None, set())
    viejo_cerca = v.fila_buque(2, "B", (1, 1, 0, 0, 1), 600, None, set())
    viejo_lejos = v.fila_buque(3, "C", (2, 2, 0, 0, 5), 6900, None, set())
    repetido = v.fila_buque(1, "A", (9, 9, 0, 5, 0), 100, None, set())
    previo = {"generado_utc": "2026-10-08T12:00:00Z", "campos": v.CAMPOS_BUQUE, "b": [viejo_cerca, viejo_lejos, repetido]}
    t = datetime(2026, 10, 8, 12, 20, tzinfo=timezone.utc).timestamp()
    out = v.conservar_buques([nueva], previo, t)
    assert [f[0] for f in out] == [1, 2]
    assert out[0][2] == 0.1          # la posición nueva gana a la vieja
    assert out[1][8] == 600 + 1200   # la edad crece con el tiempo transcurrido
    assert v.conservar_buques([nueva], {**previo, "campos": ["mmsi"]}, t) == [nueva]
