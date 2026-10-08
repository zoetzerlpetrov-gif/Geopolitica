#!/usr/bin/env python3
"""Genera data/events.json y data/run-log.json con DATOS DE EJEMPLO (Fase 1).

Son hechos públicos y conocidos, clasificados a mano, para probar el mapa antes de
conectar la ingesta automática (Fase 2). Cada evento lleva "es_ejemplo": true y el
enlace apunta a una búsqueda en Wikipedia en español (no a un artículo de prensa),
para no atribuir a un medio un texto que no se ha verificado.

Uso:  python3 tools/make_sample_events.py
"""
import json
import os
import urllib.parse
from datetime import datetime, timedelta, timezone

ROOT = os.path.join(os.path.dirname(__file__), "..")


def wiki(q):
    return "https://es.wikipedia.org/w/index.php?search=" + urllib.parse.quote_plus(q)


# (id, fecha, titulo, resumen, iso3, region, lat, lon, principal, secundarias, subtemas,
#  actores, severidad, impacto_mexico, busqueda)
E = [
    ("mar-rojo-huties-2023", "2023-12-15T12:00:00Z",
     "Ataques hutíes en el Mar Rojo desvían navieras de Suez al Cabo de Buena Esperanza",
     "Tras ataques a buques comerciales cerca de Bab el-Mandeb, varias navieras suspendieron el tránsito por el Mar Rojo y rodearon África. El desvío alarga los viajes Asia–Europa y encarece fletes y seguros.",
     "YEM", "medio_oriente", 12.58, 43.33, "geografia", ["seguridad", "geoeconomia", "identidad"],
     ["chokepoints", "actores_no_estatales", "cadenas_suministro"],
     ["Hutíes (Ansar Allah)", "Navieras internacionales", "Estados Unidos", "Reino Unido", "Irán"], 4,
     "Insumos asiáticos con más días de tránsito y fletes más caros para manufactura en México.",
     "Crisis del mar Rojo"),
    ("finlandia-otan-2023", "2023-04-04T12:00:00Z",
     "Finlandia ingresa formalmente a la OTAN",
     "Finlandia se convirtió en el miembro 31 de la alianza tras abandonar su política de no alineamiento después de la invasión rusa de Ucrania. La frontera terrestre OTAN–Rusia se alarga unos 1,300 km.",
     "FIN", "europa_occidental", 60.17, 24.94, "seguridad", ["instituciones", "geografia"],
     ["alianzas"], ["Finlandia", "OTAN", "Rusia"], 3, None, "Finlandia OTAN adhesión"),
    ("suecia-otan-2024", "2024-03-07T12:00:00Z",
     "Suecia completa su adhesión a la OTAN",
     "Suecia entró a la alianza después de que Turquía y Hungría ratificaran su ingreso. Con ello casi todo el litoral del mar Báltico queda en países de la OTAN.",
     "SWE", "europa_occidental", 59.33, 18.07, "seguridad", ["instituciones", "geografia"],
     ["alianzas"], ["Suecia", "OTAN", "Turquía", "Hungría", "Rusia"], 3, None, "Suecia OTAN adhesión"),
    ("reservas-rusia-2022", "2022-02-28T12:00:00Z",
     "Congelan reservas del banco central de Rusia",
     "EUA, la UE y aliados bloquearon el acceso del Banco de Rusia a buena parte de sus reservas en el extranjero y excluyeron bancos rusos de SWIFT. Es un caso de referencia del uso del sistema financiero como arma.",
     "RUS", "europa_este_rusia", 55.75, 37.62, "geoeconomia", ["seguridad", "instituciones"],
     ["sanciones_financieras", "monedas_reserva"], ["Rusia", "Estados Unidos", "Unión Europea", "Banco de Rusia"], 4,
     "Due diligence de proveedores con vínculos rusos y revisión de listas de sanciones en operaciones de comercio exterior.",
     "Sanciones internacionales durante la invasión rusa de Ucrania"),
    ("chips-controles-2022", "2022-10-07T12:00:00Z",
     "EUA restringe la venta de chips avanzados y equipo de fabricación a China",
     "El Departamento de Comercio de EUA impuso controles de exportación sobre semiconductores avanzados y herramientas para producirlos con destino a China. Las reglas se ampliaron en 2023 y 2024.",
     "USA", "norteamerica", 38.9, -77.04, "tecnologia", ["geoeconomia", "seguridad"],
     ["semiconductores", "controles_exportacion"], ["Estados Unidos", "China", "Nvidia", "TSMC"], 4,
     "Inferencia: puede favorecer ensamble y pruebas de electrónica en México si las reglas de origen se alinean con EUA.",
     "Controles de exportación de semiconductores Estados Unidos China"),
    ("nord-stream-2022", "2022-09-26T12:00:00Z",
     "Explosiones dañan los gasoductos Nord Stream en el mar Báltico",
     "Fugas por explosiones submarinas inutilizaron tres de las cuatro líneas de Nord Stream 1 y 2 cerca de la isla de Bornholm. La autoría sigue en disputa.",
     "DNK", "europa_occidental", 55.5, 15.7, "energia", ["seguridad", "geoeconomia"],
     ["petroleo_gas", "seguridad_energetica"], ["Rusia", "Alemania", "Dinamarca", "Suecia"], 4, None,
     "Sabotaje de los gasoductos Nord Stream"),
    ("panama-sequia-2023", "2023-08-01T12:00:00Z",
     "Sequía obliga a limitar tránsitos y calado en el Canal de Panamá",
     "Desde mediados de 2023, el bajo nivel del lago Gatún llevó a la Autoridad del Canal a reducir tránsitos diarios y el calado permitido. Navieras ajustaron rutas y cargas.",
     "PAN", "centroamerica_caribe", 9.08, -79.68, "clima", ["geografia", "geoeconomia"],
     ["sequias_agua", "chokepoints"], ["Autoridad del Canal de Panamá", "Navieras"], 3,
     "Inferencia: rutas Asia–Golfo de México más lentas; los puertos mexicanos del Pacífico y el ferrocarril ganan peso como alternativa.",
     "Canal de Panamá sequía 2023"),
    ("india-poblacion-2023", "2023-04-30T12:00:00Z",
     "India supera a China como el país más poblado (estimación ONU)",
     "Según estimaciones de la ONU, India superó a China en población hacia finales de abril de 2023. China, en cambio, registra caída de población desde 2022.",
     "IND", "asia_sur", 28.61, 77.21, "demografia", ["geoeconomia"],
     ["bono_demografico"], ["India", "China", "ONU"], 2, None, "Demografía de India"),
    ("mexico-litio-2022", "2022-04-20T12:00:00Z",
     "México declara el litio de utilidad pública y reserva su explotación al Estado",
     "Una reforma a la Ley Minera publicada en abril de 2022 declaró el litio de utilidad pública y creó las bases para un organismo estatal que lo explote.",
     "MEX", "norteamerica", 29.8, -109.14, "energia", ["geoeconomia", "tecnologia"],
     ["minerales_criticos"], ["Gobierno de México", "Empresas mineras"], 3,
     "Define quién puede explotar el litio en México y condiciona la inversión privada en la cadena de baterías.",
     "Litio para México"),
    ("omc-apelacion-2019", "2019-12-11T12:00:00Z",
     "El Órgano de Apelación de la OMC queda paralizado",
     "Al vencer el mandato de sus miembros sin reemplazo, por el bloqueo de EUA a los nombramientos, el órgano se quedó sin quórum. Las disputas comerciales ya no tienen una segunda instancia operativa.",
     "CHE", "europa_occidental", 46.22, 6.14, "instituciones", ["geoeconomia"],
     ["omc_controversias"], ["OMC", "Estados Unidos"], 2, None, "Órgano de Apelación de la OMC"),
    ("remesas-mexico-2023", "2024-02-01T12:00:00Z",
     "Remesas a México superan los 60 mil millones de dólares en 2023 (Banxico)",
     "Banco de México reportó ingresos por remesas por encima de 60 mil millones de USD en 2023, la mayoría desde EUA.",
     "MEX", "norteamerica", 19.43, -99.13, "demografia", ["geoeconomia"],
     ["remesas", "migracion_refugiados"], ["Banxico", "Migrantes mexicanos en EUA"], 2,
     "Fuente relevante de divisas y consumo en estados con alta migración.", "Remesas en México"),
    ("tratado-aguas-1944-ciclo-2025", "2025-10-24T12:00:00Z",
     "Cierra el ciclo 2020–2025 del Tratado de Aguas de 1944 con entregas pendientes de México",
     "El ciclo quinquenal de entregas de agua del río Bravo a EUA terminó con un déficit de México, en medio de sequía en Chihuahua. El tema se mezcla con la agenda comercial bilateral.",
     "MEX", "norteamerica", 27.54, -105.41, "energia", ["clima", "instituciones"],
     ["agua_transfronteriza", "sequias_agua"], ["México", "Estados Unidos", "CILA/IBWC", "Productores de Chihuahua"], 3,
     "Riesgo de presión comercial de EUA y de conflicto local por agua en el norte.", "Tratado de Aguas de 1944"),
    ("tmec-revision-2026", "2026-07-01T12:00:00Z",
     "Fecha prevista de la revisión conjunta del T-MEC",
     "El artículo 34.7 del tratado prevé una revisión conjunta en el sexto aniversario de su entrada en vigor (1 de julio de 2026). En ella los tres países deciden si extienden su vigencia.",
     "MEX", "norteamerica", 19.43, -99.13, "geoeconomia", ["instituciones", "riesgo"],
     ["tratados_comerciales", "aranceles"], ["México", "Estados Unidos", "Canadá"], 4,
     "Define reglas de origen, aranceles y certidumbre para la inversión exportadora.", "Tratado entre México, Estados Unidos y Canadá"),
    ("taiwan-ejercicios-2024", "2024-05-23T12:00:00Z",
     "China realiza ejercicios militares alrededor de Taiwán (Joint Sword-2024A)",
     "El Ejército Popular de Liberación desplegó buques y aviones alrededor de la isla días después de la investidura del presidente Lai Ching-te.",
     "TWN", "indopacifico_taiwan", 23.7, 121.0, "seguridad", ["geografia", "identidad"],
     ["ejercicios_despliegues", "islas_mares_disputa"], ["China", "Taiwán", "Estados Unidos"], 4,
     "Inferencia: un bloqueo del estrecho afectaría el abasto de semiconductores a la industria automotriz y electrónica en México.",
     "Estrecho de Taiwán ejercicios militares 2024"),
    ("sahel-cedeao-2024", "2024-01-28T12:00:00Z",
     "Mali, Burkina Faso y Níger anuncian su salida de la CEDEAO",
     "Las tres juntas militares del Sahel anunciaron su retiro del bloque regional de África Occidental y luego formaron la Alianza de Estados del Sahel.",
     "MLI", "africa_norte_sahel", 14.5, -2.0, "regional", ["instituciones", "seguridad"],
     ["africa_norte_sahel", "cumbres"], ["Mali", "Burkina Faso", "Níger", "CEDEAO", "Rusia"], 3, None,
     "Alianza de Estados del Sahel"),
    ("groenlandia-eua-2025", "2025-01-07T12:00:00Z",
     "El gobierno entrante de EUA reitera su interés en Groenlandia",
     "Donald Trump, entonces presidente electo, no descartó medidas económicas ni militares para obtener Groenlandia. Dinamarca y el gobierno groenlandés rechazaron la idea.",
     "GRL", "artico", 64.18, -51.72, "geografia", ["seguridad", "regional", "energia"],
     ["artico", "disputas_fronterizas"], ["Estados Unidos", "Dinamarca", "Groenlandia"], 2, None, "Groenlandia Estados Unidos 2025"),
    ("georgia-agentes-extranjeros-2024", "2024-05-14T12:00:00Z",
     "Georgia aprueba la ley de 'agentes extranjeros' entre protestas masivas",
     "El Parlamento aprobó la ley pese a manifestaciones en Tiflis. Críticos la comparan con la legislación rusa y la UE advirtió que afecta la candidatura de Georgia.",
     "GEO", "europa_este_rusia", 41.72, 44.79, "identidad", ["instituciones"],
     ["protestas", "censura_prensa"], ["Gobierno de Georgia", "Manifestantes", "Unión Europea", "Rusia"], 3, None,
     "Ley de transparencia de la influencia extranjera Georgia"),
    ("colonial-pipeline-2021", "2021-05-07T12:00:00Z",
     "Ciberataque de ransomware detiene el oleoducto Colonial en EUA",
     "La empresa paró el ducto que abastece de combustibles a la costa este de EUA durante varios días. El caso se volvió referencia de riesgo cibernético en infraestructura crítica.",
     "USA", "norteamerica", 34.07, -84.29, "tecnologia", ["energia", "seguridad"],
     ["ciberataques"], ["Colonial Pipeline", "DarkSide"], 3, None, "Ciberataque a Colonial Pipeline"),
    ("sudan-guerra-2023", "2023-04-15T12:00:00Z",
     "Estalla la guerra entre el ejército de Sudán y las Fuerzas de Apoyo Rápido",
     "Los combates comenzaron en Jartum y se extendieron a Darfur. El conflicto generó una de las mayores crisis de desplazamiento del mundo.",
     "SDN", "africa_norte_sahel", 15.5, 32.56, "seguridad", ["demografia", "regional"],
     ["conflictos_activos", "desplazados_internos"], ["Fuerzas Armadas de Sudán", "Fuerzas de Apoyo Rápido"], 5, None,
     "Guerra civil de Sudán 2023"),
    ("gaza-guerra-2023", "2023-10-07T12:00:00Z",
     "Ataque de Hamás contra Israel inicia la guerra en Gaza",
     "Tras el ataque del 7 de octubre, Israel lanzó una ofensiva sobre Gaza. La guerra tuvo efectos regionales, entre ellos los ataques hutíes en el Mar Rojo.",
     "PSE", "medio_oriente", 31.5, 34.47, "seguridad", ["identidad", "instituciones"],
     ["conflictos_activos", "actores_no_estatales"], ["Israel", "Hamás", "Estados Unidos", "Irán"], 5, None,
     "Guerra de Israel y Hamás"),
    ("cop28-2023", "2023-12-13T12:00:00Z",
     "La COP28 acuerda 'transitar fuera' de los combustibles fósiles",
     "La cumbre de Dubái cerró con un texto que por primera vez llama a alejarse de los combustibles fósiles en los sistemas energéticos, sin fijar una eliminación obligatoria.",
     "ARE", "medio_oriente", 25.2, 55.27, "clima", ["instituciones", "energia"],
     ["acuerdos_climaticos", "transicion_energetica"], ["ONU", "Emiratos Árabes Unidos", "OPEP"], 2, None,
     "Conferencia de las Naciones Unidas sobre el Cambio Climático de 2023"),
    ("opep-recortes-2023", "2023-04-02T12:00:00Z",
     "Países de la OPEP+ anuncian recortes voluntarios de producción de petróleo",
     "Arabia Saudita y otros productores anunciaron recortes adicionales por más de un millón de barriles diarios. El precio del crudo subió tras el anuncio.",
     "SAU", "medio_oriente", 24.71, 46.68, "energia", ["geoeconomia"],
     ["petroleo_gas"], ["Arabia Saudita", "OPEP+", "Rusia"], 3,
     "Afecta precios de combustibles importados y los ingresos petroleros del gobierno.", "OPEP+ recorte producción 2023"),
    ("aranceles-eua-mexico-2025", "2025-02-01T12:00:00Z",
     "EUA ordena aranceles de 25 % a importaciones de México y Canadá",
     "Una orden ejecutiva impuso aranceles citando fentanilo y migración. El 3 de febrero se pausaron 30 días tras acuerdos de seguridad fronteriza.",
     "USA", "norteamerica", 38.9, -77.04, "geoeconomia", ["riesgo", "seguridad"],
     ["aranceles", "tratados_comerciales"], ["Estados Unidos", "México", "Canadá"], 4,
     "Riesgo directo para exportadores: costo arancelario, reglas de origen y continuidad de contratos.",
     "Aranceles de Estados Unidos a México 2025"),
    ("titulo-42-fin-2023", "2023-05-11T12:00:00Z",
     "Termina el Título 42 en la frontera EUA–México",
     "Concluyó la medida sanitaria que permitía expulsiones rápidas de migrantes. EUA volvió a aplicar el Título 8 con nuevas restricciones de asilo.",
     "USA", "norteamerica", 31.76, -106.48, "demografia", ["instituciones", "seguridad"],
     ["migracion_refugiados"], ["Estados Unidos", "México", "Migrantes"], 3,
     "Mayor presión sobre ciudades fronterizas mexicanas y albergues.", "Título 42 Estados Unidos"),
    ("cables-baltico-2024", "2024-11-18T12:00:00Z",
     "Dañan dos cables submarinos de telecomunicaciones en el mar Báltico",
     "Se cortaron los cables Finlandia–Alemania y Lituania–Suecia en menos de 24 horas. Las autoridades investigaron a un buque de carga que pasó por la zona.",
     "SWE", "europa_occidental", 56.9, 18.9, "tecnologia", ["seguridad", "geografia"],
     ["cables_submarinos", "guerra_hibrida"], ["Finlandia", "Alemania", "Lituania", "Suecia", "China"], 3, None,
     "Cables submarinos mar Báltico 2024"),
    ("cpi-putin-2023", "2023-03-17T12:00:00Z",
     "La Corte Penal Internacional emite orden de arresto contra Vladímir Putin",
     "La CPI acusa la deportación ilegal de niños ucranianos. Rusia no reconoce la jurisdicción de la Corte.",
     "NLD", "europa_occidental", 52.08, 4.31, "instituciones", ["seguridad", "identidad"],
     ["cortes_internacionales"], ["Corte Penal Internacional", "Rusia", "Ucrania"], 3, None,
     "Orden de arresto de la Corte Penal Internacional contra Vladímir Putin"),
    ("monterrey-agua-2022", "2022-06-15T12:00:00Z",
     "Crisis de agua en Monterrey obliga a cortes de suministro",
     "La sequía dejó presas en niveles muy bajos y el área metropolitana operó con horarios de suministro. El uso industrial del agua entró al debate público.",
     "MEX", "norteamerica", 25.67, -100.31, "riesgo", ["clima", "energia"],
     ["continuidad_negocio", "escenarios_impacto"], ["Gobierno de Nuevo León", "Industria", "CONAGUA"], 3,
     "Caso de continuidad de negocio: plantas del norte con dependencia de agua y riesgo reputacional.",
     "Crisis del agua en Monterrey 2022"),
    ("tesla-nuevo-leon-2023", "2023-03-01T12:00:00Z",
     "Tesla anuncia una planta en Nuevo León",
     "La empresa anunció una fábrica en Santa Catarina, uno de los casos más citados del nearshoring en México.",
     "MEX", "norteamerica", 25.68, -100.46, "geoeconomia", ["riesgo", "energia"],
     ["nearshoring"], ["Tesla", "Gobierno de México", "Gobierno de Nuevo León"], 2,
     "Muestra el atractivo del norte para inversión y la presión sobre agua y energía.", "Tesla Nuevo León"),
    ("apagon-iberico-2025", "2025-04-28T12:00:00Z",
     "Apagón masivo deja sin electricidad a España y Portugal",
     "Una caída de la red eléctrica ibérica detuvo trenes, telecomunicaciones y pagos durante horas. Las causas se investigaron durante meses.",
     "ESP", "europa_occidental", 40.42, -3.70, "infraestructura", ["energia", "tecnologia"],
     ["centrales_infra", "caidas_internet", "electricidad"], ["Red Eléctrica de España", "REN (Portugal)", "Gobierno de España"], 4,
     "Referencia para planes de continuidad de plantas mexicanas ante fallas de la red eléctrica.", "Apagón eléctrico en la península ibérica de 2025"),
    ("mpox-oms-2024", "2024-08-14T12:00:00Z",
     "La OMS declara el mpox emergencia de salud pública de importancia internacional",
     "La declaración respondió al aumento de casos de una nueva variante en la República Democrática del Congo y países vecinos.",
     "COD", "africa_subsahariana", -4.32, 15.31, "salud_nrbq", ["instituciones", "demografia"],
     ["brotes", "alertas_oms"], ["OMS", "República Democrática del Congo"], 3,
     "Activa vigilancia epidemiológica en puertos y aeropuertos mexicanos.", "Mpox emergencia de salud pública 2024"),
]


def build():
    eventos = []
    for (eid, fecha, titulo, resumen, iso3, region, lat, lon, principal, secundarias,
         subtemas, actores, sev, impacto, busqueda) in E:
        url = wiki(busqueda)
        fuentes = [{"fuente": "Wikipedia (búsqueda)", "url": url, "tipo_fuente": "analisis", "fecha_utc": fecha}]
        if eid == "mar-rojo-huties-2023":
            # Demuestra la deduplicación: un hecho, varias fuentes.
            fuentes.append({"fuente": "Wikipedia (búsqueda, inglés)",
                            "url": "https://en.wikipedia.org/w/index.php?search=Red+Sea+crisis",
                            "tipo_fuente": "analisis", "fecha_utc": fecha})
        eventos.append({
            "id": eid, "fecha_utc": fecha, "titulo": titulo, "resumen": resumen,
            "fuente": fuentes[0]["fuente"], "url": url, "tipo_fuente": "analisis",
            "pais_iso3": iso3, "region": region, "lat": lat, "lon": lon,
            "area_principal": principal, "areas_secundarias": secundarias, "subtemas": subtemas,
            "actores": actores, "severidad": sev, "confianza_clasificacion": 1.0,
            "verificado": True, "impacto_mexico": impacto, "fuentes": fuentes, "es_ejemplo": True,
        })
    eventos.sort(key=lambda e: e["fecha_utc"], reverse=True)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(os.path.join(ROOT, "data", "events.json"), "w", encoding="utf-8") as f:
        json.dump({"version_esquema": "1.0", "generado_utc": stamp, "modo": "ejemplo",
                   "total": len(eventos), "eventos": eventos}, f, ensure_ascii=False, indent=1)

    nxt = now.replace(minute=17, second=0)
    if nxt <= now:
        nxt += timedelta(hours=1)
    with open(os.path.join(ROOT, "data", "run-log.json"), "w", encoding="utf-8") as f:
        json.dump({
            "generado_utc": stamp, "modo": "ejemplo",
            "cron": "17 * * * *", "intervalo_minutos": 60,
            "proxima_ejecucion_utc": nxt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "eventos_total": len(eventos), "eventos_nuevos": len(eventos),
            "fuentes": [{"id": "ejemplo", "nombre": "Datos de ejemplo (tools/make_sample_events.py)",
                         "estado": "ok", "eventos": len(eventos), "segundos": 0, "error": None}],
            "errores": [],
        }, f, ensure_ascii=False, indent=2)
    print(f"events.json: {len(eventos)} eventos de ejemplo")


if __name__ == "__main__":
    build()
