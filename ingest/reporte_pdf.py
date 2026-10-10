"""Reporte diario (JSON de ingest/reporte.py) → PDF, con fpdf2 y la fuente DejaVu (acentos y «»).

Se genera en GitHub Actions; si fpdf2 o la fuente no están, reporte.py guarda el reporte sin PDF.
Cada evento lleva su título, fuente, fecha y enlace al original; el resumen es el propio del sistema.
"""
import os
import re

from fpdf import FPDF

FUENTES = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
SEV = {5: "5 · extrema", 4: "4 · alta", 3: "3 · media", 2: "2 · baja", 1: "1 · informativa"}
TEND = {"sube": "▲ por encima de su promedio", "baja": "▼ por debajo de su promedio", "estable": "≈ en su promedio", "sin base": "sin base de comparación"}
HORIZONTES = [("corto_plazo", "Corto plazo"), ("mediano_plazo", "Mediano plazo"), ("largo_plazo", "Largo plazo")]
AZUL, GRIS, NEGRO = (31, 78, 121), (95, 99, 104), (20, 20, 20)


class Pdf(FPDF):
    def __init__(self, rep):
        super().__init__(format="Letter")
        self.rep = rep
        if not all(os.path.exists(f) for f in FUENTES):
            raise FileNotFoundError("falta la fuente DejaVu")
        self.add_font("DejaVu", "", FUENTES[0])
        self.add_font("DejaVu", "B", FUENTES[1])
        self.set_auto_page_break(True, margin=16)
        self.set_margins(16, 16, 16)
        self.alias_nb_pages()
        self.set_display_mode("default", "continuous")  # la «acción al abrir» se quita al guardar (sin_accion_al_abrir)
        self.set_title(rep["titulo"])
        self.set_subject(f"Reporte del {rep['fecha']}")
        self.set_author("Monitor Geopolítico")
        self.set_creator("Monitor Geopolítico · github.com/zoetzerlpetrov-gif/Geopolitica")
        self.set_lang("es-MX")

    def multi_cell(self, w, h, text="", **kw):
        # Cada bloque empieza en el margen izquierdo de la línea siguiente (en fpdf2 el cursor queda a la derecha).
        kw.setdefault("new_x", "LMARGIN")
        kw.setdefault("new_y", "NEXT")
        return super().multi_cell(w, h, text, **kw)

    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("DejaVu", "", 8)
        self.set_text_color(*GRIS)
        self.cell(0, 5, f"{self.rep['titulo']} · {self.rep['fecha']}", align="L")
        self.ln(7)

    def footer(self):
        self.set_y(-12)
        self.set_font("DejaVu", "", 7.5)
        self.set_text_color(*GRIS)
        self.cell(0, 5, f"Monitor Geopolítico · github.com/zoetzerlpetrov-gif/Geopolitica · página {self.page_no()}/{{nb}}", align="C")

    def titulo(self, texto, tam=13):
        self.ln(2)
        self.set_font("DejaVu", "B", tam)
        self.set_text_color(*AZUL)
        self.multi_cell(0, tam * 0.5, texto)
        self.ln(1)
        self.set_text_color(*NEGRO)

    def parrafo(self, texto, tam=9.5, color=NEGRO, alto=4.8):
        self.set_font("DejaVu", "", tam)
        self.set_text_color(*color)
        self.multi_cell(0, alto, texto)
        self.set_text_color(*NEGRO)

    def evento(self, e):
        self.set_font("DejaVu", "B", 9.5)
        self.multi_cell(0, 4.8, e["titulo"])
        meta = f"{e.get('fuente') or ''} · {e.get('fecha_utc', '')[:16].replace('T', ' ')} UTC · severidad {SEV.get(e.get('severidad'), '?')}"
        if e.get("automatico"):
            meta += " · señal automática (GDELT)"
        self.parrafo(meta, 8, GRIS, 4)
        if e.get("resumen"):
            self.parrafo(e["resumen"], 9, NEGRO, 4.5)
        if e.get("url"):
            self.set_font("DejaVu", "", 7.5)
            self.set_text_color(*AZUL)
            # La dirección va como texto, sin enlace activo (/URI): decenas de enlaces activos a sitios externos
            # hacen que algunos antivirus marquen el PDF como phishing. Los lectores de PDF la detectan al tocarla.
            self.multi_cell(0, 4, e["url"][:200])
            self.set_text_color(*NEGRO)
        self.ln(2)


def escribir(rep, ruta):
    pdf = Pdf(rep)
    pdf.add_page()
    pdf.set_font("DejaVu", "B", 18)
    pdf.set_text_color(*AZUL)
    pdf.multi_cell(0, 9, rep["titulo"])
    pdf.parrafo(f"{rep['fecha']} · corte a las {rep['corte_mx']} (hora del centro de México) · últimas {rep['ventana']['horas']} horas", 9.5, GRIS)
    pdf.ln(2)
    pdf.titulo("Resumen en cifras")
    pdf.parrafo(rep["panorama_reglas"])
    fix = (rep.get("indicadores") or {}).get("fix")
    if fix:
        pdf.parrafo(f"{fix['nombre']}: {fix['valor']:.4f} ({fix['fecha']}, {fix['fuente']}).", 9.5)

    ia = rep.get("panorama_ia")
    if ia and ia.get("horizontes"):
        pdf.titulo("Panorama con IA (hipótesis, no predicción)")
        pdf.parrafo(ia.get("aviso", ""), 8.5, GRIS, 4.2)
        for clave, nombre in HORIZONTES:
            h = ia["horizontes"].get(clave)
            if not h:
                continue
            pdf.set_font("DejaVu", "B", 10.5)
            pdf.multi_cell(0, 5.5, f"{nombre} ({h.get('horizonte', '')})")
            for esc in h.get("escenarios", []):
                pdf.set_font("DejaVu", "B", 9.5)
                pdf.multi_cell(0, 4.8, f"• {esc['titulo']} — probabilidad {esc.get('probabilidad', '?')}")
                pdf.parrafo(esc.get("descripcion", ""), 9, NEGRO, 4.5)
                if esc.get("senales"):
                    pdf.parrafo("Señales a vigilar: " + "; ".join(esc["senales"]), 8.5, GRIS, 4.2)
            pdf.ln(1)

    pdf.titulo("Por tema")
    for s in rep["secciones"]:
        pdf.set_font("DejaVu", "B", 11)
        pdf.set_text_color(*AZUL)
        pdf.multi_cell(0, 5.5, f"{s['nombre']} — {s['total']} eventos")
        pdf.parrafo(f"{s['notas']} notas de medios · {s['senales_automaticas']} señales automáticas · {s['alta_severidad']} de severidad alta · "
                    f"{TEND.get(s['tendencia'], s['tendencia'])} (promedio de notas en 7 días: {s['promedio_7d']})", 8.5, GRIS, 4.2)
        pdf.ln(1)
        if not s["eventos"]:
            pdf.parrafo("Sin eventos en este tema en las últimas 24 horas.", 9, GRIS)
        for e in s["eventos"]:
            pdf.evento(e)
    if rep.get("entorno") and rep["entorno"]["eventos"]:
        pdf.titulo(rep["entorno"]["nombre"])
        pdf.parrafo(rep["entorno"]["nota"], 8.5, GRIS, 4.2)
        for e in rep["entorno"]["eventos"]:
            pdf.evento(e)
    if rep.get("regiones"):
        pdf.titulo("Por región")
        for r in rep["regiones"][:12]:
            pdf.parrafo(f"{r['region'].replace('_', ' ').capitalize()}: {r['total']} eventos ({r['alta_severidad']} de severidad alta)", 9.5)
    pdf.titulo("Método y fuentes", 11)
    pdf.parrafo(rep["metodo"], 8.5, GRIS, 4.2)
    if rep.get("fuentes"):
        pdf.parrafo("Fuentes con más eventos: " + "; ".join(f"{f} ({n})" for f, n in rep["fuentes"][:10]), 8.5, GRIS, 4.2)
    pdf.parrafo("Del contenido de los medios solo se usan título, fuente, fecha y enlace; los resúmenes son propios. "
                "La clasificación es automática y puede tener errores. No es asesoría.", 8.5, GRIS, 4.2)
    with open(ruta, "wb") as f:
        f.write(sin_accion_al_abrir(bytes(pdf.output())))


def sin_accion_al_abrir(datos):
    """Quita «/OpenAction [...]» del catálogo. fpdf2 la agrega siempre (solo fija el zoom), y algunos antivirus la
    marcan como sospechosa. Se sustituye por espacios del mismo largo para no mover las posiciones de la tabla xref."""
    return re.sub(rb"/OpenAction \[[^\]]*\]", lambda m: b" " * len(m.group(0)), datos, count=1)
