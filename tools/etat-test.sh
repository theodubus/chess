#!/usr/bin/env bash
#
# Éprouve `tools/etat.sh` sur des dépôts fabriqués : la ligne des branches
# distantes à faire supprimer par Théo.
#
#   tools/etat-test.sh
#
# Pourquoi ce test existe
#
# Cette ligne ne sert que lorsqu'une branche fusionnée traîne sur le distant :
# le reste du temps elle se tait, et un script qui se tait à tort ressemble
# exactement à un script qui n'a rien à dire. Ses exclusions comptent autant
# que sa détection — `main`, la branche de travail, et les branches de Codex,
# qui appartiennent à un autre agent et qu'il ne faut pas proposer au ménage
# (`CLAUDE.md`, Structure). Même argument que `tools/ref-test.sh` : une branche
# de script qui ne s'exécute qu'à l'occasion s'éprouve sur des cas fabriqués.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ATELIER="$(mktemp -d "${TMPDIR:-/tmp}/etat-test-XXXXXX")"
trap 'rm -rf "$ATELIER"' EXIT

echecs=0
ok()   { printf 'ok     %s\n' "$1"; }
rate() { printf 'ÉCHEC  %s\n' "$1"; echo "$2" | sed 's/^/       /'; echecs=$((echecs + 1)); }

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@test
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@test

# Un distant nu, peuplé depuis une source : `main`, une branche fusionnée,
# une branche en cours, une branche de Codex fusionnée, et la branche de
# travail, fusionnée elle aussi.
git init -q --bare -b main "$ATELIER/distant.git"
git init -q -b main "$ATELIER/source"
(
  cd "$ATELIER/source"
  git remote add origin "$ATELIER/distant.git"
  echo un > f && git add f && git commit -qm un
  git branch fusionnee
  git branch codex/ui
  git branch claude/travail
  echo deux > f && git commit -qam deux
  git switch -q -c en-cours
  echo trois > f && git commit -qam trois
  git push -q origin main fusionnee codex/ui claude/travail en-cours 2>/dev/null
)

git clone -q "$ATELIER/distant.git" "$ATELIER/travail"
mkdir -p "$ATELIER/travail/tools"
cp "$ROOT/tools/etat.sh" "$ATELIER/travail/tools/etat.sh"
git -C "$ATELIER/travail" switch -q claude/travail

sortie=$(cd "$ATELIER/travail" && bash tools/etat.sh 2>&1)
ligne=$(grep 'à faire supprimer par Théo' <<<"$sortie" || true)
# La liste seule, après le dernier deux-points : le libellé porte lui-même le
# mot « main ».
liste=" ${ligne##*:} "

if [[ "$liste" == *" fusionnee "* ]]; then ok "une branche contenue dans main est signalée"
else rate "une branche contenue dans main est signalée" "$sortie"; fi
if [[ "$liste" != *"en-cours"* ]]; then ok "une branche en cours ne l'est pas"
else rate "une branche en cours ne l'est pas" "$ligne"; fi
if [[ "$liste" != *"codex/"* ]]; then ok "une branche de Codex ne l'est jamais"
else rate "une branche de Codex ne l'est jamais" "$ligne"; fi
if [[ "$liste" != *"claude/travail"* ]]; then ok "la branche de travail ne l'est pas"
else rate "la branche de travail ne l'est pas" "$ligne"; fi
if [[ "$liste" != *" main "* ]]; then ok "main ne l'est pas"
else rate "main ne l'est pas" "$ligne"; fi

# Plus rien à supprimer : la ligne se tait, au lieu de crier à vide.
git -C "$ATELIER/source" push -q origin --delete fusionnee 2>/dev/null
git -C "$ATELIER/travail" fetch -q --prune origin
sortie=$(cd "$ATELIER/travail" && bash tools/etat.sh 2>&1)
if ! grep -q 'à faire supprimer par Théo' <<<"$sortie"; then ok "rien à supprimer : la ligne se tait"
else rate "rien à supprimer : la ligne se tait" "$sortie"; fi

if (( echecs > 0 )); then echo; echo "$echecs cas en échec."; exit 1; fi
echo; echo "tools/etat-test.sh : tous les cas passent."
