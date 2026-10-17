"""Global Fishing Watch (filtros de apagados y encuentros), conteo de tráfico marítimo y listas oficiales (SAT 69-B, FBI)."""
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "maritimo"))
sys.path.insert(0, os.path.join(ROOT, "tools", "investigacion"))
import gfw as G  # noqa: E402
import listas as Li  # noqa: E402
import trafico as T  # noqa: E402

DESDE = datetime(2026, 10, 1, tzinfo=timezone.utc)


def hueco(horas, intencional=True, tipo="fishing", fin="2026-10-10T08:00:00.000Z"):
    return {"start": "2026-10-09T00:00:00.000Z", "end": fin, "vessel": {"name": " LUCKY 7 ", "ssvid": "412000001", "flag": "CHN", "type": tipo},
            "gap": {"intentionalDisabling": intencional, "durationHours": horas, "distanceKm": 120.4, "impliedSpeedKnots": 2.04,
                    "offPosition": {"lat": -20.5, "lon": -80.25}, "onPosition": {"lat": -21.0, "lon": -79.9}}}


def test_apagados_filtra_por_intencion_duracion_tipo_y_fecha():
    entradas = [hueco(30), hueco(30, intencional=False), hueco(5), hueco(24 * 40), hueco(30, tipo="gear"), hueco(30, fin="2026-09-20T00:00:00Z")]
    f = G.apagados(entradas, DESDE)
    assert len(f) == 1
    p = f[0]["properties"]
    assert f[0]["geometry"]["coordinates"] == [-80.25, -20.5]
    assert p["nombre"] == "LUCKY 7" and p["mmsi"] == "412000001" and p["tipo"] == "pesca" and p["horas"] == 30
    assert p["lat_encendido"] == -21.0 and "id" not in p


def test_apagados_ordena_y_limita(monkeypatch):
    monkeypatch.setattr(G, "MAX_GUARDADOS", 2)
    f = G.apagados([hueco(20, fin=f"2026-10-0{d}T00:00:00Z") for d in (3, 7, 5)], DESDE)
    assert [x["properties"]["encendido_utc"][:10] for x in f] == ["2026-10-07", "2026-10-05"]


def encuentro(id_, tipo, riesgo=False):
    return {"id": id_, "start": "2026-10-08T00:00:00Z", "end": "2026-10-08T06:30:00Z", "position": {"lat": 5.0, "lon": 150.0},
            "vessel": {"name": "A", "ssvid": "1", "flag": "TWN", "type": "fishing"},
            "encounter": {"type": tipo, "potentialRisk": riesgo, "vessel": {"name": "B", "ssvid": "2", "flag": "PAN", "type": "carrier"}}}


def test_encuentros_un_evento_por_par_y_transbordo():
    f = G.encuentros([encuentro("abc.1", "carrier-fishing"), encuentro("abc.2", "carrier-fishing"), encuentro("x.1", "fishing-fishing"),
                      encuentro("y.1", "fishing-fishing", riesgo=True)], DESDE)
    assert len(f) == 2
    a = f[0]["properties"] if f[0]["properties"]["transbordo"] else f[1]["properties"]
    assert a["horas"] == 6.5 and a["barco_b"]["tipo"].startswith("carga refrigerada") and a["barco_a"]["bandera"] == "TWN"
    assert any(x["properties"]["riesgo"] for x in f)


def test_paginas_de_eventos(monkeypatch):
    llamadas = []

    def pedir(token, ds, d, h, offset):
        llamadas.append(offset)
        return {"entries": [{"n": offset}], "nextOffset": offset + 1 if offset < 2 else None, "total": 3}
    monkeypatch.setattr(G.time, "sleep", lambda s: None)
    assert len(G.eventos("t", "ds", "a", "b", pedir=pedir)) == 3 and llamadas == [0, 1, 2]


def test_trafico_cuenta_dentro_del_radio_y_guarda_serie():
    campos = ["lat", "lon", "vel_nudos", "subtipo"]
    rotterdam = [51.95, 4.05]
    barcos = [[51.96, 4.06, 0.2, "carga"], [51.90, 4.10, 10, "tanqueros"], [51.95, 4.05, None, ""], [53.0, 4.0, 0, "carga"]]
    lg = {"lat": rotterdam[0], "lon": rotterdam[1], "radio_km": 25}
    assert T.contar(barcos, campos, lg) == {"total": 3, "detenidos": 2, "carga": 1, "tanquero": 1}
    ahora = datetime(2026, 10, 16, 12, tzinfo=timezone.utc)
    snap = {"campos": campos, "b": barcos, "generado_utc": "2026-10-16T12:00:00Z"}
    fc = T.actualizar(snap, None, ahora)
    r = next(f["properties"] for f in fc["features"] if f["properties"]["id"] == "rotterdam")
    assert r["total"] == 3 and len(r["serie"]) == 1 and r["vs_promedio"] == 1.0
    # Misma hora: no agrega punto; hora siguiente: sí.
    assert len(next(f for f in T.actualizar(snap, fc, ahora)["features"] if f["properties"]["id"] == "rotterdam")["properties"]["serie"]) == 1
    snap2 = {**snap, "generado_utc": "2026-10-16T13:05:00Z"}
    assert len(next(f for f in T.actualizar(snap2, fc, ahora)["features"] if f["properties"]["id"] == "rotterdam")["properties"]["serie"]) == 2


CSV_SAT = (
    "Información actualizada al 31 de diciembre de 2025,,,,\n"
    "No,RFC,Nombre del Contribuyente,Situación del contribuyente,a,b,c,Publicación DOF presuntos,d,e,f,Publicación DOF desvirtuados,g,h,i,Publicación DOF definitivos,j,k,l,Publicación DOF sentencia favorable\n"
    "1,AAA010101AAA,EMPRESA  FANTASMA SA DE CV,Definitivo,,,,01/02/2020,,,,,,,,01/08/2020,,,,\n"
    "2,BBB0202022B1,OTRA SC,Presunto,,,,03/03/2025,,,,,,,,,,,,\n"
    "3,NO-ES-RFC,XX,Presunto,,,,,,,,,,,,,,,,\n")


def test_efos_de_lee_encabezado_y_filas():
    corte, filas = Li.efos_de(CSV_SAT)
    assert corte == "31 de diciembre de 2025"
    assert filas[0] == ["AAA010101AAA", "EMPRESA FANTASMA SA DE CV", "Definitivo", "01/02/2020", "", "01/08/2020", ""]
    assert len(filas) == 2


def test_fbi_de_guarda_solo_lo_minimo():
    items = [{"title": "JOHN  DOE", "url": "https://www.fbi.gov/wanted/x", "subjects": ["Violent Crime"], "poster_classification": "ten",
              "field_offices": ["miami"], "reward_text": "<p>Hasta $1,000,000</p>", "publication": "2024-01-02T00:00:00", "images": [{"large": "x.jpg"}],
              "scars_and_marks": "tatuaje", "hair": "negro"},
             {"title": "Sin enlace oficial", "url": "https://otro.sitio/x"}]
    f = Li.fbi_de(items)
    assert f == [{"nombre": "JOHN DOE", "temas": ["Violent Crime"], "categoria": "Los diez más buscados", "oficinas": ["miami"],
                  "recompensa": "Hasta $1,000,000", "publicado": "2024-01-02", "url": "https://www.fbi.gov/wanted/x"}]


def test_merodeo_filtra_duracion_y_fecha():
    def e(horas, fin="2026-10-10T00:00:00Z"):
        return {"start": "2026-10-08T00:00:00Z", "end": fin, "position": {"lat": -8.4, "lon": -93.9}, "regions": {"highSeas": ["63203"], "eez": []},
                "vessel": {"id": "v1", "name": "HUA YANG", "ssvid": "577144000", "flag": "VUT", "type": "carrier"},
                "loitering": {"totalTimeHours": horas, "averageSpeedKnots": 1.17, "averageDistanceFromShoreKm": 904}}
    f = G.merodeo([e(48), e(1), e(24 * 40), e(48, fin="2026-09-01T00:00:00Z")], DESDE)
    assert len(f) == 1
    p = f[0]["properties"]
    assert p["alta_mar"] and p["gfw_id"] == "v1" and p["tipo"].startswith("carga refrigerada") and p["dist_costa_km"] == 904


def test_pesca_mexico_marca_extranjeros_y_anp():
    def e(flag, anp=False):
        return {"start": "2026-10-08T00:00:00Z", "end": "2026-10-08T03:00:00Z", "position": {"lat": 18.8, "lon": -112.0},
                "regions": {"mpaNoTake": ["555"] if anp else []}, "vessel": {"id": f"id{flag}", "name": "X", "ssvid": "1", "flag": flag, "type": "fishing"},
                "fishing": {"potentialRisk": False, "vesselPublicAuthorizationStatus": "unmatched"}}
    f = {x["properties"]["bandera"] or "nula": x["properties"] for x in G.pesca_mexico([e("USA"), e("MEX", anp=True), e(None)], DESDE)}
    assert f["USA"]["extranjero"] and not f["USA"]["anp_sin_pesca"] and f["USA"]["horas"] == 3.0
    assert f["MEX"]["anp_sin_pesca"] and not f["MEX"]["extranjero"]
    assert not f["nula"]["extranjero"]
    assert f["USA"]["autorizacion"] == "sin autorización pública conocida"


def test_puertos_mexico_agrupa_por_puerto():
    def v(flag, fin, llegada="2026-10-09T00:00:00Z"):
        return {"start": llegada, "end": fin, "vessel": {"id": f"i{flag}{fin}", "name": "B", "ssvid": "1", "flag": flag, "type": "fishing"},
                "port_visit": {"startAnchorage": {"id": "mex-loscabos", "name": "LOS CABOS", "lat": 22.88, "lon": -109.91}}}
    f = G.puertos_mexico([v("USA", "2026-10-10T00:00:00Z"), v("MEX", "2026-10-11T00:00:00Z"), v("USA", "2026-10-12T00:00:00Z", llegada="2012-01-01T00:00:00Z"),
                          v("CAN", "2026-09-01T00:00:00Z")], DESDE)
    assert len(f) == 1
    p = f[0]["properties"]
    assert p["nombre"] == "Los Cabos" and p["visitas_total"] == 2 and p["extranjeros"] == 1 and p["banderas"] == ["USA"]
    assert p["visitas"][0]["bandera"] == "MEX"  # la más reciente primero


def test_radar_lee_celdas():
    rep = {"entries": [{"public-global-sar-presence:v4.0": [{"lat": 24.6, "lon": -97.2, "detections": 2, "entryTimestamp": "2026-09-15T00:47:15Z", "exitTimestamp": "2026-10-13T13:13:50Z"},
                                                            {"lat": 21.5, "lon": -89.8, "detections": 9}, {"lat": None, "lon": 1, "detections": 3}]}]}
    f = G.radar_mexico(rep)
    assert [x["properties"]["detecciones"] for x in f] == [9, 2]


IDENTIDAD = {"selfReportedInfo": [{"id": "v1", "shipname": "NUEVO", "flag": "PAN", "transmissionDateFrom": "2024-01-01T00:00:00Z", "transmissionDateTo": "2026-10-01T00:00:00Z"},
                                  {"id": "v0", "shipname": "VIEJO", "flag": "CHN", "transmissionDateFrom": "2018-01-01T00:00:00Z", "transmissionDateTo": "2023-12-01T00:00:00Z"}],
             "registryInfo": [{"latestVesselInfo": True, "imo": "123", "callsign": "ABC", "lengthM": 60, "tonnageGt": 900, "shipname": "NUEVO",
                               "extraFields": [{"iuuStatus": {"value": "LISTED"}}]}],
             "registryOwners": [{"name": "NAVIERA  EJEMPLO SA", "flag": "PAN", "dateFrom": "2024-02-01T00:00:00Z"}]}


def test_resumen_identidad_y_alerta():
    r = G.resumen_identidad(IDENTIDAD)
    assert r["nombres"] == ["VIEJO", "NUEVO"] and [b["bandera"] for b in r["banderas"]] == ["CHN", "PAN"]
    assert r["imo"] == "123" and r["iuu_registro"] and r["duenos"][0]["nombre"] == "NAVIERA EJEMPLO SA"
    ins = G.resumen_insights({"apparentFishing": {"periodSelectedCounters": {"events": 10, "eventsInNoTakeMPAs": 2, "eventsInRFMOWithoutKnownAuthorization": 0}},
                              "vesselIdentity": {"iuuVesselList": {"totalTimesListed": 0}}, "gap": {"periodSelectedCounters": {"eventsGapOff": 1}}})
    assert ins["pesca_anp_sin_pesca"] == 2 and ins["apagados_anio"] == 1
    a = G.alerta({**r, **ins})
    assert "lista de pesca ilegal" in a and "2 eventos de pesca en áreas protegidas" in a
    assert G.alerta({"iuu_veces": 0, "banderas": []}) == ""


def test_revisar_usa_cache_y_tope(monkeypatch):
    monkeypatch.setattr(G.time, "sleep", lambda s: None)
    llamadas = []

    def llamar(token, url, cuerpo=None, timeout=90):
        llamadas.append("insights" if "/insights/" in url else "identidad")
        if "/vessels?" in url:
            return {"entries": [IDENTIDAD]}
        return {"vesselIdentity": {"iuuVesselList": {"totalTimesListed": 1}}}
    ahora = datetime(2026, 10, 17, tzinfo=timezone.utc)
    cache = {"v9": {"revisado_utc": "2026-10-16T00:00:00Z", "iuu_veces": 0}}
    n = G.revisar("t", ["v9", "v1", "v2", "v3"], cache, ahora, llamar=llamar, maximo=2)
    assert n == 2  # v9 está al día; solo v1 y v2 por el tope
    assert cache["v1"]["imo"] == "123" and cache["v1"]["iuu_veces"] == 1 and "v3" not in cache
    assert llamadas == ["identidad", "insights", "insights"]  # identidad en un lote; insights uno por barco


def test_adjuntar_pone_revision_y_alerta():
    capas = {"encuentros": [{"properties": {"barco_a": {"gfw_id": "a"}, "barco_b": {"gfw_id": "b"}}}],
             "puertos": [{"properties": {"visitas": [{"gfw_id": "a"}, {"gfw_id": "z"}]}}], "merodeo": [{"properties": {"gfw_id": "b"}}]}
    cache = {"a": {"iuu_veces": 2, "revisado_utc": "x"}, "b": {"iuu_veces": 0}}
    G.adjuntar(capas, cache)
    e = capas["encuentros"][0]["properties"]
    assert e["barco_a"]["alerta"] and "revisado_utc" not in e["barco_a"]["revision"] and e["alerta"] == e["barco_a"]["alerta"]
    assert capas["puertos"][0]["properties"]["con_alerta"] == 1
    assert capas["merodeo"][0]["properties"]["alerta"] == ""
    ids = G.ids_a_revisar({"encuentros": capas["encuentros"], "merodeo": capas["merodeo"],
                           "apagados": [{"properties": {"gfw_id": "c", "horas": 100}}, {"properties": {"gfw_id": "d", "horas": 20}}]})
    assert ids == ["a", "b", "c"]
