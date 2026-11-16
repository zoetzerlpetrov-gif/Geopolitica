"""Expansión contextual de meses abreviados. Solo locución; no modifica los textos en pantalla."""
import re
from datetime import date

MESES = {'ene':'enero','feb':'febrero','mar':'marzo','abr':'abril','may':'mayo','jun':'junio','jul':'julio','ago':'agosto',
         'sep':'septiembre','sept':'septiembre','set':'septiembre','oct':'octubre','nov':'noviembre','dic':'diciembre'}
PATRON = '(?:' + '|'.join(sorted(MESES,key=len,reverse=True)) + ')'
NUMERO = {n:i+1 for i,n in enumerate(['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])}


def expandir_fechas(texto):
    def dia(m):
        d, mes, anio = m['dia'], MESES[m['mes'].lower()], m['anio']
        try:
            date(int(anio or 2000),NUMERO[mes],int(d))
        except ValueError:
            return m.group()
        # Un punto final sin año sigue siendo una pausa de fin de frase.
        punto = '.' if m['punto'] and not anio else ''
        return f'{int(d)} de {mes}' + (f' de {anio}' if anio else punto)
    rx = re.compile(r'\b(?P<dia>[0-3]?\d)(?:\s+de\s+|\s+|[-/])(?P<mes>'+PATRON+r')\b(?P<punto>\.)?(?:(?:\s+de\s+|\s+|[-/])(?P<anio>(?:19|20|21)\d{2})\b)?',re.I)
    texto = rx.sub(dia,str(texto or ''))
    def mes_anio(m):
        # SEP con mayúsculas sin un día ni marcador temporal puede ser la institución.
        antes = texto[:m.start()]
        if m['mes'] == 'SEP' and not re.search(r'\b(?:en|durante|desde|hasta|mes de)\s*$',antes,re.I):
            return m.group()
        return f'{MESES[m["mes"].lower()]} de {m["anio"]}'
    texto = re.sub(r'\b(?P<mes>'+PATRON+r')\b\.?\s+(?:de\s+)?(?P<anio>(?:19|20|21)\d{2})\b',mes_anio,texto,flags=re.I)
    def temporal(m):
        if m['mes']=='SEP':
            return m.group()
        return m['antes']+MESES[m['mes'].lower()]+('.' if m['punto'] else '')
    texto = re.sub(r'\b(?P<antes>(?:en|durante|desde|hasta|mes de)\s+)(?P<mes>'+PATRON+r')\b(?P<punto>\.)?',temporal,texto,flags=re.I)
    return texto
