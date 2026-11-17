#!/usr/bin/env bash
# Solo dos archivos de estafas, en una rama independiente; nunca toca las demás capas.
set -euo pipefail
url="${DESTINO_GIT:-https://x-access-token:${TOKEN:-}@github.com/${GITHUB_REPOSITORY:-}.git}"
fusionar="$(pwd)/tools/red/fusionar_estafas.py"
nuevo="$(pwd)/vivos"
trabajo=$(mktemp -d)
trap 'rm -rf "$trabajo"' EXIT
for intento in 1 2 3; do
  mkdir -p "$trabajo/remoto" "$trabajo/pub/vivos"
  # Si no se puede leer la referencia, no se publica a ciegas.
  git fetch -q --depth 1 "${DESTINO_GIT:-origin}" datos-estafas
  esperado=$(git rev-parse FETCH_HEAD)
  git archive FETCH_HEAD vivos/estafas.geojson vivos/estafas_estado.json | tar -x -C "$trabajo/remoto"
  python3 "$fusionar" "$trabajo/remoto/vivos" "$nuevo" "$trabajo/pub/vivos"
  if (cd "$trabajo/pub" && git init -q && git checkout -q -B datos-estafas \
      && git config user.name geopolitica-bot && git config user.email actions@users.noreply.github.com \
      && git add vivos && git commit -q -m "Estafas: publicación validada" \
      && git push -q --force-with-lease="datos-estafas:${esperado}" "$url" HEAD:datos-estafas); then
    exit 0
  fi
  rm -rf "$trabajo/pub/.git"
  echo "La publicación de estafas cambió durante el envío; se reintenta con la referencia nueva." >&2
done
exit 1
