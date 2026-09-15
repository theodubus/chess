#!/usr/bin/env bash
#
# Balayage par mutation, sous verrou exclusif.
#
#   tools/mutants.sh --file engine/src/tt.rs
#   tools/mutants.sh                          # tout le moteur
#
# Pourquoi le verrou
#
# Le 15 sept. 2026, j'ai relancé un balayage alors que le précédent tournait
# encore. Les deux processus écrivent dans le même `mutants.out/` : `missed.txt`
# mélangeait les survivants de l'ancien code et du nouveau, avec des numéros de
# ligne d'une version qui n'existait plus. J'ai lu ce mélange comme un résultat.
#
# C'est le même piège que « ne jamais faire tourner deux matchs en même temps »,
# transposé : deux mesures concurrentes ne se contentent pas d'être lentes,
# elles se corrompent. Un verrou rend la faute inexprimable au lieu de la
# confier à ma vigilance.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERROU="$ROOT/mutants.out.lock"
exec 9>"$VERROU"
if ! flock -n 9; then
    echo "mutants.sh : un balayage tourne déjà (verrou $VERROU)." >&2
    echo "Attendre qu'il finisse, ou le tuer : pkill -f cargo-mutants" >&2
    exit 2
fi

# `mutants.out/` d'un balayage précédent fausserait la lecture des survivants.
rm -rf "$ROOT/mutants.out"

# `--profile mutants` hérite de release sans LTO : le LTO recompile tout le
# graphe à chaque mutant. Le code testé reste optimisé.
exec cargo mutants --profile mutants "$@"
