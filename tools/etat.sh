#!/usr/bin/env bash
#
# L'état du travail en cours, **calculé** et jamais écrit.
#
#   tools/etat.sh
#
# Lancé par le hook `SessionStart` déclaré dans `.claude/settings.json`, dont
# la sortie entre dans le contexte du modèle.
#
# Pourquoi ce script existe
#
# `CLAUDE.md` est réinjecté après chaque compactage ; le carnet de bord, qui
# porte « où on en est », ne l'est pas. **Le document qui dit l'état est donc
# absent au moment précis où la mémoire vient d'être perdue.** Le 22 sept. 2026
# un engagement pris en prose — « j'attaque B9, je te reviens avec son coût
# monothread » — a disparu exactement comme ça : ni fiche, ni journal, ni
# `tools/README.md` ne le portaient.
#
# `SessionStart` se déclenche au démarrage, à la reprise, après `/clear` **et
# après chaque compactage**. C'est le seul point d'accroche qui tombe au bon
# moment.
#
# **Tout ce qui est imprimé ici est dérivé de git.** Rien n'est recopié, donc
# rien ne peut vieillir — c'est la seule forme d'état que ce dépôt tienne pour
# fiable, après avoir payé le chiffre de bench périmé, le renvoi par position,
# et un « fait vérifié » sur des branches distantes devenu faux en un jour.
#
# Ce script ne doit JAMAIS empêcher une session de démarrer : pas de `set -e`,
# et tout échec se traduit par une ligne en moins, jamais par un code non nul.
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

# Les renvois sont DÉRIVÉS du fichier, jamais recopiés. La première version
# nommait « § EN VOL » en dur ; la section a été renommée au verdict de C21 et
# le pointeur a survécu, parfaitement lisible, en désignant le vide. C'est le
# piège du renvoi par position, dans le script même qui existe pour qu'aucun
# état ne vieillisse.
#
# Deux classes, et la distinction est le tout du dispositif :
#   ÉPISODIQUE  — « EN VOL », « VERDICT » n'existent que quand quelque chose
#                 tourne ou vient d'être tranché. Absentes, elles se taisent :
#                 un garde-fou qui crie en permanence finit par être ignoré.
#   STRUCTUREL  — les autres doivent exister. Leur absence est une erreur, et
#                 c'est le travail du script de la dire.
echo "à lire avant de décider quoi faire :"

# TOUS les titres qui correspondent, pas le premier : deux mesures peuvent être
# en vol à la fois (C22 et B9 l'ont été le 23 sept. 2026), et la première
# version n'en montrait qu'une — un état calculé qui CACHE une mesure en vol.
renvoi() {
  local motif="$1" quoi="$2" obligatoire="$3"
  local titres
  titres=$(grep -E "^#{2,4} .*$motif" tools/README.md 2>/dev/null | sed -E 's/^#+ //')
  if [ -n "$titres" ]; then
    while IFS= read -r titre; do
      echo "  tools/README.md § « $titre »${quoi:+ — $quoi}"
    done <<< "$titres"
  elif [ "$obligatoire" = oui ]; then
    echo "  !! tools/README.md n'a plus de section « $motif » — renvoi à corriger"
  fi
}

renvoi "EN VOL"                    "ce qui tourne en ce moment"                        non
renvoi "VERDICT"                   "ce qui vient d'être tranché, et la suite"          non
renvoi "Ce qu.il faut surveiller"  "ce qui vieillit sans que rien ne le signale"       oui
renvoi "Ce qui reste à faire, par ordre mesuré" ""                                oui

# Le carnet est privé et hors du dépôt (décision de Théo) : son adresse vit
# dans un fichier local ignoré par git, pour que le pointeur soit mécanique
# sans que le dépôt porte le lien.
if [ -f .claude/carnet.local ]; then
  echo "  carnet de bord : $(head -1 .claude/carnet.local)"
else
  echo "  carnet de bord : adresse non configurée (.claude/carnet.local absent)"
fi
