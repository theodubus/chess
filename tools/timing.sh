#!/usr/bin/env bash
#
# Compare le TEMPS de deux binaires, correctement par construction.
#
#   tools/timing.sh <candidat> <référence> [paires]
#
# Pourquoi ce script existe
#
# Deux fautes de mesure de temps sur ce projet, les deux évitables :
#
#   14 sept. — un balayage de tailles de cache lu à profondeur 7, où le temps
#              n'est pas comparable. Les chiffres sortaient non monotones et
#              c'était du bruit pur.
#   15 sept. — une conclusion tirée de 7 exécutions : 5 gagnantes sur 7 et
#              -1,2 % sur la médiane. Le même changement, mesuré sur 22 paires,
#              donnait 19 sur 22 et -2,1 %. Sept ne suffisait pas.
#
# Ce script impose les trois choses que j'oublie :
#
#   1. il REFUSE de mesurer si les deux binaires n'explorent pas exactement le
#      même nombre de nœuds — sans quoi on compare deux arbres et pas deux
#      vitesses, et le résultat ne veut rien dire ;
#   2. il mesure à profondeur 10, jamais 7, où le bruit domine ;
#   3. il refuse de conclure sous PAIRES_MIN paires, et rend un test des signes
#      plutôt qu'une comparaison de médianes à l'œil.

set -euo pipefail

CANDIDAT="${1:?usage: tools/timing.sh <candidat> <référence> [paires]}"
REFERENCE="${2:?usage: tools/timing.sh <candidat> <référence> [paires]}"
PAIRES="${3:-20}"
PROFONDEUR="${PROFONDEUR:-10}"
PAIRES_MIN="${PAIRES_MIN:-20}"

[[ -x "$CANDIDAT"  ]] || { echo "binaire candidat introuvable : $CANDIDAT" >&2; exit 1; }
[[ -x "$REFERENCE" ]] || { echo "binaire de référence introuvable : $REFERENCE" >&2; exit 1; }

# Deux fois le MÊME binaire rendrait un rapport de exactement 1,00 — ou, pour
# le SPRT, 0 Elo — et personne ne saurait pourquoi. `match.yml` compare déjà
# les empreintes sur un runner ; le chemin local, lui, n'avait pas ce contrôle.
# C'est la faute B10 appliquée à un garde-fou plutôt qu'à un chiffre : couvrir
# une seule copie, ce n'est pas couvrir. La cause habituelle est `cp -p` ou
# `mv`, qui préservent les dates et font juger les sources à jour par cargo.
if [[ "$(md5sum "$CANDIDAT" | cut -d' ' -f1)" == "$(md5sum "$REFERENCE" | cut -d' ' -f1)" ]]; then
  echo "les deux binaires sont IDENTIQUES (même empreinte md5) : il n'y a rien à mesurer." >&2
  echo "Cause habituelle : cp -p ou mv préservent les dates, cargo n'a rien recompilé." >&2
  echo "Reconstruire la référence par tools/ref.sh, qui rend son empreinte." >&2
  exit 1
fi

if (( PAIRES < PAIRES_MIN )); then
  echo "refus : $PAIRES paires demandées, minimum $PAIRES_MIN." >&2
  echo "Sept exécutions ont déjà produit un faux négatif sur ce projet." >&2
  exit 1
fi

noeuds() { "$1" bench "$2" | sed -n 's/^Total nodes  *: *//p'; }
temps()  { "$1" bench "$2" | sed -n 's/^Time (ms)  *: *//p'; }

echo "contrôle préalable : les deux binaires doivent explorer le même arbre"
for d in 7 "$PROFONDEUR"; do
  a="$(noeuds "$CANDIDAT" "$d")"
  b="$(noeuds "$REFERENCE" "$d")"
  printf '  profondeur %-3s candidat=%-12s référence=%-12s ' "$d" "$a" "$b"
  if [[ "$a" == "$b" ]]; then
    echo "identiques"
  else
    echo "DIFFÉRENTS"
    echo
    echo "refus de mesurer : les arbres diffèrent, donc le temps ne compare" >&2
    echo "pas deux vitesses. Un changement qui modifie l'arbre se juge au" >&2
    echo "SPRT, pas au chronomètre." >&2
    exit 1
  fi
done

echo
echo "mesure : $PAIRES paires alternées à la profondeur $PROFONDEUR"
CAND_MS=(); REF_MS=()
for ((i = 1; i <= PAIRES; i++)); do
  # Alterner à chaque paire plutôt que grouper : une dérive de charge ou de
  # température se répartit alors sur les deux binaires au lieu d'en pénaliser
  # un seul.
  c="$(temps "$CANDIDAT" "$PROFONDEUR")"
  r="$(temps "$REFERENCE" "$PROFONDEUR")"
  CAND_MS+=("$c"); REF_MS+=("$r")
  printf '\r  %d/%d' "$i" "$PAIRES"
done
echo; echo

python3 - "${CAND_MS[*]}" "${REF_MS[*]}" <<'PY'
import sys, statistics as st
from math import comb

c = [int(x) for x in sys.argv[1].split()]
r = [int(x) for x in sys.argv[2].split()]
n = len(c)

for nom, v in (("candidat", c), ("référence", r)):
    print(f"{nom:10s} min={min(v):5d}  médiane={st.median(v):7.1f}  "
          f"moyenne={st.mean(v):7.1f}  écart-type={st.pstdev(v):5.1f}")

d_min = 100 * (min(c) / min(r) - 1)
d_med = 100 * (st.median(c) / st.median(r) - 1)
gagne = sum(1 for a, b in zip(c, r) if a < b)
# Test des signes bilatéral : les paires nulles ne tranchent ni dans un sens
# ni dans l'autre, on les écarte.
utiles = sum(1 for a, b in zip(c, r) if a != b)
k = min(gagne, utiles - gagne)
p = 2 * sum(comb(utiles, i) for i in range(0, k + 1)) / 2 ** utiles if utiles else 1.0
p = min(p, 1.0)

print()
print(f"écart sur le min     : {d_min:+.1f} %")
print(f"écart sur la médiane : {d_med:+.1f} %")
print(f"paires où le candidat est plus rapide : {gagne}/{n}")
print(f"test des signes, p (bilatéral) = {p:.4f}")
print()
if p >= 0.05:
    print("VERDICT : aucun écart démontré. Ne pas inscrire de chiffre.")
elif d_med < 0:
    print(f"VERDICT : le candidat est plus rapide de {abs(d_med):.1f} % (p = {p:.4f}).")
else:
    print(f"VERDICT : le candidat est plus LENT de {d_med:.1f} % (p = {p:.4f}).")
PY
