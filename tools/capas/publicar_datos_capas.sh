#!/usr/bin/env bash
# Publica capas/ en la rama huérfana datos-capas sin pisar lo que otro workflow acaba de publicar.
#
# Uso (desde la raíz del repo, con capas/ ya construido y TOKEN en el entorno):
#   tools/capas/publicar_datos_capas.sh camaras "mensaje"   # «Cámaras del mundo»: solo cambia cámaras
#   tools/capas/publicar_datos_capas.sh capas   "mensaje"   # «Construir capas»: conserva cámaras más recientes
#
# En cada intento descarga la rama vigente, fusiona (tools/capas/fusionar_camaras.py) y sube con
# --force-with-lease: si alguien publicó en medio, el push se rechaza y se reintenta con la versión nueva.
set -euo pipefail
modo=$1
mensaje=$2
# DESTINO_GIT solo para pruebas locales (tests/test_fusionar_camaras.py); en Actions se usa GitHub.
url="${DESTINO_GIT:-https://x-access-token:${TOKEN:-}@github.com/${GITHUB_REPOSITORY:-}.git}"
fusionar="$(pwd)/tools/capas/fusionar_camaras.py"
construido="$(pwd)/capas"
trabajo=$(mktemp -d)

for intento in 1 2 3; do
  rm -rf "$trabajo/remoto" "$trabajo/pub"
  mkdir -p "$trabajo/remoto" "$trabajo/pub"/capas
  esperado=""
  if git fetch -q --depth 1 "${DESTINO_GIT:-origin}" datos-capas; then
    esperado=$(git rev-parse FETCH_HEAD)
    git archive FETCH_HEAD capas | tar -x -C "$trabajo/remoto"
  elif [ "$modo" = "camaras" ]; then
    echo "No se pudo leer datos-capas: no se publica un catálogo incompleto." >&2
    exit 1
  fi
  mkdir -p "$trabajo/remoto"/capas
  if [ "$modo" = "camaras" ]; then
    python3 "$fusionar" "$trabajo/remoto"/capas "$construido" "$trabajo/pub"/capas
  else
    python3 "$fusionar" "$construido" "$trabajo/remoto"/capas "$trabajo/pub"/capas --solo-si-mas-reciente
  fi
  # Cadena con && (dentro de un «if», set -e no detiene los pasos intermedios).
  if (cd "$trabajo/pub" && git init -q && git checkout -q -b datos-capas \
      && git config user.name "geopolitica-bot" && git config user.email "actions@users.noreply.github.com" \
      && git add capas && git commit -q -m "$mensaje" \
      && git push -q --force-with-lease="datos-capas:${esperado}" "$url" HEAD:datos-capas); then
    echo "Publicado en datos-capas (intento $intento)"
    exit 0
  fi
  echo "La rama cambió mientras se preparaba la publicación; reintento $intento de 3" >&2
  sleep $((intento * ${ESPERA_REINTENTO:-20}))  # ESPERA_REINTENTO=0 en pruebas
done
echo "No se pudo publicar datos-capas tras 3 intentos." >&2
exit 1
