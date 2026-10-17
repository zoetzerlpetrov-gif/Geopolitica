import json, urllib.request, urllib.parse
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
O = {"Origin": "https://zoetzerlpetrov-gif.github.io", "User-Agent": UA}
def pedir(u):
    r = urllib.request.Request(u, headers=O)
    try:
        with urllib.request.urlopen(r, timeout=40) as x:
            return x.status, dict(x.headers), x.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
for u in ["https://api.adsbdb.com/v0/aircraft/0D0A1C", "https://api.adsbdb.com/v0/callsign/AMX123", "https://hexdb.io/api/v1/aircraft/0D0A1C",
          "https://hexdb.io/hex-reg?hex=0D0A1C", "https://hexdb.io/hex-type?hex=0D0A1C", "https://api.adsbdb.com/robots.txt", "https://hexdb.io/robots.txt"]:
    s, h, b = pedir(u)
    print("==", u, s, {k: v for k, v in h.items() if k.lower().startswith("access-control")}); print(b[:600].decode("utf-8", "replace"))
q = urllib.parse.quote('intitle:"XA-VLE"')
s, h, b = pedir(f"https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=5&format=json&origin=*&srsearch={q}")
print("== commons matricula", s, h.get("Access-Control-Allow-Origin"), b[:500])
q = urllib.parse.quote("Volaris Airbus A320neo")
s, h, b = pedir(f"https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=5&format=json&origin=*&srsearch={q}")
print("== commons aerolinea+modelo", s, b[:500])
