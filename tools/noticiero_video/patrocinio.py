"""Patrocinios y menciones de marca en Brújula Diaria, separados de las noticias.

Todo sale de config/patrocinios.json: sin una campaña activa y vigente el video queda igual que hoy. Reglas fijas:
  * El patrocinio va en su propia escena («Publicidad»), nunca dentro de una nota ni de Mercados.
  * La voz siempre empieza con «Mensaje patrocinado por <marca>» y la pantalla lleva la etiqueta PUBLICIDAD.
  * Máximo `reglas.max_por_video` menciones por video; categorías prohibidas (política electoral, tabaco, apuestas…)
    se rechazan aunque estén activas.
  * Si una nota del día habla de la marca patrocinadora, la nota se marca «<marca> patrocina este programa» y la
    descripción lo dice (conflicto de interés a la vista).
  * El video se declara a YouTube con promoción pagada (paidProductPlacementDetails) y la descripción lo indica arriba.
"""
import base64
import json
import os
import re
from datetime import date

RUTA = os.path.join(os.path.dirname(__file__), "..", "..", "config", "patrocinios.json")
POSICIONES = ("apertura", "pausa", "cierre")
DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"]
MAX_VOZ = 320       # caracteres: unos 20 segundos de voz
MAX_PANTALLA = 140
MAX_LOGO = 512 * 1024
TIPOS_LOGO = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp"}
# El texto del anuncio no puede presentarse como noticia ni prometer rendimientos.
TEXTO_PROHIBIDO = re.compile(r"[úu]ltima hora|noticia|breaking|garantizad|rendimiento seguro|sin riesgo|gana dinero f[aá]cil", re.I)


def leer(ruta=RUTA):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def problemas(c, reglas):
    """Lista de motivos por los que una campaña no puede salir (vacía si está bien)."""
    out = []
    if not str(c.get("marca") or "").strip():
        out.append("falta la marca")
    if c.get("posicion") not in POSICIONES:
        out.append(f"posición inválida (usa {', '.join(POSICIONES)})")
    voz, pantalla = str(c.get("voz") or ""), str(c.get("pantalla") or "")
    if not voz.strip() or len(voz) > MAX_VOZ:
        out.append(f"la voz debe tener entre 1 y {MAX_VOZ} caracteres")
    if len(pantalla) > MAX_PANTALLA:
        out.append(f"el texto en pantalla pasa de {MAX_PANTALLA} caracteres")
    if TEXTO_PROHIBIDO.search(voz + " " + pantalla):
        out.append("el texto se presenta como noticia o promete rendimientos")
    if c.get("enlace") and not str(c["enlace"]).startswith("https://"):
        out.append("el enlace debe ser https://")
    if str(c.get("categoria") or "").lower() in {x.lower() for x in reglas.get("categorias_prohibidas", [])}:
        out.append(f"categoría no permitida: {c.get('categoria')}")
    if not c.get("contrato"):
        out.append("falta la referencia del contrato u orden de inserción")
    return out


def vigentes(cfg, fecha):
    """Campañas que salen en el video de `fecha` (AAAA-MM-DD), en el orden del archivo, hasta el máximo por video."""
    reglas = (cfg or {}).get("reglas", {})
    try:
        dia = date.fromisoformat(fecha)
    except ValueError:
        return []
    out = []
    for c in (cfg or {}).get("campanias", []):
        if not c.get("activo") or problemas(c, reglas):
            continue
        if c.get("desde") and fecha < c["desde"] or c.get("hasta") and fecha > c["hasta"]:
            continue
        if c.get("dias") and DIAS[dia.weekday()] not in c["dias"]:
            continue
        out.append(c)
    return out[: int(reglas.get("max_por_video", 2))]


def logo_data(ruta_relativa, raiz=os.path.join(os.path.dirname(__file__), "..", "..")):
    """Logo como data URI (la plantilla se abre con file:// y no debe pedir nada a internet). None si no sirve."""
    if not ruta_relativa:
        return None
    ruta = os.path.normpath(os.path.join(raiz, ruta_relativa))
    tipo = TIPOS_LOGO.get(os.path.splitext(ruta)[1].lower())
    base = os.path.normpath(os.path.join(raiz, "assets", "patrocinios"))
    if not tipo or not ruta.startswith(base + os.sep) or not os.path.isfile(ruta) or os.path.getsize(ruta) > MAX_LOGO:
        return None
    with open(ruta, "rb") as f:
        return f"data:{tipo};base64,{base64.b64encode(f.read()).decode()}"


def escena(c):
    marca = c["marca"].strip()
    return {"tipo": "patrocinio", "encabezado": "Publicidad", "marca": marca, "texto": (c.get("pantalla") or "").strip(),
            "enlace": c.get("enlace", ""), "logo": logo_data(c.get("logo")),
            "voz": f"Mensaje patrocinado por {marca}. {c['voz'].strip()} Fin del mensaje patrocinado. Seguimos con las noticias."
            if c["posicion"] != "cierre" else f"Mensaje patrocinado por {marca}. {c['voz'].strip()}"}


def insertar(escenas, campanias):
    """Apertura: después de la portada. Pausa: antes de Indicadores (o a la mitad de las notas). Cierre: antes de la
    despedida. Nunca entre dos notas de la misma sección."""
    esc = list(escenas)
    for c in campanias:
        e = escena(c)
        if c["posicion"] == "apertura":
            i = next((k + 1 for k, x in enumerate(esc) if x["tipo"] == "portada"), 0)
        elif c["posicion"] == "cierre":
            i = next((k for k, x in enumerate(esc) if x["tipo"] == "cierre"), len(esc))
        else:
            i = next((k for k, x in enumerate(esc) if x["tipo"] == "economia"), None)
            if i is None:
                notas = [k for k, x in enumerate(esc) if x["tipo"] == "nota"]
                medio = notas[len(notas) // 2] if notas else len(esc)
                # recorrer hasta un cambio de sección para no partir una sección en dos
                i = next((k for k in range(medio, len(esc)) if esc[k]["tipo"] != "nota" or esc[k].get("seccion") != esc[k - 1].get("seccion")), medio)
        esc.insert(i, e)
    return esc


def marcar_conflictos(escenas, campanias):
    """Si una nota o un instrumento de Mercados menciona a una marca patrocinadora, se dice en pantalla. Devuelve las
    marcas que aparecieron en las noticias (para la descripción)."""
    vistas = []
    for c in campanias:
        nombres = [c["marca"]] + list(c.get("alias") or [])
        pat = re.compile(r"\b(" + "|".join(re.escape(n) for n in nombres if n) + r")\b", re.I)
        for e in escenas:
            if e["tipo"] == "nota" and pat.search(f"{e.get('texto', '')} {e.get('medio', '')}"):
                e["aviso_patrocinador"] = f"{c['marca']} patrocina este programa"
                vistas.append(c["marca"])
            if e["tipo"] == "mercados":
                for f in e.get("filas") or []:
                    if pat.search(f"{f.get('nombre', '')} {f.get('ticker', '')}"):
                        f["aviso_patrocinador"] = "patrocinador"
                        vistas.append(c["marca"])
    return sorted(set(vistas))


def descripcion(campanias, marcas_en_noticias=()):
    """(línea para arriba de la descripción, bloque para abajo)."""
    if not campanias:
        return "", ""
    marcas = ", ".join(dict.fromkeys(c["marca"] for c in campanias))
    arriba = f"Incluye promoción pagada de {marcas}. Las noticias no son patrocinadas ni revisadas por los patrocinadores."
    lineas = ["Patrocinadores de este video:"] + [f"• {c['marca']}" + (f": {c['enlace']}" if c.get("enlace") else "") for c in campanias]
    if marcas_en_noticias:
        lineas.append(f"Aviso: hoy hay notas o datos sobre {', '.join(marcas_en_noticias)}, que patrocina este programa.")
    return arriba, "\n".join(lineas)


def aplicar(g, cfg=None):
    """Agrega los patrocinios vigentes al guion `g` (escenas, descripción y bandera de promoción pagada)."""
    cfg = leer() if cfg is None else cfg
    camp = vigentes(cfg, g["fecha"])
    if not camp:
        g["patrocinio"] = False
        return g
    g["escenas"] = insertar(g["escenas"], camp)
    vistas = marcar_conflictos(g["escenas"], camp)
    arriba, abajo = descripcion(camp, vistas)
    partes = g["descripcion"].split("\n", 1)
    g["descripcion"] = (partes[0] + "\n" + arriba + ("\n" + partes[1] if len(partes) > 1 else "") + "\n\n" + abajo)[:4900]
    g["patrocinio"] = True
    g["patrocinadores"] = [c["marca"] for c in camp]
    return g
