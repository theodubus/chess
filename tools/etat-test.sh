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
# que sa détection — `main`, la branche de travail, et les branches que la
# politique garde (`[human] keep_branches` de `.socle/policy.toml`), celles
# d'un autre agent ou des réseaux, qu'il ne faut pas proposer au ménage. Même
# argument que `tools/ref-test.sh` : une branche de script qui ne s'exécute
# qu'à l'occasion s'éprouve sur des cas fabriqués.
#
# Chaque motif de la politique a son cas et son témoin, un nom voisin qui ne
# correspond pas et doit être signalé : sans témoin, un motif trop large
# passerait. Une politique fabriquée, qui ne garde plus Codex, prouve que les
# motifs se lisent dans la politique et non dans le script (B-0036).
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
# une branche en cours, la branche de travail, fusionnée elle aussi, et pour
# chaque motif de la politique réelle une branche gardée et son témoin, tous
# fusionnés.
GARDEES=(codex/ui reseau/n10 ccr-abc)
TEMOINS=(codex-ui reseau-n10 ccr-a/b)
git init -q --bare -b main "$ATELIER/distant.git"
git init -q -b main "$ATELIER/source"
(
  cd "$ATELIER/source"
  git remote add origin "$ATELIER/distant.git"
  echo un > f && git add f && git commit -qm un
  for b in fusionnee claude/travail "${GARDEES[@]}" "${TEMOINS[@]}"; do git branch "$b"; done
  echo deux > f && git commit -qam deux
  git switch -q -c en-cours
  echo trois > f && git commit -qam trois
  git push -q origin main fusionnee claude/travail en-cours "${GARDEES[@]}" "${TEMOINS[@]}" 2>/dev/null
)

git clone -q "$ATELIER/distant.git" "$ATELIER/travail"
mkdir -p "$ATELIER/travail/tools" "$ATELIER/travail/.socle"
cp "$ROOT/tools/etat.sh" "$ATELIER/travail/tools/etat.sh"
cp "$ROOT/.socle/policy.toml" "$ATELIER/travail/.socle/policy.toml"
ln -s "$ROOT/.socle/engine" "$ATELIER/travail/.socle/engine"
git -C "$ATELIER/travail" switch -q claude/travail

# La liste seule, après le dernier deux-points : le libellé porte lui-même le
# mot « main ».
liste_de() {
  local ligne
  ligne=$(grep 'à faire supprimer par Théo' <<<"$1" || true)
  echo " ${ligne##*:} "
}

# Un motif ajouté à la politique sans son cas ici passerait sans être
# éprouvé : chaque motif doit garder au moins une branche de GARDEES.
sans_cas=$(python3 -c '
import sys, tomllib
from pathlib import Path
sys.path.insert(0, sys.argv[1] + "/.socle/engine")
from socle.utils import correspond
pol = tomllib.loads(Path(sys.argv[1], ".socle/policy.toml").read_text(encoding="utf-8"))
for motif in pol.get("human", {}).get("keep_branches", []):
    if not any(correspond(g, [motif]) for g in sys.argv[2:]):
        print(motif)
' "$ROOT" "${GARDEES[@]}")
if [ -z "$sans_cas" ]; then ok "chaque motif de la politique a son cas"
else rate "chaque motif de la politique a son cas" "motifs sans cas : $sans_cas"; fi

sortie=$(cd "$ATELIER/travail" && bash tools/etat.sh 2>&1)
liste=$(liste_de "$sortie")

if [[ "$liste" == *" fusionnee "* ]]; then ok "une branche contenue dans main est signalée"
else rate "une branche contenue dans main est signalée" "$sortie"; fi
if [[ "$liste" != *"en-cours"* ]]; then ok "une branche en cours ne l'est pas"
else rate "une branche en cours ne l'est pas" "$liste"; fi
if [[ "$liste" != *"claude/travail"* ]]; then ok "la branche de travail ne l'est pas"
else rate "la branche de travail ne l'est pas" "$liste"; fi
if [[ "$liste" != *" main "* ]]; then ok "main ne l'est pas"
else rate "main ne l'est pas" "$liste"; fi
for i in "${!GARDEES[@]}"; do
  g=${GARDEES[$i]} t=${TEMOINS[$i]}
  if [[ "$liste" != *" $g "* ]]; then ok "$g, que la politique garde, ne l'est jamais"
  else rate "$g, que la politique garde, ne l'est jamais" "$liste"; fi
  if [[ "$liste" == *" $t "* ]]; then ok "son témoin $t, hors du motif, l'est"
  else rate "son témoin $t, hors du motif, l'est" "$sortie"; fi
done

# Les motifs viennent de la politique : qu'elle ne garde plus Codex, et
# Codex est proposé ; qu'elle garde autre chose, et cette chose ne l'est pas.
printf '[human]\nkeep_branches = ["reseau/**", "ccr-*", "codex-*"]\n' > "$ATELIER/travail/.socle/policy.toml"
sortie=$(cd "$ATELIER/travail" && bash tools/etat.sh 2>&1)
liste=$(liste_de "$sortie")
if [[ "$liste" == *" codex/ui "* && "$liste" != *"codex-ui"* ]]; then
  ok "les motifs se lisent dans la politique, pas dans le script"
else rate "les motifs se lisent dans la politique, pas dans le script" "$sortie"; fi

# Une politique illisible : la ligne le dit, et le script n'échoue pas.
echo 'keep_branches = [' > "$ATELIER/travail/.socle/policy.toml"
if sortie=$(cd "$ATELIER/travail" && bash tools/etat.sh 2>&1) \
  && grep -q 'non calculées, la politique' <<<"$sortie" \
  && ! grep -q 'à faire supprimer par Théo' <<<"$sortie"; then
  ok "une politique illisible se dit, sans rien proposer ni échouer"
else rate "une politique illisible se dit, sans rien proposer ni échouer" "$sortie"; fi
cp "$ROOT/.socle/policy.toml" "$ATELIER/travail/.socle/policy.toml"

# Plus rien à supprimer : la ligne se tait, au lieu de crier à vide.
git -C "$ATELIER/source" push -q origin --delete fusionnee "${TEMOINS[@]}" 2>/dev/null
git -C "$ATELIER/travail" fetch -q --prune origin
sortie=$(cd "$ATELIER/travail" && bash tools/etat.sh 2>&1)
if ! grep -q 'à faire supprimer' <<<"$sortie"; then ok "rien à supprimer : la ligne se tait"
else rate "rien à supprimer : la ligne se tait" "$sortie"; fi

if (( echecs > 0 )); then echo; echo "$echecs cas en échec."; exit 1; fi
echo; echo "tools/etat-test.sh : tous les cas passent."
