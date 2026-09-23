#!/usr/bin/env bash
#
# Éprouve tools/plis.sh. Tourne dans tools/verify.sh.
#
# Journaux fabriqués au format de `cutechess-cli -debug all`. Le premier cas
# est le TÉMOIN : deux moteurs identiques doivent rendre un écart nul — c'est
# ce qui distingue une méthode d'une machine à produire des écarts. Les
# suivants éprouvent ce qui se rate : une recherche de ponder terminée par
# `stop` comptée comme un coup joué, et les refus, qui ne servent qu'en cas
# de problème et ne seraient jamais vérifiés autrement.
set -uo pipefail

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIS="$ICI/plis.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echecs=0

attend() {  # attend <nom> <ligne attendue, ou « (refus) »> <journal>
  local nom="$1" attendu="$2" obtenu
  if obtenu=$("$PLIS" "$3" 2>/dev/null); then
    obtenu=$(grep -F -- "$attendu" <<<"$obtenu" || echo "(absente)")
  else
    obtenu="(refus)"
  fi
  if [[ "$obtenu" == "$attendu" ]]; then
    echo "  ok      $nom"
  else
    echo "  ÉCHEC   $nom : attendu « $attendu », obtenu « $obtenu »"
    echecs=$((echecs + 1))
  fi
}

# Une partie : chaque moteur joue un coup par profondeur donnée.
#   partie <prof. candidat>... -- <prof. référence>...
t=0
partie() {
  local cote=candidat p
  echo "$t >candidat(0): ucinewgame"
  echo "$t >reference(1): ucinewgame"
  for p in "$@"; do
    if [[ "$p" == "--" ]]; then cote=reference; continue; fi
    t=$((t + 10)); echo "$t >$cote(0): go wtime 8000 btime 8000 winc 80 binc 80"
    t=$((t + 90)); echo "$t <$cote(0): info depth $p score cp 0 nodes 9000 time 90 nps 100000 pv e2e4"
    t=$((t + 1));  echo "$t <$cote(0): bestmove e2e4"
  done
}

# --- 1. témoin : rien ne diffère, l'écart doit être nul ----------------------
{ partie 10 12 -- 10 12; partie 14 9 -- 14 9; } > "$TMP/temoin"
attend "témoin : moteurs identiques, écart nul" \
  "écart apparié : +0.00 ± 0.00 pli sur 2 parties (IC 95 %)" "$TMP/temoin"

# --- 2. écart connu : +1 puis +2, donc +1,50 ± 1,96 × 0,5 --------------------
{ partie 11 11 -- 10 10; partie 12 -- 10; } > "$TMP/connu"
attend "écart connu, apparié par partie" \
  "écart apparié : +1.50 ± 0.98 pli sur 2 parties (IC 95 %)" "$TMP/connu"

# --- 3. ponder : le stop est jeté, le ponderhit compte -----------------------
# Partie 1 : un ponder à la profondeur 30 terminé par stop, puis un vrai coup
# à 10. S'il était compté, l'écart ne serait pas nul sur cette partie.
# Partie 2 : un ponder confirmé, dont la dernière itération close est 13.
t=0
{
  partie -- 10
  echo "200 >candidat(0): go ponder wtime 8000 btime 8000 winc 80 binc 80"
  echo "250 <candidat(0): info depth 30 score cp 0 nodes 9000 time 50 nps 180000 pv e2e4"
  echo "260 >candidat(0): stop"
  echo "261 <candidat(0): bestmove e2e4"
  echo "270 >candidat(0): go wtime 8000 btime 8000 winc 80 binc 80"
  echo "360 <candidat(0): info depth 10 score cp 0 nodes 9000 time 90 nps 100000 pv e2e4"
  echo "361 <candidat(0): bestmove e2e4"
  t=400
  partie -- 10
  echo "500 >candidat(0): go ponder wtime 8000 btime 8000 winc 80 binc 80"
  echo "550 <candidat(0): info depth 12 score cp 0 nodes 9000 time 50 nps 180000 pv e2e4"
  echo "560 >candidat(0): ponderhit"
  echo "590 <candidat(0): info depth 13 score cp 0 nodes 9000 time 90 nps 100000 pv e2e4"
  echo "591 <candidat(0): bestmove e2e4"
} > "$TMP/ponder"
attend "ponder : stop jeté, ponderhit compté (écarts 0 et +3)" \
  "écart apparié : +1.50 ± 2.94 pli sur 2 parties (IC 95 %)" "$TMP/ponder"
attend "ponder : taux de succès" \
  "ponder de candidat : 2 go ponder, 1 ponderhit, 1 stop — taux 0.500" "$TMP/ponder"

# --- 4. les refus -------------------------------------------------------------
partie 10 -- > "$TMP/seul"
attend "refus : un seul moteur a joué" "(refus)" "$TMP/seul"
partie 10 -- 10 > "$TMP/une"
attend "refus : une seule partie, pas d'intervalle" "(refus)" "$TMP/une"

if (( echecs > 0 )); then
  echo "$echecs cas en échec"
  exit 1
fi
