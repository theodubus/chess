#!/usr/bin/env bash
# La séance C2 du n° 20 sur la carte de Théo, sans surveillance (tools/README.md,
# section « La séance C2 ») : la RECETTE, sur les données de N9w50s800 — les 94
# jobs appris de l'étape B et les 80 de (e), déjà sur le disque depuis C1 —,
# 256 unités, quatre seaux de roi, huit de sortie, 800 superlots, pas 0,001.
# Chaque réseau ne change qu'UN réglage de N9w50s800, qui joue et sert de base ;
# chacun est commité et poussé sur `reseau/n20d` dès qu'il passe TOUS ses
# contrôles :
#   a — n9w625s800    le poids du résultat à 0,625 au lieu de 0,5 ;
#       n9w75s800     à 0,75 ;
#   b — n9p25s800     l'exposant de la perte à 2,5 au lieu de 2 ;
#       n9w25a75s800  le poids variable, de 0,25 à 0,75 — 0,5 en moyenne.
# Et C2c, écrite le 27 oct. — un réglage de plus par réseau, chacun dans
# les deux sens, son sens étant inconnu :
#   c1 — n9pfbs800     le pas final dix fois plus bas (0,3⁵ / 10 du pas initial) ;
#        n9pfhs800     dix fois plus haut ;
#   c2 — n9l8ks800    le lot à 8 192 positions au lieu de 16 384 ;
#        n9l32ks800   à 32 768 ;
#   c3 — n9y8s800     le premier demi-coup gardé à 8 au lieu de 16 ;
#        n9y24s800    à 24.
#
#   bash tools/seance-n20d.sh essai   # contrôles, données, essai court
#   bash tools/seance-n20d.sh a       # les deux poids, ~10 h 30
#   bash tools/seance-n20d.sh b       # la perte et le poids variable, ~10 h 30
#   bash tools/seance-n20d.sh tout    # a puis b, ~21 h
#   bash tools/seance-n20d.sh c       # c1, c2 puis c3, ~32 h — ou chacun seul
#   bash tools/seance-n20d.sh c veille   # puis met la machine en veille
#
# `veille` (Théo, 27 oct. : « une mise en veille forcée en fin de séance ») :
# armée une fois l'essai court réussi — un arrêt pendant les contrôles se lit
# à l'écran, il ne met rien en veille —, la veille se demande à la sortie,
# réussie ou non, après la levée du blocage que la séance pose elle-même.
#
# Tout vit sous `~/shallowred/` (Théo, 22 oct.) : le dépôt `chess/`, les
# données `donnees/<génération>/`, les journaux `seances/<nom>/`. Le dépôt est
# celui qui porte ce script, où qu'il soit. Relancé après une interruption, il
# reprend au réseau qui manque et saute ce qui est déjà poussé.
set -uo pipefail

RACINE=${RACINE:-$HOME/shallowred}
DEPOT=${DEPOT:-$(cd "$(dirname "$0")/.." && pwd)}
DONNEES_N20=${DONNEES_N20:-$RACINE/donnees/n20}
DONNEES_N20E=${DONNEES_N20E:-$RACINE/donnees/n20e}
TRAVAIL=${TRAVAIL:-$RACINE/seances/n20d}
MODE=${1:-tout}
VEILLE=${2:-}
NN=$DEPOT/tools/nnue-train
ARCH=768x4hm-256-s8
# Parties:positions de chaque ensemble, sommés sur les registres
# (`tools/n20-jobs.tsv`, `tools/n20e-jobs.tsv`) : l'entraîneur relit à l'octet.
ATT_N9=29009129:3712073002

case "$MODE" in essai | a | b | tout | c | c1 | c2 | c3) ;; *)
  echo "usage : $0 [essai|a|b|tout|c|c1|c2|c3] [veille]" >&2
  exit 2
  ;;
esac
case "$VEILLE" in "" | veille) ;; *)
  echo "usage : $0 [essai|a|b|tout|c|c1|c2|c3] [veille]" >&2
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
# Les points de sauvegarde de quatre entraînements, et ce qui manquerait des données.
place_libre() { [ "$(df -Pk "$1" | awk 'NR == 2 {print $4}')" -ge 16777216 ]; }
distante() { [ -n "$(git_d ls-remote --heads origin "$1")" ]; }
locale() { git_d show-ref --verify --quiet "refs/heads/$1"; }

dire "séance C2 du n° 20, mode $MODE — dépôt $DEPOT"
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

# ---- 1. Les données : celles de N9w50s800, déjà là depuis C1 ; ce qui
# manquerait se télécharge, le tenu à l'écart jamais. Un job à moitié
# téléchargé reste dans `.tmp-` et se refait à la relance.
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
dire "— les données de N9w50s800 : l'étape B et (e), ce qui manque"
B_TOUS=()
for r in "${APPRIS_N20[@]}"; do B_TOUS+=("$DONNEES_N20/$r"); done
E10=()
for r in "${APPRIS_N20E[@]}"; do E10+=("$DONNEES_N20E/$r"); done
if ! telecharger "$DONNEES_N20" "${APPRIS_N20[@]}" || ! telecharger "$DONNEES_N20E" "${APPRIS_N20E[@]}" ||
  ! compte_vf 376 "${B_TOUS[@]}" || ! compte_vf 320 "${E10[@]}"; then
  dire "ARRÊT : il manque des données (376 et 320 fichiers .vf attendus) — relancer reprend où il s'est arrêté."
  exit 1
fi
dire "ok      376 + 320 fichiers .vf"

if [ "$MODE" != essai ] && command -v systemd-inhibit >/dev/null; then
  # Une veille arrêterait l'entraînement sans un mot.
  systemd-inhibit --what=sleep:idle --who=seance-n20d --why="entraînement NNUE" \
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
controler() { # nom, identifiant, puis des contrôles : pas=X | wdl=X | recette=LIGNE
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
    # La ligne de recette ENTIÈRE, telle que l'entraîneur l'imprime : chaque
    # réseau de C2 ne diffère de N9w50s800 que d'un réglage, et un réglage
    # mal passé ne fait rien planter — il entraîne un autre réseau. Le modèle
    # de la ligne retombe, à l'octet, sur la sortie réelle de N9w50s800 et de
    # E10w50 (tools/README.md, « La séance C2 »).
    recette=*) grep -Fqx -- "${c#recette=}" "$sortie" || {
      dire "  ÉCHEC $nom : la recette imprimée n'est pas « ${c#recette=} »"
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
  local b=reseau/n20d message=$1 code
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
  if [ "$ESSAI" = 0 ]; then dire "ESSAI RÉUSSI — lancer : bash $0 a (puis b), bash $0 tout, ou bash $0 c"; else dire "ESSAI ÉCHOUÉ — m'envoyer $RESUME"; fi
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

# ---- 3. Les réseaux, chacun poussé dès qu'il a passé ses contrôles.
B=0
git_d fetch -q origin
deja_pousse() { git_d cat-file -e "origin/reseau/n20d:reseaux/$1-$2.bin" 2>/dev/null; }
# La ligne que l'entraîneur imprime pour sa recette, au format de
# `tools/nnue-train` : `{}` d'un f32 pour les poids et l'exposant, `{:e}` du
# pas final.
ligne_recette() { # superlots, pas final affiché, wdl, wdl final, exposant, lot, ply
  printf '  %s superlots, pas 0.001 → %s, wdl %s → %s, perte ^%s, lot %s, ply ≥ %s' "$@"
}
# Le pas final que l'entraîneur affichera, `{:e}` de 0,001 × le rapport en
# f32 — calculé par un programme Rust au format de `tools/nnue-train` le
# 27 oct. ; un rapport absent de la table arrête la séance plutôt que de
# contrôler contre une ligne devinée.
pas_final_affiche() { # rapport, ou « - » pour celui de N9w50s800 (0,3⁵)
  case "$1" in
  -) echo 2.4300007e-6 ;;
  0.000243) echo 2.4300002e-7 ;;
  0.0243) echo 2.4300001e-5 ;;
  *) return 1 ;;
  esac
}
# nom, wdl, wdl final, exposant ; puis, pour C2c, le rapport du pas final
# (« - » : celui de N9w50s800), le lot et le premier demi-coup gardé.
reseau_c2() {
  local nom=$1 w=$2 wf=$3 perte=$4 pf=${5:--} lot=${6:-16384} ply=${7:-16} id=$ARCH-800 args affiche
  args=(--superlots 800 --wdl "$w" --pas 0.001)
  [ "$wf" = "$w" ] || args+=(--wdl-final "$wf")
  [ "$perte" = 2 ] || args+=(--perte "$perte")
  [ "$pf" = - ] || args+=(--pas-final "$pf")
  [ "$lot" = 16384 ] || args+=(--lot "$lot")
  [ "$ply" = 16 ] || args+=(--ply-min "$ply")
  if ! affiche=$(pas_final_affiche "$pf"); then
    dire "  ÉCHEC $nom : le rapport de pas final $pf n'est pas dans la table de la séance"
    B=1
    return
  fi
  if deja_pousse "$nom" "$id"; then
    dire "déjà poussé  $nom"
  elif ! former "$nom" "$id" "${args[@]}" --attendu "$ATT_N9" --sortie "$nom" "${B_TOUS[@]}" "${E10[@]}"; then
    B=1
  elif controler "$nom" "$id" pas=0.001 "recette=$(ligne_recette 800 "$affiche" "$w" "$wf" "$perte" "$lot" "$ply")"; then
    publier "Réseau NNUE du n° 20, séance C2 : $nom — tools/seance-n20d.sh, tous les contrôles passés" \
      "$nom:$id" || B=1
  else
    # Refusé, il resterait « déjà fait » et aucune relance ne le referait.
    # Mis de côté, jamais effacé : si c'est le contrôle qui se trompe — N9w50s800
    # le 22 oct. —, cinq heures de carte restent publiables à la main.
    local cote
    cote=$nom.refuse-$(date +%Y%m%d-%H%M%S)
    mv "$NN/$nom" "$NN/$cote" && mv "$NN/$nom.sortie.txt" "$NN/$cote.sortie.txt" &&
      dire "  $nom mis de côté dans $NN/$cote — la relance le refait"
    B=1
  fi
}
if [ "$MODE" = a ] || [ "$MODE" = tout ]; then
  dire "— n9w625s800 : le poids du résultat à 0,625"
  reseau_c2 n9w625s800 0.625 0.625 2
  dire "— n9w75s800 : le poids du résultat à 0,75"
  reseau_c2 n9w75s800 0.75 0.75 2
fi
if [ "$MODE" = b ] || [ "$MODE" = tout ]; then
  dire "— n9p25s800 : l'exposant de la perte à 2,5"
  reseau_c2 n9p25s800 0.5 0.5 2.5
  dire "— n9w25a75s800 : le poids variable, de 0,25 à 0,75"
  reseau_c2 n9w25a75s800 0.25 0.75 2
fi
# C2c : le poids, la perte et le reste de N9w50s800 ; un seul réglage changé.
if [ "$MODE" = c1 ] || [ "$MODE" = c ]; then
  dire "— n9pfbs800 : le pas final dix fois plus bas"
  reseau_c2 n9pfbs800 0.5 0.5 2 0.000243
  dire "— n9pfhs800 : le pas final dix fois plus haut"
  reseau_c2 n9pfhs800 0.5 0.5 2 0.0243
fi
if [ "$MODE" = c2 ] || [ "$MODE" = c ]; then
  dire "— n9l8ks800 : le lot à 8 192"
  reseau_c2 n9l8ks800 0.5 0.5 2 - 8192
  dire "— n9l32ks800 : le lot à 32 768"
  reseau_c2 n9l32ks800 0.5 0.5 2 - 32768
fi
if [ "$MODE" = c3 ] || [ "$MODE" = c ]; then
  dire "— n9y8s800 : le premier demi-coup gardé à 8"
  reseau_c2 n9y8s800 0.5 0.5 2 - 16384 8
  dire "— n9y24s800 : le premier demi-coup gardé à 24"
  reseau_c2 n9y24s800 0.5 0.5 2 - 16384 24
fi

if [ "$B" = 0 ]; then
  dire "FIN : ok — les réseaux sur reseau/n20d, les sorties dans $NN/*.sortie.txt"
else
  dire "FIN : ÉCHEC — le détail plus haut, les sorties dans $NN/*.sortie.txt ; relancer reprend au réseau qui manque"
fi
[ "$B" = 0 ]
