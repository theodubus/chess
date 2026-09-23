#!/usr/bin/env bash
#
# Reconstruit le vecteur pentanomial d'un match depuis ses lignes de parties.
#
#   tools/paires.sh <journal> [nom du candidat]     → « a,b,c,d,e »
#
# POURQUOI : cutechess-cli n'imprime AUCUN vecteur pentanomial — vérifié dans
# son source épinglé, il n'écrit que « Score of A vs B: V - D - N ». Or c'est
# lui qui fait jouer le ponder (fastchess ne sait pas pondérer), et
# `mettre-en-commun.sh` ne sait sommer que des vecteurs pentanomiaux. Ce script
# comble l'écart ; sa sortie se passe telle quelle à `mettre-en-commun.sh`.
#
# COMMENT : avec `-repeat` et `-games 2`, les parties 2k−1 et 2k jouent la même
# ouverture des deux côtés. Chaque paire vaut 0, ½, 1, 1½ ou 2 points pour le
# candidat, et le vecteur compte les paires de chaque valeur. Les deux arbitres
# écrivent la même ligne : « Finished game N (Blancs vs Noirs): 1-0 {…} ».
#
# SA VÉRITÉ TERRAIN : fastchess, lui, écrit à la fois ces lignes ET son propre
# vecteur. Sur un même journal, les deux doivent coïncider exactement —
# `tools/paires-test.sh` l'éprouve.
#
# Il REFUSE plutôt que de deviner : une paire incomplète — match coupé en
# plein milieu, partie manquante — n'est pas comptée à moitié, elle est
# écartée et signalée sur la sortie d'erreur. Un vecteur faux se sommerait
# en silence dans une mise en commun.
set -euo pipefail

JOURNAL="${1:-}"
CANDIDAT="${2:-candidat}"
[[ -n "$JOURNAL" && -r "$JOURNAL" ]] || {
  echo "usage : tools/paires.sh <journal> [nom du candidat, « candidat » par défaut]" >&2
  exit 1
}

awk -v cand="$CANDIDAT" '
  # Finished game 12 (candidat vs reference): 1-0 {White wins by adjudication}
  /Finished game [0-9]+ \(/ {
    ligne = $0
    sub(/.*Finished game /, "", ligne)
    n = ligne + 0
    sub(/^[0-9]+ \(/, "", ligne)
    blancs = ligne; sub(/ vs .*/, "", blancs)
    noirs = ligne;  sub(/^[^ ]+ vs /, "", noirs); sub(/\).*/, "", noirs)
    res = ligne;    sub(/^[^)]*\): /, "", res);   sub(/ .*/, "", res)
    if (blancs != cand && noirs != cand) next
    if      (res == "1-0")     pts = (blancs == cand) ? 1 : 0
    else if (res == "0-1")     pts = (noirs  == cand) ? 1 : 0
    else if (res == "1/2-1/2") pts = 0.5
    else next                  # partie sans résultat (interrompue) : ignorée
    if (n in vu) { doublon++; next }
    vu[n] = 1; points[n] = pts
  }
  END {
    split("0 0 0 0 0", v, " ")
    for (n in points) {
      if (n % 2 == 1) {
        if ((n + 1) in points) {
          bin = (points[n] + points[n + 1]) * 2   # 0..4
          v[bin + 1]++
        } else orphelines++
      } else if (!((n - 1) in points)) orphelines++
    }
    if (doublon)    printf "attention : %d ligne(s) de partie en double écartée(s)\n", doublon > "/dev/stderr"
    if (orphelines) printf "attention : %d partie(s) sans sa jumelle écartée(s)\n", orphelines > "/dev/stderr"
    total = v[1] + v[2] + v[3] + v[4] + v[5]
    if (total == 0) { print "aucune paire complète" > "/dev/stderr"; exit 2 }
    printf "%d,%d,%d,%d,%d\n", v[1], v[2], v[3], v[4], v[5]
  }
' "$JOURNAL"
