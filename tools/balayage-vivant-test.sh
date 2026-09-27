#!/usr/bin/env bash
#
# Éprouve tools/balayage-vivant.sh. Tourne dans tools/verify.sh et dans la CI,
# juste avant le contrôle qu'il éprouve.
#
# Même argument que `.github/mutation-verdict-test.sh` : la branche précieuse
# de ce script est son ÉCHEC, qui ne se déclenche qu'après deux mois de
# silence. Sans cas fabriqués, elle ne s'exécuterait jamais avant le jour où
# elle doit marcher.
set -uo pipefail

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIVANT="$ICI/balayage-vivant.sh"
MAINTENANT="2026-09-23T23:00:00Z"
echecs=0

cas() {  # cas <nom> <code attendu> <texte attendu> <arguments…>
  local nom="$1" attendu_code="$2" attendu_texte="$3"; shift 3
  local sortie code=0
  sortie="$("$VIVANT" "$@" 2>&1)" || code=$?
  if [[ "$code" != "$attendu_code" ]] || ! grep -qF -- "$attendu_texte" <<<"$sortie"; then
    echo "  ÉCHEC   $nom : code $code (attendu $attendu_code)"; echo "$sortie" | sed 's/^/          /'
    echecs=$((echecs + 1)); return
  fi
  echo "  ok      $nom"
}

cas "vivant : balayé il y a deux jours" 0 "il y a 2 jour(s)" \
  active "2026-09-21T20:00:00Z" "$MAINTENANT"
# Le seuil lui-même : quinze jours passent, seize non. Sans ces deux cas, un
# `>` changé en `>=` ou un seuil déplacé passerait inaperçu.
cas "vivant : quinze jours, pile au seuil" 0 "il y a 15 jour(s)" \
  active "2026-09-08T22:00:00Z" "$MAINTENANT"
cas "arrêté : seize jours sans balayage" 1 "il y a 16 jours" \
  active "2026-09-07T22:00:00Z" "$MAINTENANT"
# Le cas qui a motivé le script : GitHub a endormi le workflow. La date peut
# être récente — c'est l'état qui compte.
cas "arrêté : workflow endormi par GitHub" 1 "« disabled_inactivity »" \
  disabled_inactivity "2026-09-22T04:40:00Z" "$MAINTENANT"
cas "arrêté : aucune exécution" 1 "aucune exécution" \
  active "" "$MAINTENANT"
cas "refus : date illisible" 2 "date illisible" \
  active "mardi dernier" "$MAINTENANT"
cas "refus : arguments manquants" 2 "usage" \
  active

if ((echecs > 0)); then
  echo "$echecs cas en échec"
  exit 1
fi
