#!/usr/bin/env bash
# La séance du n° 20 sur la carte de Théo, d'une traite et sans surveillance :
# (a) — N6r4La, N6r4Lb, le réglage fin sur Leela —, (d) — N6r4w50, N6r4w25, le
# poids du résultat —, à `main` ; puis l'étape A — N7p2, N7p4, plus de passes —,
# à `4a604ea`. Chaque réseau est contrôlé ; chaque étape qui passe TOUS ses
# contrôles est commitée et poussée seule (`reseau/n20-ad`, `reseau/n20a`,
# `reseau/n20a-points`) : une étape qui échoue ne retient pas les autres.
#
#   bash tools/seance-n20.sh essai   # les contrôles et l'essai court, ~5 min
#   bash tools/seance-n20.sh         # tout, ~6 h ; le résumé dans ~/seance-n20/
#
# Les commandes, les valeurs et les critères sont ceux de tools/README.md,
# section « N° 20 » (« La séance A » et « (a) et (d) — la séance ») : ce
# script les enchaîne et lit à leur place ce que ces sections demandent de
# lire. Relancé après une interruption, il reprend au réseau qui manque et
# saute une étape déjà poussée.
set -uo pipefail

DEPOT=${DEPOT:-$HOME/chess}
DONNEES_N18=${DONNEES_N18:-$HOME/nnue-n18}
LEELA=${LEELA:-$HOME/leela}
TRAVAIL=${TRAVAIL:-$HOME/seance-n20}
MODE=${1:-tout}
NN=$DEPOT/tools/nnue-train
ATTENDU=18435764:2328546367
DEPART=n6r4/shallowred-768x4hm-256-s8-100
COMMIT_A=4a604ea
OCTETS_BINPACK=14366468016
ARCH=768x4hm-256-s8

case "$MODE" in essai | tout) ;; *)
  echo "usage : $0 [essai|tout]" >&2
  exit 2
  ;;
esac
mkdir -p "$TRAVAIL"

# Le script change de commit en cours de route (`4a604ea` n'a pas ce fichier) :
# il tourne sur une copie hors du dépôt, que git ne touche pas.
if [ "${SEANCE_N20_COPIE:-}" != 1 ]; then
  cp "$0" "$TRAVAIL/seance-n20.sh"
  SEANCE_N20_COPIE=1 exec bash "$TRAVAIL/seance-n20.sh" "$@"
fi

# Personne pour taper un mot de passe : un push qui en demanderait un échoue
# au lieu d'attendre, et les réseaux restent sur le disque.
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND=${GIT_SSH_COMMAND:-ssh -o BatchMode=yes}

RESUME=$TRAVAIL/resume.txt
printf '\n=== %s ===\n' "$(date)" >>"$RESUME"
dire() { printf '%s  %s\n' "$(date '+%d/%m %H:%M')" "$*" | tee -a "$RESUME"; }
git_d() { git -C "$DEPOT" "$@"; }

INHIBE=
fin() {
  [ -n "$INHIBE" ] && kill "$INHIBE" 2>/dev/null
  # Jamais laisser le dépôt sur `4a604ea` ou sur une branche de rapport.
  [ "$(git_d branch --show-current 2>/dev/null)" = main ] || git_d switch -q main 2>/dev/null
}
trap fin EXIT

# ---- 0. Les contrôles d'avant : un seul écart arrête tout.
ECHEC=0
verifier() {
  local message=$1
  shift
  if "$@" >/dev/null 2>&1; then dire "ok      $message"; else
    dire "ÉCHEC   $message"
    ECHEC=1
  fi
}
# Les 316 fichiers des 79 jobs appris : le dossier peut contenir aussi le job
# tenu à l'écart, que l'entraînement ne lit jamais.
compte_vf() { [ "$(for j in "${TOUS[@]}"; do find "$j" -maxdepth 1 -name '*.vf'; done | wc -l)" -eq 316 ]; }
cuda_present() { ls "$CUDA_PATH"/lib64/lib{cudart,nvrtc,cublas}.so; }
place_libre() { [ "$(df -Pk "$NN" | awk 'NR == 2 {print $4}')" -ge 4194304 ]; }
distante() { [ -n "$(git_d ls-remote --heads origin "$1")" ]; }
locale() { git_d show-ref --verify --quiet "refs/heads/$1"; }

dire "séance n° 20, mode $MODE — dépôt $DEPOT"
verifier "le dépôt, sans fichier suivi modifié" git_d diff --quiet HEAD --
verifier "main à jour (fetch, switch, pull --ff-only)" \
  bash -c 'git -C "$1" fetch -q origin && git -C "$1" switch -q main && git -C "$1" pull -q --ff-only' _ "$DEPOT"
mapfile -t TOUS < <(awk -F'\t' -v d="$DONNEES_N18" '$4 == "appris" {print d "/" $1}' "$DEPOT/tools/n18-jobs.tsv")
verifier "79 jobs appris, tous présents" bash -c '[ $# -eq 79 ] && for j; do [ -d "$j" ] || exit 1; done' _ "${TOUS[@]}"
verifier "316 fichiers .vf dans ces 79 jobs" compte_vf
mapfile -t PAQUETS < <(find "$LEELA" -name '*.binpack' 2>/dev/null)
verifier "un seul binpack sous $LEELA, de $OCTETS_BINPACK octets" \
  bash -c '[ $# -eq 2 ] && [ "$(stat -c %s "$1")" -eq "$2" ]' _ "${PAQUETS[@]}" "$OCTETS_BINPACK"
DONNEES_LEELA=$(dirname "${PAQUETS[0]:-/introuvable/x}")
verifier "le point de départ $DEPART, optimiser_state compris" test -d "$NN/$DEPART/optimiser_state"
if [ -z "${CUDA_PATH:-}" ] || ! cuda_present >/dev/null 2>&1; then
  export CUDA_PATH=/usr/local/cuda-13.2
  export LD_LIBRARY_PATH=$CUDA_PATH/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
fi
verifier "CUDA : cudart, nvrtc, cublas sous $CUDA_PATH" cuda_present
verifier "4 Go libres au moins" place_libre
verifier "cargo" command -v cargo
if [ "$ECHEC" != 0 ]; then
  dire "ARRÊT : un contrôle d'avant a échoué, rien n'a été lancé."
  exit 1
fi

if [ "$MODE" = tout ] && command -v systemd-inhibit >/dev/null; then
  # Une veille arrêterait l'entraînement sans un mot.
  systemd-inhibit --what=sleep:idle --who=seance-n20 --why="entraînement NNUE" \
    sleep infinity >/dev/null 2>&1 &
  INHIBE=$!
  sleep 2
  if kill -0 "$INHIBE" 2>/dev/null; then dire "ok      mise en veille bloquée jusqu'à la fin"; else
    INHIBE=
    dire "ATTENTION : la mise en veille n'a pas pu être bloquée — régler l'alimentation à « jamais »"
  fi
fi

# ---- Entraîner et contrôler un réseau.
entrainer() { # nom, puis les arguments de l'entraîneur
  local nom=$1
  shift
  (cd "$NN" && cargo run --release --features cuda -- "$@") 2>&1 | tee "$NN/$nom.sortie.txt"
}

# Un réseau déjà fini — relance après une interruption — n'est pas refait.
fini() { grep -qF "RÉSEAU PRÊT : $1/shallowred-$2/quantised.bin" "$NN/$1.sortie.txt" 2>/dev/null &&
  [ -s "$NN/$1/shallowred-$2/quantised.bin" ]; }

former() { # nom, identifiant, puis les arguments de l'entraîneur
  local nom=$1 id=$2 debut
  shift 2
  if fini "$nom" "$id"; then
    dire "déjà fait  $nom"
    return 0
  fi
  rm -rf "${NN:?}/$nom"
  debut=$(date +%s)
  dire "lance   $nom"
  entrainer "$nom" "$@"
  local code=$?
  dire "fin     $nom — code $code, $((($(date +%s) - debut) / 60)) min"
  [ "$code" = 0 ] || dire "  ÉCHEC $nom : l'entraîneur a rendu le code $code — la fin de $NN/$nom.sortie.txt dit pourquoi"
  return "$code"
}

# Lit dans la sortie gardée ce que les sections du n° 20 demandent d'y lire.
controler() { # nom, identifiant, puis des contrôles : echelle | pas=X | wdl=X | depuis
  local nom=$1 id=$2 sortie=$NN/$1.sortie.txt ok=0 c echelle
  shift 2
  grep -qF "RÉSEAU PRÊT : $nom/shallowred-$id/quantised.bin" "$sortie" || {
    dire "  ÉCHEC $nom : pas de « RÉSEAU PRÊT : $nom/shallowred-$id/quantised.bin »"
    ok=1
  }
  [ -s "$NN/$nom/shallowred-$id/quantised.bin" ] || {
    dire "  ÉCHEC $nom : quantised.bin absent ou vide"
    ok=1
  }
  grep -q "écart médian" "$sortie" || {
    dire "  ÉCHEC $nom : pas de confrontation"
    ok=1
  }
  for c in "$@"; do
    case "$c" in
    echelle)
      echelle=$(sed -n 's/.*échelle ajustée \([0-9.]*\).*/\1/p' "$sortie" | head -1)
      awk -v e="${echelle:-0}" 'BEGIN { exit !(e >= 250 && e <= 450) }' || {
        dire "  ÉCHEC $nom : échelle ajustée « ${echelle:-absente} » hors de 250 à 450"
        ok=1
      }
      ;;
    pas=*) grep -q "superlots, pas ${c#pas=} → " "$sortie" || {
      dire "  ÉCHEC $nom : la recette imprimée n'a pas le pas ${c#pas=}"
      ok=1
    } ;;
    wdl=*) grep -q ", wdl ${c#wdl=}\$" "$sortie" || {
      dire "  ÉCHEC $nom : la recette imprimée n'a pas wdl ${c#wdl=}"
      ok=1
    } ;;
    depuis) grep -qF "repart de $DEPART" "$sortie" || {
      dire "  ÉCHEC $nom : ne repart pas de $DEPART"
      ok=1
    } ;;
    esac
  done
  if [ "$ok" = 0 ]; then
    dire "  ok $nom —$(grep -o ' écart médian.*' "$sortie" | head -1)$(
      sed -n 's/.*\(échelle ajustée [0-9.]*\).*/ ; \1/p' "$sortie" | head -1
    )"
  fi
  return "$ok"
}

pousser() {
  local essai
  for essai in 1 2 3 4; do
    git_d push -q -u origin "$1" && return 0
    sleep $((essai * 30))
  done
  dire "  ÉCHEC du push de $1 — la branche est commitée en local : git -C $DEPOT push -u origin $1"
  return 1
}

# Copie dans reseaux/ et ajoute à l'index — ces fichiers-là, nommément : un
# `git add reseaux` prendrait aussi ce qui traînerait d'une autre séance.
copier_reseaux() { # nom:identifiant…
  local c n a d
  for c in "$@"; do
    n=${c%%:*} a=${c#*:} d=$NN/$n/shallowred-$a
    cp "$d/quantised.bin" "$DEPOT/reseaux/$n-$a.bin" &&
      cp "$d/log.txt" "$DEPOT/reseaux/$n-$a.log.txt" &&
      cp "$NN/$n.sortie.txt" "$DEPOT/reseaux/$n-$a.sortie.txt" &&
      git_d add -- "reseaux/$n-$a.bin" "reseaux/$n-$a.log.txt" "reseaux/$n-$a.sortie.txt" || return 1
  done
}

copier_points() {
  local d s
  mkdir -p "$DEPOT/reseaux/points-n20a" || return 1
  for d in "$NN"/n7p*/shallowred-*; do
    s=${d##*-}
    [ $((s % 40)) -eq 0 ] || continue
    cp "$d/quantised.bin" "$DEPOT/reseaux/points-n20a/$(basename "$(dirname "$d")")-$(basename "$d").bin" || return 1
  done
  [ "$(find "$DEPOT/reseaux/points-n20a" -name '*.bin' | wc -l)" -eq 15 ] ||
    { dire "  ÉCHEC : pas 15 points de sauvegarde" && return 1; }
  git_d add -- reseaux/points-n20a
}

copier_ad() {
  copier_reseaux "${PUBLIES[@]}" &&
    cp "$NN/essai-n6r4l.sortie.txt" "$DEPOT/reseaux/" &&
    git_d add -- reseaux/essai-n6r4l.sortie.txt
}

# Passe sur la branche de rapport — la crée depuis la base, ou la reprend où
# l'origine la laisse —, y copie par la commande donnée, commite s'il y a du
# neuf et pousse. Relancé, il complète ce qu'un passage précédent a laissé.
publier() { # branche, base, message, commande de copie…
  local b=$1 base=$2 message=$3 code
  shift 3
  git_d fetch -q origin
  if locale "$b"; then
    git_d switch -q "$b" && { ! distante "$b" || git_d merge -q --ff-only "origin/$b"; }
  elif distante "$b"; then
    git_d switch -q -c "$b" "origin/$b"
  else
    git_d switch -q -c "$b" "$base"
  fi || {
    dire "  ÉCHEC : impossible de passer sur $b"
    git_d switch -q main
    return 1
  }
  if ! "$@" || ! { git_d diff --cached --quiet || git_d commit -q -m "$message"; }; then
    dire "  ÉCHEC de la copie ou du commit sur $b"
    git_d reset -q --hard
    git_d switch -q main
    return 1
  fi
  pousser "$b"
  code=$?
  git_d switch -q main
  return "$code"
}

# ---- L'essai court de (a) : la reprise au pas réduit, l'échelle, la confrontation.
ESSAI=0
dire "— l'essai court de (a)"
rm -rf "${NN:?}/essai-n6r4l"
entrainer essai-n6r4l --depuis "$DEPART" --pas 0.0001 --superlots 1 --sortie essai-n6r4l "$DONNEES_LEELA" ||
  dire "  ÉCHEC essai-n6r4l : l'entraîneur a rendu une erreur"
controler essai-n6r4l "$ARCH-1" echelle pas=0.0001 depuis || ESSAI=1
if [ "$MODE" = essai ]; then
  if [ "$ESSAI" = 0 ]; then dire "ESSAI RÉUSSI — lancer : bash $TRAVAIL/seance-n20.sh"; else dire "ESSAI ÉCHOUÉ — m'envoyer $RESUME"; fi
  exit "$ESSAI"
fi

# ---- (a) et (d), à `main`. Ce qui a passé ses contrôles part, même si un
# voisin a échoué : les deux axes se lisent à part (« (a) et (d) — la séance »).
AD=0 PUBLIES=()
git_d fetch -q origin
deja_pousse() { git_d cat-file -e "origin/reseau/n20-ad:reseaux/$1-$2.bin" 2>/dev/null; }
reseau_ad() { # nom, identifiant, contrôles (séparés par des espaces), puis les arguments de l'entraîneur
  local nom=$1 id=$2 controles=$3
  shift 3
  if deja_pousse "$nom" "$id"; then
    dire "déjà poussé  $nom"
  elif [ "$nom" != "${nom#n6r4l}" ] && [ "$ESSAI" != 0 ]; then
    dire "  $nom sauté : l'essai court a échoué"
    AD=1
  # shellcheck disable=SC2086 # les contrôles se séparent aux espaces, exprès
  elif former "$nom" "$id" "$@" && controler "$nom" "$id" $controles; then
    PUBLIES+=("$nom:$id")
  else
    AD=1
  fi
}
dire "— (a), le réglage fin sur Leela"
reseau_ad n6r4la "$ARCH-20" "echelle pas=0.0001 wdl=0.75 depuis" \
  --depuis "$DEPART" --pas 0.0001 --superlots 20 --sortie n6r4la "$DONNEES_LEELA"
reseau_ad n6r4lb "$ARCH-20" "echelle pas=0.00002 wdl=0.75 depuis" \
  --depuis "$DEPART" --pas 0.00002 --superlots 20 --sortie n6r4lb "$DONNEES_LEELA"
dire "— (d), le poids du résultat"
reseau_ad n6r4w50 "$ARCH-100" "pas=0.001 wdl=0.5" \
  --attendu "$ATTENDU" --superlots 100 --wdl 0.5 --sortie n6r4w50 "${TOUS[@]}"
reseau_ad n6r4w25 "$ARCH-100" "pas=0.001 wdl=0.25" \
  --attendu "$ATTENDU" --superlots 100 --wdl 0.25 --sortie n6r4w25 "${TOUS[@]}"
if [ "${#PUBLIES[@]}" -gt 0 ]; then
  dire "— rapport de (a) et (d) : ${PUBLIES[*]%%:*}"
  publier reseau/n20-ad main \
    "Réseaux NNUE du n° 20, (a) et (d) : ${PUBLIES[*]%%:*} — tools/seance-n20.sh, tous les contrôles passés" \
    copier_ad || AD=1
fi

# ---- L'étape A, à `4a604ea`, telle qu'écrite le 17 oct. : les deux réseaux,
# puis leurs points, ou rien.
A=0
git_d fetch -q origin
if distante reseau/n20a && distante reseau/n20a-points; then
  dire "— A : reseau/n20a et reseau/n20a-points sont déjà poussées, sautée"
else
  dire "— A, plus de passes, à $COMMIT_A"
  if git_d checkout -q "$COMMIT_A"; then
    { former n7p2 "$ARCH-200" --attendu "$ATTENDU" --superlots 200 --sortie n7p2 "${TOUS[@]}" &&
      controler n7p2 "$ARCH-200"; } || A=1
    { former n7p4 "$ARCH-400" --attendu "$ATTENDU" --superlots 400 --sortie n7p4 "${TOUS[@]}" &&
      controler n7p4 "$ARCH-400"; } || A=1
    git_d switch -q main
  else
    dire "  ÉCHEC : checkout de $COMMIT_A"
    A=1
  fi
  if [ "$A" = 0 ]; then
    dire "— rapport de A"
    publier reseau/n20a main "Réseaux NNUE du n° 20, étape A : N7p2 et N7p4 — plus de passes" \
      copier_reseaux n7p2:"$ARCH-200" n7p4:"$ARCH-400" || A=1
    if [ "$A" = 0 ]; then
      base=reseau/n20a
      locale "$base" || base=origin/reseau/n20a
      publier reseau/n20a-points "$base" "Points de sauvegarde du n° 20, étape A, tous les 40 superlots" \
        copier_points || A=1
    fi
  fi
fi

etat() { if [ "$1" = 0 ]; then echo ok; else echo ÉCHEC; fi; }
dire "FIN : (a) et (d) $(etat "$AD"), A $(etat "$A") — le détail plus haut, les sorties dans $NN/*.sortie.txt"
[ "$AD" = 0 ] && [ "$A" = 0 ]
