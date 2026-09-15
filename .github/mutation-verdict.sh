#!/usr/bin/env bash
# Confronte les résumés d'un balayage par mutation au plafond inscrit dans le
# dépôt. Sort non nul si un fichier a *plus* de survivants que son plafond.
#
# Séparé du workflow pour une raison précise : un script lancé en CI et jamais
# exécutable localement n'est jamais vérifié. Celui-ci se teste par
# `.github/mutation-verdict-test.sh`.
set -uo pipefail

DOSSIER=${1:?usage: mutation-verdict.sh <dossier-resumes> <fichier-plafond>}
PLAFOND=${2:?usage: mutation-verdict.sh <dossier-resumes> <fichier-plafond>}

if [ ! -d "$DOSSIER" ]; then
    echo "verdict : dossier de résumés introuvable : $DOSSIER" >&2
    exit 2
fi
if [ ! -f "$PLAFOND" ]; then
    echo "verdict : plafond introuvable : $PLAFOND" >&2
    exit 2
fi

# Le plafond attendu, fichier par fichier. L'ordre du fichier est conservé :
# une table associative s'énumère dans un ordre arbitraire, et deux journaux
# hebdomadaires qu'on ne peut pas comparer ligne à ligne ne servent à rien.
declare -A attendu=()
noms=()
while read -r nom valeur _reste; do
    case "$nom" in ''|'#'*) continue ;; esac
    attendu["$nom"]=$valeur
    noms+=("$nom")
done < "$PLAFOND"

# Un plafond sans aucune entrée rendrait un vert silencieux : la boucle
# ci-dessous ne tournerait pas, et le script sortirait à zéro sans avoir rien
# comparé. C'est la même famille de faute que le `missed.txt` vide d'un
# balayage qui n'a pas tourné.
if [ "${#attendu[@]}" -eq 0 ]; then
    echo "verdict : plafond vide ($PLAFOND) — rien à comparer." >&2
    exit 2
fi

echo "===== VERDICT MUTATION ====="
printf '%-14s %9s %9s %9s %9s  %s\n' fichier survivants plafond attrapés expirés état

hausse=0
baisse=0
manquant=0
total_survivants=0

for nom in "${noms[@]}"; do
    resume="$DOSSIER/resume-$nom.txt"
    if [ ! -f "$resume" ]; then
        printf '%-14s %9s %9s %9s %9s  %s\n' "$nom" "?" "${attendu[$nom]}" "?" "?" "RÉSUMÉ ABSENT"
        manquant=$((manquant + 1))
        continue
    fi
    manques=$(sed -n 's/^manques=//p' "$resume")
    attrapes=$(sed -n 's/^attrapes=//p' "$resume")
    expires=$(sed -n 's/^expires=//p' "$resume")
    : "${manques:=?}" "${attrapes:=?}" "${expires:=?}"

    etat="ok"
    if [ "$manques" = "?" ]; then
        etat="RÉSUMÉ ILLISIBLE"
        manquant=$((manquant + 1))
    elif [ "$manques" -gt "${attendu[$nom]}" ]; then
        etat="HAUSSE (+$((manques - ${attendu[$nom]})))"
        hausse=$((hausse + 1))
    elif [ "$manques" -lt "${attendu[$nom]}" ]; then
        etat="baisse (-$((${attendu[$nom]} - manques))), le plafond peut descendre à $manques"
        baisse=$((baisse + 1))
    fi
    [ "$manques" = "?" ] || total_survivants=$((total_survivants + manques))
    printf '%-14s %9s %9s %9s %9s  %s\n' \
        "$nom" "$manques" "${attendu[$nom]}" "$attrapes" "$expires" "$etat"
done

echo
echo "total des survivants : $total_survivants"

# Les survivants eux-mêmes, pour que la lecture du journal suffise à savoir
# quoi corriger sans télécharger d'artefact.
for nom in "${noms[@]}"; do
    resume="$DOSSIER/resume-$nom.txt"
    [ -f "$resume" ] || continue
    liste=$(sed -n '/^--- survivants ---$/,/^--- fin ---$/p' "$resume" | sed '1d;$d')
    [ -n "$liste" ] || continue
    echo
    echo "--- survivants de $nom ---"
    echo "$liste"
done

echo "===== FIN VERDICT ====="

if [ "$manquant" -gt 0 ]; then
    echo "verdict : $manquant fichier(s) sans résumé exploitable — le balayage a échoué avant de conclure." >&2
    exit 1
fi
if [ "$hausse" -gt 0 ]; then
    echo "verdict : $hausse fichier(s) au-dessus du plafond — du code a cessé d'être couvert." >&2
    echo "Corriger les tests, ou relever le plafond dans $PLAFOND en expliquant pourquoi." >&2
    exit 1
fi
if [ "$baisse" -gt 0 ]; then
    echo "verdict : $baisse fichier(s) sous le plafond. Resserrer $PLAFOND."
fi
exit 0
