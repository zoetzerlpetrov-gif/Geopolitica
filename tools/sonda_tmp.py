import json, os, subprocess, sys, time
t0 = time.time()
subprocess.run([sys.executable, "-u", "tools/clima_tactico/actualizar.py", "--forzar"], check=False)
print(f"TOTAL {time.time()-t0:.0f} s; FIRMS key presente: {bool(os.environ.get('FIRMS_MAP_KEY'))}")
d = "vivos/ct"
for f in sorted(os.listdir(d)):
    p = os.path.join(d, f)
    try:
        j = json.load(open(p))
        n = len(j.get("features", [])) if isinstance(j, dict) and "features" in j else (len(j) if isinstance(j, list) else "-")
    except Exception as e:
        n = f"ERR {e}"
    print(f, os.path.getsize(p) // 1024, "KB", n)
