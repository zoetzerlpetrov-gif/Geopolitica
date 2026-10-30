"""Genera config/economia.json (catálogo de indicadores de la sección Economía, solo admin).

Se edita aquí y se corre `python3 tools/economia/catalogo_economia.py`: así los textos quedan en un solo lugar y con la misma forma.
Cada indicador: región (MX, US, EU, GL), grupo (macro, consumo, curioso), lectura (sube_bien, sube_mal, neutral),
confiabilidad (oficial, aproximacion, anecdota) y fuente (tipo e identificador verificados con la API el 30-oct-2026).
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

FRED = "https://fred.stlouisfed.org/series/"
EUROSTAT = "https://ec.europa.eu/eurostat/databrowser/view/"
INEGI = "https://www.inegi.org.mx/app/indicadores/"
BANXICO = "https://www.banxico.org.mx/SieInternet/"


def fred(id_):
    return {"tipo": "fred", "id": id_, "enlace": FRED + id_, "nombre": f"FRED · {id_}"}


def euro(dataset, **params):
    return {"tipo": "eurostat", "dataset": dataset, "params": {"geo": "EU27_2020", **params}, "enlace": EUROSTAT + dataset, "nombre": f"Eurostat · {dataset}"}


def inegi(id_, fuente="BISE", nombre="INEGI", trimestral=False):
    return {"tipo": "inegi", "id": id_, "fuente_inegi": fuente, "enlace": INEGI, "nombre": f"{nombre} · {id_}", "trimestral": trimestral}


def banxico(id_):
    return {"tipo": "banxico", "id": id_, "enlace": BANXICO, "nombre": f"Banxico SIE · {id_}"}


def ind(id_, region, grupo, nombre, que_mide, lectura, fuente, unidad, freq, conf="oficial", transform="nivel", como_leer=""):
    return {"id": id_, "region": region, "grupo": grupo, "nombre": nombre, "que_mide": que_mide, "como_leer": como_leer, "lectura": lectura,
            "confiabilidad": conf, "fuente": fuente, "unidad": unidad, "frecuencia": freq, "transform": transform}


EURO_VENTAS = dict(indic_bt="VOL_SLS", s_adj="SCA", unit="PCH_PRE")
INDICADORES = [
    # ------------------------------------------------------------------ México
    ind("mx_desempleo", "MX", "macro", "Tasa de desempleo", "Porcentaje de la población activa que busca trabajo y no lo tiene.", "sube_mal",
        fred("LRHUTTTTMXM156S"), "%", "mensual", como_leer="En México es baja porque mucha gente trabaja en la informalidad: hay que verla junto con el empleo informal."),
    ind("mx_empleo", "MX", "macro", "Personal ocupado (todos los sectores)", "Índice de personas trabajando en construcción, industria, comercio y servicios (encuestas de INEGI).", "sube_bien",
        inegi("702094", nombre="INEGI"), "índice", "mensual"),
    ind("mx_bono10", "MX", "macro", "Tasa del bono a 10 años", "Lo que cobra el mercado por prestarle al gobierno de México a 10 años.", "neutral",
        fred("IRLTLT01MXM156N"), "%", "mensual", como_leer="Si sube mucho, el crédito de largo plazo (hipotecas) se encarece."),
    ind("mx_informal", "MX", "macro", "Población ocupada en el sector informal", "Personas que trabajan en negocios sin registro (puestos, oficios por cuenta propia).", "sube_mal",
        inegi("6200093709", nombre="INEGI ENOE", trimestral=True), "personas", "trimestral"),
    ind("mx_menudeo", "MX", "consumo", "Comercio al menudeo (variación mensual)", "Cuánto cambian las ventas de las tiendas respecto al mes anterior.", "sube_bien",
        fred("MEXPRMNTO01GPSAM"), "% vs. mes anterior", "mensual"),
    ind("mx_inflacion", "MX", "macro", "Inflación anual (INPC)", "Cuánto subieron los precios al consumidor en 12 meses.", "sube_mal",
        banxico("SP30578"), "% anual", "mensual", como_leer="La meta de Banxico es 3 % (±1). Arriba de 4 % los salarios rinden menos."),
    ind("mx_tasa", "MX", "macro", "Tasa objetivo de Banxico", "Tasa a la que el banco central presta a los bancos; de ella dependen créditos y rendimientos.", "neutral",
        banxico("SF61745"), "%", "diaria", como_leer="Cuando baja, el crédito se abarata y la economía se estimula; cuando sube, se frena la inflación."),
    ind("mx_fix", "MX", "macro", "Tipo de cambio FIX", "Pesos que cuesta un dólar (tipo oficial de Banxico).", "sube_mal",
        banxico("SF43718"), "MXN por USD", "diaria", como_leer="Un peso más débil encarece lo importado; ayuda a quien recibe dólares (exportadores, remesas)."),
    ind("mx_remesas", "MX", "consumo", "Remesas familiares", "Dinero que envían a México quienes trabajan en el extranjero.", "sube_bien",
        banxico("SE27803"), "millones de USD", "mensual", como_leer="Sostienen el consumo de millones de hogares; dependen del empleo de los migrantes en EUA."),
    ind("mx_salario_min", "MX", "consumo", "Salario mínimo general", "Pago mínimo legal por día de trabajo.", "sube_bien",
        banxico("SL11298"), "pesos por día", "anual"),
    ind("mx_abarrotes", "MX", "consumo", "Ventas: abarrotes y alimentos", "Ingresos del comercio al por menor de abarrotes (despensa).", "sube_bien",
        inegi("720066", nombre="INEGI EMEC"), "índice 2013=100", "mensual"),
    ind("mx_autoservicio", "MX", "consumo", "Ventas: tiendas de autoservicio", "Supermercados y tiendas de conveniencia.", "sube_bien",
        inegi("720069", nombre="INEGI EMEC"), "índice 2013=100", "mensual"),
    ind("mx_departamentales", "MX", "consumo", "Ventas: tiendas departamentales", "Grandes almacenes (ropa, hogar, electrónica).", "sube_bien",
        inegi("720070", nombre="INEGI EMEC"), "índice 2013=100", "mensual"),
    ind("mx_ropa", "MX", "consumo", "Ventas: ropa, bisutería y accesorios", "Una compra que se puede aplazar: cae pronto cuando el dinero no alcanza.", "sube_bien",
        inegi("720073", nombre="INEGI EMEC"), "índice 2013=100", "mensual"),
    ind("mx_farmacia", "MX", "consumo", "Ventas: salud y farmacia", "Medicinas y artículos de salud.", "neutral",
        inegi("720076", nombre="INEGI EMEC"), "índice 2013=100", "mensual"),
    ind("mx_muebles", "MX", "consumo", "Ventas: muebles para el hogar", "Compras grandes y casi siempre a crédito.", "sube_bien",
        inegi("720083", nombre="INEGI EMEC"), "índice 2013=100", "mensual"),
    ind("mx_combustibles", "MX", "consumo", "Ventas: combustibles y lubricantes", "Gasolina y diésel vendidos al menudeo: movimiento de personas y mercancías.", "sube_bien",
        inegi("720093", nombre="INEGI EMEC"), "índice 2013=100", "mensual"),
    ind("mx_fondas", "MX", "curioso", "Índice de fondas y restaurantes (confianza)", "Confianza de los dueños de restaurantes, fondas y hoteles sobre su negocio (encuesta mensual de INEGI).", "sube_bien",
        inegi("701980", nombre="INEGI ICE"), "puntos (50 = neutral)", "mensual", conf="aproximacion",
        como_leer="Arriba de 50 = más optimistas que pesimistas. No hay una serie pública solo de fondas o taquerías: esta es la más cercana. Cifras originales (con estacionalidad)."),
    ind("mx_confianza_comercio", "MX", "consumo", "Confianza de los comerciantes al menudeo", "Optimismo de los dueños de tiendas sobre ventas e inversión.", "sube_bien",
        inegi("701850", nombre="INEGI ICE"), "puntos (50 = neutral)", "mensual"),
    ind("mx_esparcimiento", "MX", "curioso", "Índice del entretenimiento", "Ventas al menudeo de artículos para el esparcimiento (juguetes, deportes, música, libros).", "sube_bien",
        inegi("720079", nombre="INEGI EMEC"), "índice 2013=100", "mensual", conf="aproximacion",
        como_leer="Gasto que se recorta primero cuando el dinero no alcanza."),
    ind("mx_autos", "MX", "curioso", "Índice de la agencia de autos", "Ingresos del comercio al por menor de automóviles y camionetas.", "sube_bien",
        inegi("720090", nombre="INEGI EMEC"), "índice 2013=100", "mensual", conf="aproximacion",
        como_leer="Compra grande y casi siempre a crédito: refleja confianza y acceso a financiamiento."),
    # ------------------------------------------------------------------ Estados Unidos
    ind("us_pib", "US", "macro", "Crecimiento del PIB real", "Cuánto creció la economía en el trimestre (tasa anualizada).", "sube_bien",
        fred("A191RL1Q225SBEA"), "% anualizado", "trimestral", como_leer="Dos trimestres seguidos negativos se suelen llamar «recesión técnica»."),
    ind("us_desempleo", "US", "macro", "Tasa de desempleo", "Porcentaje de la población activa sin trabajo.", "sube_mal", fred("UNRATE"), "%", "mensual"),
    ind("us_sahm", "US", "macro", "Regla de Sahm", "Cuánto subió el desempleo promedio de 3 meses sobre su mínimo del último año.", "sube_mal",
        fred("SAHMREALTIME"), "puntos", "mensual", como_leer="Desde 1970, cada vez que llegó a 0.5 la economía ya estaba en recesión."),
    ind("us_curva", "US", "macro", "Curva de rendimientos (10 años − 2 años)", "Diferencia entre la tasa del bono a 10 años y la del bono a 2 años.", "sube_bien",
        fred("T10Y2Y"), "puntos porcentuales", "diaria", como_leer="Negativa (invertida) = el mercado espera tasas más bajas porque teme una desaceleración; ha precedido a las últimas recesiones."),
    ind("us_tasa", "US", "macro", "Tasa de fondos federales", "Tasa de referencia de la Reserva Federal.", "neutral", fred("FEDFUNDS"), "%", "mensual"),
    ind("us_inflacion", "US", "macro", "Inflación anual (CPI)", "Cuánto subieron los precios al consumidor en 12 meses.", "sube_mal",
        fred("CPIAUCSL"), "% anual", "mensual", transform="anual", como_leer="La meta de la Fed es 2 %."),
    ind("us_industria", "US", "macro", "Producción industrial", "Volumen producido por fábricas, minas y electricidad.", "sube_bien", fred("INDPRO"), "índice 2017=100", "mensual"),
    ind("us_confianza", "US", "consumo", "Confianza del consumidor (U. Michigan)", "Cómo ven los hogares su situación y la del país.", "sube_bien", fred("UMCSENT"), "índice 1966=100", "mensual"),
    ind("us_ventas", "US", "consumo", "Ventas al menudeo reales", "Ventas de las tiendas descontando la inflación.", "sube_bien", fred("RRSFS"), "millones de USD de 1982-84", "mensual"),
    ind("us_ahorro", "US", "consumo", "Tasa de ahorro personal", "Parte del ingreso disponible que los hogares no gastan.", "neutral", fred("PSAVERT"), "% del ingreso", "mensual",
        como_leer="Muy baja = poco colchón ante una crisis; si sube de golpe, suele ser por miedo a perder ingresos."),
    ind("us_deuda", "US", "consumo", "Servicio de deuda de los hogares", "Parte del ingreso que se va en pagar deudas.", "sube_mal", fred("TDSP"), "% del ingreso", "trimestral"),
    ind("us_morosidad", "US", "consumo", "Morosidad en tarjetas de crédito", "Porcentaje de saldos de tarjetas con pagos atrasados.", "sube_mal", fred("DRCCLACBS"), "%", "trimestral"),
    ind("us_negocios", "US", "consumo", "Solicitudes para abrir negocios", "Trámites para crear empresas nuevas.", "sube_bien", fred("BABATOTALSAUS"), "solicitudes", "mensual"),
    ind("us_super", "US", "consumo", "Ventas: supermercados", "Gasto en comida para preparar en casa.", "neutral", fred("MRTSSM4451USS"), "millones de USD", "mensual"),
    ind("us_restaurantes", "US", "consumo", "Ventas: restaurantes y bares", "Gasto en comer fuera; se recorta cuando el dinero no alcanza.", "sube_bien", fred("MRTSSM722USS"), "millones de USD", "mensual"),
    ind("us_enlinea", "US", "consumo", "Ventas: comercio en línea", "Ventas sin tienda física.", "sube_bien", fred("MRTSSM454USS"), "millones de USD", "mensual"),
    ind("us_ropa", "US", "consumo", "Ventas: tiendas de ropa", "Compra aplazable.", "sube_bien", fred("MRTSSM448USS"), "millones de USD", "mensual"),
    # ------------------------------------------------------------------ Unión Europea
    ind("eu_pib", "EU", "macro", "Crecimiento del PIB (trimestral)", "Cuánto creció la economía de la UE respecto al trimestre anterior.", "sube_bien",
        euro("namq_10_gdp", na_item="B1GQ", unit="CLV_PCH_PRE", s_adj="SCA"), "% vs. trimestre anterior", "trimestral"),
    ind("eu_desempleo", "EU", "macro", "Tasa de desempleo", "Porcentaje de la población activa sin trabajo (27 países).", "sube_mal",
        euro("une_rt_m", s_adj="SA", age="TOTAL", sex="T", unit="PC_ACT"), "%", "mensual"),
    ind("eu_inflacion", "EU", "macro", "Inflación anual (HICP)", "Cuánto subieron los precios en 12 meses (índice armonizado).", "sube_mal",
        euro("prc_hicp_minr", coicop18="TOTAL", unit="RCH_A"), "% anual", "mensual", como_leer="La meta del BCE es 2 %. Desde 2026 Eurostat usa la clasificación COICOP 2018."),
    ind("eu_sentimiento", "EU", "macro", "Sentimiento económico (ESI)", "Encuesta a empresas y consumidores; 100 = promedio de largo plazo.", "sube_bien",
        euro("ei_bssi_m_r2", indic="BS-ESI-I", s_adj="SA"), "índice (100 = promedio)", "mensual"),
    ind("eu_industria", "EU", "macro", "Producción industrial", "Volumen producido por la industria.", "sube_bien",
        euro("sts_inpr_m", nace_r2="B-D", s_adj="SCA", unit="I21", indic_bt="PRD"), "índice 2021=100", "mensual"),
    ind("eu_menudeo", "EU", "consumo", "Ventas al menudeo (variación mensual)", "Cambio de las ventas de las tiendas respecto al mes anterior.", "sube_bien",
        euro("sts_trtu_m", nace_r2="G47", **EURO_VENTAS), "% vs. mes anterior", "mensual"),
    ind("eu_confianza", "EU", "consumo", "Confianza del consumidor", "Saldo de respuestas optimistas menos pesimistas.", "sube_bien",
        euro("ei_bsco_m", indic="BS-CSMCI", s_adj="SA"), "saldo (puntos)", "mensual"),
    ind("eu_grandes_compras", "EU", "consumo", "Intención de grandes compras (12 meses)", "Cuántos hogares piensan comprar auto, muebles o aparatos.", "sube_bien",
        euro("ei_bsco_m", indic="BS-MP-NY", s_adj="SA"), "saldo (puntos)", "mensual"),
    ind("eu_ahorro", "EU", "consumo", "Intención de ahorrar (12 meses)", "Cuántos hogares planean ahorrar; sube cuando hay miedo.", "neutral",
        euro("ei_bsco_m", indic="BS-SV-NY", s_adj="SA"), "saldo (puntos)", "mensual"),
    ind("eu_turismo", "EU", "consumo", "Noches en hoteles y alojamientos", "Noches pasadas por turistas en la UE.", "sube_bien",
        euro("tour_occ_nim", c_resid="TOTAL", nace_r2="I551-I553", unit="NR"), "noches", "mensual", como_leer="Tiene mucha estacionalidad: compara contra el mismo mes del año anterior."),
    # ------------------------------------------------------------------ Índices curiosos con datos
    ind("bigmac_mx", "MX", "curioso", "Índice Big Mac · México", "Cuánto cuesta un Big Mac en México convertido a dólares, comparado con EUA.", "neutral",
        {"tipo": "bigmac", "iso": "MEX", "enlace": "https://github.com/TheEconomist/big-mac-data", "nombre": "The Economist (licencia MIT)"},
        "% sobre o bajo el valor justo vs. USD", "semestral",
        como_leer="Negativo = el peso está «barato» (subvaluado) frente al dólar; positivo = «caro». Ignora diferencias de salarios y rentas."),
    ind("bigmac_eu", "EU", "curioso", "Índice Big Mac · zona euro", "Lo mismo para el euro.", "neutral",
        {"tipo": "bigmac", "iso": "EUZ", "enlace": "https://github.com/TheEconomist/big-mac-data", "nombre": "The Economist (licencia MIT)"},
        "% sobre o bajo el valor justo vs. USD", "semestral"),
    ind("bigmac_us", "US", "curioso", "Precio del Big Mac en EUA", "Precio en dólares (referencia del índice).", "sube_mal",
        {"tipo": "bigmac", "iso": "USA", "campo": "dollar_price", "enlace": "https://github.com/TheEconomist/big-mac-data", "nombre": "The Economist (licencia MIT)"},
        "USD", "semestral"),
    ind("gscpi", "GL", "curioso", "Presión en cadenas de suministro (GSCPI)", "Junta fletes marítimos y aéreos (incluido el Báltico Seco) y encuestas de tiempos de entrega y faltantes.", "sube_mal",
        {"tipo": "gscpi", "enlace": "https://www.newyorkfed.org/research/policy/gscpi", "nombre": "Fed de Nueva York"}, "desviaciones estándar", "mensual",
        como_leer="0 = normal. Arriba de 1 = cuellos de botella (en 2021 llegó a 4.3). Negativo = sobra capacidad."),
    ind("us_cajas", "US", "curioso", "Índice de cajas de cartón", "Producción de productos de papel convertido (cajas y contenedores de cartón): casi todo lo que se vende se envía en caja.", "sube_bien",
        fred("IPG3222S"), "índice 2017=100", "mensual", conf="aproximacion"),
    ind("us_labial", "US", "curioso", "Índice del lápiz labial (precio de cosméticos)", "Precio de cosméticos, perfumes y artículos de uñas en la inflación de EUA. La idea original (Leonard Lauder, 2001) usaba las ventas, que no se publican.", "neutral",
        fred("CUUR0000SEGB02"), "% anual", "mensual", conf="aproximacion", transform="anual",
        como_leer="Si sube más que la inflación general, hay demanda de «lujos pequeños»."),
    ind("us_palomitas", "US", "curioso", "Índice de palomitas (precio de cine y espectáculos)", "Precio de entradas a cine, teatro y conciertos.", "neutral",
        fred("CUSR0000SERF01"), "% anual", "mensual", conf="aproximacion", transform="anual"),
    ind("eu_cajas", "EU", "curioso", "Índice de cajas de cartón · UE", "Producción de la industria del papel y cartón.", "sube_bien",
        euro("sts_inpr_m", nace_r2="C17", s_adj="SCA", unit="I21", indic_bt="PRD"), "índice 2021=100", "mensual", conf="aproximacion"),
    ind("us_tren", "US", "curioso", "Carga ferroviaria (vagones)", "Vagones de carga movidos: carbón, granos, químicos, autos.", "sube_bien",
        fred("RAILFRTCARLOADSD11"), "vagones", "mensual", transform="anual"),
    ind("us_intermodal", "US", "curioso", "Carga ferroviaria intermodal", "Contenedores y remolques en tren: importaciones y comercio en línea.", "sube_bien",
        fred("RAILFRTINTERMODAL"), "unidades", "mensual", transform="anual"),
    ind("us_camiones", "US", "curioso", "Tonelaje de camiones (ATA)", "Toneladas movidas en camión; unas 7 de cada 10 en EUA.", "sube_bien", fred("TRUCKD11"), "índice 2015=100", "mensual"),
    ind("us_casas_rodantes", "US", "curioso", "Índice de casas rodantes", "Producción de remolques y campers: compra cara, financiada y opcional.", "sube_bien",
        fred("IPG336214S"), "índice 2017=100", "mensual", conf="aproximacion", como_leer="Suele caer meses antes de una recesión."),
    ind("us_huevo", "US", "curioso", "Precio del huevo", "Precio promedio de una docena de huevos grandes.", "sube_mal", fred("APU0000708111"), "USD por docena", "mensual",
        como_leer="Se volvió termómetro popular en 2023 por la gripe aviar; refleja más la oferta que la economía."),
    ind("us_ropa_hombre", "US", "curioso", "Índice de ropa interior masculina (precio)", "Precio de la ropa de hombre en la inflación. La idea original (Greenspan) usaba las ventas, que no se publican.", "neutral",
        fred("CUSR0000SAA1"), "% anual", "mensual", conf="aproximacion", transform="anual"),
    ind("us_tintoreria", "US", "curioso", "Índice de tintorerías (precio)", "Precio de lavandería y tintorería en la inflación.", "neutral",
        fred("CUSR0000SEGD03"), "% anual", "mensual", conf="aproximacion", transform="anual"),
    ind("us_cobre", "GL", "curioso", "Dr. Copper (precio del cobre)", "El cobre se usa en construcción, autos y electrónica: su precio anticipa la demanda industrial.", "sube_bien",
        fred("PCOPPUSDM"), "USD por tonelada", "mensual", conf="aproximacion"),
    ind("eu_restaurantes", "EU", "curioso", "Precio de restaurantes y cafés", "Cuánto suben los precios de comer fuera.", "neutral",
        euro("prc_hicp_minr", coicop18="CP1111", unit="RCH_A"), "% anual", "mensual", conf="aproximacion"),
    ind("eu_peluqueria", "EU", "curioso", "«Cortes de recesión» (precio de peluquerías)", "Precio de peluquerías y estéticas.", "neutral",
        euro("prc_hicp_minr", coicop18="CP1313", unit="RCH_A"), "% anual", "mensual", conf="aproximacion"),
    ind("eu_vacaciones", "EU", "curioso", "Índice de vacaciones (paquetes turísticos)", "Precio de paquetes vacacionales: viajes que se aplazan cuando el dinero no alcanza.", "neutral",
        euro("prc_hicp_minr", coicop18="CP0980", unit="RCH_A"), "% anual", "mensual", conf="aproximacion",
        como_leer="Si sube mucho, hay demanda fuerte de viajes; si baja, las agencias rebajan para vender."),
    ind("eu_hoteles", "EU", "curioso", "Precio de hoteles y alojamiento", "Cuánto suben las tarifas de hoteles en la UE.", "neutral",
        euro("prc_hicp_minr", coicop18="CP1120", unit="RCH_A"), "% anual", "mensual", conf="aproximacion"),
]

# Índices derivados: se calculan con dos series del catálogo (mismas fechas).
DERIVADOS = [
    {"id": "us_comer_fuera", "region": "US", "grupo": "curioso", "nombre": "Comer fuera vs. comer en casa", "operacion": "cociente", "a": "us_restaurantes", "b": "us_super",
     "que_mide": "Dólares gastados en restaurantes por cada dólar en supermercado. Es la versión con datos de los índices de frijoles enlatados y Spam.",
     "como_leer": "Si baja, la gente cambia restaurante por despensa: señal de recorte.", "lectura": "sube_bien", "confiabilidad": "oficial", "unidad": "USD en restaurante por USD en súper", "frecuencia": "mensual"},
    {"id": "us_miseria", "region": "US", "grupo": "macro", "nombre": "Índice de miseria", "operacion": "suma", "a": "us_desempleo", "b": "us_inflacion",
     "que_mide": "Desempleo + inflación anual (Arthur Okun, años 60).", "como_leer": "Más alto = más presión sobre los hogares.", "lectura": "sube_mal",
     "confiabilidad": "oficial", "unidad": "puntos", "frecuencia": "mensual"},
    {"id": "eu_miseria", "region": "EU", "grupo": "macro", "nombre": "Índice de miseria", "operacion": "suma", "a": "eu_desempleo", "b": "eu_inflacion",
     "que_mide": "Desempleo + inflación anual.", "como_leer": "Más alto = más presión sobre los hogares.", "lectura": "sube_mal", "confiabilidad": "oficial", "unidad": "puntos", "frecuencia": "mensual"},
    {"id": "mx_miseria", "region": "MX", "grupo": "macro", "nombre": "Índice de miseria", "operacion": "suma", "a": "mx_desempleo", "b": "mx_inflacion",
     "que_mide": "Desempleo + inflación anual.", "como_leer": "En México el desempleo bajo lo hace ver mejor de lo que es: la informalidad no entra.", "lectura": "sube_mal",
     "confiabilidad": "oficial", "unidad": "puntos", "frecuencia": "mensual"},
]

# Índices sin datos abiertos: solo se explican (y, si existe, el enlace a quien lo publica).
SIN_DATOS = [
    ("lapiz_labial", "Índice del lápiz labial", "Leonard Lauder (Estée Lauder) lo propuso en 2001: en crisis la gente deja los lujos grandes y se da lujos pequeños, como un labial.",
     "No hay serie pública de ventas de labiales. En EUA se puede ver de lado las ventas de tiendas de salud y cuidado personal.", ""),
    ("faldas", "Índice del largo de las faldas", "George Taylor (1926): faldas cortas en tiempos de auge, largas en crisis.",
     "Un estudio de 2010 (van Baardwijk y Franses) encontró que la moda sigue a la economía con unos 3 años de retraso: no sirve para anticipar.", ""),
    ("champana", "Índice de champaña", "Las celebraciones y los lujos se recortan primero.",
     "Solo hay envíos anuales en comunicados del Comité Champagne.", "https://www.champagne.fr/"),
    ("rubia", "«Rubia de recesión»", "Se espacian los retoques de tinte y se notan las raíces.", "Sin datos; la aproximación es el precio de peluquerías.", ""),
    ("parches", "Índice de parches de uniforme", "Anécdota: menos contrataciones = menos uniformes bordados con el nombre de la empresa.", "Sin datos.", ""),
    ("citas", "Índice de primeras citas", "Anécdota: en crisis más gente busca pareja en apps y gasta menos por cita.", "Sin datos abiertos.", ""),
    ("rascacielos", "Índice de rascacielos", "Andrew Lawrence (1999): terminar el edificio más alto del mundo coincidió con crisis (Empire State 1931, Torres Petronas 1998, Burj Khalifa 2010).",
     "No es una serie: es una lista de coincidencias. El CTBUH lleva el registro de edificios altos.", "https://www.skyscrapercenter.com/"),
    ("navidad", "Índice de precios de Navidad", "PNC calcula cada año desde 1984 cuánto cuestan los regalos de la canción «Los doce días de Navidad».",
     "Un dato anual que PNC publica en diciembre.", "https://www.pnc.com/en/about-pnc/topics/pnc-christmas-price-index.html"),
    ("hada", "Índice del hada de los dientes", "Delta Dental pregunta cada año cuánto dejan los papás por diente; suele moverse con la bolsa.",
     "Un dato anual (encuesta).", "https://www.deltadental.com/"),
    ("baltico", "Índice Báltico Seco (BDI)", "Costo diario de rentar barcos para carga a granel (granos, mineral de hierro, carbón).",
     "Los datos son de la Bolsa del Báltico con licencia de pago; no se pueden publicar aquí. El GSCPI ya lo incluye en su cálculo.", "https://www.balticexchange.com/"),
    ("waffle", "Índice Waffle House (FEMA)", "Si los restaurantes Waffle House cierran después de un huracán, el desastre es grave.",
     "Mide desastres, no economía. Se deja como referencia.", ""),
]


def construir():
    return {"_nota": "Generado por tools/economia/catalogo_economia.py: editar allá. Solo admin (economia.html).", "indicadores": INDICADORES, "derivados": DERIVADOS,
            "sin_datos": [{"id": a, "nombre": b, "que_mide": c, "nota": d, "enlace": e} for a, b, c, d, e in SIN_DATOS]}


if __name__ == "__main__":
    ruta = os.path.join(ROOT, "config", "economia.json")
    json.dump(construir(), open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(ruta, len(INDICADORES), "indicadores")
