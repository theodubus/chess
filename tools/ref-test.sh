#!/usr/bin/env bash
#
# Éprouve `tools/ref.sh` sur des dépôts fabriqués.
#
#   tools/ref-test.sh
#
# Pourquoi ce test existe
#
# La branche la plus précieuse de `ref.sh` est son REFUS : la référence git
# périmée est le seul des quatre pièges qui ait faussé une mesure publiée. Or
# elle ne se déclenche presque jamais — donc, sans ce test, elle ne serait
# jamais vérifiée. C'est exactement l'argument de
# `.github/mutation-verdict-test.sh`, qui a trouvé une faute à sa première
# exécution : un script dont la branche intéressante ne s'exécute qu'en cas de
# catastrophe doit être éprouvé sur des cas fabriqués, ou il ne protège rien.
#
# Aucun des cas ci-dessous n'atteint `cargo build` : tout ce qui est contrôlé
# l'est AVANT la compilation, ce qui rend ce test instantané et exécutable dans
# `tools/verify.sh`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ATELIER="$(mktemp -d "${TMPDIR:-/tmp}/ref-test-XXXXXX")"
trap 'rm -rf "$ATELIER"' EXIT

echecs=0
cas() {
  local nom="$1" attendu_code="$2" attendu_texte="$3"; shift 3
  local sortie code=0
  sortie="$("$@" 2>&1)" || code=$?
  if [[ "$code" != "$attendu_code" ]]; then
    echo "ÉCHEC  $nom : code $code, attendu $attendu_code"; echo "$sortie" | sed 's/^/       /'
    echecs=$((echecs + 1)); return
  fi
  if [[ -n "$attendu_texte" ]] && ! grep -qF -- "$attendu_texte" <<<"$sortie"; then
    echo "ÉCHEC  $nom : « $attendu_texte » absent de la sortie"; echo "$sortie" | sed 's/^/       /'
    echecs=$((echecs + 1)); return
  fi
  echo "ok     $nom"
}
cas_sans() {
  local nom="$1" interdit="$2"; shift 2
  local sortie
  sortie="$("$@" 2>&1)" || true
  if grep -qF -- "$interdit" <<<"$sortie"; then
    echo "ÉCHEC  $nom : « $interdit » n'aurait pas dû apparaître"; echo "$sortie" | sed 's/^/       /'
    echecs=$((echecs + 1)); return
  fi
  echo "ok     $nom"
}

# Un « distant » nu et un clone, pour que `git ls-remote` ait quelque chose à
# dire sans toucher au réseau ni au vrai dépôt.
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@test
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@test
git init -q -b main "$ATELIER/source"
(
  cd "$ATELIER/source"
  echo un > f && git add f && git commit -qm un
  echo deux > f && git commit -qam deux
)
git clone -q "$ATELIER/source" "$ATELIER/clone"
# HEAD détachée : sans cela git refuse de déplacer une branche qui est
# celle du worktree courant, et c'est précisément ce qu'on veut simuler.
git -C "$ATELIER/clone" checkout -q --detach
mkdir -p "$ATELIER/clone/tools"
cp "$ROOT/tools/ref.sh" "$ATELIER/clone/tools/ref.sh"

REF="$ATELIER/clone/tools/ref.sh"
TETE="$(git -C "$ATELIER/source" rev-parse main)"
VIEUX="$(git -C "$ATELIER/source" rev-parse main~1)"

# Le cas qui compte : la branche LOCALE reste en arrière alors que le fetch
# réussit, parce qu'un fetch ne déplace pas une branche locale. C'est la forme
# exacte du piège du 22 sept. 2026.
git -C "$ATELIER/clone" branch -f main "$VIEUX"
cas "référence périmée : refus" 1 "RÉFÉRENCE PÉRIMÉE" "$REF" main
cas "le refus nomme les deux SHA" 1 "$TETE" "$REF" main

# Nommer le distant explicitement est l'échappatoire, et elle ne doit pas
# déclencher le contrôle — `origin/main` résout bien à la tête.
cas_sans "origin/main ne déclenche pas le contrôle" "RÉFÉRENCE PÉRIMÉE" "$REF" origin/main

# Un SHA est explicite par nature : demander un commit ancien exprès est
# légitime et ne doit pas être refusé comme périmé.
cas_sans "un SHA ne déclenche pas le contrôle" "RÉFÉRENCE PÉRIMÉE" "$REF" "$VIEUX"

# Une référence inconnue doit mourir tôt et clairement, jamais au milieu d'une
# compilation de vingt secondes.
cas "référence inconnue" 1 "introuvable" "$REF" nexistepas

# Le contrôle de fraîcheur ne doit pas passer pour un succès quand il n'a rien
# vu : une branche locale à jour passe, et c'est le cas nominal.
git -C "$ATELIER/clone" branch -f main "$TETE"
cas_sans "branche locale à jour : pas de refus" "RÉFÉRENCE PÉRIMÉE" "$REF" main

if (( echecs > 0 )); then
  echo; echo "$echecs cas en échec."; exit 1
fi
echo; echo "tools/ref-test.sh : tous les cas passent."
