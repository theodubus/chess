#!/usr/bin/env bash
#
# Toutes les vérifications du projet, une seule fois, un seul code de sortie.
#
#   tools/verify.sh            # tout : fmt, clippy, tests, acceptation, bench
#   tools/verify.sh --rapide   # fmt, clippy, tests debug — quelques secondes
#
# Pourquoi ce script existe
#
# Le 14 sept. 2026, un test échouait en debug et je ne l'ai pas vu : j'avais
# filtré la sortie de `cargo test` sur « test result » et sommé les totaux avec
# `awk`. La ligne disait « FAILED », la somme disait 81, et j'ai lu la somme.
#
# Lire une sortie de test, c'est se donner une occasion de la lire de travers.
# Un code de sortie ne se lit pas de travers. Ce script n'existe que pour ça :
# rendre l'échec impossible à manquer.
#
# Il n'arrête PAS à la première faute — il les exécute toutes et les rapporte
# ensemble. Découvrir trois problèmes d'un coup coûte moins cher que trois
# allers-retours.

set -uo pipefail

# Sans locale UTF-8, `${#mot}` compte les OCTETS : « critères » y vaut 9 au lieu
# de 8, et chaque accent décale une colonne. Le conteneur ne définit ni LANG ni
# LC_ALL, d'où ce réglage explicite.
export LC_ALL=C.UTF-8

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RAPIDE=0
[[ "${1:-}" == "--rapide" ]] && RAPIDE=1

ECHECS=()
LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

etape() {
  local nom="$1"; shift
  printf '  %s%*s' "$nom" $(( 46 - ${#nom} )) ''
  if "$@" > "$LOG" 2>&1; then
    printf 'ok\n'
  else
    printf 'ECHEC\n'
    ECHECS+=("$nom")
    # La sortie complète d'un échec, pas un extrait : c'est le moment où on en
    # a besoin, et la tronquer oblige à relancer.
    sed 's/^/      | /' "$LOG"
  fi
}

echo "vérification de ShallowRed — $(git rev-parse --short HEAD 2>/dev/null || echo 'hors dépôt')"
echo

etape "format"                    cargo fmt --all -- --check
etape "clippy"                    cargo clippy --all-targets --all-features -- -D warnings
etape "tests (debug)"             cargo test --workspace
# Le verdict du balayage hebdomadaire ne s'exécute qu'une fois par semaine sur
# un runner GitHub. Sans ce test, une faute y dormirait jusqu'à ce qu'elle
# fasse passer une régression de couverture pour un succès.
etape "verdict de mutation"       .github/mutation-verdict-test.sh
# Même argument, appliqué à la construction des références : la branche qui
# compte dans `ref.sh` est son REFUS, et un refus ne s'exécute qu'en cas de
# catastrophe. Une seconde, aucune compilation, des dépôts fabriqués.
etape "références de mesure"      tools/ref-test.sh
# Même argument encore : la branche qui compte dans `mettre-en-commun.sh` est
# son REFUS de réunir des matchs qui se contredisent, et elle ne sert qu'en
# cas de problème. Le premier cas du test confronte la formule pentanomiale à
# ce que fastchess a réellement imprimé.
etape "mise en commun"            tools/mettre-en-commun-test.sh
# `paires.sh` reconstruit le vecteur pentanomial que cutechess n'imprime pas ;
# son test porte une vérité terrain — un vrai journal fastchess — et ses refus.
etape "paires"                    tools/paires-test.sh
# `plis.sh` rend les plis qu'un changement gagne en partie ; son premier cas
# est un témoin qui doit rendre zéro, et un défaut d'appariement le fait tomber.
etape "plis appariés"             tools/plis-test.sh
# `balayage-vivant.sh` ne tombe qu'après des semaines sans balayage ; sans cas
# fabriqués, sa branche d'échec ne s'exécuterait jamais avant d'être utile.
etape "balayage vivant"           tools/balayage-vivant-test.sh
# `etat.sh` s'exécute à chaque démarrage et après chaque compactage, sa
# sortie entrant dans le contexte du modèle. Un script devenu MUET ne se
# verrait pas — on croirait simplement qu'il n'y a rien à dire.
etape "état calculé"              bash -c 'tools/etat.sh | grep -q "non fusionné dans main"'

if [[ $RAPIDE -eq 0 ]]; then
  etape "tests (release)"         cargo test --workspace --release
  etape "critères d'acceptation"  cargo test --workspace --release -- --ignored
  etape "bench"                   cargo run --release --bin shallowred -- bench 7
  # Pas en mode rapide : c'est celui que le hook Stop lance, et l'auto-test
  # invoque ce même hook. La récursion s'arrête là.
  etape "hooks"                   tools/verify-hooks.sh
fi

echo
if [[ ${#ECHECS[@]} -eq 0 ]]; then
  [[ $RAPIDE -eq 1 ]] && echo "TOUT PASSE (mode rapide — acceptation et bench non exécutés)" \
                      || echo "TOUT PASSE"
  exit 0
fi

echo "ECHEC — ${#ECHECS[@]} étape(s) : ${ECHECS[*]}"
exit 1
