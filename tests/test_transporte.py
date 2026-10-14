"""Emergencias aéreas, trenes, avisos náuticos, perturbaciones tropicales y zonas afectadas (sin red)."""
import os
import sys
from datetime import datetime, timedelta, timezone

RAIZ = os.path.join(os.path.dirname(__file__), "..")
for d in ("tools/transporte", "tools/clima", "tools", "ingest"):
    sys.path.insert(0, os.path.join(RAIZ, d))
import avisos_nauticos as N  # noqa: E402
import emergencias_aereas as E  # noqa: E402
import perturbaciones as P  # noqa: E402
import run as R  # noqa: E402
import trenes as T  # noqa: E402
import zonas_afectadas as Z  # noqa: E402

AHORA = 1_791_990_000


def avion(hex_, codigo="7700", lat=40.0, lon=-3.0, flags=0):
    return {"hex": hex_, "flight": "IBE123 ", "r": "EC-ABC", "t": "A320", "lat": lat, "lon": lon, "alt_baro": 30000, "gs": 400, "track": 90, "dbFlags": flags}


def test_emergencias_excluye_privacidad_y_sin_posicion():
    assert E.de_adsblol(avion("a1", flags=8), "7700", AHORA) is None      # LADD
    assert E.de_adsblol(avion("a1", flags=4), "7700", AHORA) is None      # PIA
    assert E.de_adsblol({"hex": "a1"}, "7700", AHORA) is None
    r = E.de_adsblol(avion("a1"), "7700", AHORA)
    assert r["indicativo"] == "IBE123" and r["alt_m"] == 9144 and r["squawk"] == "7700"


def test_emergencias_conserva_6_horas_y_arma_rastro():
    r1 = E.de_adsblol(avion("a1"), "7700", AHORA)
    reg = E.combinar([], [r1], AHORA)
    r2 = E.de_adsblol(avion("a1", lat=40.5), "7700", AHORA + 1200)
    reg = E.combinar(reg, [r2], AHORA + 1200)
    assert len(reg) == 1 and len(reg[0]["rastro"]) == 2 and reg[0]["primera_t"] == AHORA
    # Sin señales nuevas: sigue 6 h, luego se descarta.
    assert len(E.combinar(reg, [], AHORA + 1200 + 5 * 3600)) == 1
    assert E.combinar(reg, [], AHORA + 1200 + 6 * 3600 + 1) == []
    feats = E.a_geojson(reg, AHORA + 1200)
    assert {f["properties"]["kind"] for f in feats} == {"avion", "rastro"}
    assert feats[0]["properties"]["activo"] and feats[0]["properties"]["codigo_texto"] == "Emergencia general"


def test_emergencias_codigo_mas_grave():
    reg = E.combinar([], [E.de_adsblol(avion("a1"), "7600", AHORA)], AHORA)
    reg = E.combinar(reg, [E.de_adsblol(avion("a1"), "7500", AHORA + 60)], AHORA + 60)
    assert reg[0]["squawk"] == "7500" and set(reg[0]["codigos"]) == {"7600", "7500"}


def test_emergencias_desde_filas_de_opensky():
    datos = {"campos": ["hex", "indicativo", "lon", "lat", "alt_m", "rumbo", "vel_kmh", "subtipo", "pais", "edad_s", "vs_ms", "squawk"],
             "a": [["b1", "AMX1", -99.1, 19.4, 3000, 10, 500, "civil_comercial", "", 3, 0, "7700"], ["b2", "AMX2", -99, 19, 3000, 10, 500, "civil_comercial", "", 3, 0, "1200"]]}
    f = E.de_filas(datos, AHORA)
    assert [x["hex"] for x in f] == ["b1"] and f[0]["fuente"] == "OpenSky"


def test_avisos_nauticos_categorias_y_coordenadas():
    assert N.coordenadas("POSITION 12-30.5N 045-10.0E")[0] == [45.167, 12.508]
    assert N.coordenadas("01-15S 080-00W") == [[-80.0, -1.25]]
    assert N.categoria("ARMED ROBBERY REPORTED, SKIFF APPROACHED")[0] == "pirateria"
    assert N.categoria("VESSEL ADRIFT, 3 PERSONS IN WATER")[0] == "rescate"
    assert N.categoria("GPS INTERFERENCE REPORTED IN AREA")[0] == "gnss"
    assert N.categoria("MOBILE OFFSHORE DRILLING UNITS POSITIONS") is None


def test_avisos_nauticos_area_y_puntos():
    texto = "HAZARDOUS OPERATIONS, ROCKET LAUNCHING IN AREA BOUND BY 10-00N 120-00E, 10-30N 121-00E, 11-00N 120-30E."
    fs = N.a_features({"text": texto, "navArea": "P", "msgNumber": 7, "msgYear": 2026})
    assert fs[0]["geometry"]["type"] == "Polygon" and fs[0]["geometry"]["coordinates"][0][0] == fs[0]["geometry"]["coordinates"][0][-1]
    assert sum(f["geometry"]["type"] == "Point" for f in fs) == 3
    assert fs[0]["properties"]["zona"].startswith("HYDROPAC") and fs[0]["properties"]["categoria"] == "militar_espacial"
    assert N.a_features({"text": "LIGHT EXTINGUISHED 10-00N 120-00E"}) == []


def test_trenes_solo_posiciones_recientes():
    ahora = datetime(2026, 10, 14, 15, 30, tzinfo=timezone.utc)
    assert T.reciente("2026-10-14T15:10:00.000Z", ahora)
    assert not T.reciente("2026-10-13T18:15:01.000Z", ahora)
    assert not T.reciente(None, ahora)


def test_trenes_finlandia():
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    d = {"data": {"currentlyRunningTrains": [
        {"trainNumber": 7, "departureDate": "2026-10-14", "cancelled": False, "trainType": {"name": "IC", "trainCategory": {"name": "Long-distance"}},
         "operator": {"name": "VR"}, "trainLocations": [{"speed": 140, "timestamp": ts, "location": [29.65, 61.68]}], "timeTableRows": [{"station": {"name": "Helsinki"}}]},
        {"trainNumber": 8, "cancelled": True, "trainLocations": [{"speed": 0, "timestamp": ts, "location": [25, 60]}]}]}}
    f = T.finlandia_graphql(d)
    assert len(f) == 1 and f[0]["properties"]["categoria"] == "Larga distancia" and f[0]["properties"]["origen"] == "Helsinki"
    assert f[0]["properties"]["id"] == "finlandia-7" and f[0]["properties"]["red"] == "finlandia"


def test_trenes_noruega_irlanda_boston_filadelfia():
    ahora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    no = T.noruega_graphql({"data": {"vehicles": [{"vehicleId": "525-2026-10-14", "lastUpdated": ahora, "location": {"latitude": 59.67, "longitude": 9.65},
                                                   "speed": 20, "line": {"publicCode": "R12", "lineName": "Kongsberg-Oslo S-Eidsvoll"}, "operator": {"operatorRef": "VYG:Operator:VY"}}]}})
    assert no[0]["properties"]["operador"] == "Vy" and no[0]["properties"]["vel_kmh"] == 72
    xml = b"""<?xml version="1.0"?><ArrayOfObjTrainPositions xmlns="http://api.irishrail.ie/realtime/">
      <objTrainPositions><TrainStatus>R</TrainStatus><TrainLatitude>53.35</TrainLatitude><TrainLongitude>-6.25</TrainLongitude><TrainCode>A123</TrainCode>
      <PublicMessage>A123\\n17:30 - Dublin Connolly to Sligo (2 mins late)\\nDeparted Maynooth</PublicMessage><Direction>To Sligo</Direction></objTrainPositions>
      <objTrainPositions><TrainStatus>N</TrainStatus><TrainLatitude>51.8</TrainLatitude><TrainLongitude>-8.2</TrainLongitude><TrainCode>P529</TrainCode></objTrainPositions>
    </ArrayOfObjTrainPositions>"""
    ie = T.irlanda_xml(xml)
    assert len(ie) == 1 and ie[0]["properties"]["origen"] == "Dublin Connolly" and ie[0]["properties"]["destino"] == "Sligo" and ie[0]["properties"]["retraso_min"] == 2
    bo = T.boston_json({"data": [{"id": "1814", "attributes": {"label": "1814", "latitude": 41.98, "longitude": -70.96, "speed": 10, "updated_at": ahora},
                                  "relationships": {"route": {"data": {"id": "CR-NewBedford"}}}}]})
    assert bo[0]["properties"]["linea"] == "Línea NewBedford" and bo[0]["properties"]["vel_kmh"] == 36
    fi = T.filadelfia_json([{"lat": "40.07", "lon": "-75.30", "trainno": "2393", "dest": "Penn Medicine", "line": "Manayunk/Norristown", "late": 4, "SOURCE": "Norristown"}])
    assert fi[0]["properties"]["retraso_min"] == 4 and fi[0]["geometry"]["coordinates"] == [-75.3, 40.07]


def test_perturbaciones_niveles():
    assert P.nivel("30%") == ("baja", 30) and P.nivel(50) == ("media", 50) and P.nivel("70%") == ("alta", 70)
    assert P.nivel(None) == (None, None)
    f = P.normalizar({"geometry": {"type": "Point", "coordinates": [-50, 12]}, "properties": {"OBJECTID": 1, "BASIN": "Atlantic", "PROB2DAY": "20%", "PROB7DAY": "70%"}}, "ubicacion_7d")
    p = f["properties"]
    assert p["prob_7d"] == 70 and p["nivel_7d"] == "alta" and p["nivel_2d"] == "baja" and p["cuenca"] == "Atlantic"


# ------------------------------------------------------------------ zonas afectadas
CUADRO = lambda x0, y0, x1, y1: {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}  # noqa: E731
POLIS = [
    {"nombres": ["Sinaloa"], "iso3": "MEX", "region": "", "tipo": "State", "bbox": [-109, 22, -105, 27], "geometry": CUADRO(-109, 22, -105, 27)},
    {"nombres": ["Baja California"], "iso3": "MEX", "region": "", "tipo": "State", "bbox": [-117, 28, -112, 32.7], "geometry": CUADRO(-117, 28, -112, 32.7)},
    {"nombres": ["Baja California Sur"], "iso3": "MEX", "region": "", "tipo": "State", "bbox": [-115, 22.8, -109, 28], "geometry": CUADRO(-115, 22.8, -109, 28)},
    {"nombres": ["New York"], "iso3": "USA", "region": "", "tipo": "State", "bbox": [-80, 40, -72, 45], "geometry": CUADRO(-80, 40, -72, 45)},
]
AHORA_DT = datetime(2026, 10, 14, 12, tzinfo=timezone.utc)


def ev(i, titulo, pais="MEX", sev=4, horas=3, lat=None, lon=None, fuente="El Universal", tipo="noticia"):
    return {"id": f"e{i}", "titulo": titulo, "resumen": "", "pais_iso3": pais, "severidad": sev, "fuente": fuente, "tipo_fuente": tipo,
            "fecha_utc": (AHORA_DT - timedelta(hours=horas)).strftime("%Y-%m-%dT%H:%M:%SZ"), "lat": lat, "lon": lon, "url": f"https://x/{i}"}


def nombres(evs):
    return sorted(f["properties"]["nombre"] for f in Z.zonas(evs, Z.Divisiones(POLIS, {"MEX": ["México", "Mexico"]}), AHORA_DT, {"MEX": (-102, 23)}))


def test_zonas_por_mencion_y_frase_mas_larga():
    assert nombres([ev(1, "Huracán toca tierra en Baja California Sur con vientos de 150 km/h")]) == ["Baja California Sur"]
    assert nombres([ev(2, "Enfrentamiento en Sinaloa deja 8 muertos")]) == ["Sinaloa"]


def test_zonas_ignora_organizaciones_y_medios():
    assert nombres([ev(3, "El Cártel de Sinaloa recluta menores en Tecate")]) == []
    assert nombres([ev(4, "Cornell no renuncia, según The New York Times", pais="USA")]) == []


def test_zonas_por_coordenadas_pero_no_centroide():
    assert nombres([ev(5, "Explosión en planta química", lat=24.8, lon=-107.4)]) == ["Sinaloa"]
    assert nombres([ev(6, "Explosión en planta química", lat=23, lon=-102)]) == []      # centro del país: no se sabe dónde


def test_zonas_filtra_severidad_ventana_y_fuentes_automaticas():
    assert nombres([ev(7, "Balacera en Sinaloa", sev=2)]) == []
    assert nombres([ev(8, "Balacera en Sinaloa", horas=60)]) == []
    assert nombres([ev(9, "Combate: México → Sinaloa", fuente="GDELT 2.0 (evento codificado)", tipo="base_datos")]) == []
    assert nombres([ev(10, "Balacera en Sinaloa", fuente="Mastodon #geopolitics", tipo="red_social")]) == []
    assert nombres([ev(11, "la sinaloa de abajo")]) == []                                   # en minúscula no es nombre propio


def test_zonas_agrega_eventos():
    fs = Z.zonas([ev(12, "Balacera en Sinaloa", sev=3), ev(13, "Bloqueos en Sinaloa", sev=5)], Z.Divisiones(POLIS), AHORA_DT)
    p = fs[0]["properties"]
    assert p["n_eventos"] == 2 and p["sev_max"] == 5 and p["eventos"][0]["severidad"] == 5 and p["id"] == "MEX-Sinaloa"
    assert p["eventos"][0]["por_que"] == "la nota nombra «Sinaloa»"
    assert dict(p["temas"]) == {"Violencia armada o crimen organizado": 1, "Protestas, bloqueos o disturbios": 1}
    assert p["resumen"].startswith("Posible afectación por: ")


def test_zonas_tema():
    assert Z.tema_de("Huracán Simon deja dos muertos en Sinaloa") == "Huracán, ciclón o tormenta tropical"
    assert Z.tema_de("Miles de manifestantes marchan en Nueva Delhi") == "Protestas, bloqueos o disturbios"
    assert Z.tema_de("Reunión de gabinete", "instituciones", {"instituciones": "Instituciones"}) == "Instituciones"


def test_contiene_con_hueco():
    g = {"type": "Polygon", "coordinates": [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]]}
    assert Z.contiene(g, 1, 1) and not Z.contiene(g, 5, 5) and not Z.contiene(g, 11, 1)


def test_severidad_dia_de_muertos():
    assert R.severidad_texto("Festival del Día de Muertos 2026 en Guanajuato") == 2
    assert R.severidad_texto("Ataque deja cinco muertos en Guanajuato") == 4


def test_avisos_nauticos_descarta_socorro_antiguo():
    ahora = datetime(2026, 10, 14, tzinfo=timezone.utc)
    viejo = {"text": "DISTRESS SIGNAL RECEIVED IN 21-28.60N 048-01.93W", "issueDate": "221325Z SEP 2023"}
    nuevo = {"text": "DISTRESS SIGNAL RECEIVED IN 21-28.60N 048-01.93W", "issueDate": "101200Z OCT 2026"}
    minas = {"text": "MINE DANGER AREA 21-28.60N 048-01.93W", "issueDate": "221325Z SEP 2023"}
    assert N.a_features(viejo, ahora) == []
    assert N.a_features(nuevo, ahora)[0]["properties"]["emitido"] == "2026-10-10T12:00Z"
    assert N.a_features(minas, ahora)                     # las zonas de minas siguen mientras estén vigentes
    assert N.categoria("FISHING GEAR ABANDONED IN 46-16.00N 002-18.00W") is None
    assert N.fecha_emision("xx") is None
