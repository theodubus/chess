#!/usr/bin/env bash
# Vérifie `mutation-verdict.sh` sur des résumés fabriqués. Sans ce test, le
# script ne serait exécuté qu'une fois par semaine sur un runner GitHub, et une
# faute y dormirait jusqu'à ce qu'elle fasse passer une régression pour un
# succès.
set -uo pipefail

ICI=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
VERDICT="$ICI/mutation-verdict.sh"
BAC=$(mktemp -d)
trap 'rm -rf "$BAC"' EXIT

ATTENDUS=10
vus=0
echecs=0

resume() { # resume <dossier> <fichier> <manques> [survivant...]
    local d=$1 f=$2 m=$3
    shift 3
    mkdir -p "$d"
    {
        echo "fichier=$f"
        echo "manques=$m"
        echo "attrapes=10"
        echo "expires=0"
        echo "inviables=0"
        echo "--- survivants ---"
        for s in "$@"; do echo "$s"; done
        echo "--- fin ---"
    } > "$d/resume-$f.txt"
}

cas() { # cas <intitulé> <code attendu> <motif attendu dans la sortie> <dossier> <plafond>
    local intitule=$1 code_attendu=$2 motif=$3 dossier=$4 plafond=$5
    vus=$((vus + 1))
    local sortie code
    sortie=$("$VERDICT" "$dossier" "$plafond" 2>&1)
    code=$?
    if [ "$code" -ne "$code_attendu" ]; then
        printf 'ÉCHEC  %s : code %s attendu, %s obtenu\n%s\n' \
            "$intitule" "$code_attendu" "$code" "$sortie"
        echecs=$((echecs + 1))
        return
    fi
    if ! printf '%s' "$sortie" | grep -qF "$motif"; then
        printf 'ÉCHEC  %s : « %s » absent de la sortie\n%s\n' "$intitule" "$motif" "$sortie"
        echecs=$((echecs + 1))
        return
    fi
    printf 'ok     %s\n' "$intitule"
}

printf 'a.rs 5\nb.rs 0\n' > "$BAC/plafond.txt"

# Égalité : aucun mouvement, succès.
resume "$BAC/egal" a.rs 5 "a.rs:1:1 mut"
resume "$BAC/egal" b.rs 0
cas "à plafond exact, succès" 0 "ok" "$BAC/egal" "$BAC/plafond.txt"

# Hausse d'un seul mutant : échec. C'est la raison d'être du cliquet.
resume "$BAC/hausse" a.rs 6
resume "$BAC/hausse" b.rs 0
cas "un survivant de plus casse" 1 "HAUSSE (+1)" "$BAC/hausse" "$BAC/plafond.txt"

# Hausse sur un fichier à zéro : le cas qui protège le travail déjà fait.
resume "$BAC/hausse0" a.rs 5
resume "$BAC/hausse0" b.rs 1
cas "un fichier à zéro qui régresse casse" 1 "HAUSSE (+1)" "$BAC/hausse0" "$BAC/plafond.txt"

# Baisse : succès, mais le script réclame le resserrage.
resume "$BAC/baisse" a.rs 2
resume "$BAC/baisse" b.rs 0
cas "une baisse passe" 0 "le plafond peut descendre à 2" "$BAC/baisse" "$BAC/plafond.txt"

# Résumé absent : un balayage qui n'a pas conclu ne vaut pas un succès.
resume "$BAC/partiel" a.rs 5
cas "un résumé manquant casse" 1 "RÉSUMÉ ABSENT" "$BAC/partiel" "$BAC/plafond.txt"

# Résumé présent mais tronqué : même verdict.
mkdir -p "$BAC/tronque"
resume "$BAC/tronque" a.rs 5
printf 'fichier=b.rs\n' > "$BAC/tronque/resume-b.rs.txt"
cas "un résumé illisible casse" 1 "RÉSUMÉ ILLISIBLE" "$BAC/tronque" "$BAC/plafond.txt"

# Un balayage interrompu écrit « INCOMPLET » au lieu de `manques=`. Sans ce
# cas, une panne d'infrastructure se lirait comme une couverture parfaite : le
# `missed.txt` d'un balayage qui n'a pas tourné est vide, exactement comme
# celui d'un fichier entièrement couvert.
mkdir -p "$BAC/incomplet"
resume "$BAC/incomplet" a.rs 5
{
    echo "fichier=b.rs"
    echo "INCOMPLET vus=12 annonces=61"
    echo "attrapes=12"
    echo "expires=0"
    echo "inviables=0"
    echo "--- survivants ---"
    echo "--- fin ---"
} > "$BAC/incomplet/resume-b.rs.txt"
cas "un balayage interrompu casse" 1 "RÉSUMÉ ILLISIBLE" "$BAC/incomplet" "$BAC/plafond.txt"

# La liste des survivants se lit dans le journal, sans artefact à télécharger.
resume "$BAC/liste" a.rs 5 "a.rs:42:9: replace foo -> bar"
resume "$BAC/liste" b.rs 0
cas "les survivants sont imprimés" 0 "a.rs:42:9: replace foo -> bar" "$BAC/liste" "$BAC/plafond.txt"

# Un plafond vide n'a rien comparé : le rendre vert serait le pire des
# silences, puisque le fichier est justement ce qui définit l'exigence.
printf '# que des commentaires\n\n' > "$BAC/plafond-vide.txt"
cas "plafond vide : code 2" 2 "plafond vide" "$BAC/egal" "$BAC/plafond-vide.txt"

# Un plafond introuvable est une erreur de configuration, pas un succès.
cas "plafond absent : code 2" 2 "plafond introuvable" "$BAC/egal" "$BAC/rien.txt"

echo
if [ "$vus" -ne "$ATTENDUS" ]; then
    echo "ÉCHEC  $vus cas exécutés, $ATTENDUS attendus — un cas a disparu."
    exit 1
fi
if [ "$echecs" -ne 0 ]; then
    echo "ÉCHEC  $echecs cas sur $vus"
    exit 1
fi
echo "$vus cas, tous passés."
