"""Paletas que rotan cada día (Brújula Diaria) o en cada short, para que las miniaturas no se vean iguales.

El logo, la tipografía y la disposición se conservan; solo cambian los colores. Cada paleta cumple contraste
WCAG: tinta sobre fondo ≥ 7:1, gris sobre fondo ≥ 4.5:1 y acento sobre fondo ≥ 3:1 (lo prueba tests/test_shorts.py).
"""
from datetime import date

PALETAS = [
    {"nombre": "noche", "fondo": "#0b1220", "fondo2": "#13233d", "tinta": "#eef2f6", "gris": "#9fb0c3", "acento": "#d9a826"},
    {"nombre": "vino", "fondo": "#1d0b14", "fondo2": "#3a1426", "tinta": "#fbeff4", "gris": "#d2aebd", "acento": "#ff8fab"},
    {"nombre": "bosque", "fondo": "#081a14", "fondo2": "#0f3326", "tinta": "#ecf8f1", "gris": "#a6cbb7", "acento": "#5ee6a8"},
    {"nombre": "oceano", "fondo": "#061826", "fondo2": "#0b3350", "tinta": "#eaf6ff", "gris": "#a4c6dd", "acento": "#4cc9f0"},
    {"nombre": "carbon", "fondo": "#141414", "fondo2": "#2a2a2a", "tinta": "#f4f4f4", "gris": "#b8b8b8", "acento": "#ff7a45"},
    {"nombre": "indigo", "fondo": "#120f2e", "fondo2": "#241f55", "tinta": "#f1efff", "gris": "#b9b3e6", "acento": "#b388ff"},
    {"nombre": "terracota", "fondo": "#1f0f08", "fondo2": "#3d1e10", "tinta": "#fff3ea", "gris": "#e0bba5", "acento": "#ffb347"},
    {"nombre": "petroleo", "fondo": "#04201f", "fondo2": "#08403d", "tinta": "#e8fbfa", "gris": "#9fd0cc", "acento": "#ffd166"},
]


def paleta_del_dia(dia=None, desfase=0):
    """Paleta según el día del año (y un desfase para que dos videos del mismo día no coincidan)."""
    d = dia or date.today()
    if isinstance(d, str):
        d = date.fromisoformat(d[:10])
    return PALETAS[(d.toordinal() + desfase) % len(PALETAS)]


def luminancia(hexa):
    c = [int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contraste(a, b):
    la, lb = sorted((luminancia(a), luminancia(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)
