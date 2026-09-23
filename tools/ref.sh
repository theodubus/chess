#!/usr/bin/env bash
#
# Construit un binaire de RÉFÉRENCE à partir d'un commit, d'une branche ou
# d'un tag — correctement par construction.
#
#   tools/ref.sh <commit|branche|tag> [chemin-de-sortie]
#
# Pourquoi ce script existe
#
# Construire une référence est un geste de quatre lignes, et le dépôt a payé
# QUATRE pièges distincts dedans. Chacun est écrit dans `CLAUDE.md` ; aucun
# n'était encadré par du code, alors que `match.yml` fait déjà tout cela
# correctement sur un runner. Le chemin local n'avait pas de garde-fou — la
# faute de famille B10 : un garde-fou qui ne couvre qu'une copie ne garde rien.
#
#   13 sept. — `git stash` pour construire l'« avant ». Il a emporté la
#              conversion de `bench` de perft vers la recherche, et la mesure
#              comptait des nœuds de perft. Seule l'absurdité du chiffre l'a
#              révélé — elle aurait pu ne pas être absurde.
#   14 sept. — `cp -p` préserve les dates, cargo juge les sources à jour et ne
#              recompile rien : on mesure deux fois le même binaire, et le
#              rapport rend exactement 1,00.
#   22 sept. — `origin/main` figé ONZE commits en arrière dans le clone local,
#              alors que le distant portait bien la tête annoncée. Binaire
#              neuf, code juste, édition correcte, et un arbre trois fois trop
#              gros. Ce qui l'a attrapé n'est pas la vigilance, c'est d'avoir
#              écrit la valeur attendue avant de mesurer.
#   22 sept. — `git fetch <remote> <branche>` n'élague pas : après une fusion,
#              GitHub supprime la branche distante et la référence de suivi
#              survit en pointant le commit d'AVANT la fusion. Deux fausses
#              alarmes de suite.
#
# Ce script impose les quatre choses que j'oublie :
#
#   1. il élague (`git fetch --prune`), jamais `git fetch <remote> <branche>` ;
#   2. il CONFRONTE une branche nommée à `git ls-remote` et refuse de
#      construire si la résolution locale diffère du distant — c'est le seul
#      des quatre qui a faussé une mesure publiée ;
#   3. il construit en worktree détaché, jamais par `git stash` ;
#   4. il rend l'empreinte du binaire, pour que « deux fois le même binaire »
#      se voie avant le match et non après.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF="${1:?usage: tools/ref.sh <commit|branche|tag> [chemin-de-sortie]}"
SORTIE="${2:-/tmp/reference}"
REMOTE="${REMOTE:-origin}"

cd "$ROOT"

# 1. Élaguer. Sans `--prune`, une référence de suivi survit à la suppression
#    de sa branche distante et continue de désigner le commit d'avant fusion.
echo "tools/ref.sh : git fetch --prune $REMOTE"
if ! git fetch --prune --quiet "$REMOTE" 2>/dev/null; then
  echo "tools/ref.sh : AVERTISSEMENT — le fetch a échoué (réseau ?)." >&2
  echo "               La résolution ci-dessous porte sur un clone peut-être périmé." >&2
fi

# 2. Résoudre, tel quel puis sous le distant — `git worktree` ne résout pas un
#    nom de branche nu qui n'existe que sous `origin/`.
sha=$(git rev-parse --verify --quiet "${REF}^{commit}" || true)
[ -n "$sha" ] || sha=$(git rev-parse --verify --quiet "${REMOTE}/${REF}^{commit}" || true)
if [ -z "$sha" ]; then
  echo "tools/ref.sh : « $REF » introuvable — essayé tel quel et sous $REMOTE/." >&2
  exit 1
fi

# 3. Confronter au distant. C'est LE contrôle qui manquait : `git fetch` ne
#    déplace pas une branche LOCALE, donc `main` peut résoudre onze commits en
#    arrière alors que le fetch a réussi. Nommer une branche veut dire « ce
#    qu'elle porte maintenant » ; si ce n'est pas ce qu'on veut, on passe le
#    SHA, ce qui est explicite et ne déclenche pas ce contrôle.
branche="${REF#"$REMOTE"/}"
distant=$(git ls-remote --heads "$REMOTE" "$branche" 2>/dev/null | cut -f1 || true)
if [ -n "$distant" ] && [ "$distant" != "$sha" ]; then
  echo >&2
  echo "tools/ref.sh : RÉFÉRENCE PÉRIMÉE — refus de construire." >&2
  echo "               « $REF » résout en local à  $sha" >&2
  echo "               mais $REMOTE/$branche porte  $distant" >&2
  echo >&2
  echo "  C'est le piège du 22 sept. 2026 : binaire neuf, code juste, et un" >&2
  echo "  arbre trois fois trop gros parce que la RÉFÉRENCE GIT était figée." >&2
  echo "  Le symptôme est identique à celui du binaire périmé — un chiffre" >&2
  echo "  plausible qui répond à une autre question." >&2
  echo >&2
  echo "  Pour la tête du distant :  tools/ref.sh $REMOTE/$branche" >&2
  echo "  Pour ce commit-ci exprès : tools/ref.sh $sha" >&2
  exit 1
fi

# 4. Construire en worktree détaché. Isolé, sans effet de bord, et il n'emporte
#    rien du travail non committé — contrairement au stash.
WT="$(mktemp -d "${TMPDIR:-/tmp}/shallowred-ref-XXXXXX")"
nettoyer() { git worktree remove --force "$WT" 2>/dev/null || rm -rf "$WT"; }
trap nettoyer EXIT

echo "tools/ref.sh : $REF -> $sha"
git worktree add --detach --quiet "$WT" "$sha"
( cd "$WT" && cargo build --release --bin shallowred )

# `cp` et non `cp -p` : préserver la date ferait juger les sources à jour par
# un cargo ultérieur, et l'on mesurerait l'ancien binaire.
cp "$WT/target/release/shallowred" "$SORTIE"

empreinte=$(md5sum "$SORTIE" | cut -d' ' -f1)
echo "tools/ref.sh : $SORTIE  md5=$empreinte"
