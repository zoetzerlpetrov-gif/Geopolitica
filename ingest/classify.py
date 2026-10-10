#!/usr/bin/env python3
"""Clasificador por reglas (nivel 1, sin IA) basado en las palabras clave de config/taxonomy.json.

Cómo puntúa un texto (título + resumen):
  1. Se normaliza: minúsculas, sin acentos, signos convertidos en espacios.
  2. Cada palabra clave se busca como palabra o frase completa (no como pedazo de otra palabra);
     las palabras sueltas también coinciden en plural (+s, +es): "ataque" encuentra "ataques".
  3. Peso de cada coincidencia:
       - palabra clave de SUBTEMA: 2 puntos (es más específica)
       - palabra clave del ÁREA:   1 punto
       - +0.5 por cada palabra adicional de la frase ("canal de suez" pesa más que "canal")
     Una misma frase cuenta una vez por área aunque aparezca en varias listas.
  4. Área principal = la de mayor puntaje. Secundarias = hasta 3 con al menos 35 % del puntaje principal.
     El área 10 (regional) solo puede ser principal si supera a la siguiente por 25 %: casi todo hecho
     ocurre en una región, y la región ya la da el país del evento.
  5. Confianza (0–1) = margen entre la primera y la segunda área, ajustado por cuánta evidencia hubo.

Uso:  python3 ingest/classify.py "Titular a clasificar"
"""
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MIN_SECUNDARIA = 0.35
VENTAJA_REGIONAL = 1.25


def normalizar(texto):
    t = unicodedata.normalize("NFKD", texto.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"(?<!\d)\.|\.(?!\d)", " ", t)  # el punto solo se conserva entre dígitos (pm2.5)
    t = re.sub(r"[^a-z0-9+.]+", " ", t)
    return f" {re.sub(r' +', ' ', t).strip()} "


# Siglas que coinciden con palabras comunes: solo cuentan si en el texto original van en MAYÚSCULAS.
#   "un" (artículo en español) ≠ UN (Naciones Unidas); "who" (pronombre) ≠ WHO (OMS);
#   "cop" (policía en inglés) ≠ COP29; "ai" ≠ AI (inteligencia artificial).
SOLO_MAYUSCULAS = {"un": re.compile(r"(?<![A-Za-z])UN(?![a-z])"), "who": re.compile(r"(?<![A-Za-z])WHO(?![a-z])"),
                   "cop": re.compile(r"(?<![A-Za-z])COP(?![a-z])"), "ai": re.compile(r"(?<![A-Za-z])AI(?![a-z])"),
                   # Siglas mexicanas que en minúsculas son otra cosa o partes de palabras.
                   "ine": re.compile(r"(?<![A-Za-z])INE(?![a-z])"), "cfe": re.compile(r"(?<![A-Za-z])CFE(?![a-z])"),
                   "dof": re.compile(r"(?<![A-Za-z])DOF(?![a-z])")}


def _peso(frase, base):
    return base + 0.5 * (len(frase.split()) - 1)


class Clasificador:
    def __init__(self, taxonomy=None):
        if taxonomy is None:
            with open(os.path.join(ROOT, "config", "taxonomy.json"), encoding="utf-8") as f:
                taxonomy = json.load(f)
        self.areas = [a["id"] for a in taxonomy["areas"]]
        # reglas[area] = lista de (frase normalizada, peso, subtema o None)
        self.reglas = {}
        for a in taxonomy["areas"]:
            vistas = {}
            for lang in ("es", "en"):
                for k in a["palabras_clave"][lang]:
                    n = normalizar(k).strip()
                    if n:
                        vistas.setdefault(n, (_peso(n, 1), None))
            for s in a["subtemas"]:
                for lang in ("es", "en"):
                    for k in s["palabras_clave"][lang]:
                        n = normalizar(k).strip()
                        if not n:
                            continue
                        previo = vistas.get(n)
                        peso = _peso(n, 2)
                        if previo is None or previo[0] < peso or previo[1] is None:
                            vistas[n] = (max(peso, previo[0] if previo else 0), s["id"])
            self.reglas[a["id"]] = [(f" {frase} ", peso, sub) for frase, (peso, sub) in vistas.items()]

    def puntuar(self, texto):
        t = normalizar(texto)
        siglas_ok = {k for k, rx in SOLO_MAYUSCULAS.items() if rx.search(texto)}
        puntajes, subtemas, evidencia = {}, {}, {}
        for area, reglas in self.reglas.items():
            total = 0.0
            for frase, peso, sub in reglas:
                if frase.strip() in SOLO_MAYUSCULAS and frase.strip() not in siglas_ok:
                    continue
                if frase in t or (" " not in frase.strip() and (frase[:-1] + "s " in t or frase[:-1] + "es " in t)):
                    total += peso
                    evidencia.setdefault(area, []).append(frase.strip())
                    if sub:
                        subtemas.setdefault(area, set()).add(sub)
            if total:
                puntajes[area] = total
        return puntajes, subtemas, evidencia

    def clasificar(self, texto):
        """Devuelve dict con area_principal, areas_secundarias, subtemas, confianza y evidencia.
        Si no hay ninguna coincidencia, area_principal es None."""
        puntajes, subtemas, evidencia = self.puntuar(texto)
        if not puntajes:
            return {"area_principal": None, "areas_secundarias": [], "subtemas": [], "confianza": 0.0, "puntajes": {}, "evidencia": {}}
        orden = sorted(puntajes, key=lambda a: (-puntajes[a], self.areas.index(a)))
        if orden[0] == "regional" and len(orden) > 1 and puntajes["regional"] < VENTAJA_REGIONAL * puntajes[orden[1]]:
            orden[0], orden[1] = orden[1], orden[0]
        principal = orden[0]
        top = puntajes[principal]
        secundarias = [a for a in orden[1:] if puntajes[a] >= MIN_SECUNDARIA * top][:3]
        segundo = puntajes[orden[1]] if len(orden) > 1 else 0.0
        margen = (top - segundo) / top
        evidencia_factor = min(1.0, top / 6)
        confianza = round(max(0.05, min(1.0, 0.5 * margen + 0.5 * evidencia_factor)), 2)
        subs = sorted(set().union(*(subtemas.get(a, set()) for a in [principal, *secundarias])))
        return {
            "area_principal": principal, "areas_secundarias": secundarias, "subtemas": subs,
            "confianza": confianza, "puntajes": {a: puntajes[a] for a in orden},
            "evidencia": {a: evidencia[a] for a in [principal, *secundarias]},
        }


if __name__ == "__main__":
    r = Clasificador().clasificar(" ".join(sys.argv[1:]) or "Ataques hutíes en el Mar Rojo desvían navieras de Suez")
    print(json.dumps(r, ensure_ascii=False, indent=2))
