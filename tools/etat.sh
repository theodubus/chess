#!/usr/bin/env bash
#
# L'état du travail en cours, **calculé** et jamais écrit.
#
#   tools/etat.sh
#
# Un outil à lancer à la main : la branche, ce qui n'est pas fusionné, les
# branches distantes à faire supprimer par Théo, et l'écart entre code et
# documentation. **Tout ce qui est imprimé ici est dérivé de git.** Rien
# n'est recopié, donc rien ne peut vieillir.
#
# Pourquoi il n'est plus lancé au démarrage
#
# Du 22 sept. au 13 nov. 2026, le hook `SessionStart` le lançait, pour que
# l'état reparaisse après chaque compactage : le document qui disait « où on
# en est » manquait au moment précis où la mémoire venait d'être perdue. Depuis
# l'adoption du socle, c'est l'état du socle (`python3 .socle/socle state`)
# qui s'imprime au démarrage : la branche, ce qui n'est pas fusionné, et les
# branches à faire supprimer, hors celles que la politique garde, comme ce
# script depuis B-0036.
# Théo a validé de ne garder que lui (D-0009) ; la feuille de route, les
# renvois et l'adresse du carnet, qui n'étaient qu'ici, sont partis avec.
#
# Ce script ne doit JAMAIS échouer : pas de `set -e`, et tout échec se
# traduit par une ligne en moins, jamais par un code non nul.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 0

echo "== ShallowRed — état calculé par tools/etat.sh, rien de recopié =="

branche=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')
sales=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
if [ "$sales" = "0" ]; then
  echo "branche  : $branche (arbre propre)"
else
  echo "branche  : $branche — ATTENTION, $sales fichier(s) non committé(s)"
fi

# `git log origin/main..HEAD` vide veut dire que `main` porte déjà tout. C'est
# le contrôle qui tranche les fausses alarmes de référence de suivi périmée.
non_fusionnes=$(git log --oneline origin/main..HEAD 2>/dev/null)
if [ -n "$non_fusionnes" ]; then
  echo "non fusionné dans main : $(echo "$non_fusionnes" | wc -l | tr -d ' ') commit(s)"
  echo "$non_fusionnes" | sed 's/^/  /'
else
  echo "non fusionné dans main : rien"
fi

# Les branches distantes que `main` contient en entier : les supprimer ne perd
# rien, et c'est à Théo de le faire — le jeton de session ne peut pas supprimer
# une référence distante (vérifié le 22 sept. 2026). Il a demandé, le 5 oct.,
# qu'on les lui signale à chaque point de récap, comme toute action humaine
# nécessaire : une consigne en prose s'oublie au premier compactage, une ligne
# calculée à chaque reprise non. Calculé sur les références du dernier
# `fetch`, donc une branche supprimée depuis peut encore y figurer. Jamais
# `main`, ni la branche de travail, ni celles que la politique garde
# (`[human] keep_branches` de `.socle/policy.toml`), qui appartiennent à un
# autre agent ou portent des réseaux (D-0002).
#
# Les motifs se lisent dans la politique, et se comparent par la fonction
# même du socle (`correspond`, `*` ne traversant pas `/`) : recopiés ici, ils
# ont divergé une fois déjà, ce script n'excluant que `codex/…` quand la
# politique gardait aussi `reseau/…` et `ccr-…` (B-0036). Si le filtre
# échoue — politique illisible, socle absent, `python3` absent ou sans
# `tomllib` —, la ligne le dit avec la dernière ligne de l'erreur, au lieu
# de proposer des branches gardées ou d'en accuser une cause devinée.
candidates=""
while IFS= read -r ref; do
  nom=${ref#origin/}
  case "$nom" in
    origin|HEAD|main|"$branche") continue ;;
  esac
  absents=$(git rev-list --count "origin/main..$ref" 2>/dev/null) || continue
  if [ "$absents" = "0" ]; then
    candidates="$candidates$nom"$'\n'
  fi
done < <(git for-each-ref --format='%(refname:short)' refs/remotes/origin 2>/dev/null)
if [ -n "$candidates" ]; then
  if filtre=$(printf '%s' "$candidates" | python3 -c '
import sys, tomllib
from pathlib import Path
racine = Path(sys.argv[1])
sys.path.insert(0, str(racine / ".socle" / "engine"))
from socle.utils import correspond
politique = tomllib.loads((racine / ".socle" / "policy.toml").read_text(encoding="utf-8"))
garder = politique.get("human", {}).get("keep_branches", [])
for nom in sys.stdin.read().split():
    if not correspond(nom, garder):
        print(nom)
' "$ROOT" 2>&1); then
    if [ -n "$filtre" ]; then
      echo "à faire supprimer par Théo — contenues dans main, selon le dernier fetch : $(echo $filtre)"
    fi
  else
    echo "branches à faire supprimer : non calculées, le filtre de la politique a échoué : $(printf '%s\n' "$filtre" | tail -n 1)"
  fi
fi

# Le signal de documentation. Il ne PRESCRIT rien — il constate, et c'est ce
# qui le rend utilisable : « il faudrait documenter » est une consigne qu'on
# oublie, « 6 fichiers de code et 0 de documentation » est un fait.
modifies=$(git diff --name-only origin/main...HEAD 2>/dev/null)
if [ -n "$modifies" ]; then
  rs=$(echo "$modifies" | grep -c '\.rs$')
  md=$(echo "$modifies" | grep -c '\.md$')
  echo "depuis main : $rs fichier(s) .rs, $md fichier(s) .md"
  if [ "$rs" -gt 0 ] && [ "$md" -eq 0 ]; then
    echo "  ^ du code a changé et aucune documentation. Vérifier que c'est voulu."
  fi
fi
