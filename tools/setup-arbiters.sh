#!/usr/bin/env bash
#
# Construit les arbitres de match dans tools/arbiters/.
#
# Deux arbitres, et c'est délibéré (arbitrage A14) :
#
#   fastchess      — arbitre de travail. SPRT pentanomial, aucune dépendance.
#   cutechess-cli  — contre-vérification. Implémentation indépendante ; si les
#                    deux s'accordent sur un même match, l'arbitre retenu ne
#                    partage pas les angles morts du moteur.
#
# Les deux sont épinglés sur un commit précis. Une dépendance flottante fait
# casser la mesure sans qu'aucune ligne de notre code ait changé — on a déjà
# payé cette leçon sur la toolchain Rust.
set -euo pipefail

FASTCHESS_COMMIT=60d7a7a26c6b0582a15c112fb29a1829bef2adb3
CUTECHESS_COMMIT=5e84232be4546aaedc9d87a96c91867a1da06ada

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/tools/arbiters"
WITH_CUTECHESS=0
[[ "${1:-}" == "--with-cutechess" ]] && WITH_CUTECHESS=1

mkdir -p "$DEST"

build_fastchess() {
  echo "==> fastchess @ ${FASTCHESS_COMMIT:0:7}"
  local src="$DEST/fastchess-src"
  if [[ ! -d "$src/.git" ]]; then
    git clone -q https://github.com/Disservin/fastchess "$src"
  fi
  git -C "$src" fetch -q origin "$FASTCHESS_COMMIT" 2>/dev/null || git -C "$src" fetch -q
  git -C "$src" checkout -q "$FASTCHESS_COMMIT"
  make -C "$src" -j"$(nproc)" >/dev/null
  cp "$src/fastchess" "$DEST/fastchess"
  "$DEST/fastchess" --version
}

build_cutechess() {
  echo "==> cutechess-cli @ ${CUTECHESS_COMMIT:0:7}"
  # Qt6 est une dépendance lourde ; elle n'est installée que si l'on demande
  # explicitement la contre-vérification.
  if ! ls /usr/lib/*/cmake/Qt6 >/dev/null 2>&1; then
    echo "    installation de Qt6 (sudo requis)"
    # `update` peut échouer pour une raison étrangère au dépôt — un PPA tiers
    # de l'environnement qui n'est plus signé l'a fait le 23 sept. 2026 dans
    # le conteneur de session. L'installation, elle, réussit souvent avec les
    # listes déjà présentes : c'est elle qui doit trancher, pas `update`.
    sudo apt-get update -qq \
      || echo "    apt-get update a échoué — installation tentée avec les listes présentes"
    sudo apt-get install -y -qq qt6-base-dev qt6-base-dev-tools qt6-svg-dev
  fi
  local src="$DEST/cutechess-src"
  if [[ ! -d "$src/.git" ]]; then
    git clone -q https://github.com/cutechess/cutechess "$src"
  fi
  git -C "$src" fetch -q origin "$CUTECHESS_COMMIT" 2>/dev/null || git -C "$src" fetch -q
  git -C "$src" checkout -q "$CUTECHESS_COMMIT"
  cmake -S "$src" -B "$src/build" -DCMAKE_BUILD_TYPE=Release -DWITH_TESTS=OFF >/dev/null
  cmake --build "$src/build" -j"$(nproc)" >/dev/null
  cp "$src/build/cutechess-cli" "$DEST/cutechess-cli"
  QT_QPA_PLATFORM=offscreen "$DEST/cutechess-cli" --version | head -1
}

build_fastchess
[[ $WITH_CUTECHESS -eq 1 ]] && build_cutechess

echo
echo "Arbitres prêts dans tools/arbiters/."
# `if` et non `[[ … ]] && echo` : en DERNIÈRE ligne, ce raccourci rendait son
# code d'échec au script entier. Avec --with-cutechess, le test est faux, donc
# le script réussi sortait en 1 — vu le 23 sept. 2026 en construisant
# cutechess pour le ponder. Toute étape de CI qui l'aurait appelé aurait
# échoué sur une construction réussie.
if [[ $WITH_CUTECHESS -eq 0 ]]; then
  echo "cutechess-cli non construit : relancer avec --with-cutechess."
fi
