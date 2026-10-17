import json, time, urllib.request
U = "https://geopolitica-vuelos.zoetzerl-petrov.workers.dev"
O = "https://zoetzerlpetrov-gif.github.io"
def pedir(path, origen=O):
    r = urllib.request.Request(U + path, headers={"Origin": origen, "User-Agent": "sonda-geopolitica"})
    try:
        with urllib.request.urlopen(r, timeout=40) as x:
            return x.status, dict(x.headers), x.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
for path in ["/punto/19.5/-99.25/50", "/punto/40.75/-73.75/100", "/punto/51.5/0/25"]:
    s, h, b = pedir(path)
    try:
        d = json.loads(b)
    except ValueError:
        d = {"crudo": b[:200]}
    print(path, s, h.get("Access-Control-Allow-Origin"), len(d.get("ac", [])), "aviones; restantes:", d.get("restantes"), d.get("error", ""))
    if d.get("ac"):
        print("  ejemplo:", json.dumps(d["ac"][0]))
    time.sleep(2)
print("otro origen:", pedir("/punto/19.5/-99.25/50", "https://otro.com")[0])
# 1792248742
import os, urllib.parse
print("--- directo desde GitHub Actions con la cuenta")
try:
    body = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": os.environ["OS_ID"], "client_secret": os.environ["OS_SECRETO"]}).encode()
    r = urllib.request.Request("https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token", data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})
    t0 = time.time()
    with urllib.request.urlopen(r, timeout=40) as x:
        tok = json.loads(x.read())
    print("token:", "ok", tok.get("expires_in"), "s", f"({time.time()-t0:.1f} s)")
    r = urllib.request.Request("https://opensky-network.org/api/states/all?extended=1&lamin=19&lomin=-100&lamax=20&lomax=-98", headers={"Authorization": "Bearer " + tok["access_token"]})
    with urllib.request.urlopen(r, timeout=40) as x:
        d = json.loads(x.read()); print("estados:", x.status, len(d.get("states") or []), "restantes:", x.headers.get("X-Rate-Limit-Remaining"))
except Exception as e:
    print("error:", e)
print("--- intermediario otra vez")
s, h, b = pedir("/punto/19.5/-99.25/50"); print(s, b[:200])
