#!/usr/bin/env bash
#
# Fait jouer le MÊME match par les deux arbitres et compare leurs verdicts.
#
#   tools/crosscheck.sh [binaire] [profondeur-A] [profondeur-B]
#
# À quoi ça sert : un arbitre qui partagerait les angles morts du moteur
# rendrait une mesure fausse sans que rien ne le signale. Deux implémentations
# indépendantes qui s'accordent écartent cette hypothèse.
#
# À relancer après toute modification de la couche UCI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FASTCHESS="$ROOT/tools/arbiters/fastchess"
CUTECHESS="$ROOT/tools/arbiters/cutechess-cli"
ENGINE="${1:-$ROOT/target/release/shallowred}"
DEPTH_A="${2:-4}"
DEPTH_B="${3:-2}"
BOOK="${BOOK:-$ROOT/tools/book.epd}"
ROUNDS="${ROUNDS:-12}"

for binary in "$FASTCHESS" "$CUTECHESS"; do
  [[ -x "$binary" ]] || {
    echo "arbitre absent : $binary" >&2
    echo "lancer tools/setup-arbiters.sh --with-cutechess" >&2
    exit 1
  }
done
export QT_QPA_PLATFORM=offscreen

# Les deux arbitres impriment un score COURANT après chaque partie : il faut
# lire la dernière ligne, pas la première. Ce piège a produit un faux
# désaccord la première fois que ce script a tourné.
fc_result() {
  sed -n 's/.*Wins: \([0-9]*\), Losses: \([0-9]*\), Draws: \([0-9]*\).*/\1-\2-\3/p' | tail -1
}
cc_result() {
  sed -n 's/^Score of .*: \([0-9]*\) - \([0-9]*\) - \([0-9]*\).*/\1-\2-\3/p' | tail -1
}

echo "==> fastchess"
FC=$("$FASTCHESS" \
  -engine cmd="$ENGINE" name=A depth="$DEPTH_A" \
  -engine cmd="$ENGINE" name=B depth="$DEPTH_B" \
  -openings file="$BOOK" format=epd order=sequential \
  -rounds "$ROUNDS" -games 2 -repeat -concurrency 1 2>&1 | fc_result)
echo "    victoires-défaites-nulles : $FC"

echo "==> cutechess-cli"
CC=$("$CUTECHESS" \
  -engine cmd="$ENGINE" name=A proto=uci tc=inf depth="$DEPTH_A" \
  -engine cmd="$ENGINE" name=B proto=uci tc=inf depth="$DEPTH_B" \
  -openings file="$BOOK" format=epd order=sequential \
  -rounds "$ROUNDS" -games 2 -repeat -concurrency 1 2>&1 | cc_result)
echo "    victoires-défaites-nulles : $CC"

echo
if [[ -n "$FC" && "$FC" == "$CC" ]]; then
  echo "ACCORD : les deux arbitres rendent $CC (victoires-défaites-nulles)."
else
  echo "DÉSACCORD : fastchess \"$FC\", cutechess \"$CC\"." >&2
  echo "Ne pas se fier aux mesures tant que ce n'est pas expliqué." >&2
  exit 1
fi
