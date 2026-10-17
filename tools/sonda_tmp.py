import subprocess
def c(u, n=700):
    r = subprocess.run(["curl", "-s", "-m", "25", "-A", "Geopolitica-monitor/1.0", "-w", "\n[HTTP %{http_code}]", u], capture_output=True, text=True)
    print("==", u, "\n", r.stdout[:n])
c("https://stooq.com/robots.txt")
c("https://stooq.com/q/l/?s=^spx+^dji+^ndq+^mxx+^ipc+^dax+^ukx+^nkx+^hsi+^cac+^shc+^bvp+^tsx+xauusd+xagusd+hg.f+cl.f+cb.f+ng.f+usdmxn+eurusd+usdjpy+gbpusd+aapl.us+nvda.us+msft.us+walmex.mx&f=sd2t2ohlc&h&e=csv", 2500)
c("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,tether&vs_currencies=usd&include_24hr_change=true")
c("https://api.frankfurter.app/latest?from=USD&to=MXN,EUR,JPY,GBP,CNY,BRL,CAD")
c("https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500,DCOILWTICO", 400)
c("https://api.gold-api.com/price/XAU")
c("https://api.gold-api.com/price/XAG")
c("https://api.gold-api.com/price/HG")
c("https://query1.finance.yahoo.com/v8/finance/chart/%5EMXX?range=1d&interval=1d", 300)
