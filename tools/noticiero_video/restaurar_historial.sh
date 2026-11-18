#!/usr/bin/env bash
# Cada destino tiene su propio repositorio: git archive no debe heredar el prefijo de una subcarpeta.
set -euo pipefail
destino=$1
url="${DESTINO_GIT:-https://x-access-token:${TOKEN:-}@github.com/${GITHUB_REPOSITORY:-}.git}"
mkdir -p "$destino"
cd "$destino"
git init -q
git fetch -q --depth 1 "$url" datos-comentarios
git archive FETCH_HEAD | tar -x
if [ ! -d guiones ]; then
  echo "::warning::El historial publicado aún no contiene guiones; se inicia vacío. La consulta de la rama sí terminó correctamente."
fi
mkdir -p guiones comentarios
