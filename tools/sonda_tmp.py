import json, subprocess
r = subprocess.run(["python3", "tools/conflictos/videos.py"], capture_output=True, text=True, timeout=300)
print(r.stdout, r.stderr[-800:])
try:
    d = json.load(open("vivos/conflictos_videos.json"))
    print(d.get("errores"))
    print({k: len(v) for k, v in d["videos"].items()})
    for k in ("ucrania", "sudan", "mexico"):
        for v in d["videos"].get(k, [])[:2]:
            print(k, v)
except Exception as e:
    print("sin archivo", e)
