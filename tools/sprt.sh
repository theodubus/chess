#!/usr/bin/env bash
#
# Décide si un changement améliore ShallowRed, par test séquentiel du rapport
# de probabilité (SPRT).
#
#   tools/sprt.sh <binaire-candidat> <binaire-référence>
#
# Le SPRT s'arrête dès que les données suffisent à trancher, au lieu de jouer
# un nombre de parties fixé d'avance. Il rend l'un de trois verdicts :
#
#   H1 accepted  — le candidat est meilleur que la borne basse
#   H0 accepted  — il ne l'est pas
#   (ni l'un ni l'autre) — le budget de parties est épuisé sans conclusion
#
# Réglages par variable d'environnement :
#   ELO0, ELO1   bornes de l'hypothèse       (défaut 0 et 5)
#   ALPHA, BETA  risques de première et      (défaut 0.05)
#                seconde espèce
#   TC           cadence, format Cute Chess  (défaut 8+0.08)
#   ROUNDS       plafond de paires de parties (défaut 20000)
#   SRAND        graine du tirage des ouvertures (défaut 20260913)
#   BOOK         livre d'ouvertures          (défaut tools/book.epd)
#   HASH_MB      taille de table imposée aux  (défaut : non imposée)
#                deux moteurs
#
# Bornes usuelles : [0, 5] pour un changement censé gagner, [-5, 0] pour
# vérifier qu'une simplification ne coûte rien. Ce sont des conventions, pas
# des valeurs démontrées pour ce projet.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FASTCHESS="$ROOT/tools/arbiters/fastchess"

CANDIDATE="${1:?usage: tools/sprt.sh <binaire-candidat> <binaire-référence>}"
BASELINE="${2:?usage: tools/sprt.sh <binaire-candidat> <binaire-référence>}"

ELO0="${ELO0:-0}"; ELO1="${ELO1:-5}"
ALPHA="${ALPHA:-0.05}"; BETA="${BETA:-0.05}"
TC="${TC:-8+0.08}"
ROUNDS="${ROUNDS:-20000}"
# Sans graine, fastchess tire un ordre d'ouvertures différent à chaque
# lancement : deux exécutions du même match ne sont alors pas comparables et
# « relancer pour vérifier » ne vérifie rien. Vérifié le 14 sept. 2026 — à
# graine fixée, le match est reproductible coup pour coup.
SRAND="${SRAND:-20260913}"
BOOK="${BOOK:-$ROOT/tools/book.epd}"
CONCURRENCY="${CONCURRENCY:-$(( $(nproc) > 1 ? $(nproc) - 1 : 1 ))}"

# N'imposer une taille de table que si elle est demandée : un moteur qui
# n'annonce pas l'option ferait échouer l'arbitre, ce qui rend impossible la
# comparaison avec une version antérieure à son introduction.
HASH_OPT=()
[[ -n "${HASH_MB:-}" ]] && HASH_OPT=(option.Hash="$HASH_MB")

# Les arguments se contrôlent AVANT l'environnement : sans cela le garde-fou
# des empreintes est inatteignable sur une machine sans arbitre, donc
# inéprouvable — et un garde-fou qu'on ne peut pas faire échouer ne vaut
# pas grand-chose. Ces deux-là manquaient purement et simplement.
[[ -x "$CANDIDATE" ]] || { echo "binaire candidat introuvable : $CANDIDATE" >&2; exit 1; }
[[ -x "$BASELINE"  ]] || { echo "binaire de référence introuvable : $BASELINE" >&2; exit 1; }

# Deux fois le MÊME binaire rendrait un rapport de exactement 1,00 — ou, pour
# le SPRT, 0 Elo — et personne ne saurait pourquoi. `match.yml` compare déjà
# les empreintes sur un runner ; le chemin local, lui, n'avait pas ce contrôle.
# C'est la faute B10 appliquée à un garde-fou plutôt qu'à un chiffre : couvrir
# une seule copie, ce n'est pas couvrir. La cause habituelle est `cp -p` ou
# `mv`, qui préservent les dates et font juger les sources à jour par cargo.
if [[ "$(md5sum "$CANDIDATE" | cut -d' ' -f1)" == "$(md5sum "$BASELINE" | cut -d' ' -f1)" ]]; then
  echo "les deux binaires sont IDENTIQUES (même empreinte md5) : il n'y a rien à mesurer." >&2
  echo "Cause habituelle : cp -p ou mv préservent les dates, cargo n'a rien recompilé." >&2
  echo "Reconstruire la référence par tools/ref.sh, qui rend son empreinte." >&2
  exit 1
fi

[[ -x "$FASTCHESS" ]] || { echo "arbitre absent : lancer tools/setup-arbiters.sh" >&2; exit 1; }
[[ -f "$BOOK" ]] || { echo "livre absent : $BOOK" >&2; exit 1; }

echo "SPRT  candidat=$(basename "$CANDIDATE")  référence=$(basename "$BASELINE")"
echo "      bornes [$ELO0, $ELO1]  alpha=$ALPHA beta=$BETA  cadence=$TC  concurrence=$CONCURRENCY"
echo "      graine des ouvertures=$SRAND"
echo

# -repeat joue chaque ouverture des deux côtés : c'est ce qui rend les
# statistiques pentanomiales possibles et annule le biais d'ouverture.
exec "$FASTCHESS" \
  -engine cmd="$CANDIDATE" name=candidat \
  -engine cmd="$BASELINE"  name=reference \
  -each tc="$TC" proto=uci "${HASH_OPT[@]}" \
  -openings file="$BOOK" format=epd order=random -srand "$SRAND" \
  -rounds "$ROUNDS" -games 2 -repeat \
  -sprt elo0="$ELO0" elo1="$ELO1" alpha="$ALPHA" beta="$BETA" model=normalized \
  -concurrency "$CONCURRENCY" \
  -draw movenumber=40 movecount=8 score=10 \
  -resign movecount=4 score=600 twosided=true
