#!/usr/bin/env bash
#
# Le balayage de mutation tourne-t-il encore ? Tourne dans la CI, à chaque push.
#
#   tools/balayage-vivant.sh <état du workflow> <date du dernier balayage> [maintenant]
#
# Les deux premiers arguments viennent de l'API GitHub (étape de `ci.yml`) :
# l'état de `mutation.yml` — `active`, `disabled_inactivity`,
# `disabled_manually`… — et la date ISO 8601 de sa dernière exécution, vide
# s'il n'y en a aucune. `maintenant` ne sert qu'aux tests.
#
# Pourquoi
#
# Le dépôt est public, et GitHub y ENDORT les workflows planifiés après
# soixante jours sans activité. Le cliquet de mutation mourrait alors sans un
# mot : pas de balayage, donc pas de verdict, donc pas d'issue — le job
# `Verdict` ne peut pas signaler sa propre absence, et tout reste vert. Ce
# contrôle tourne à chaque push, c'est-à-dire exactement quand le code bouge,
# donc quand un balayage manquant coûte quelque chose.
#
# Il remplace une routine planifiée qui vivait hors du dépôt. Relevé le
# 23 sept. 2026 : le seul mardi où le cliquet a cassé sur `main`, GitHub a
# lancé le cron de 00:00 avec 3 h 48 de retard, et la routine de 03:00 a lu
# l'exécution PRÉCÉDENTE — elle s'est tue. Une alerte qui passe avant
# l'événement qu'elle surveille ne surveille rien.
#
# Le seuil compte n'importe quelle exécution, planifiée ou lancée à la main :
# la question est « un balayage a-t-il couvert le code récemment ? », pas
# « le cron est-il beau ». Quinze jours laissent passer un mardi manqué, pas
# deux.
set -euo pipefail

SEUIL_JOURS=15

if [[ $# -lt 2 ]]; then
  echo "usage : tools/balayage-vivant.sh <état> <date du dernier balayage> [maintenant]" >&2
  exit 2
fi
etat="$1" derniere="$2" maintenant="${3:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

if [[ "$etat" != "active" ]]; then
  echo "BALAYAGE ARRÊTÉ : le workflow Mutation est « $etat »."
  echo "  GitHub endort les workflows planifiés d'un dépôt public après 60 jours"
  echo "  sans activité. Le réactiver : onglet Actions → Mutation → Enable workflow,"
  echo "  puis lancer un balayage à la main (workflow_dispatch) sur main."
  exit 1
fi

if [[ -z "$derniere" ]]; then
  echo "BALAYAGE ARRÊTÉ : le workflow Mutation n'a aucune exécution."
  exit 1
fi

if ! t_derniere=$(date -u -d "$derniere" +%s 2>/dev/null) \
  || ! t_maintenant=$(date -u -d "$maintenant" +%s 2>/dev/null); then
  echo "refus : date illisible (« $derniere » ou « $maintenant »)" >&2
  exit 2
fi

age=$(((t_maintenant - t_derniere) / 86400))
if ((age > SEUIL_JOURS)); then
  echo "BALAYAGE ARRÊTÉ : dernière exécution de Mutation il y a $age jours ($derniere)."
  echo "  Le workflow est actif mais ne tourne plus. Lancer un balayage à la main"
  echo "  (workflow_dispatch) sur main, et chercher pourquoi le cron ne part plus."
  exit 1
fi
echo "balayage de mutation vivant : dernière exécution il y a $age jour(s), workflow $etat"
