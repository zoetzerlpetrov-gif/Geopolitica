"""Autorización única para que GitHub pueda subir videos a TU canal de YouTube. Se corre UNA vez, en tu computadora.

Pasos:
  1. En Google Cloud: proyecto → «YouTube Data API v3» habilitada → credencial «ID de cliente OAuth» de tipo
     «App de escritorio». Copia el ID de cliente y el secreto (no los pegues en ningún chat).
  2. En una terminal:  python3 tools/noticiero_video/autorizar.py
     Te pide el ID y el secreto, abre el navegador, eliges la cuenta del canal y aceptas.
  3. Imprime un «refresh token». Cópialo en GitHub → Settings → Secrets and variables → Actions → New repository
     secret, con el nombre YT_REFRESH_TOKEN. Crea también YT_CLIENT_ID y YT_CLIENT_SECRET con los valores del paso 1.
Solo pide permiso para SUBIR videos (scope youtube.upload): no puede leer ni borrar nada de tu cuenta.
Sin dependencias: usa la biblioteca estándar de Python.
"""
import getpass
import http.server
import json
import secrets
import urllib.parse
import urllib.request
import webbrowser

AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/youtube.upload"


def main():
    cid = input("ID de cliente OAuth: ").strip()
    secreto = getpass.getpass("Secreto del cliente (no se muestra al escribir): ").strip()
    estado = secrets.token_urlsafe(16)
    recibido = {}

    class Manejador(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(self.path).query))
            recibido.update(q)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("Listo. Ya puedes cerrar esta pestaña y volver a la terminal.".encode("utf-8"))

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", 0), Manejador)
    redir = f"http://127.0.0.1:{srv.server_port}/"
    url = AUTH + "?" + urllib.parse.urlencode({"client_id": cid, "redirect_uri": redir, "response_type": "code", "scope": SCOPE,
                                               "access_type": "offline", "prompt": "consent", "state": estado})
    print("Abriendo el navegador. Si no se abre, copia esta dirección:\n" + url)
    webbrowser.open(url)
    srv.handle_request()
    if recibido.get("state") != estado or "code" not in recibido:
        raise SystemExit(f"No se recibió la autorización ({recibido.get('error', 'sin código')}).")
    datos = urllib.parse.urlencode({"code": recibido["code"], "client_id": cid, "client_secret": secreto, "redirect_uri": redir, "grant_type": "authorization_code"}).encode()
    with urllib.request.urlopen(urllib.request.Request(TOKEN, data=datos), timeout=60) as r:
        tok = json.load(r)
    if "refresh_token" not in tok:
        raise SystemExit("Google no entregó refresh token. Quita el acceso de la app en myaccount.google.com/permissions y repite.")
    print("\nCopia este valor en el secreto YT_REFRESH_TOKEN de GitHub (y no lo compartas):\n")
    print(tok["refresh_token"])


if __name__ == "__main__":
    main()
