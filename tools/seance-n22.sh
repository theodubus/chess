#!/usr/bin/env bash
# La séance du n° 22 sur la carte de Théo, sans surveillance (tools/README.md,
# section « La séance du n° 22 ») : trois réseaux à la recette de C1 — 256
# unités, quatre seaux de roi, huit de sortie, 400 superlots, poids du
# résultat 0,5, pas 0,001 —, sur la partie mesurée du n° 22, étiquetée par
# N9w50s800 ; chacun commité et poussé sur `reseau/n22` dès qu'il passe TOUS
# ses contrôles :
#   e5nw50   — les 39 jobs appris à 5 000 nœuds ;
#   e25tw50  — les 38 jobs appris à 2 500 nœuds : le budget à temps de runner
#              égal, la décision ;
#   e25vw50  — les 19 premiers de ceux-là : le volume gardé de e5nw50 à un job
#              près, l'étiquette seule.
#
#   bash tools/seance-n22.sh essai          # contrôles, données, essai court
#   bash tools/seance-n22.sh tout           # les trois, ~8 h 30
#   bash tools/seance-n22.sh tout veille    # puis met la machine en veille
#
# `veille` : celle de tools/seance-n20d.sh — armée une fois l'essai court
# réussi, demandée à la sortie, réussie ou non, après la levée du blocage que
# la séance pose elle-même.
#
# Tout vit sous `~/shallowred/` (Théo, 22 oct.) : le dépôt `chess/`, les
# données `donnees/<génération>/`, les journaux `seances/<nom>/`. Le dépôt est
# celui qui porte ce script, où qu'il soit. Relancé après une interruption, il
# reprend au réseau qui manque et saute ce qui est déjà poussé ; le
# téléchargement reprend au job qui manque.
set -uo pipefail

RACINE=${RACINE:-$HOME/shallowred}
DEPOT=${DEPOT:-$(cd "$(dirname "$0")/.." && pwd)}
DONNEES_N22=${DONNEES_N22:-$RACINE/donnees/n22}
TRAVAIL=${TRAVAIL:-$RACINE/seances/n22}
MODE=${1:-tout}
VEILLE=${2:-}
NN=$DEPOT/tools/nnue-train
ARCH=768x4hm-256-s8
# Parties:positions de chaque ensemble, sommés sur le registre
# (`tools/n22-jobs.tsv`) le 27 oct. : l'entraîneur relit à l'octet.
ATT_E5N=8731249:1084732803
ATT_E25T=19863087:2285525972
ATT_E25V=9775632:1124756878
ATT_TOUT=28594336:3370258775

usage() {
  echo "usage : $0 [essai|tout] [veille]" >&2
  exit 2
}
case "$MODE" in essai | tout) ;; *) usage ;; esac
case "$VEILLE" in "" | veille) ;; *) usage ;; esac
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
ARMEE=
fin() {
  # Le blocage levé AVANT la veille : tant qu'il tient, elle serait refusée.
  if [ -n "$INHIBE" ]; then
    kill "$INHIBE" 2>/dev/null
    wait "$INHIBE" 2>/dev/null
  fi
  # Jamais laisser le dépôt sur la branche de rapport.
  [ "$(git_d branch --show-current 2>/dev/null)" = main ] || git_d switch -q main 2>/dev/null
  if [ -n "$ARMEE" ]; then
    dire "mise en veille"
    systemctl suspend || dire "ÉCHEC de la mise en veille — systemctl suspend a refusé"
  fi
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
# ~14 Go de données neuves sur le disque, puis trois entraînements.
place_libre() { [ "$(df -Pk "$1" | awk 'NR == 2 {print $4}')" -ge "$2" ]; }
distante() { [ -n "$(git_d ls-remote --heads origin "$1")" ]; }
locale() { git_d show-ref --verify --quiet "refs/heads/$1"; }

dire "séance du n° 22, mode $MODE — dépôt $DEPOT"
verifier "le dépôt, sans fichier suivi modifié" git_d diff --quiet HEAD --
verifier "main à jour (fetch, switch, pull --ff-only)" \
  bash -c 'git -C "$1" fetch -q origin && git -C "$1" switch -q main && git -C "$1" pull -q --ff-only' _ "$DEPOT"
# Le registre dans l'ordre de lancement : un numéro de run croît avec lui.
# Seules les vagues 1 à 5 — la partie mesurée — entrent : les suivantes
# s'ajoutent au registre sans changer les trois ensembles.
appris() { awk -F'\t' -v b="$1" '$4 == "appris" && $5 == b && $3 <= 5 {print $1}' "$DEPOT/tools/n22-jobs.tsv" | sort -n; }
mapfile -t A2500 < <(appris 2500)
mapfile -t A5000 < <(appris 5000)
verifier "38 jobs appris à 2 500 nœuds au registre, vagues 1 à 5" test "${#A2500[@]}" -eq 38
verifier "39 jobs appris à 5 000 nœuds au registre, vagues 1 à 5" test "${#A5000[@]}" -eq 39
verifier "gh, connecté à GitHub" gh auth status
mkdir -p "$DONNEES_N22"
if [ -z "${CUDA_PATH:-}" ] || ! cuda_present >/dev/null 2>&1; then
  export CUDA_PATH=/usr/local/cuda-13.2
  export LD_LIBRARY_PATH=$CUDA_PATH/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
fi
verifier "CUDA : cudart, nvrtc, cublas sous $CUDA_PATH" cuda_present
# Ce qui est déjà téléchargé compte : une relance ne demande que le reste.
DEJA=$(du -sk "$DONNEES_N22" 2>/dev/null | cut -f1)
verifier "20 Go libres au moins sous $DONNEES_N22, moins ce qui y est déjà" \
  place_libre "$DONNEES_N22" $((20971520 - ${DEJA:-0}))
verifier "4 Go libres au moins sous $NN" place_libre "$NN" 4194304
verifier "cargo" command -v cargo
# La veille se demandera sans personne pour taper un mot de passe : seul
# « yes » la garantit. Un refus n'arrête pas la séance, il se dit.
if [ "$VEILLE" = veille ]; then
  if busctl call org.freedesktop.login1 /org/freedesktop/login1 \
    org.freedesktop.login1.Manager CanSuspend 2>/dev/null | grep -qx 's "yes"'; then
    dire "ok      la veille possible sans mot de passe"
  else
    dire "ATTENTION : la veille demanderait un mot de passe ou est impossible — la séance ira au bout, la machine restera allumée"
  fi
fi
if [ "$ECHEC" != 0 ]; then
  dire "ARRÊT : un contrôle d'avant a échoué, rien n'a été lancé."
  exit 1
fi

# ---- 1. Les données : les 77 jobs appris, le tenu à l'écart jamais. Un job à
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
dire "— le téléchargement : 77 jobs, ~12 Go"
E25T=()
for r in "${A2500[@]}"; do E25T+=("$DONNEES_N22/$r"); done
E5N=()
for r in "${A5000[@]}"; do E5N+=("$DONNEES_N22/$r"); done
if ! telecharger "$DONNEES_N22" "${A2500[@]}" "${A5000[@]}" ||
  ! compte_vf 152 "${E25T[@]}" || ! compte_vf 156 "${E5N[@]}"; then
  dire "ARRÊT : il manque des données (152 et 156 fichiers .vf attendus) — relancer reprend où il s'est arrêté."
  exit 1
fi
dire "ok      152 + 156 fichiers .vf, $(du -sh "$DONNEES_N22" | cut -f1)"

# E2.5v : les 19 premiers jobs appris à 2 500 — la règle écrite avant, le
# volume gardé de E5n à un job près (751,0 M contre 743,0 M).
E25V=("${E25T[@]:0:19}")

if [ "$MODE" = tout ] && command -v systemd-inhibit >/dev/null; then
  # Une veille arrêterait l'entraînement sans un mot.
  systemd-inhibit --what=sleep:idle --who=seance-n22 --why="entraînement NNUE" \
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

# Lit dans la sortie gardée ce que la séance demande d'y lire : le réseau
# prêt, la confrontation, et la ligne de recette ENTIÈRE, telle que
# l'entraîneur l'imprime — un réglage mal passé ne fait rien planter, il
# entraîne un autre réseau. Le modèle de la ligne retombe, à l'octet, sur la
# sortie réelle de E10w50, 400 superlots (`reseaux/e10w50-*.sortie.txt`).
RECETTE='  400 superlots, pas 0.001 → 2.4300007e-6, wdl 0.5 → 0.5, perte ^2, lot 16384, ply ≥ 16'
controler() { # nom, identifiant, puis « recette » pour exiger la ligne
  local nom=$1 id=$2 sortie=$NN/$1.sortie.txt ok=0
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
  if [ "${3:-}" = recette ] && ! grep -Fqx -- "$RECETTE" "$sortie"; then
    dire "  ÉCHEC $nom : la recette imprimée n'est pas « $RECETTE »"
    ok=1
  fi
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
  local b=reseau/n22 message=$1 code
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

# ---- 2. L'essai court : relit chaque octet des 77 jobs et refuse au moindre
# écart de compte ; un superlot, la confrontation.
ESSAI=0
dire "— l'essai court, sur les 77 jobs"
rm -rf "${NN:?}/essai-n22"
entrainer essai-n22 --attendu "$ATT_TOUT" --superlots 1 --sortie essai-n22 "${E25T[@]}" "${E5N[@]}" ||
  dire "  ÉCHEC essai-n22 : l'entraîneur a rendu une erreur"
controler essai-n22 "$ARCH-1" || ESSAI=1
if [ "$MODE" = essai ]; then
  if [ "$ESSAI" = 0 ]; then dire "ESSAI RÉUSSI — lancer : bash $0 tout (veille)"; else dire "ESSAI ÉCHOUÉ — m'envoyer $RESUME"; fi
  exit "$ESSAI"
fi
if [ "$ESSAI" != 0 ]; then
  dire "ARRÊT : l'essai court a échoué, aucun réseau n'a été lancé — m'envoyer $RESUME"
  exit 1
fi
if [ "$VEILLE" = veille ]; then
  ARMEE=1
  dire "ok      la veille armée : la machine se mettra en veille à la fin de la séance"
fi

# ---- 3. Les réseaux, chacun poussé dès qu'il a passé ses contrôles — les deux
# de la décision d'abord.
B=0
git_d fetch -q origin
deja_pousse() { git_d cat-file -e "origin/reseau/n22:reseaux/$1-$2.bin" 2>/dev/null; }
reseau_e() { # nom, puis les arguments de données
  local nom=$1 id=$ARCH-400 cote
  shift
  if deja_pousse "$nom" "$id"; then
    dire "déjà poussé  $nom"
  elif ! former "$nom" "$id" --superlots 400 --wdl 0.5 --pas 0.001 --sortie "$nom" "$@"; then
    B=1
  elif controler "$nom" "$id" recette; then
    publier "Réseau NNUE du n° 22 : $nom — tools/seance-n22.sh, tous les contrôles passés" \
      "$nom:$id" || B=1
  else
    # Refusé, il resterait « déjà fait » et aucune relance ne le referait.
    # Mis de côté, jamais effacé : si c'est le contrôle qui se trompe, les
    # heures de carte restent publiables à la main.
    cote=$nom.refuse-$(date +%Y%m%d-%H%M%S)
    mv "$NN/$nom" "$NN/$cote" && mv "$NN/$nom.sortie.txt" "$NN/$cote.sortie.txt" &&
      dire "  $nom mis de côté dans $NN/$cote — la relance le refait"
    B=1
  fi
}
dire "— e5nw50 : les 39 jobs à 5 000 nœuds"
reseau_e e5nw50 --attendu "$ATT_E5N" "${E5N[@]}"
dire "— e25tw50 : les 38 jobs à 2 500 nœuds — le budget à temps de runner égal"
reseau_e e25tw50 --attendu "$ATT_E25T" "${E25T[@]}"
dire "— e25vw50 : les 19 premiers à 2 500 — l'étiquette seule, à volume égal"
reseau_e e25vw50 --attendu "$ATT_E25V" "${E25V[@]}"

if [ "$B" = 0 ]; then
  dire "FIN : ok — les réseaux sur reseau/n22, les sorties dans $NN/*.sortie.txt"
else
  dire "FIN : ÉCHEC — le détail plus haut, les sorties dans $NN/*.sortie.txt ; relancer reprend au réseau qui manque"
fi
[ "$B" = 0 ]
