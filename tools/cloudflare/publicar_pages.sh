#!/usr/bin/env bash
# Publica el sitio ya armado (_site) en Cloudflare Pages (Direct Upload con Wrangler).
# Requisitos (secretos de GitHub): CLOUDFLARE_API_TOKEN con permisos «Cloudflare Pages: Edit» y «Workers R2 Storage:
# Edit», y CLOUDFLARE_ACCOUNT_ID. Sin ellos no hace nada (sale con 0) y el sitio sigue en GitHub Pages.
# Archivos de más de 25 MiB (límite de Pages): se suben a R2 (solo si cambiaron) y una Function los sirve con rangos.
set -euo pipefail
origen=${1:?carpeta del sitio}
PROYECTO=${CF_PROYECTO:-dominus-osint}
BUCKET=${CF_R2:-dominus-grandes}
# Ambiente: «main» = producción (dominusosint.com). Otra rama (pruebas, uat) = copia de vista previa en
# https://<rama>.dominus-osint.pages.dev: lee los buckets pero NUNCA los escribe (no pisa datos de producción).
RAMA=${CF_RAMA:-main}
[[ "$RAMA" =~ ^[a-z0-9-]+$ ]] || { echo "::error::Rama de Cloudflare no válida: $RAMA"; exit 1; }
W="npx --yes wrangler@4.158.0"
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "Sin CLOUDFLARE_API_TOKEN o CLOUDFLARE_ACCOUNT_ID: no se publica en Cloudflare (el sitio sigue en GitHub Pages)."
  exit 0
fi
raiz=$(cd "$(dirname "$0")/../.." && pwd)
trabajo=$(mktemp -d)
cp -r "$origen" "$trabajo/sitio"
cp -r "$raiz/cloudflare/pages/functions" "$trabajo/functions"
cd "$trabajo"
cat > wrangler.toml <<TOML
name = "$PROYECTO"
pages_build_output_dir = "./sitio"
compatibility_date = "2026-11-01"
TOML
# R2 se activa una vez en el panel de Cloudflare (pide un método de pago aunque el uso quede en el nivel gratuito).
r2=0
$W r2 bucket create "$BUCKET" >/dev/null 2>&1 || true
if $W r2 bucket list 2>/dev/null | grep -q "$BUCKET"; then
  r2=1
  printf '\n[[r2_buckets]]\nbinding = "GRANDES"\nbucket_name = "%s"\n' "$BUCKET" >> wrangler.toml
else
  echo "::warning::R2 no está activo en la cuenta de Cloudflare: los archivos de más de 25 MiB no se publican en Cloudflare (el resto del sitio sí)."
fi

# 1) Archivos grandes → R2 (solo los que cambiaron; la lista de huellas vive en el propio bucket).
mapfile -t grandes < <(cd sitio && find . -type f -size +25M | sed 's|^\./||' | sort)
rutas=()
if [ ${#grandes[@]} -gt 0 ] && [ "$r2" = 0 ]; then
  for f in "${grandes[@]}"; do echo "Se omite en Cloudflare (sin R2): $f"; rm -f "sitio/$f"; done
  grandes=()
fi
if [ ${#grandes[@]} -gt 0 ]; then
  $W r2 object get "$BUCKET/_huellas.txt" --remote --pipe > huellas_previas.txt 2>/dev/null || : > huellas_previas.txt
  : > huellas.txt
  for f in "${grandes[@]}"; do
    case "$f" in data/capas/*) ;; *) echo "::warning::$f pasa de 25 MiB y no está en data/capas/: no se publica en Cloudflare"; rm -f "sitio/$f"; continue;; esac
    h="$(sha256sum "sitio/$f" | cut -d' ' -f1)  ${f#data/}"
    echo "$h" >> huellas.txt
    if [ "$RAMA" = main ] && ! grep -qxF "$h" huellas_previas.txt; then
      echo "Subiendo a R2: ${f#data/} ($(du -h "sitio/$f" | cut -f1))"
      $W r2 object put "$BUCKET/${f#data/}" --file "sitio/$f" --remote --content-type application/octet-stream
    fi
    rutas+=("/$f")
    rm -f "sitio/$f"
  done
  [ "$RAMA" = main ] && $W r2 object put "$BUCKET/_huellas.txt" --file huellas.txt --remote --content-type text/plain >/dev/null
fi
# 1b) Datos por plan (config/datos_por_plan.json con «activo»: true): los archivos que solo usan los planes de pago
#     se suben al bucket privado dominus-datos-plan (solo los que cambiaron) y se quitan del sitio público.
#     El Worker los entrega a la sesión con el plan (cloudflare/planes/datos.js). Con «activo»: false no se toca nada.
mapfile -t protegidos < <(python3 - "$raiz/config/datos_por_plan.json" sitio <<'PY'
import json, os, sys
c = json.load(open(sys.argv[1], encoding="utf-8"))
if c.get("activo"):
    a = c.get("archivos") or {}
    for base, _, fs in os.walk(os.path.join(sys.argv[2], "data")):
        for f in fs:
            r = os.path.relpath(os.path.join(base, f), sys.argv[2]).replace(os.sep, "/")
            if r in a or any(k.endswith("/") and r.startswith(k) for k in a):
                print(r)
PY
)
if [ ${#protegidos[@]} -gt 0 ]; then
  if [ "$r2" = 0 ]; then
    echo "::error::Datos por plan activos pero R2 no está disponible: no se publica para no exponer ni perder datos."
    exit 1
  fi
  # Resumen sin contenido (fechas y errores) para que el Centro de control siga vigilando estos archivos.
  python3 "$raiz/tools/pages/resumen_protegidos.py" sitio "${protegidos[@]}"
  BPLAN=dominus-datos-plan
  $W r2 object get "$BPLAN/_huellas.txt" --remote --pipe > huellas_plan_previas.txt 2>/dev/null || : > huellas_plan_previas.txt
  : > huellas_plan.txt
  for f in "${protegidos[@]}"; do
    h="$(sha256sum "sitio/$f" | cut -d' ' -f1)  $f"
    echo "$h" >> huellas_plan.txt
    if [ "$RAMA" = main ] && ! grep -qxF "$h" huellas_plan_previas.txt; then
      $W r2 object put "$BPLAN/$f" --file "sitio/$f" --remote --content-type application/octet-stream >/dev/null
    fi
    rm -f "sitio/$f"
  done
  [ "$RAMA" = main ] && $W r2 object put "$BPLAN/_huellas.txt" --file huellas_plan.txt --remote --content-type text/plain >/dev/null
  echo "Datos por plan: ${#protegidos[@]} archivos en R2 (privado) y fuera del sitio público."
fi
# 2) Las Functions solo se invocan en esas rutas (el resto es estático y no consume el cupo de Workers).
python3 - "${rutas[@]}" > sitio/_routes.json <<'PY'
import json, sys
print(json.dumps({"version": 1, "include": sys.argv[1:] or ["/__sin_funciones__"], "exclude": []}))
PY
# 3) Proyecto (se crea la primera vez) y publicación en producción.
$W pages project create "$PROYECTO" --production-branch main >/dev/null 2>&1 || true
$W pages deploy --project-name "$PROYECTO" --branch "$RAMA" --commit-dirty=true
if [ "$RAMA" = main ]; then
  echo "Publicado en https://$PROYECTO.pages.dev (y en el dominio propio si ya está conectado)."
else
  echo "Copia de «$RAMA» publicada en https://$RAMA.$PROYECTO.pages.dev (no toca producción)."
fi
# Respaldo: la misma copia ya limpia (sin datos por plan ni archivos de R2) para GitHub Pages y el archivo descargable.
if [ -n "${RESPALDO_DIR:-}" ] && [ "$RAMA" = main ]; then
  rm -rf "$RESPALDO_DIR" && mkdir -p "$RESPALDO_DIR" && cp -r sitio/. "$RESPALDO_DIR/"
  rm -f "$RESPALDO_DIR/_routes.json"
  echo "Copia de respaldo lista en $RESPALDO_DIR ($(du -sh "$RESPALDO_DIR" | cut -f1))."
fi
