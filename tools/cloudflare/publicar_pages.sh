#!/usr/bin/env bash
# Publica el sitio ya armado (_site) en Cloudflare Pages (Direct Upload con Wrangler).
# Requisitos (secretos de GitHub): CLOUDFLARE_API_TOKEN con permisos «Cloudflare Pages: Edit» y «Workers R2 Storage:
# Edit», y CLOUDFLARE_ACCOUNT_ID. Sin ellos no hace nada (sale con 0) y el sitio sigue en GitHub Pages.
# Archivos de más de 25 MiB (límite de Pages): se suben a R2 (solo si cambiaron) y una Function los sirve con rangos.
set -euo pipefail
origen=${1:?carpeta del sitio}
PROYECTO=${CF_PROYECTO:-dominus-osint}
BUCKET=${CF_R2:-dominus-grandes}
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
    if ! grep -qxF "$h" huellas_previas.txt; then
      echo "Subiendo a R2: ${f#data/} ($(du -h "sitio/$f" | cut -f1))"
      $W r2 object put "$BUCKET/${f#data/}" --file "sitio/$f" --remote --content-type application/octet-stream
    fi
    rutas+=("/$f")
    rm -f "sitio/$f"
  done
  $W r2 object put "$BUCKET/_huellas.txt" --file huellas.txt --remote --content-type text/plain >/dev/null
fi
# 2) Las Functions solo se invocan en esas rutas (el resto es estático y no consume el cupo de Workers).
python3 - "${rutas[@]}" > sitio/_routes.json <<'PY'
import json, sys
print(json.dumps({"version": 1, "include": sys.argv[1:] or ["/__sin_funciones__"], "exclude": []}))
PY
# 3) Proyecto (se crea la primera vez) y publicación en producción.
$W pages project create "$PROYECTO" --production-branch main >/dev/null 2>&1 || true
$W pages deploy --project-name "$PROYECTO" --branch main --commit-dirty=true
echo "Publicado en https://$PROYECTO.pages.dev (y en el dominio propio si ya está conectado)."
