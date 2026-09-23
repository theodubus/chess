#!/usr/bin/env bash
#
# Éprouve `tools/mettre-en-commun.sh` sur des cas fabriqués et sur un cas de
# VÉRITÉ TERRAIN.
#
#   tools/mettre-en-commun-test.sh
#
# Pourquoi ce test existe
#
# Un script de mise en commun ne sert qu'aux rares fois où plusieurs matchs
# tournent en parallèle, et sa branche la plus précieuse — le refus de mettre
# en commun des matchs qui se contredisent — ne se déclenche qu'en cas de
# problème. Sans test, elle ne serait jamais vérifiée. C'est l'argument de
# `.github/mutation-verdict-test.sh` et de `tools/ref-test.sh`.
#
# **Le cas qui compte le plus est le premier** : la formule pentanomiale doit
# retomber sur ce que fastchess a réellement imprimé. Un outil de statistique
# qui rend des chiffres plausibles mais faux est exactement ce que ce dépôt a
# appris à craindre.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTIL="$ROOT/tools/mettre-en-commun.sh"
ATELIER="$(mktemp -d "${TMPDIR:-/tmp}/commun-test-XXXXXX")"
trap 'rm -rf "$ATELIER"' EXIT

echecs=0
ok()    { printf 'ok     %s\n' "$1"; }
rate()  { printf 'ÉCHEC  %s\n' "$1"; echo "$2" | sed 's/^/       /'; echecs=$((echecs + 1)); }

cas_contient() {
  local nom="$1" attendu="$2"; shift 2
  local sortie; sortie="$("$@" 2>&1)" || true
  if grep -qF -- "$attendu" <<<"$sortie"; then ok "$nom"; else rate "$nom" "$sortie"; fi
}
cas_code() {
  local nom="$1" attendu="$2"; shift 2
  local sortie code=0; sortie="$("$@" 2>&1)" || code=$?
  if [[ "$code" == "$attendu" ]]; then ok "$nom"; else rate "$nom" "code $code, attendu $attendu"$'\n'"$sortie"; fi
}

# ── 1. Vérité terrain ────────────────────────────────────────────────────────
# Le SPRT expiré de C21, run 35784289654 : fastchess a imprimé
#   Elo: 14.59 +/- 8.31   sur Ptnml(0-2): [97, 284, 766, 332, 141]
C21="97,284,766,332,141"
AUTRE="90,250,780,320,130"
cas_contient "vérité terrain : Elo de fastchess"  "+14.59" "$OUTIL" "$C21" "$AUTRE"
cas_contient "vérité terrain : IC de fastchess"   "8.31"   "$OUTIL" "$C21" "$AUTRE"

# ── 2. La mise en commun divise l'écart-type par racine de deux ──────────────
# 8,31 / sqrt(2) = 5,876. C'est la propriété qui justifie de paralléliser.
# ── 2. EXACTITUDE : deux moitiés doivent reconstituer le tout ───────────────
# Le test le plus fort disponible. Ces deux vecteurs somment EXACTEMENT au
# Ptnml de C21 sans être égaux, donc leur mise en commun doit rendre le chiffre
# que fastchess a imprimé sur le match entier — Elo et intervalle.
#
# Il remplace un ancien cas qui passait deux fois le MÊME vecteur : le
# garde-fou des matchs identiques le refuse désormais, à raison, et un test qui
# demande à l'outil de faire ce qu'il doit interdire ne mesure rien de bon.
MOITIE_A="48,142,383,166,70"
MOITIE_B="49,142,383,166,71"
commun=$("$OUTIL" "$MOITIE_A" "$MOITIE_B" 2>&1 | grep "EN COMMUN")
if grep -qF "+14.59" <<<"$commun" && grep -qE '8\.3[01]' <<<"$commun"; then
  ok "deux moitiés reconstituent le tout, Elo et intervalle"
else
  rate "deux moitiés reconstituent le tout, Elo et intervalle" "$commun"
fi

# Et la propriété qui justifie de paralléliser : doubler l'effectif divise
# l'intervalle par racine de deux. 8,31 / sqrt(2) = 5,876.
double=$("$OUTIL" "$C21" "97,284,766,332,142" 2>&1 | grep "EN COMMUN")
if grep -qE '5\.8[6-8]' <<<"$double"; then
  ok "doubler l'effectif rétrécit l'IC d'un facteur racine de 2"
else
  rate "doubler l'effectif rétrécit l'IC d'un facteur racine de 2" "$double"
fi

# ── 3. L'ordre des matchs ne change rien ────────────────────────────────────
A="100,200,700,300,150"; B="90,250,780,320,130"
un=$("$OUTIL" "$A" "$B" 2>&1 | grep "EN COMMUN")
deux=$("$OUTIL" "$B" "$A" 2>&1 | grep "EN COMMUN")
if [[ "$un" == "$deux" ]]; then ok "la mise en commun est indépendante de l'ordre"
else rate "la mise en commun est indépendante de l'ordre" "$un"$'\n'"$deux"; fi

# ── 4. Le refus quand les matchs se contredisent ────────────────────────────
cas_code     "matchs contradictoires : code 2" 2 "$OUTIL" "$C21" "300,400,600,200,120"
cas_contient "matchs contradictoires : le dit" "ne mesurent pas le meme effet" \
  "$OUTIL" "$C21" "300,400,600,200,120"
cas_code     "matchs homogènes : code 0" 0 "$OUTIL" "$A" "$B"

# ── 5. Lire un journal, et y prendre la DERNIÈRE ligne ──────────────────────
# La règle du dépôt : les arbitres impriment un score courant après CHAQUE
# partie. Prendre la première ligne rendrait le score de la partie 20.
cat > "$ATELIER/journal.log" <<'LOG'
Results of candidat vs reference (8+0.08, NULL, 16MB, book.epd):
Elo: 99.00 +/- 50.00, nElo: 1.00 +/- 1.00
Ptnml(0-2): [1, 1, 1, 1, 96]
Finished game 40 (candidat vs reference): 1-0 {White wins}
Results of candidat vs reference (8+0.08, NULL, 16MB, book.epd):
Elo: 14.59 +/- 8.31, nElo: 21.04 +/- 11.96
Ptnml(0-2): [97, 284, 766, 332, 141]
LOG
# Le second argument DIFFÈRE du contenu du journal : le garde-fou des matchs
# identiques refuserait sinon, et il aurait raison.
cas_contient "un journal rend sa DERNIÈRE ligne Ptnml, pas la première" "1620 paires" \
  "$OUTIL" "$ATELIER/journal.log" "$AUTRE"

# ── 6. Les refus ────────────────────────────────────────────────────────────
# Le garde-fou de la graine, imposé par un code de sortie plutôt que rappelé.
cas_code     "deux matchs identiques : code 3" 3 "$OUTIL" "$C21" "$C21"
cas_contient "deux matchs identiques : le dit" "sont IDENTIQUES" "$OUTIL" "$C21" "$C21"

cas_code "un seul match est refusé"        1 "$OUTIL" "$C21"
cas_code "un vecteur malformé est refusé"  1 "$OUTIL" "1,2,3" "$C21"
cas_code "un journal sans Ptnml est refusé" 1 "$OUTIL" "/etc/hostname" "$C21"

if (( echecs > 0 )); then echo; echo "$echecs cas en échec."; exit 1; fi
echo; echo "tools/mettre-en-commun-test.sh : tous les cas passent."
