import sys, time
sys.path.insert(0, "tools/historia")
import cronologia as C
for clase in ("Q198", "Q178561", "Q7944", "Q3024240"):
    t0 = time.time()
    try:
        r = C.filas(C.pedir(C.consulta(clase), intentos=1), C.CLASES[clase])
        print(C.CLASES[clase], f"{time.time()-t0:.1f}s", len(r), "países", sum(len(v) for v in r.values()), "filas", (r.get("MEX") or [])[:4])
    except Exception as e:
        print(C.CLASES[clase], "ERROR", e, f"{time.time()-t0:.1f}s")
