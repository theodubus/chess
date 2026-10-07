#!/usr/bin/env bash
#
# Construit les binaires que livre le dépôt — Théo, 6 oct. 2026 : « on
# livrera deux binaires selon AVX2 ou non » ; le 7 oct., pour Windows et
# macOS aussi.
#
#   tools/binaires.sh [dossier]                 défaut : dist/
#   tools/binaires.sh --comparer <binaire> <binaire>
#   tools/binaires.sh --empreinte <binaire>
#
# Sur un processeur x86-64 — Linux, Windows sous Git Bash, Mac Intel :
#   <dossier>/shallowred[.exe]        x86-64      le jeu de base : tourne partout
#   <dossier>/shallowred-avx2[.exe]   x86-64-v3   AVX2, BMI2, FMA : × 1,235 de
#                                                 nœuds par seconde au réseau
#                                                 (6 oct. 2026)
# Sur un processeur ARM 64 bits — Mac Apple Silicon, Linux ARM :
#   <dossier>/shallowred              le jeu natif ; l'AVX2 n'y existe pas
# Et partout :
#   <dossier>/empreinte.txt           l'arbre que cherche le binaire de base
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
# L'empreinte écrite à côté des binaires sert à la comparaison ENTRE systèmes :
# la CI construit sur Linux, Windows et les deux sortes de Mac, et un dernier
# job exige la même empreinte partout — le même raisonnement, d'une machine à
# l'autre au lieu d'un jeu d'instructions à l'autre.
#
# Le jeu d'instructions passe par RUSTFLAGS, posé ici pour chaque binaire : un
# RUSTFLAGS hérité du shell ne doit rien changer à ce qu'on livre.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFONDEUR_RESEAU="${PROFONDEUR_RESEAU:-10}"

# Windows installe souvent `python` sans `python3`, et un `python3` qui n'est
# qu'un raccourci vers sa boutique : on garde le premier qui RÉPOND.
PYTHON=""
for candidat in python3 python; do
  if command -v "$candidat" >/dev/null 2>&1 \
    && "$candidat" -c 'import sys; sys.exit(sys.version_info < (3, 6))' >/dev/null 2>&1; then
    PYTHON="$candidat"
    break
  fi
done

# L'empreinte d'un binaire : le total du banc fait main, puis, pour chaque
# position du banc, les nœuds et le coup de la recherche au réseau. Tout se lit
# en Python, pas en sed — celui de macOS n'est pas celui de Linux —, et les
# retours chariot d'un Python de Windows ne doivent pas faire deux empreintes
# d'un même arbre.
empreinte() {
  if [ -z "$PYTHON" ]; then
    echo "refus : ni python3 ni python ne répondent" >&2
    return 1
  fi
  "$PYTHON" -I -c '
import subprocess, sys
binaire, profondeur = sys.argv[1], sys.argv[2]
# UTF-8 nommé : le banc écrit « nœuds », et Windows décoderait en cp1252.
banc = subprocess.run([binaire, "bench", "7"], stdout=subprocess.PIPE, encoding="utf-8", check=True).stdout
total = None
fens = []
for ligne in banc.splitlines():
    if ligne.startswith("Total nodes"):
        total = ligne.split(":", 1)[1].strip()
    mots = ligne.split()
    # « <nœuds> nœuds <secondes> s <fen> », une ligne par position du banc.
    if len(mots) > 4 and mots[1] == "nœuds" and mots[3] == "s":
        fens.append(" ".join(mots[4:]))
if total is None or not fens:
    raise SystemExit("banc illisible")
sortie = [total]
p = subprocess.Popen([binaire], stdin=subprocess.PIPE, stdout=subprocess.PIPE, encoding="utf-8", bufsize=1)
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
for fen in fens:
    envoyer("ucinewgame"); envoyer("isready"); attendre("readyok")
    envoyer("position fen " + fen); envoyer("go depth " + profondeur)
    noeuds, coup = attendre("bestmove")
    sortie.append(f"{noeuds} {coup}")
envoyer("quit"); p.wait()
sys.stdout.buffer.write(("\n".join(sortie) + "\n").encode())
' "$1" "$PROFONDEUR_RESEAU"
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

# Vrai si ce processeur a l'AVX2 : Linux et Git Bash l'écrivent dans
# /proc/cpuinfo, un Mac Intel le dit par sysctl.
a_l_avx2() {
  if [ -r /proc/cpuinfo ]; then
    grep -qiw avx2 /proc/cpuinfo
  else
    sysctl -n machdep.cpu.leaf7_features 2>/dev/null | grep -qiw avx2
  fi
}

case "${1:-}" in
  --comparer)
    [ $# -eq 3 ] || { echo "usage : tools/binaires.sh --comparer <binaire> <binaire>" >&2; exit 2; }
    comparer "$2" "$3"
    exit
    ;;
  --empreinte)
    [ $# -eq 2 ] || { echo "usage : tools/binaires.sh --empreinte <binaire>" >&2; exit 2; }
    empreinte "$2"
    exit
    ;;
esac

SORTIE="${1:-$ROOT/dist}"
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) EXE=".exe" ;;
  *) EXE="" ;;
esac
mkdir -p "$SORTIE"

case "$(uname -m)" in
  x86_64 | amd64)
    # Le binaire de base dans le dossier cible ordinaire — RUSTFLAGS vide y
    # donne l'empreinte d'un `cargo build --release` nu, donc rien à recompiler
    # s'il vient d'être construit ; l'AVX2 dans le sien, pour ne pas s'écraser
    # l'un l'autre à chaque passage.
    ( cd "$ROOT" && RUSTFLAGS="" cargo build --release --bin shallowred )
    cp "$ROOT/target/release/shallowred$EXE" "$SORTIE/shallowred$EXE"
    ( cd "$ROOT" && RUSTFLAGS="-C target-cpu=x86-64-v3" \
        cargo build --release --bin shallowred --target-dir "$ROOT/target/binaires/x86-64-v3" )
    cp "$ROOT/target/binaires/x86-64-v3/release/shallowred$EXE" "$SORTIE/shallowred-avx2$EXE"
    if a_l_avx2; then
      if ! comparer "$SORTIE/shallowred$EXE" "$SORTIE/shallowred-avx2$EXE"; then
        rm -f "$SORTIE/shallowred$EXE" "$SORTIE/shallowred-avx2$EXE"
        exit 1
      fi
    else
      echo "ce processeur n'a pas l'AVX2 : shallowred-avx2$EXE est construit, pas comparé"
    fi
    livres="$SORTIE/shallowred$EXE (x86-64), $SORTIE/shallowred-avx2$EXE (x86-64-v3)"
    ;;
  arm64 | aarch64)
    ( cd "$ROOT" && RUSTFLAGS="" cargo build --release --bin shallowred )
    cp "$ROOT/target/release/shallowred$EXE" "$SORTIE/shallowred$EXE"
    echo "processeur ARM : un seul binaire, le natif — l'AVX2 est propre au x86-64"
    livres="$SORTIE/shallowred$EXE ($(uname -m))"
    ;;
  *)
    echo "refus : processeur $(uname -m) — ni x86-64 ni ARM 64 bits" >&2
    exit 1
    ;;
esac

empreinte "$SORTIE/shallowred$EXE" > "$SORTIE/empreinte.txt"
echo "binaires : $livres ; empreinte : $SORTIE/empreinte.txt"
