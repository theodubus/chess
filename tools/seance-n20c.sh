#!/usr/bin/env bash
# La séance C1 du n° 20 sur la carte de Théo, d'une traite et sans surveillance
# (tools/README.md, section « La séance C1 ») : les données de (e) téléchargées,
# puis trois réseaux à la recette de N8nw50 — 256 unités, quatre seaux de roi,
# huit de sortie, poids du résultat 0,5, pas 0,001 —, chacun commité et poussé
# sur `reseau/n20c` dès qu'il passe TOUS ses contrôles :
#   N9w50s800 — toutes les données étiquetées par N6r4 (les 94 jobs appris de
#               l'étape B et les 80 de (e)), 800 superlots : le candidat
#               contre N8tw50s800, qui joue ;
#   E10w50    — les 80 jobs de (e), à 10 000 nœuds, 400 superlots ;
#   E5vw50    — les 44 premiers jobs de l'étape B, à 5 000 nœuds, le même
#               volume gardé à 1 % près, 400 superlots.
# E5t, le témoin à temps égal, est N8nw50, déjà entraîné.
#
#   bash tools/seance-n20c.sh essai   # contrôles, téléchargement, essai court
#   bash tools/seance-n20c.sh         # tout, ~10 h 35 ; le résumé dans seances/n20c/
#
# Tout vit sous un seul dossier, `~/shallowred/` (Théo, 22 oct.) : le dépôt
# `chess/`, les données `donnees/<génération>/`, les journaux `seances/<nom>/`.
# Le dépôt est celui qui porte ce script, où qu'il soit.
# Relancé après une interruption, il reprend au réseau qui manque et saute ce
# qui est déjà poussé ; le téléchargement reprend au job qui manque.
set -uo pipefail

RACINE=${RACINE:-$HOME/shallowred}
DEPOT=${DEPOT:-$(cd "$(dirname "$0")/.." && pwd)}
DONNEES_N20=${DONNEES_N20:-$RACINE/donnees/n20}
DONNEES_N20E=${DONNEES_N20E:-$RACINE/donnees/n20e}
TRAVAIL=${TRAVAIL:-$RACINE/seances/n20c}
MODE=${1:-tout}
NN=$DEPOT/tools/nnue-train
ARCH=768x4hm-256-s8
# Parties:positions de chaque ensemble, sommés sur les registres
# (`tools/n20-jobs.tsv`, `tools/n20e-jobs.tsv`) : l'entraîneur relit à l'octet.
ATT_N9=29009129:3712073002
ATT_E10=8662540:1148044133
ATT_E5V=9402946:1185033571

case "$MODE" in essai | tout) ;; *)
  echo "usage : $0 [essai|tout]" >&2
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
# ~5 Go de données neuves, trois entraînements, points de sauvegarde compris.
place_libre() { [ "$(df -Pk "$1" | awk 'NR == 2 {print $4}')" -ge 16777216 ]; }
distante() { [ -n "$(git_d ls-remote --heads origin "$1")" ]; }
locale() { git_d show-ref --verify --quiet "refs/heads/$1"; }

dire "séance C1 du n° 20, mode $MODE — dépôt $DEPOT"
verifier "le dépôt, sans fichier suivi modifié" git_d diff --quiet HEAD --
verifier "main à jour (fetch, switch, pull --ff-only)" \
  bash -c 'git -C "$1" fetch -q origin && git -C "$1" switch -q main && git -C "$1" pull -q --ff-only' _ "$DEPOT"
# Les registres dans l'ordre de lancement : un numéro de run croît avec lui.
mapfile -t APPRIS_N20 < <(awk -F'\t' '$4 == "appris" {print $1}' "$DEPOT/tools/n20-jobs.tsv" | sort -n)
mapfile -t APPRIS_N20E < <(awk -F'\t' '$4 == "appris" {print $1}' "$DEPOT/tools/n20e-jobs.tsv" | sort -n)
verifier "94 jobs de l'étape B au registre" test "${#APPRIS_N20[@]}" -eq 94
verifier "80 jobs de (e) au registre" test "${#APPRIS_N20E[@]}" -eq 80
verifier "gh, connecté à GitHub" gh auth status
# L'ancien rangement oublié ferait retélécharger 9 Go à côté des données qu'on a.
if [ ! -d "$DONNEES_N20" ] && [ -d "$HOME/nnue-n20" ]; then
  dire "ÉCHEC   l'étape B est encore dans ~/nnue-n20 — d'abord : mv ~/nnue-n20 $DONNEES_N20"
  ECHEC=1
else
  mkdir -p "$DONNEES_N20"
fi
mkdir -p "$DONNEES_N20E"
if [ -z "${CUDA_PATH:-}" ] || ! cuda_present >/dev/null 2>&1; then
  export CUDA_PATH=/usr/local/cuda-13.2
  export LD_LIBRARY_PATH=$CUDA_PATH/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
fi
verifier "CUDA : cudart, nvrtc, cublas sous $CUDA_PATH" cuda_present
verifier "16 Go libres au moins sous $DONNEES_N20E" place_libre "$DONNEES_N20E"
verifier "16 Go libres au moins sous $NN" place_libre "$NN"
verifier "cargo" command -v cargo
if [ "$ECHEC" != 0 ]; then
  dire "ARRÊT : un contrôle d'avant a échoué, rien n'a été lancé."
  exit 1
fi

# ---- 1. Les données : l'étape B — déjà là depuis la séance B, sauf ce qui
# manque — puis les 80 jobs appris de (e), le tenu à l'écart jamais. Un job à
# moitié téléchargé reste dans `.tmp-` et se refait à la relance.
telecharger() { # dossier, puis les runs
  local dossier=$1 r
  shift
  for r in "$@"; do
    [ -d "$dossier/$r" ] && continue
    rm -rf "${dossier:?}/.tmp-$r"
    if gh run download "$r" -R theodubus/chess -n "nnue-$r" -D "$dossier/.tmp-$r" >/dev/null 2>&1; then
      mv "$dossier/.tmp-$r" "$dossier/$r"
    else
      dire "  ÉCHEC du téléchargement de $r"
      return 1
    fi
  done
}
dire "— le téléchargement : l'étape B (ce qui manque), puis (e)"
B_TOUS=()
for r in "${APPRIS_N20[@]}"; do B_TOUS+=("$DONNEES_N20/$r"); done
E10=()
for r in "${APPRIS_N20E[@]}"; do E10+=("$DONNEES_N20E/$r"); done
if ! telecharger "$DONNEES_N20" "${APPRIS_N20[@]}" || ! telecharger "$DONNEES_N20E" "${APPRIS_N20E[@]}" ||
  ! compte_vf 376 "${B_TOUS[@]}" || ! compte_vf 320 "${E10[@]}"; then
  dire "ARRÊT : il manque des données (376 et 320 fichiers .vf attendus) — relancer reprend où il s'est arrêté."
  exit 1
fi
dire "ok      376 + 320 fichiers .vf, $(du -sh "$DONNEES_N20E" | cut -f1) pour (e)"

# E5v : les 44 premiers jobs appris de l'étape B — la règle écrite avant, le
# volume gardé de (e) à un job près (809,7 M contre 801,4 M).
E5V=("${B_TOUS[@]:0:44}")

if [ "$MODE" = tout ] && command -v systemd-inhibit >/dev/null; then
  # Une veille arrêterait l'entraînement sans un mot.
  systemd-inhibit --what=sleep:idle --who=seance-n20c --why="entraînement NNUE" \
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

# Lit dans la sortie gardée ce que la séance demande d'y lire.
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
    # Le poids du résultat, constant : « wdl 0.5 → 0.5, » — le format de
    # l'entraîneur depuis les options de la séance C (début → fin, puis la
    # perte, le lot, le ply). L'ancien contrôle cherchait « , wdl 0.5 » en fin
    # de ligne et a refusé N9w50s800 le 22 oct., bien entraîné.
    wdl=*) grep -Fq ", wdl ${c#wdl=} → ${c#wdl=}, " "$sortie" || {
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
  local b=reseau/n20c message=$1 code
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

# ---- 2. L'essai court : relit chaque octet des 174 jobs de N9 et refuse au
# moindre écart de compte ; un superlot, la confrontation.
ESSAI=0
dire "— l'essai court, sur toutes les données de N9"
rm -rf "${NN:?}/essai-n9"
entrainer essai-n9 --attendu "$ATT_N9" --superlots 1 --sortie essai-n9 "${B_TOUS[@]}" "${E10[@]}" ||
  dire "  ÉCHEC essai-n9 : l'entraîneur a rendu une erreur"
controler essai-n9 "$ARCH-1" pas=0.001 || ESSAI=1
if [ "$MODE" = essai ]; then
  if [ "$ESSAI" = 0 ]; then dire "ESSAI RÉUSSI — lancer : bash $0 tout"; else dire "ESSAI ÉCHOUÉ — m'envoyer $RESUME"; fi
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
deja_pousse() { git_d cat-file -e "origin/reseau/n20c:reseaux/$1-$2.bin" 2>/dev/null; }
reseau_c() { # nom, superlots, puis les arguments de données — poids 0,5, pas 0,001
  local nom=$1 sl=$2 id=$ARCH-$2
  shift 2
  if deja_pousse "$nom" "$id"; then
    dire "déjà poussé  $nom"
  elif former "$nom" "$id" --superlots "$sl" --wdl 0.5 --pas 0.001 --sortie "$nom" "$@" &&
    controler "$nom" "$id" pas=0.001 wdl=0.5; then
    publier "Réseau NNUE du n° 20, séance C1 : $nom — tools/seance-n20c.sh, tous les contrôles passés" \
      "$nom:$id" || B=1
  else
    B=1
  fi
}
dire "— N9w50s800 : toutes les données de N6r4, 800 superlots — le candidat contre N8tw50s800"
reseau_c n9w50s800 800 --attendu "$ATT_N9" "${B_TOUS[@]}" "${E10[@]}"
dire "— E10w50 : (e), 10 000 nœuds, 400 superlots"
reseau_c e10w50 400 --attendu "$ATT_E10" "${E10[@]}"
dire "— E5vw50 : les 44 premiers de l'étape B, 5 000 nœuds, 400 superlots"
reseau_c e5vw50 400 --attendu "$ATT_E5V" "${E5V[@]}"

if [ "$B" = 0 ]; then
  dire "FIN : ok — les réseaux sur reseau/n20c, les sorties dans $NN/*.sortie.txt"
else
  dire "FIN : ÉCHEC — le détail plus haut, les sorties dans $NN/*.sortie.txt ; relancer reprend au réseau qui manque"
fi
[ "$B" = 0 ]
