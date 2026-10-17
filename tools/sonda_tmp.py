import subprocess
def c(u, n=600, t="60"):
    r = subprocess.run(["curl", "-s", "-L", "-m", t, "-A", "Mozilla/5.0 (compatible; Geopolitica-monitor/1.0)", "-w", "\n[HTTP %{http_code} %{time_total}s]", u], capture_output=True, text=True)
    print("==", u, "\n", r.stdout[:n].replace("\n", " | "))
c("https://api.frankfurter.dev/v1/latest?base=USD&symbols=MXN,EUR,JPY,GBP,CNY,BRL,CAD")
c("https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500", 300, "90")
c("https://api.stlouisfed.org/fred/series/observations?series_id=SP500&file_type=json&limit=2&sort_order=desc", 300)
c("https://gold-api.com/robots.txt", 300)
for s in ["XPT", "XPD", "CL", "BTC"]:
    c(f"https://api.gold-api.com/price/{s}", 250)
c("https://api.gold-api.com/symbols", 800)
c("https://www.bmv.com.mx/robots.txt", 300)
c("https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno", 300)
