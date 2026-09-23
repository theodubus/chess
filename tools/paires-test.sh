#!/usr/bin/env bash
#
# Éprouve tools/paires.sh. Tourne dans tools/verify.sh.
#
# Son premier cas est une VÉRITÉ TERRAIN : un vrai journal fastchess de 80
# parties, qui porte à la fois les lignes de parties et le vecteur que
# fastchess a calculé lui-même, [3, 11, 8, 13, 5]. La reconstruction doit y
# retomber exactement. Les autres cas éprouvent les REFUS — une paire
# incomplète, une ligne en double, une partie interrompue — qui ne servent
# qu'en cas de problème, donc ne seraient jamais vérifiés autrement.
set -uo pipefail

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAIRES="$ICI/paires.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echecs=0

attend() {  # attend <nom> <sortie attendue> <journal>
  local nom="$1" attendu="$2" obtenu
  obtenu=$("$PAIRES" "$3" 2>/dev/null) || obtenu="(refus)"
  if [[ "$obtenu" == "$attendu" ]]; then
    echo "  ok      $nom"
  else
    echo "  ÉCHEC   $nom : attendu « $attendu », obtenu « $obtenu »"
    echecs=$((echecs + 1))
  fi
}

# --- 1. vérité terrain : les lignes « Finished game » d'un vrai match -------
{
  echo "Finished game 2 (reference vs candidat): 1-0 {White wins by adjudication}"
  echo "Finished game 3 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 1 (candidat vs reference): 1/2-1/2 {Draw by adjudication}"
  echo "Finished game 5 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 4 (reference vs candidat): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 6 (reference vs candidat): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 7 (candidat vs reference): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 8 (reference vs candidat): 0-1 {Black wins by adjudication}"
  echo "Finished game 9 (candidat vs reference): 0-1 {Black wins by adjudication}"
  echo "Finished game 12 (reference vs candidat): 1-0 {White mates}"
  echo "Finished game 11 (candidat vs reference): 0-1 {Black wins by adjudication}"
  echo "Finished game 10 (reference vs candidat): 1/2-1/2 {Draw by fifty moves rule}"
  echo "Finished game 13 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 14 (reference vs candidat): 1/2-1/2 {Draw by insufficient mating material}"
  echo "Finished game 15 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 16 (reference vs candidat): 0-1 {Black wins by adjudication}"
  echo "Finished game 17 (candidat vs reference): 1/2-1/2 {Draw by insufficient mating material}"
  echo "Finished game 18 (reference vs candidat): 0-1 {Black wins by adjudication}"
  echo "Finished game 19 (candidat vs reference): 1/2-1/2 {Draw by insufficient mating material}"
  echo "Finished game 20 (reference vs candidat): 1-0 {White wins by adjudication}"
  echo "Finished game 21 (candidat vs reference): 0-1 {Black mates}"
  echo "Finished game 22 (reference vs candidat): 1-0 {White wins by adjudication}"
  echo "Finished game 23 (candidat vs reference): 1/2-1/2 {Draw by insufficient mating material}"
  echo "Finished game 25 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 24 (reference vs candidat): 0-1 {Black wins by adjudication}"
  echo "Finished game 26 (reference vs candidat): 1-0 {White wins by adjudication}"
  echo "Finished game 29 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 27 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 28 (reference vs candidat): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 31 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 32 (reference vs candidat): 1-0 {White wins by adjudication}"
  echo "Finished game 30 (reference vs candidat): 0-1 {Black wins by adjudication}"
  echo "Finished game 34 (reference vs candidat): 0-1 {Black wins by adjudication}"
  echo "Finished game 33 (candidat vs reference): 0-1 {Black mates}"
  echo "Finished game 35 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 36 (reference vs candidat): 1-0 {White wins by adjudication}"
  echo "Finished game 38 (reference vs candidat): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 37 (candidat vs reference): 0-1 {Black wins by adjudication}"
  echo "Finished game 39 (candidat vs reference): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 40 (reference vs candidat): 1-0 {White wins by adjudication}"
  echo "Finished game 41 (candidat vs reference): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 42 (reference vs candidat): 0-1 {Black mates}"
  echo "Finished game 44 (reference vs candidat): 1-0 {White wins by adjudication}"
  echo "Finished game 45 (candidat vs reference): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 43 (candidat vs reference): 1/2-1/2 {Draw by adjudication}"
  echo "Finished game 47 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 46 (reference vs candidat): 1-0 {White wins by adjudication}"
  echo "Finished game 48 (reference vs candidat): 1-0 {White wins by adjudication}"
  echo "Finished game 49 (candidat vs reference): 0-1 {Black wins by adjudication}"
  echo "Finished game 50 (reference vs candidat): 0-1 {Black wins by adjudication}"
  echo "Finished game 51 (candidat vs reference): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 52 (reference vs candidat): 0-1 {Black mates}"
  echo "Finished game 53 (candidat vs reference): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 54 (reference vs candidat): 1-0 {White wins by adjudication}"
  echo "Finished game 56 (reference vs candidat): 0-1 {Black wins by adjudication}"
  echo "Finished game 55 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 57 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 58 (reference vs candidat): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 59 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 60 (reference vs candidat): 1-0 {White wins by adjudication}"
  echo "Finished game 61 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 63 (candidat vs reference): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 62 (reference vs candidat): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 64 (reference vs candidat): 0-1 {Black wins by adjudication}"
  echo "Finished game 65 (candidat vs reference): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 66 (reference vs candidat): 1-0 {White wins by adjudication}"
  echo "Finished game 67 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 68 (reference vs candidat): 1/2-1/2 {Draw by adjudication}"
  echo "Finished game 69 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 71 (candidat vs reference): 0-1 {Black wins by adjudication}"
  echo "Finished game 70 (reference vs candidat): 0-1 {Black wins by adjudication}"
  echo "Finished game 72 (reference vs candidat): 1-0 {White wins by adjudication}"
  echo "Finished game 73 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 74 (reference vs candidat): 1-0 {White wins by adjudication}"
  echo "Finished game 76 (reference vs candidat): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 75 (candidat vs reference): 0-1 {Black wins by adjudication}"
  echo "Finished game 77 (candidat vs reference): 1-0 {White wins by adjudication}"
  echo "Finished game 78 (reference vs candidat): 0-1 {Black wins by adjudication}"
  echo "Finished game 79 (candidat vs reference): 1/2-1/2 {Draw by 3-fold repetition}"
  echo "Finished game 80 (reference vs candidat): 1-0 {White wins by adjudication}"
} > "$TMP/verite.log"
attend "vérité terrain : 80 parties, le vecteur de fastchess" "3,11,8,13,5" "$TMP/verite.log"

# --- 2. le candidat noir dans la première partie de la paire ---------------
cat > "$TMP/noirs.log" <<'J'
Finished game 1 (reference vs candidat): 0-1 {Black wins by adjudication}
Finished game 2 (candidat vs reference): 1/2-1/2 {Draw by 3-fold repetition}
J
attend "candidat noir puis blanc : 1 + ½ = 1½" "0,0,0,1,0" "$TMP/noirs.log"

# --- 3. l'ordre d'arrivée ne compte pas ------------------------------------
cat > "$TMP/desordre.log" <<'J'
Finished game 4 (reference vs candidat): 1-0 {White wins by adjudication}
Finished game 1 (candidat vs reference): 1-0 {White wins by adjudication}
Finished game 3 (candidat vs reference): 0-1 {Black wins by adjudication}
Finished game 2 (reference vs candidat): 0-1 {Black wins by adjudication}
J
attend "concurrence : les paires se retrouvent par leur numéro" "1,0,0,0,1" "$TMP/desordre.log"

# --- 4. REFUS : une paire incomplète est écartée, pas comptée à moitié -----
cat > "$TMP/orpheline.log" <<'J'
Finished game 1 (candidat vs reference): 1-0 {White wins by adjudication}
Finished game 2 (reference vs candidat): 1/2-1/2 {Draw by adjudication}
Finished game 3 (candidat vs reference): 1-0 {White wins by adjudication}
J
attend "une partie sans sa jumelle ne compte pas" "0,0,0,1,0" "$TMP/orpheline.log"

# --- 5. REFUS : une ligne répétée ne compte qu'une fois --------------------
cat > "$TMP/doublon.log" <<'J'
Finished game 1 (candidat vs reference): 1-0 {White wins by adjudication}
Finished game 1 (candidat vs reference): 1-0 {White wins by adjudication}
Finished game 2 (reference vs candidat): 1-0 {White wins by adjudication}
J
attend "une ligne en double ne compte qu'une fois" "0,0,1,0,0" "$TMP/doublon.log"

# --- 6. REFUS : une partie interrompue n'a pas de résultat -----------------
cat > "$TMP/interrompue.log" <<'J'
Finished game 1 (candidat vs reference): * {Game interrupted}
Finished game 2 (reference vs candidat): 1-0 {White wins by adjudication}
J
attend "rien de complet : refus plutôt qu'un vecteur vide" "(refus)" "$TMP/interrompue.log"

# --- 7. le nom du candidat se choisit --------------------------------------
cat > "$TMP/noms.log" <<'J'
Finished game 1 (sr-ponder vs sr): 1-0 {White wins by adjudication}
Finished game 2 (sr vs sr-ponder): 1-0 {White wins by adjudication}
J
obtenu=$("$PAIRES" "$TMP/noms.log" sr-ponder 2>/dev/null) || obtenu="(refus)"
if [[ "$obtenu" == "0,0,1,0,0" ]]; then
  echo "  ok      le nom du candidat se passe en argument"
else
  echo "  ÉCHEC   nom du candidat : obtenu « $obtenu »"; echecs=$((echecs + 1))
fi

echo
if (( echecs > 0 )); then
  echo "paires : $echecs échec(s)"
  exit 1
fi
echo "paires : tout passe"
