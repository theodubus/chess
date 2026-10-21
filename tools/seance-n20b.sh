#!/usr/bin/env bash
# La séance B du n° 20 sur la carte de Théo, d'une traite et sans surveillance :
# les données neuves de l'étape B téléchargées, puis les réseaux du format
# choisi, à 400 superlots (`SL=400`, le verdict de l'étape A) — et 800 pour
# le doublement suivant, au format w50. Chaque réseau qui passe TOUS
# ses contrôles est commité et poussé aussitôt sur `reseau/n20b` : le premier
# fini se mesure pendant que les suivants s'entraînent.
#
#   bash tools/seance-n20b.sh essai        # contrôles, téléchargement, essai court
#   bash tools/seance-n20b.sh              # tout, ~14 h 30 ; le résumé dans ~/seance-n20b/
#   bash tools/seance-n20b.sh tout ecrit   # le format écrit le 20 oct. à 13 h 25
#   bash tools/seance-n20b.sh tout n8n800  # N8nw50s800 seul, ~5 h 15
#
# Deux formats, l'arbitrage de Théo les départage (tools/README.md, section
# « N° 20 », « La séance B ») :
#   w50   — tout au poids du résultat 0,5 : N7p4w50 (les anciennes, la
#           composition de A et de (d)), N8tw50 (les deux), N8tw50s800 (les
#           deux, 800 superlots : faut-il encore plus de passes ?), l'écran
#           du pas (N6r4w50 aux pas 0,0005 et 0,002, 100 superlots), N8nw50
#           (les neuves seules, l'étiqueteur — le dernier, qu'on peut couper) ;
#   ecrit — au poids 0,75 : N8t, N8n ; N7p4, déjà entraîné, sert de troisième.
# Et un troisième, écrit le 21 oct. au soir, après le verdict de N8nw50 contre
# N8tw50 (+5,18 ± 3,32 : les données de N5l diluent à superlots fixés) :
#   n8n800 — N8nw50s800, les neuves seules à 800 superlots, le candidat
#           suivant contre N8tw50s800, qui joue. Fondu dans la séance C
#           (Théo, 21 oct.) ; le format reste pour le lancer seul.
# Relancé après une interruption, il reprend au réseau qui manque et saute
# ce qui est déjà poussé ; le téléchargement reprend au job qui manque.
set -uo pipefail

DEPOT=${DEPOT:-$HOME/chess}
DONNEES_N18=${DONNEES_N18:-$HOME/nnue-n18}
DONNEES_N20=${DONNEES_N20:-$HOME/nnue-n20}
TRAVAIL=${TRAVAIL:-$HOME/seance-n20b}
MODE=${1:-tout}
FORMAT=${2:-w50}
NN=$DEPOT/tools/nnue-train
SL=400
ARCH=768x4hm-256-s8
# Parties:positions de chaque ensemble, que l'entraîneur relit à l'octet.
ATT_ANCIENNES=18435764:2328546367
ATT_NEUVES=18245052:2299253673
ATT_TOUT=36680816:4627800040

case "$MODE" in essai | tout) ;; *)
  echo "usage : $0 [essai|tout] [w50|ecrit|n8n800]" >&2
  exit 2
  ;;
esac
case "$FORMAT" in w50 | ecrit | n8n800) ;; *)
  echo "usage : $0 [essai|tout] [w50|ecrit|n8n800]" >&2
  exit 2
  ;;
esac
mkdir -p "$TRAVAIL"

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
  # Jamais laisser le dépôt sur la branche de rapport.
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
compte_vf() { # nombre attendu, puis les dossiers
  local n=$1
  shift
  [ "$(for j in "$@"; do find "$j" -maxdepth 1 -name '*.vf'; done | wc -l)" -eq "$n" ]
}
cuda_present() { ls "$CUDA_PATH"/lib64/lib{cudart,nvrtc,cublas}.so; }
# ~10 Go de données neuves et trois entraînements de 400 superlots, points
# de sauvegarde compris.
place_libre() { [ "$(df -Pk "$1" | awk 'NR == 2 {print $4}')" -ge 16777216 ]; }
distante() { [ -n "$(git_d ls-remote --heads origin "$1")" ]; }
locale() { git_d show-ref --verify --quiet "refs/heads/$1"; }

dire "séance B du n° 20, mode $MODE, format $FORMAT — dépôt $DEPOT"
verifier "le dépôt, sans fichier suivi modifié" git_d diff --quiet HEAD --
verifier "main à jour (fetch, switch, pull --ff-only)" \
  bash -c 'git -C "$1" fetch -q origin && git -C "$1" switch -q main && git -C "$1" pull -q --ff-only' _ "$DEPOT"
mapfile -t ANCIENNES < <(awk -F'\t' -v d="$DONNEES_N18" '$4 == "appris" {print d "/" $1}' "$DEPOT/tools/n18-jobs.tsv")
verifier "79 jobs anciens, tous présents" bash -c '[ $# -eq 79 ] && for j; do [ -d "$j" ] || exit 1; done' _ "${ANCIENNES[@]}"
verifier "316 fichiers .vf dans ces 79 jobs" compte_vf 316 "${ANCIENNES[@]}"
mapfile -t APPRIS_N20 < <(awk -F'\t' '$4 == "appris" {print $1}' "$DEPOT/tools/n20-jobs.tsv")
verifier "94 jobs neufs au registre" test "${#APPRIS_N20[@]}" -eq 94
verifier "gh, connecté à GitHub" gh auth status
mkdir -p "$DONNEES_N20"
if [ -z "${CUDA_PATH:-}" ] || ! cuda_present >/dev/null 2>&1; then
  export CUDA_PATH=/usr/local/cuda-13.2
  export LD_LIBRARY_PATH=$CUDA_PATH/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
fi
verifier "CUDA : cudart, nvrtc, cublas sous $CUDA_PATH" cuda_present
verifier "16 Go libres au moins sous $DONNEES_N20" place_libre "$DONNEES_N20"
verifier "16 Go libres au moins sous $NN" place_libre "$NN"
verifier "cargo" command -v cargo
if [ "$ECHEC" != 0 ]; then
  dire "ARRÊT : un contrôle d'avant a échoué, rien n'a été lancé."
  exit 1
fi

# ---- 1. Les données neuves : les 94 jobs appris, le tenu à l'écart jamais.
# Un job à moitié téléchargé reste dans `.tmp-` et se refait à la relance.
dire "— le téléchargement des 94 jobs neufs"
TELE=0
for r in "${APPRIS_N20[@]}"; do
  [ -d "$DONNEES_N20/$r" ] && continue
  rm -rf "${DONNEES_N20:?}/.tmp-$r"
  if gh run download "$r" -R theodubus/chess -n "nnue-$r" -D "$DONNEES_N20/.tmp-$r" >/dev/null 2>&1; then
    mv "$DONNEES_N20/.tmp-$r" "$DONNEES_N20/$r"
  else
    dire "  ÉCHEC du téléchargement de $r"
    TELE=1
    break
  fi
done
NEUFS_TOUS=()
for r in "${APPRIS_N20[@]}"; do NEUFS_TOUS+=("$DONNEES_N20/$r"); done
if [ "$TELE" != 0 ] || ! compte_vf 376 "${NEUFS_TOUS[@]}"; then
  dire "ARRÊT : il manque des données neuves (376 fichiers .vf attendus) — relancer reprend où il s'est arrêté."
  exit 1
fi
dire "ok      376 fichiers .vf, $(du -sh "$DONNEES_N20" | cut -f1)"

# Les neuves : les 84 premiers jobs appris dans l'ordre de lancement — la règle
# de fin écrite avant, 0,5 % au-dessus du volume ancien ; les dix suivants
# restent pour (c) et (e).
mapfile -t NEUVES < <(printf '%s\n' "${APPRIS_N20[@]}" | sort -n | head -84 | sed "s|^|$DONNEES_N20/|")
if [ "${#NEUVES[@]}" -ne 84 ]; then
  dire "ARRÊT : ${#NEUVES[@]} jobs neufs retenus au lieu de 84."
  exit 1
fi

if [ "$MODE" = tout ] && command -v systemd-inhibit >/dev/null; then
  # Une veille arrêterait l'entraînement sans un mot.
  systemd-inhibit --what=sleep:idle --who=seance-n20b --why="entraînement NNUE" \
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

# Lit dans la sortie gardée ce que la séance B demande d'y lire.
controler() { # nom, identifiant, puis des contrôles : pas=X | wdl=X
  local nom=$1 id=$2 sortie=$NN/$1.sortie.txt ok=0 c
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
    pas=*) grep -q "superlots, pas ${c#pas=} → " "$sortie" || {
      dire "  ÉCHEC $nom : la recette imprimée n'a pas le pas ${c#pas=}"
      ok=1
    } ;;
    wdl=*) grep -q ", wdl ${c#wdl=}\$" "$sortie" || {
      dire "  ÉCHEC $nom : la recette imprimée n'a pas wdl ${c#wdl=}"
      ok=1
    } ;;
    esac
  done
  [ "$ok" = 0 ] && dire "  ok $nom —$(grep -o ' écart médian.*' "$sortie" | head -1)"
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

# Passe sur la branche de rapport — la crée depuis `main`, ou la reprend où
# l'origine la laisse —, y copie, commite s'il y a du neuf et pousse.
publier() { # message, puis nom:identifiant
  local b=reseau/n20b message=$1 code
  shift
  git_d fetch -q origin
  if locale "$b"; then
    git_d switch -q "$b" && { ! distante "$b" || git_d merge -q --ff-only "origin/$b"; }
  elif distante "$b"; then
    git_d switch -q -c "$b" "origin/$b"
  else
    git_d switch -q -c "$b" main
  fi || {
    dire "  ÉCHEC : impossible de passer sur $b"
    git_d switch -q main
    return 1
  }
  if ! copier_reseaux "$@" || ! { git_d diff --cached --quiet || git_d commit -q -m "$message"; }; then
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

# ---- 2. L'essai court : relit chaque octet des 84 jobs neufs et refuse au
# moindre écart de compte ; un superlot, la confrontation.
ESSAI=0
dire "— l'essai court, sur les neuves"
rm -rf "${NN:?}/essai-n8"
entrainer essai-n8 --attendu "$ATT_NEUVES" --superlots 1 --sortie essai-n8 "${NEUVES[@]}" ||
  dire "  ÉCHEC essai-n8 : l'entraîneur a rendu une erreur"
controler essai-n8 "$ARCH-1" pas=0.001 || ESSAI=1
if [ "$MODE" = essai ]; then
  if [ "$ESSAI" = 0 ]; then dire "ESSAI RÉUSSI — lancer : bash $0 tout $FORMAT"; else dire "ESSAI ÉCHOUÉ — m'envoyer $RESUME"; fi
  exit "$ESSAI"
fi
if [ "$ESSAI" != 0 ]; then
  dire "ARRÊT : l'essai court a échoué, aucun réseau n'a été lancé — m'envoyer $RESUME"
  exit 1
fi

# ---- 3. Les réseaux, chacun poussé dès qu'il a passé ses contrôles. Le plus
# probable à embarquer d'abord.
B=0
git_d fetch -q origin
deja_pousse() { git_d cat-file -e "origin/reseau/n20b:reseaux/$1-$2.bin" 2>/dev/null; }
reseau_b() { # nom, superlots, poids, pas, puis les arguments de données
  local nom=$1 sl=$2 wdl=$3 pas=$4 id=$ARCH-$2
  shift 4
  if deja_pousse "$nom" "$id"; then
    dire "déjà poussé  $nom"
  elif former "$nom" "$id" --superlots "$sl" --wdl "$wdl" --pas "$pas" --sortie "$nom" "$@" &&
    controler "$nom" "$id" "pas=$pas" "wdl=$wdl"; then
    publier "Réseau NNUE du n° 20, séance B : $nom — tools/seance-n20b.sh, tous les contrôles passés" \
      "$nom:$id" || B=1
  else
    B=1
  fi
}
if [ "$FORMAT" = w50 ]; then
  dire "— N7p4w50 : les anciennes, 400 superlots, poids 0,5"
  reseau_b n7p4w50 "$SL" 0.5 0.001 --attendu "$ATT_ANCIENNES" "${ANCIENNES[@]}"
  dire "— N8tw50 : les anciennes et les neuves"
  reseau_b n8tw50 "$SL" 0.5 0.001 --attendu "$ATT_TOUT" "${ANCIENNES[@]}" "${NEUVES[@]}"
  dire "— N8tw50s800 : les mêmes, 800 superlots — le doublement suivant"
  reseau_b n8tw50s800 800 0.5 0.001 --attendu "$ATT_TOUT" "${ANCIENNES[@]}" "${NEUVES[@]}"
  # L'écran du pas : le pas initial de l'exemple de bullet, jamais mesuré
  # depuis zéro — la recette de N6r4w50 au seul pas près, 100 superlots.
  dire "— l'écran du pas : N6r4w50 au pas 0,0005, puis 0,002"
  reseau_b n6r4w50pas0005 100 0.5 0.0005 --attendu "$ATT_ANCIENNES" "${ANCIENNES[@]}"
  reseau_b n6r4w50pas002 100 0.5 0.002 --attendu "$ATT_ANCIENNES" "${ANCIENNES[@]}"
  dire "— N8nw50 : les neuves seules — le dernier, qu'on peut couper"
  reseau_b n8nw50 "$SL" 0.5 0.001 --attendu "$ATT_NEUVES" "${NEUVES[@]}"
elif [ "$FORMAT" = n8n800 ]; then
  dire "— N8nw50s800 : les neuves seules, 800 superlots — le candidat contre N8tw50s800"
  reseau_b n8nw50s800 800 0.5 0.001 --attendu "$ATT_NEUVES" "${NEUVES[@]}"
else
  dire "— N8t : les anciennes et les neuves, 400 superlots, poids 0,75"
  reseau_b n8t "$SL" 0.75 0.001 --attendu "$ATT_TOUT" "${ANCIENNES[@]}" "${NEUVES[@]}"
  dire "— N8n : les neuves seules"
  reseau_b n8n "$SL" 0.75 0.001 --attendu "$ATT_NEUVES" "${NEUVES[@]}"
fi

if [ "$B" = 0 ]; then
  dire "FIN : ok — les réseaux sur reseau/n20b, les sorties dans $NN/*.sortie.txt"
else
  dire "FIN : ÉCHEC — le détail plus haut, les sorties dans $NN/*.sortie.txt ; relancer reprend au réseau qui manque"
fi
[ "$B" = 0 ]
