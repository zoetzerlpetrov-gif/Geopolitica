"""Patrones preventivos generales; nunca reconstruyen los hechos de una noticia."""
import re
import unicodedata

CONDUSEF = 'https://www.condusef.gob.mx/index.php/i?p=tipos-de-fraude'
INCIBE = 'https://www.incibe.es/sites/default/files/docs/guia-ciberataques/osi-guia-ciberataques.pdf'
FUENTES = [('CONDUSEF · tipos de fraude', CONDUSEF), ('INCIBE · guía de ciberataques', INCIBE)]


def normal(t):
    return ''.join(c for c in unicodedata.normalize('NFD', str(t or '').lower()) if unicodedata.category(c) != 'Mn')


ESTAFA = re.compile(r'estaf|fraudes?|fraud|scam|phishing|smishing|vishing|quishing|suplant|falso.{0,25}(banco|credito|premio|empleo|soporte)|robo de (cuenta|identidad)|secuestro de (cuenta|whatsapp)|sim.?swap|pig butchering|fals[oa]s?.{0,45}(concurso|sorteo|banco|credito|premio|empleo|soporte|paquete|notificaci)|ciberdelincuent.{0,70}(cuenta|dinero)|robar.{0,35}(credencial|dato|cuenta)|montadeudas|cargos? no reconocid|retiros? no reconocid|creditos? no solicitad|comprobantes? (fals|apocrif)|desaparicion.{0,65}cuenta')
CANALES = [('WhatsApp', r'whatsapp|wasap'), ('SMS', r'\bsms\b|smishing|mensaje de texto'),
           ('Llamadas', r'llamad|telefon|vishing|robocall'), ('Correo', r'correo|email|e-mail|phishing'),
           ('Redes sociales', r'redes sociales|facebook|instagram|tiktok|telegram|\bx\.com\b'),
           ('Banca', r'banc|tarjeta|credito|credit|token|\bnip\b|\bbbva\b|\bbanorte\b|\bsantander\b|\bhsbc\b'), ('Compras', r'compra|tienda|marketplace|comercio|paquet|delivery'),
           ('Inversiones', r'inversi|invest(?:ment|ing|or)|cripto|crypto|bitcoin|ponzi')]
# Patrones orientativos apoyados en las guías enlazadas, no detalles atribuidos a la fuente de la noticia.
PATRONES = [
    ('reclamacion', 'Reclamación bancaria por verificar', r'cargos? no reconocid|retiros? no reconocid|creditos? no solicitad|desaparicion.{0,65}cuenta',
     'El titular comunica una reclamación bancaria; por sí solo no demuestra un fraude ni permite determinar su causa.',
     'Consulta los movimientos desde la aplicación oficial y solicita una aclaración al banco por sus canales oficiales. Conserva comprobantes y el folio del reporte.', CONDUSEF),
    ('smishing', 'SMS / smishing', r'smishing|\bsms\b|mensaje de texto',
     'Un mensaje puede suplantar un servicio y dirigir a una página que pide datos o pagos.',
     'Abre la aplicación o escribe la dirección oficial por tu cuenta. No uses el enlace recibido ni entregues códigos.', INCIBE),
    ('vishing', 'Llamadas / vishing', r'vishing|llamad|telefon|robocall',
     'Una llamada puede fingir ser del banco o de soporte y presionar para revelar claves o transferir dinero.',
     'Cuelga y verifica con el número oficial obtenido por tu cuenta. No compartas NIP, token ni códigos; el identificador puede falsificarse.', CONDUSEF),
    ('phishing', 'Correo / phishing', r'phishing|correo|email|e-mail',
     'Un correo puede imitar a una entidad para llevarte a un acceso falso o pedir datos confidenciales.',
     'Entra desde la aplicación oficial o una dirección verificada. No abras adjuntos inesperados ni entregues claves desde enlaces recibidos.', INCIBE),
    ('mensajeria', 'WhatsApp y mensajería', r'whatsapp|telegram|wasap',
     'En mensajería pueden suplantar contactos o servicios y pedir dinero o códigos de verificación.',
     'Confirma las solicitudes por otra vía. No compartas códigos; actualiza la aplicación y revisa los dispositivos vinculados.', INCIBE),
    ('bancaria', 'Suplantación y fraude bancario', r'banc|tarjeta|credito|token|\bnip\b',
     'Pueden fingir un problema bancario para pedir datos, códigos o movimientos de dinero.',
     'Verifica desde la aplicación o teléfono oficial. No compartas contraseñas, NIP ni token, ni transfieras por instrucciones de un contacto inesperado.', CONDUSEF),
    ('compras', 'Compras y paquetería', r'compra|tienda|marketplace|paquet|delivery|comercio',
     'Una oferta o aviso de entrega puede usarse como pretexto para solicitar pagos o datos fuera del canal legítimo.',
     'Verifica al vendedor y el envío desde sus canales oficiales. Evita pagos o enlaces enviados por contactos que no puedas comprobar.', INCIBE),
    ('inversion', 'Inversiones y cripto', r'inversi|invest(?:ment|ing|or)|cripto|crypto|bitcoin|ponzi|pig butchering',
     'Las ofertas fraudulentas pueden prometer rendimientos garantizados para obtener depósitos.',
     'Comprueba la entidad y su autorización en el regulador correspondiente. No envíes dinero por promesas de ganancias garantizadas.', CONDUSEF),
    ('redes', 'Redes sociales', r'redes sociales|facebook|instagram|tiktok|\bx\.com\b',
     'Perfiles o anuncios suplantados pueden atraer con premios, ofertas o solicitudes de dinero.',
     'Verifica el perfil por un canal independiente. No compartas códigos ni pagues por presión de mensajes o anuncios.', INCIBE),
]


def perfil_estafa(titulo):
    t = normal(titulo)
    if not ESTAFA.search(t) or (re.search(r'fraude (electoral|fiscal|contable)|fraud[e]? (election|tax)|electoral fraud', t) and not re.search(r'phishing|smishing|vishing|whatsapp|sms|llamada|suplant', t)):
        return None
    canales = [nombre for nombre, rx in CANALES if re.search(rx, t)]
    p = next((p for p in PATRONES if re.search(p[2], t)), None)
    if p:
        clave, nombre, _, modus, evitar, fuente = p
    else:
        clave, nombre = 'sin_detalle', 'Modalidad no especificada'
        modus = 'El titular no detalla el modus operandi. Consulta la fuente original; no es posible reconstruir el caso con estos datos.'
        evitar = 'Detén la operación y verifica por un canal oficial independiente antes de pagar o compartir información.'
        fuente = CONDUSEF
    entidades = [nombre for nombre, patron in [('Coppel / BanCoppel', r'\b(?:ban ?coppel|coppel)\b'), ('BBVA', r'\bbbva\b'),
        ('Banorte', r'\bbanorte\b'), ('Banamex / Citibanamex', r'\b(?:citibanamex|banamex)\b'), ('Santander', r'\bsantander\b'),
        ('HSBC', r'\bhsbc\b'), ('Banco Azteca', r'\bbanco azteca\b'), ('Scotiabank', r'\bscotiabank\b')]
        if re.search(patron, t)]
    return {'entidades': entidades, 'modalidad': clave, 'modalidad_nombre': nombre, 'canales': canales,
            'modus': modus, 'prevencion': evitar, 'guia_url': fuente,
            'alcance': 'Patrón general de prevención, no reconstrucción confirmada de este caso.'}
