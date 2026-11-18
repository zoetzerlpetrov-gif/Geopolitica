"""Fecha única de la edición; separada de las fechas de referencia de sus noticias y cifras."""
import re
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

ZONA = 'America/Mexico_City'


def _ahora(ahora=None):
    ahora = ahora or datetime.now(timezone.utc)
    if ahora.tzinfo is None:
        raise ValueError('La hora de generación debe incluir zona horaria.')
    return ahora


def edicion(fecha_manual=None, ahora=None):
    ahora = _ahora(ahora)
    hoy = ahora.astimezone(ZoneInfo(ZONA)).date().isoformat()
    if fecha_manual:
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', fecha_manual):
            raise ValueError('La fecha de edición debe tener formato AAAA-MM-DD.')
        date.fromisoformat(fecha_manual)  # Rechaza fechas inexistentes; no se sustituyen silenciosamente.
    return {'fecha': fecha_manual or hoy, 'zona': ZONA, 'origen': 'manual' if fecha_manual else 'automatica',
            'generado_utc': ahora.astimezone(timezone.utc).isoformat(), 'fecha_local_generacion': hoy}


def validar_edicion(g, descripcion, ahora=None):
    from guion import fecha_larga
    e = g.get('edicion') or {}
    fecha = g.get('fecha')
    if not fecha or e.get('fecha') != fecha or e.get('zona') != ZONA or e.get('origen') not in ('manual', 'automatica'):
        raise ValueError('Faltan metadatos coherentes de la fecha de edición del video.')
    generada = edicion(fecha if e['origen'] == 'manual' else None,
                       datetime.fromisoformat(e.get('generado_utc', '').replace('Z', '+00:00')))
    if generada['fecha_local_generacion'] != e.get('fecha_local_generacion') or generada['fecha'] != fecha:
        raise ValueError('La fecha del video no coincide con la fecha local de su generación.')
    if e['origen'] == 'automatica' and fecha != edicion(ahora=_ahora(ahora))['fecha']:
        raise ValueError('La edición automática ya pertenece a otro día en Ciudad de México; genera una edición nueva antes de subirla.')
    larga = fecha_larga(fecha).casefold()
    portadas = [s for s in g.get('escenas', []) if s.get('tipo') == 'portada']
    if len(portadas) != 1:
        raise ValueError('El video debe tener una portada con la fecha de la edición.')
    campos = [('título', g.get('titulo', '')), ('descripción', descripcion),
              ('portada', portadas[0].get('texto', '')), ('locución de la portada', portadas[0].get('voz', ''))]
    for nombre, texto in campos:
        if larga not in texto.casefold():
            raise ValueError(f'La fecha del {nombre} no coincide con {fecha}.')
    return e
