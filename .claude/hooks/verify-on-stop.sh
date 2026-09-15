#!/usr/bin/env bash
#
# Hook Stop : refuse de finir un tour sur un arbre cassé.
#
# Le hook existant sur les commits non poussés a rattrapé deux oublis en deux
# jours. Celui-ci applique le même principe à l'état du code : une règle écrite
# se lit et s'oublie, un hook se déclenche.
#
# Sauté quand aucun fichier .rs n'a bougé — inutile de payer six secondes pour
# un tour qui n'a touché que de la documentation.
#
# Garde-fou contre la boucle : si le tour suivant échoue encore de la même
# manière, le hook laisse passer avec un avertissement. Un blocage qu'on ne
# sait pas lever vaut moins qu'un avertissement qu'on lit.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 0

COMPTEUR="${TMPDIR:-/tmp}/shallowred-verify-stop.count"

# Rien de Rust n'a changé : rien à vérifier.
MODIFIES="$(git diff --name-only HEAD -- '*.rs' 2>/dev/null; git ls-files --others --exclude-standard -- '*.rs' 2>/dev/null)"
if [[ -z "$MODIFIES" ]]; then
  rm -f "$COMPTEUR"
  exit 0
fi

if SORTIE="$(tools/verify.sh --rapide 2>&1)"; then
  rm -f "$COMPTEUR"
  exit 0
fi

ESSAIS=$(( $(cat "$COMPTEUR" 2>/dev/null || echo 0) + 1 ))
echo "$ESSAIS" > "$COMPTEUR"

if (( ESSAIS >= 3 )); then
  rm -f "$COMPTEUR"
  printf '%s' "$(jq -nc --arg s "$SORTIE" \
    '{systemMessage: ("verify.sh échoue encore après trois tours — le hook laisse passer.\n" + $s)}')"
  exit 0
fi

printf '%s' "$(jq -nc --arg s "$SORTIE" \
  '{decision: "block",
    reason: ("`tools/verify.sh --rapide` échoue : l’arbre est cassé et des fichiers .rs ont changé. Corriger avant de finir le tour.\n\n" + $s)}')"
exit 0
