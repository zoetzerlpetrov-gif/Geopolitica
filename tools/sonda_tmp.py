import json, os, subprocess, sys, time
t0 = time.time()
subprocess.run([sys.executable, "-u", "tools/historia/cronologia.py", "/tmp/historia"], check=True)
print(f"TOTAL {time.time()-t0:.0f} s")
fs = sorted(os.listdir("/tmp/historia")); print(len(fs), "archivos", sum(os.path.getsize("/tmp/historia/" + f) for f in fs) // 1024, "KB")
for iso in ("MEX", "USA", "FRA", "CHN", "COL", "EGY"):
    h = json.load(open(f"/tmp/historia/{iso}.json"))["hechos"]
    print(f"\n## {iso} {len(h)} hechos, {os.path.getsize(f'/tmp/historia/{iso}.json')//1024} KB")
    for f in h[:: max(1, len(h) // 20)]: print("  ", f[2][:11], f[1], "|", f[4])
