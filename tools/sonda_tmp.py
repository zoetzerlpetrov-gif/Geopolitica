import re, subprocess
H = ["dwespanol", "FRANCE24Espanol", "BBCNewsMundo", "euronewses", "AssociatedPress", "Reuters", "aljazeeraenglish", "SkyNews", "CNNEE", "dwnews", "France24_en", "elpais", "NTN24", "TVAzteca", "nmas"]
def get(u):
    return subprocess.run(["curl", "-s", "-L", "-m", "30", "-A", "Mozilla/5.0", "-H", "Accept-Language: en", u], capture_output=True, text=True).stdout
print(get("https://www.youtube.com/robots.txt")[:600].replace("\n", " | "))
for h in H:
    t = get(f"https://www.youtube.com/@{h}")
    m = re.search(r'"(?:externalId|channelId)":"(UC[\w-]{22})"', t) or re.search(r'channel/(UC[\w-]{22})', t)
    cid = m.group(1) if m else None
    n = 0; titulo = ""
    if cid:
        x = get(f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}")
        n = x.count("<entry>"); tt = re.findall(r"<title>(.*?)</title>", x); titulo = tt[1][:70] if len(tt) > 1 else ""
    print(h, cid, n, titulo)
