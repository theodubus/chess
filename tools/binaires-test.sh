#!/usr/bin/env bash
#
# Éprouve la comparaison de tools/binaires.sh. Tourne dans tools/verify.sh et
# dans la CI, juste avant la construction qu'elle garde.
#
# Même argument que `.github/mutation-verdict-test.sh` : la branche précieuse
# de ce script est son REFUS — deux binaires du même code qui ne cherchent pas
# le même arbre —, et elle ne se déclenche que le jour où quelque chose a mal
# tourné. Des moteurs fabriqués, qui ne répondent que ce qu'on leur fait dire,
# l'exercent sans rien compiler.
set -uo pipefail

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINAIRES="$ICI/binaires.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echecs=0

# faux <nom> <nœuds au banc> <nœuds au réseau> <coup>
faux() {
  cat > "$TMP/$1" <<EOF
#!/usr/bin/env bash
if [ "\${1:-}" = "bench" ]; then
  echo "         100 nœuds     0.001 s   rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  echo "         200 nœuds     0.002 s   8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1"
  echo "==========================="
  echo "Total nodes  : $2"
  exit 0
fi
while read -r ligne; do
  case "\$ligne" in
    uci) echo "uciok" ;;
    isready) echo "readyok" ;;
    go*) echo "info depth 10 nodes $3 score cp 0"; echo "bestmove $4" ;;
    quit) exit 0 ;;
  esac
done
EOF
  chmod +x "$TMP/$1"
}

cas() {  # cas <nom> <code attendu> <texte attendu> <binaire> <binaire>
  local nom="$1" attendu_code="$2" attendu_texte="$3"; shift 3
  local sortie code=0
  sortie="$("$BINAIRES" --comparer "$@" 2>&1)" || code=$?
  if [[ "$code" != "$attendu_code" ]] || ! grep -qF -- "$attendu_texte" <<<"$sortie"; then
    echo "  ÉCHEC   $nom : code $code (attendu $attendu_code)"; echo "$sortie" | sed 's/^/          /'
    echecs=$((echecs + 1)); return
  fi
  echo "  ok      $nom"
}

faux base       90646 608075 e2e4
faux avx2       90646 608075 e2e4
faux banc       90656 608075 e2e4
faux reseau     90646 608076 e2e4
faux coup       90646 608075 d2d4

cas "le même arbre : accepté" 0 "même arbre : 90646 nœuds" "$TMP/base" "$TMP/avx2"
# Le banc évalue à la main : il ne voit que ce cas-ci.
cas "refus : le banc diffère" 1 "refus" "$TMP/base" "$TMP/banc"
# Ce que le banc ne verrait pas : l'AVX2 change surtout les boucles du réseau.
cas "refus : le réseau cherche un autre arbre" 1 "refus" "$TMP/base" "$TMP/reseau"
cas "refus : le même nombre de nœuds, un autre coup" 1 "refus" "$TMP/base" "$TMP/coup"
cas "refus : arguments manquants" 2 "usage" "$TMP/base"

# L'empreinte seule : ce que la CI compare d'un système à l'autre. Le total du
# banc d'abord, puis une ligne par position du banc — deux ici.
sortie="$("$BINAIRES" --empreinte "$TMP/base" 2>&1)" || true
attendu=$'90646\n608075 bestmove e2e4\n608075 bestmove e2e4'
if [[ "$sortie" == "$attendu" ]]; then
  echo "  ok      l'empreinte : le banc, puis chaque position"
else
  echo "  ÉCHEC   l'empreinte : « $sortie »"; echecs=$((echecs + 1))
fi
code=0; "$BINAIRES" --empreinte >/dev/null 2>&1 || code=$?
if [[ "$code" == 2 ]]; then
  echo "  ok      refus : l'empreinte sans binaire"
else
  echo "  ÉCHEC   refus : l'empreinte sans binaire — code $code"; echecs=$((echecs + 1))
fi

if ((echecs > 0)); then
  echo "$echecs cas en échec"
  exit 1
fi
