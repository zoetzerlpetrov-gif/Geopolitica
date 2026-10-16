import json, os, subprocess, glob
for s in ["tools/clima/frentes.py", "tools/clima/enso.py", "tools/clima/mar_fondo.py", "tools/espacio/cielo.py"]:
    print("=====", s); print(subprocess.run(["python3", s], capture_output=True, text=True, timeout=400).stdout[-3000:])
for f in sorted(glob.glob("vivos/*")):
    t = open(f).read(); print("=====", f, len(t)); print(t[:2500])
