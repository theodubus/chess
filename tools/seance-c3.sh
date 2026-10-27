#!/usr/bin/env bash
# La séance C3 sur la carte de Théo, sans surveillance (tools/README.md,
# section « La séance C3 ») : les architectures plus grandes, chacune contre
# une BASE entraînée sur les mêmes données — sans quoi le volume et
# l'architecture se mêleraient. La recette de N9w50s800 — 800 superlots,
# poids du résultat 0,5, pas 0,001 — pour les quatre :
#   n10      — 256 unités, quatre seaux de roi, huit de sortie : la base ;
#   n10r10   — dix seaux de roi ;
#   n10h384  — 384 unités ;
#   n10h512  — 512 unités.
# Chacun commité et poussé sur `reseau/c3` dès qu'il passe TOUS ses contrôles.
#
#   bash tools/seance-c3.sh essai          # contrôles, données, deux essais courts
#   bash tools/seance-c3.sh a              # n10 puis n10r10
#   bash tools/seance-c3.sh b              # n10h384 puis n10h512
#   bash tools/seance-c3.sh tout veille    # les quatre, puis la veille
#
# L'ENTRAÎNEUR LIT L'ARCHITECTURE DANS LE MOTEUR : `tools/nnue-train` importe
# `HIDDEN` et `ARCH` de `shallowred::nnue`. Une autre architecture s'entraîne
# donc à un autre état du moteur — un `git worktree` par architecture, au
# `main` du début de la séance, une seule ligne changée et vérifiée, jamais
# le dépôt édité pendant que la séance tourne (bash lit ce script au fil de
# l'eau). L'entraîneur du worktree tourne depuis `tools/nnue-train` du dépôt,
# si bien que ses sorties atterrissent au même endroit que celles de la base.
#
# LES DONNÉES se décident au verdict du n° 22 (« La séance C3 — le
# chiffrage ») et s'écrivent dans `tools/c3-donnees.tsv` : sans ce fichier,
# la séance refuse de partir. Chaque ligne : la génération (n20, n20e, n21,
# n22…), les vagues (« 1-5 » ou « * »), le budget de nœuds (« 5000 » ou
# « * ») ; seuls les jobs appris entrent, lus dans `tools/<génération>-jobs.tsv`.
#
# Tout vit sous `~/shallowred/` (Théo, 22 oct.). Relancé après une
# interruption, il reprend au réseau qui manque et saute ce qui est déjà poussé.
set -uo pipefail

RACINE=${RACINE:-$HOME/shallowred}
DEPOT=${DEPOT:-$(cd "$(dirname "$0")/.." && pwd)}
DONNEES=${DONNEES:-$RACINE/donnees}
TRAVAIL=${TRAVAIL:-$RACINE/seances/c3}
MODE=${1:-tout}
VEILLE=${2:-}
NN=$DEPOT/tools/nnue-train
DECISION=$DEPOT/tools/c3-donnees.tsv

usage() {
  echo "usage : $0 [essai|a|b|tout] [veille]" >&2
  exit 2
}
case "$MODE" in essai | a | b | tout) ;; *) usage ;; esac
case "$VEILLE" in "" | veille) ;; *) usage ;; esac
mkdir -p "$TRAVAIL"

export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND=${GIT_SSH_COMMAND:-ssh -o BatchMode=yes}

RESUME=$TRAVAIL/resume.txt
printf '\n=== %s ===\n' "$(date)" >>"$RESUME"
dire() { printf '%s  %s\n' "$(date '+%d/%m %H:%M')" "$*" | tee -a "$RESUME"; }
git_d() { git -C "$DEPOT" "$@"; }

INHIBE=
ARMEE=
fin() {
  if [ -n "$INHIBE" ]; then
    kill "$INHIBE" 2>/dev/null
    wait "$INHIBE" 2>/dev/null
  fi
  [ "$(git_d branch --show-current 2>/dev/null)" = main ] || git_d switch -q main 2>/dev/null
  if [ -n "$ARMEE" ]; then
    dire "mise en veille"
    systemctl suspend || dire "ÉCHEC de la mise en veille — systemctl suspend a refusé"
  fi
}
trap fin EXIT

# ---- Les architectures : nom, puis la transformation de `engine/src/nnue.rs`
# (« - » pour la base), l'identifiant que l'entraîneur doit écrire, et la
# taille du fichier, CALCULÉE À LA MAIN (`le_fichier_a_la_taille_que_bullet_ecrit`) :
# 2 × (768 × B × H + H + 8 × (2H + 1)) octets, bourrés au multiple de 64.
transformation() {
  case "$1" in
  n10) echo - ;;
  n10r10) echo 's/^    king_buckets: Some(KING_BUCKETS_4),$/    king_buckets: Some(KING_BUCKETS_10),/' ;;
  n10h384) echo 's/^pub const HIDDEN: usize = 256;$/pub const HIDDEN: usize = 384;/' ;;
  n10h512) echo 's/^pub const HIDDEN: usize = 256;$/pub const HIDDEN: usize = 512;/' ;;
  esac
}
identifiant() {
  case "$1" in
  n10) echo 768x4hm-256-s8 ;; n10r10) echo 768x10hm-256-s8 ;;
  n10h384) echo 768x4hm-384-s8 ;; n10h512) echo 768x4hm-512-s8 ;;
  esac
}
taille() { # 1 581 632 et 3 940 928 retrouvés sur N9w50s800 et N6r10
  case "$1" in
  n10) echo 1581632 ;; n10r10) echo 3940928 ;;
  n10h384) echo 2372416 ;; n10h512) echo 3163200 ;;
  esac
}

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
cuda_present() { ls "$CUDA_PATH"/lib64/lib{cudart,nvrtc,cublas}.so; }
place_libre() { [ "$(df -Pk "$1" | awk 'NR == 2 {print $4}')" -ge "$2" ]; }
distante() { [ -n "$(git_d ls-remote --heads origin "$1")" ]; }
locale() { git_d show-ref --verify --quiet "refs/heads/$1"; }

dire "séance C3, mode $MODE — dépôt $DEPOT"
verifier "le dépôt, sans fichier suivi modifié" git_d diff --quiet HEAD --
verifier "main à jour (fetch, switch, pull --ff-only)" \
  bash -c 'git -C "$1" fetch -q origin && git -C "$1" switch -q main && git -C "$1" pull -q --ff-only' _ "$DEPOT"
BASE=$(git_d rev-parse main)
verifier "la décision des données écrite : tools/c3-donnees.tsv" test -s "$DECISION"
verifier "gh, connecté à GitHub" gh auth status
if [ -z "${CUDA_PATH:-}" ] || ! cuda_present >/dev/null 2>&1; then
  export CUDA_PATH=/usr/local/cuda-13.2
  export LD_LIBRARY_PATH=$CUDA_PATH/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
fi
verifier "CUDA : cudart, nvrtc, cublas sous $CUDA_PATH" cuda_present
verifier "cargo" command -v cargo
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

# ---- 1. Les données, d'après la décision : chaque job appris qu'elle
# désigne, dans l'ordre de lancement ; les comptes de la relecture sommés sur
# les registres, les colonnes trouvées par leur nom — elles ne sont pas au
# même rang d'une génération à l'autre.
jobs_de() { # génération, vagues, budget → « run parties positions octets »
  awk -F'\t' -v v="$2" -v b="$3" '
    /^#/ { next }
    $1 == "run" { for (i = 1; i <= NF; i++) c[$i] = i; next }
    {
      if ($c["role"] != "appris") next
      if (v != "*") { split(v, r, "-"); if ($c["vague"] < r[1] || $c["vague"] > r[2]) next }
      if (b != "*" && $c["noeuds"] != b) next
      print $1, $c["parties"], $c["positions"], $c["octets_zip"]
    }' "$DEPOT/tools/$1-jobs.tsv" | sort -n
}
DOSSIERS=()
PARTIES=0 POSITIONS=0 A_TELECHARGER=0
LISTE=$TRAVAIL/jobs.txt
: >"$LISTE"
while IFS=$'\t' read -r gen vagues budget || [ -n "$gen" ]; do
  case "$gen" in "" | \#*) continue ;; esac
  if [ ! -s "$DEPOT/tools/$gen-jobs.tsv" ]; then
    dire "ARRÊT : la décision nomme $gen, sans registre tools/$gen-jobs.tsv"
    exit 1
  fi
  n=0
  while read -r run parties positions octets; do
    printf '%s %s\n' "$gen" "$run" >>"$LISTE"
    DOSSIERS+=("$DONNEES/$gen/$run")
    PARTIES=$((PARTIES + parties)) POSITIONS=$((POSITIONS + positions))
    [ -d "$DONNEES/$gen/$run" ] || A_TELECHARGER=$((A_TELECHARGER + octets))
    n=$((n + 1))
  done < <(jobs_de "$gen" "$vagues" "$budget")
  dire "ok      $gen, vagues $vagues, budget $budget : $n jobs appris"
done <"$DECISION"
ATTENDU=$PARTIES:$POSITIONS
dire "        ${#DOSSIERS[@]} jobs, $ATTENDU parties:positions"
# Décompressés, ~1,15 fois l'artefact ; et 8 Go pour les points de sauvegarde.
mkdir -p "$DONNEES"
verifier "la place pour ce qui manque, $((A_TELECHARGER / 1000000000)) Go d'artefacts" \
  place_libre "$DONNEES" $((A_TELECHARGER / 1024 * 115 / 100 + 8388608))
if [ "$ECHEC" != 0 ]; then
  dire "ARRÊT : pas assez de place, rien n'a été téléchargé."
  exit 1
fi
while read -r gen run; do
  [ -d "$DONNEES/$gen/$run" ] && continue
  mkdir -p "$DONNEES/$gen"
  rm -rf "${DONNEES:?}/$gen/.tmp-$run"
  if gh run download "$run" -R theodubus/chess -n "nnue-$run" -D "$DONNEES/$gen/.tmp-$run" >/dev/null 2>&1; then
    mv "$DONNEES/$gen/.tmp-$run" "$DONNEES/$gen/$run"
  else
    dire "ARRÊT : le téléchargement de $gen/$run a échoué — relancer reprend où il s'est arrêté."
    exit 1
  fi
done <"$LISTE"
NVF=$(for d in "${DOSSIERS[@]}"; do find "$d" -maxdepth 1 -name '*.vf'; done | wc -l)
if [ "$NVF" -ne $((4 * ${#DOSSIERS[@]})) ]; then
  dire "ARRÊT : $NVF fichiers .vf pour ${#DOSSIERS[@]} jobs, quatre chacun attendus"
  exit 1
fi
dire "ok      $NVF fichiers .vf"

if [ "$MODE" != essai ] && command -v systemd-inhibit >/dev/null; then
  systemd-inhibit --what=sleep:idle --who=seance-c3 --why="entraînement NNUE" \
    sleep infinity >/dev/null 2>&1 &
  INHIBE=$!
  sleep 2
  if kill -0 "$INHIBE" 2>/dev/null; then dire "ok      mise en veille bloquée jusqu'à la fin"; else
    INHIBE=
    dire "ATTENTION : la mise en veille n'a pas pu être bloquée — régler l'alimentation à « jamais »"
  fi
fi

# ---- 2. L'arbre d'une architecture : la base est le dépôt ; les autres, un
# worktree à BASE, une ligne changée — et rien d'autre, vérifié.
arbre() { # nom → imprime le dossier dont l'entraîneur sera bâti
  local nom=$1 t wt
  t=$(transformation "$nom")
  if [ "$t" = - ]; then
    echo "$DEPOT"
    return 0
  fi
  wt=$TRAVAIL/arbre-$nom
  # Un worktree d'une séance précédente, à un autre `main`, se refait.
  if [ -d "$wt" ] && [ "$(git -C "$wt" rev-parse HEAD 2>/dev/null)" != "$BASE" ]; then
    git_d worktree remove --force "$wt" >/dev/null 2>&1 || rm -rf "$wt"
  fi
  # Rien sur la sortie standard que le chemin : l'appelant la capture.
  git_d worktree prune >/dev/null 2>&1
  if [ ! -d "$wt" ]; then
    git_d worktree add -q --detach "$wt" "$BASE" >/dev/null || return 1
  fi
  git -C "$wt" checkout -q -- engine/src/nnue.rs >/dev/null &&
    sed -i "$t" "$wt/engine/src/nnue.rs" || return 1
  # Exactement une ligne remplacée, dans ce seul fichier.
  [ "$(git -C "$wt" diff --numstat)" = "$(printf '1\t1\tengine/src/nnue.rs')" ] || {
    echo "le worktree de $nom ne diffère pas de main d'une seule ligne" >&2
    return 1
  }
  echo "$wt"
}

entrainer() { # dossier de l'arbre, nom, puis les arguments de l'entraîneur
  local wt=$1 nom=$2
  shift 2
  (cd "$NN" && CARGO_TARGET_DIR="$NN/target" cargo run --manifest-path "$wt/tools/nnue-train/Cargo.toml" \
    --release --features cuda -- "$@") 2>&1 | tee "$NN/$nom.sortie.txt"
}

fini() { grep -qF "RÉSEAU PRÊT : $1/shallowred-$2/quantised.bin" "$NN/$1.sortie.txt" 2>/dev/null &&
  [ -s "$NN/$1/shallowred-$2/quantised.bin" ]; }

RECETTE='  800 superlots, pas 0.001 → 2.4300007e-6, wdl 0.5 → 0.5, perte ^2, lot 16384, ply ≥ 16'
controler() { # nom, identifiant complet, taille attendue, puis « recette » pour exiger la ligne
  local nom=$1 id=$2 octets=$3 sortie=$NN/$1.sortie.txt ok=0 f
  f=$NN/$nom/shallowred-$id/quantised.bin
  grep -qF "RÉSEAU PRÊT : $nom/shallowred-$id/quantised.bin" "$sortie" || {
    dire "  ÉCHEC $nom : pas de « RÉSEAU PRÊT : $nom/shallowred-$id/quantised.bin »"
    ok=1
  }
  # La taille calculée à la main : un entraîneur bâti sur le mauvais arbre
  # écrirait un autre réseau, d'une autre taille.
  [ "$(stat -c %s "$f" 2>/dev/null)" = "$octets" ] || {
    dire "  ÉCHEC $nom : quantised.bin de $(stat -c %s "$f" 2>/dev/null || echo 0) octets, $octets attendus"
    ok=1
  }
  grep -q "écart médian" "$sortie" || {
    dire "  ÉCHEC $nom : pas de confrontation"
    ok=1
  }
  if [ "${4:-}" = recette ] && ! grep -Fqx -- "$RECETTE" "$sortie"; then
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

publier() { # message, puis nom:identifiant
  local b=reseau/c3 message=$1 code
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

# ---- 3. Les essais courts : la base et la plus éloignée d'elle, n10h512 —
# l'arbre d'une architecture se bâtit, et ce qu'il écrit a sa taille.
ESSAI=0
for nom in n10 n10h512; do
  dire "— l'essai court de $nom"
  if ! wt=$(arbre "$nom"); then
    dire "  ÉCHEC essai-$nom : l'arbre de $nom n'a pas pu être préparé"
    ESSAI=1
    continue
  fi
  rm -rf "${NN:?}/essai-$nom"
  entrainer "$wt" "essai-$nom" --attendu "$ATTENDU" --superlots 1 --sortie "essai-$nom" "${DOSSIERS[@]}" ||
    dire "  ÉCHEC essai-$nom : l'entraîneur a rendu une erreur"
  controler "essai-$nom" "$(identifiant "$nom")-1" "$(taille "$nom")" || ESSAI=1
done
if [ "$MODE" = essai ]; then
  if [ "$ESSAI" = 0 ]; then dire "ESSAI RÉUSSI — lancer : bash $0 tout (veille), ou a puis b"; else dire "ESSAI ÉCHOUÉ — m'envoyer $RESUME"; fi
  exit "$ESSAI"
fi
if [ "$ESSAI" != 0 ]; then
  dire "ARRÊT : un essai court a échoué, aucun réseau n'a été lancé — m'envoyer $RESUME"
  exit 1
fi
if [ "$VEILLE" = veille ]; then
  ARMEE=1
  dire "ok      la veille armée : la machine se mettra en veille à la fin de la séance"
fi

# ---- 4. Les réseaux, chacun poussé dès qu'il a passé ses contrôles.
B=0
git_d fetch -q origin
deja_pousse() { git_d cat-file -e "origin/reseau/c3:reseaux/$1-$2.bin" 2>/dev/null; }
reseau() { # nom
  local nom=$1 id wt debut code cote
  id=$(identifiant "$nom")-800
  if deja_pousse "$nom" "$id"; then
    dire "déjà poussé  $nom"
    return
  fi
  if fini "$nom" "$id"; then
    dire "déjà fait  $nom"
  else
    if ! wt=$(arbre "$nom"); then
      dire "  ÉCHEC $nom : l'arbre n'a pas pu être préparé"
      B=1
      return
    fi
    rm -rf "${NN:?}/$nom"
    debut=$(date +%s)
    dire "lance   $nom — arbre $wt"
    entrainer "$wt" "$nom" --superlots 800 --wdl 0.5 --pas 0.001 --attendu "$ATTENDU" --sortie "$nom" "${DOSSIERS[@]}"
    code=$?
    dire "fin     $nom — code $code, $((($(date +%s) - debut) / 60)) min"
    if [ "$code" != 0 ]; then
      dire "  ÉCHEC $nom : l'entraîneur a rendu le code $code — la fin de $NN/$nom.sortie.txt dit pourquoi"
      B=1
      return
    fi
  fi
  if controler "$nom" "$id" "$(taille "$nom")" recette; then
    publier "Réseau NNUE de la séance C3 : $nom — main $BASE$( [ "$(transformation "$nom")" = - ] || printf ', puis %s' "$(transformation "$nom")") — tools/seance-c3.sh, tous les contrôles passés" \
      "$nom:$id" || B=1
  else
    cote=$nom.refuse-$(date +%Y%m%d-%H%M%S)
    mv "$NN/$nom" "$NN/$cote" && mv "$NN/$nom.sortie.txt" "$NN/$cote.sortie.txt" &&
      dire "  $nom mis de côté dans $NN/$cote — la relance le refait"
    B=1
  fi
}
if [ "$MODE" = a ] || [ "$MODE" = tout ]; then
  dire "— n10 : la base, 256 unités, quatre seaux"
  reseau n10
  dire "— n10r10 : dix seaux de roi"
  reseau n10r10
fi
if [ "$MODE" = b ] || [ "$MODE" = tout ]; then
  dire "— n10h384 : 384 unités"
  reseau n10h384
  dire "— n10h512 : 512 unités"
  reseau n10h512
fi

if [ "$B" = 0 ]; then
  dire "FIN : ok — les réseaux sur reseau/c3, les sorties dans $NN/*.sortie.txt"
else
  dire "FIN : ÉCHEC — le détail plus haut, les sorties dans $NN/*.sortie.txt ; relancer reprend au réseau qui manque"
fi
[ "$B" = 0 ]
