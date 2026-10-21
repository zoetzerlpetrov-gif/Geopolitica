"""Sonda temporal del Lote E (3): estructura del índice de leyes y DOF por fecha."""
import os, re, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F
t = F.get("https://www.diputados.gob.mx/LeyesBiblio/index.htm", timeout=60).decode("latin-1")
i = t.find("Aduanera")
print(repr(t[i - 2500:i + 2500]))
print("fechas dd/mm/aaaa:", len(re.findall(r"\d{2}/\d{2}/\d{4}", t)), "· dd-mm-aaaa:", len(re.findall(r"\d{2}-\d{2}-\d{4}", t)), "· filas <tr>:", t.count("<tr"))
for u in ["https://dof.gob.mx/index.php?year=2026&month=10&day=20", "https://dof.gob.mx/index_111.php?year=2026&month=10&day=20",
          "https://dof.gob.mx/sumario.xml?fecha=20/10/2026"]:
    try:
        b = F.get(u, timeout=40).decode("latin-1", "replace")
        print("OK", F.permitido_por_robots(u), u, len(b), b.count("nota_detalle.php"), re.findall(r"fecha=(\d{2}/\d{2}/\d{4})", b)[:3])
    except Exception as e:
        print("ERR", u, e)
