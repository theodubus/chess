#!/usr/bin/env bash
#
# Construit les DEUX binaires que livre le dépôt — Théo, 6 oct. 2026 :
# « on livrera deux binaires selon AVX2 ou non ».
#
#   tools/binaires.sh [dossier]                 défaut : dist/
#   tools/binaires.sh --comparer <binaire> <binaire>
#
#   <dossier>/shallowred         x86-64      le jeu de base : tourne partout
#   <dossier>/shallowred-avx2    x86-64-v3   AVX2, BMI2, FMA : × 1,235 de nœuds
#                                            par seconde au réseau (6 oct. 2026)
#
# Pourquoi ce script existe
#
# Deux binaires du même code ne sont LE MÊME MOTEUR que s'ils cherchent le même
# arbre. Le code est entier, donc ils le cherchent — aujourd'hui. Qu'une
# arithmétique flottante entre demain dans la recherche, et le compilateur
# aurait le droit d'en faire deux moteurs sous un même nom ; aucun match ne le
# verrait, puisque les matchs jouent le binaire AVX2 des DEUX côtés. Le script
# compare donc les arbres à chaque construction, et refuse de rendre des
# binaires qui divergent.
#
# Il compare deux choses, parce que le banc n'en voit qu'une : le banc évalue
# À LA MAIN, et ce que l'AVX2 change, ce sont surtout les boucles du RÉSEAU.
# Il lit donc le banc à la profondeur 7, puis cherche ses six positions avec
# le réseau qui joue, par l'interface UCI — nœuds et coup de chacune.
#
# Le binaire AVX2 ne s'exécute que sur un processeur qui a l'AVX2 : ailleurs,
# il est construit, pas comparé, et le script le dit.
#
# Le jeu d'instructions passe par RUSTFLAGS, posé ici pour chaque binaire : un
# RUSTFLAGS hérité du shell ne doit rien changer à ce qu'on livre.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFONDEUR_RESEAU="${PROFONDEUR_RESEAU:-10}"

# L'empreinte d'un binaire : le total du banc fait main, puis, pour chaque
# position du banc, les nœuds et le coup de la recherche au réseau.
empreinte() {
  local bin="$1" banc
  banc=$("$bin" bench 7)
  sed -n 's/^Total nodes  *: *//p' <<< "$banc"
  sed -n 's/^ *[0-9][0-9]* nœuds  *[0-9.]* s  *//p' <<< "$banc" \
    | python3 -I -c '
import subprocess, sys
binaire, profondeur = sys.argv[1], sys.argv[2]
p = subprocess.Popen([binaire], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
def envoyer(ligne):
    p.stdin.write(ligne + "\n"); p.stdin.flush()
def attendre(prefixe):
    noeuds = None
    for ligne in p.stdout:
        mots = ligne.split()
        if mots[:1] == ["info"] and "nodes" in mots:
            noeuds = mots[mots.index("nodes") + 1]
        if ligne.startswith(prefixe):
            return noeuds, ligne.strip()
    raise SystemExit("le moteur s est tu")
envoyer("uci"); attendre("uciok")
for fen in sys.stdin.read().splitlines():
    envoyer("ucinewgame"); envoyer("isready"); attendre("readyok")
    envoyer("position fen " + fen); envoyer("go depth " + profondeur)
    noeuds, coup = attendre("bestmove")
    print(noeuds, coup)
envoyer("quit"); p.wait()
' "$bin" "$PROFONDEUR_RESEAU"
}

comparer() {
  local a="$1" b="$2" ea eb
  ea=$(empreinte "$a")
  eb=$(empreinte "$b")
  if [ -z "$ea" ] || [ "$ea" != "$eb" ]; then
    echo "refus : les deux binaires ne cherchent pas le même arbre" >&2
    diff <(printf '%s\n' "$ea") <(printf '%s\n' "$eb") >&2 || true
    return 1
  fi
  echo "même arbre : $(head -1 <<< "$ea") nœuds au banc fait main à la profondeur 7," \
       "et les six positions au réseau à la profondeur $PROFONDEUR_RESEAU, nœuds et coup"
}

if [ "${1:-}" = "--comparer" ]; then
  [ $# -eq 3 ] || { echo "usage : tools/binaires.sh --comparer <binaire> <binaire>" >&2; exit 2; }
  comparer "$2" "$3"
  exit
fi

SORTIE="${1:-$ROOT/dist}"
if [ "$(uname -m)" != "x86_64" ]; then
  echo "refus : le binaire AVX2 est propre au x86-64, et cette machine est $(uname -m)" >&2
  exit 1
fi
mkdir -p "$SORTIE"

# Le binaire de base dans le dossier cible ordinaire — RUSTFLAGS vide y donne
# l'empreinte d'un `cargo build --release` nu, donc rien à recompiler s'il
# vient d'être construit ; l'AVX2 dans le sien, pour ne pas s'écraser l'un
# l'autre à chaque passage.
( cd "$ROOT" && RUSTFLAGS="" cargo build --release --bin shallowred )
cp "$ROOT/target/release/shallowred" "$SORTIE/shallowred"
( cd "$ROOT" && RUSTFLAGS="-C target-cpu=x86-64-v3" \
    cargo build --release --bin shallowred --target-dir "$ROOT/target/binaires/x86-64-v3" )
cp "$ROOT/target/binaires/x86-64-v3/release/shallowred" "$SORTIE/shallowred-avx2"

if grep -qw avx2 /proc/cpuinfo 2>/dev/null; then
  if ! comparer "$SORTIE/shallowred" "$SORTIE/shallowred-avx2"; then
    rm -f "$SORTIE/shallowred" "$SORTIE/shallowred-avx2"
    exit 1
  fi
else
  echo "ce processeur n'a pas l'AVX2 : shallowred-avx2 est construit, pas comparé"
fi
echo "binaires : $SORTIE/shallowred (x86-64), $SORTIE/shallowred-avx2 (x86-64-v3)"
