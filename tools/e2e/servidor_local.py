"""Servidor local para las pruebas por rol (tools/e2e/roles.mjs).

El sitio público (dominusosint.com) siempre muestra la vista Demo o el plan de la cuenta: no acepta ?plan= para no abrir
planes superiores escribiendo el enlace. Para probar cada plan, las pruebas corren sobre una copia local del repositorio
(en local sí se simula el plan) y los archivos que no existen en el repositorio (datos que genera la ingesta, como
data/vivos/*) se piden al sitio publicado, de solo lectura. Uso: python3 tools/e2e/servidor_local.py [puerto]
"""
import http.server
import os
import re
import sys
import urllib.error
import urllib.request

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
REMOTO = "https://dominusosint.com"
UA = "Mozilla/5.0 (X11; Linux x86_64) DOMINUS-pruebas-e2e"
# Solo rutas del propio sitio: letras, números, guiones, puntos y diagonales (sin «..», sin «//», sin esquema ni host).
RUTA_PERMITIDA = re.compile(r"/(?:data|config|vendor|assets|fuentes\.html|reporte|ops)[A-Za-z0-9_./-]*")
CONSULTA_PERMITIDA = re.compile(r"[A-Za-z0-9_=&.%-]{0,200}")


class Manejador(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=RAIZ, **k)

    def log_message(self, *a):
        pass

    def do_GET(self):
        ruta = self.path.split("?")[0]
        local = os.path.normpath(os.path.join(RAIZ, ruta.lstrip("/")))
        if not local.startswith(RAIZ):
            return self.send_error(403)
        if ruta.endswith("/") or os.path.exists(local):
            return super().do_GET()
        consulta = self.path.split("?", 1)[1] if "?" in self.path else ""
        if not RUTA_PERMITIDA.fullmatch(ruta) or ".." in ruta or "//" in ruta or not CONSULTA_PERMITIDA.fullmatch(consulta):
            return self.send_error(404)
        destino = REMOTO + ruta + (f"?{consulta}" if consulta else "")
        try:
            with urllib.request.urlopen(urllib.request.Request(destino, headers={"User-Agent": UA}), timeout=30) as r:
                cuerpo = r.read()
                self.send_response(r.status)
                self.send_header("Content-Type", r.headers.get("Content-Type", "application/octet-stream"))
                self.send_header("Content-Length", str(len(cuerpo)))
                self.end_headers()
                self.wfile.write(cuerpo)
        except urllib.error.HTTPError as e:
            self.send_error(e.code)
        except (urllib.error.URLError, TimeoutError, OSError):
            self.send_error(502)


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("127.0.0.1", PUERTO), Manejador).serve_forever()
