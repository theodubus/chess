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

# Les résumés d'un fichier. Un fichier balayé d'un seul job en laisse un,
# `resume-<fichier>.txt` ; un fichier découpé par `cargo mutants --shard`
# (`.github/workflows/mutation.yml`) en laisse un par morceau,
# `resume-<fichier>.morceau-<k>-sur-<n>.txt`, et ses comptes sont la somme
# des morceaux. **Un morceau manquant se lirait comme un fichier mieux
# couvert** : la somme ne se rend que si les `n` morceaux, de 0 à n-1, sont
# là et lisibles, tous du même découpage, et sans résumé entier à côté.
declare -A manques_de=() attrapes_de=() expires_de=() lecture_de=() survivants_de=() morceaux_de=()

# lire_resume <chemin> : imprime « manques attrapes expires » ou rien.
lire_resume() {
    local m a e
    m=$(sed -n 's/^manques=//p' "$1")
    a=$(sed -n 's/^attrapes=//p' "$1")
    e=$(sed -n 's/^expires=//p' "$1")
    case "$m" in ''|*[!0-9]*) return 1 ;; esac
    printf '%s %s %s\n' "$m" "${a:-?}" "${e:-?}"
}

# La liste des survivants d'un résumé, sans ses bornes.
survivants_du_resume() {
    sed -n '/^--- survivants ---$/,/^--- fin ---$/p' "$1" | sed '1d;$d'
}

# Additionne deux comptes, « ? » l'emportant : un compte inconnu ne se
# devine pas.
plus() {
    case "$1$2" in *'?'*) echo '?' ;; *) echo $(($1 + $2)) ;; esac
}

lire_fichier() {
    local nom=$1 entier="$DOSSIER/resume-$nom.txt"
    local morceaux=() f
    manques_de[$nom]='?' attrapes_de[$nom]='?' expires_de[$nom]='?'
    lecture_de[$nom]='' survivants_de[$nom]=''
    for f in "$DOSSIER/resume-$nom.morceau-"*"-sur-"*".txt"; do
        [ -e "$f" ] && morceaux+=("$f")
    done

    if [ -f "$entier" ] && [ "${#morceaux[@]}" -gt 0 ]; then
        lecture_de[$nom]="ENTIER ET MORCEAUX"
        return
    fi
    if [ -f "$entier" ]; then
        local comptes
        if ! comptes=$(lire_resume "$entier"); then
            lecture_de[$nom]="RÉSUMÉ ILLISIBLE"
            return
        fi
        read -r manques_de[$nom] attrapes_de[$nom] expires_de[$nom] <<< "$comptes"
        survivants_de[$nom]=$(survivants_du_resume "$entier")
        return
    fi
    if [ "${#morceaux[@]}" -eq 0 ]; then
        lecture_de[$nom]="RÉSUMÉ ABSENT"
        return
    fi

    # Les morceaux : un seul découpage, chaque k de 0 à n-1.
    local n_commun='' k n reste base
    declare -A present=()
    for f in "${morceaux[@]}"; do
        base=${f##*/}
        reste=${base#"resume-$nom.morceau-"}
        reste=${reste%.txt}
        k=${reste%%-sur-*}
        n=${reste#*-sur-}
        case "$k/$n" in *[!0-9/]*|/*|*/) lecture_de[$nom]="MORCEAU MAL NOMMÉ ($base)"; return ;; esac
        if [ "$n" -lt 2 ] || [ "$k" -ge "$n" ]; then
            lecture_de[$nom]="MORCEAU MAL NOMMÉ ($base)"
            return
        fi
        if [ -n "$n_commun" ] && [ "$n" != "$n_commun" ]; then
            lecture_de[$nom]="MORCEAUX DE DEUX DÉCOUPAGES ($n_commun et $n)"
            return
        fi
        n_commun=$n
        present[$k]=$f
    done
    for ((k = 0; k < n_commun; k++)); do
        if [ -z "${present[$k]:-}" ]; then
            lecture_de[$nom]="MORCEAU ABSENT ($k/$n_commun)"
            return
        fi
    done

    local m=0 a=0 e=0 comptes cm ca ce liste tous=''
    for ((k = 0; k < n_commun; k++)); do
        if ! comptes=$(lire_resume "${present[$k]}"); then
            lecture_de[$nom]="RÉSUMÉ ILLISIBLE (morceau $k/$n_commun)"
            return
        fi
        read -r cm ca ce <<< "$comptes"
        m=$((m + cm))
        a=$(plus "$a" "$ca")
        e=$(plus "$e" "$ce")
        liste=$(survivants_du_resume "${present[$k]}")
        [ -z "$liste" ] || tous+="${tous:+$'\n'}$liste"
    done
    manques_de[$nom]=$m attrapes_de[$nom]=$a expires_de[$nom]=$e
    survivants_de[$nom]=$tous
    morceaux_de[$nom]=$n_commun
}

for nom in "${noms[@]}"; do
    lire_fichier "$nom"
done

echo "===== VERDICT MUTATION ====="
printf '%-14s %9s %9s %9s %9s  %s\n' fichier survivants plafond attrapés expirés état

hausse=0
baisse=0
manquant=0
total_survivants=0

for nom in "${noms[@]}"; do
    manques=${manques_de[$nom]}
    etat="ok"
    if [ -n "${lecture_de[$nom]}" ]; then
        etat=${lecture_de[$nom]}
        manquant=$((manquant + 1))
    elif [ "$manques" -gt "${attendu[$nom]}" ]; then
        etat="HAUSSE (+$((manques - ${attendu[$nom]})))"
        hausse=$((hausse + 1))
    elif [ "$manques" -lt "${attendu[$nom]}" ]; then
        etat="baisse (-$((${attendu[$nom]} - manques))), le plafond peut descendre à $manques"
        baisse=$((baisse + 1))
    fi
    if [ -n "${morceaux_de[$nom]:-}" ]; then
        etat="$etat — somme de ${morceaux_de[$nom]} morceaux"
    fi
    [ "$manques" = "?" ] || total_survivants=$((total_survivants + manques))
    printf '%-14s %9s %9s %9s %9s  %s\n' \
        "$nom" "$manques" "${attendu[$nom]}" "${attrapes_de[$nom]}" "${expires_de[$nom]}" "$etat"
done

echo
echo "total des survivants : $total_survivants"

# Les survivants eux-mêmes, pour que la lecture du journal suffise à savoir
# quoi corriger sans télécharger d'artefact.
for nom in "${noms[@]}"; do
    liste=${survivants_de[$nom]}
    [ -n "$liste" ] || continue
    echo
    echo "--- survivants de $nom ---"
    echo "$liste"
done

# La synthèse est répétée EN DERNIER, et c'est délibéré.
#
# Le tableau ci-dessus est imprimé avant la liste nominative des survivants,
# qui fait plusieurs centaines de lignes. Or un journal GitHub se lit par la
# fin : l'outil de lecture de la Routine prend les 500 dernières lignes par
# défaut, et le journal de ce job en faisait 531 le 15 sept. 2026 — le tableau
# tombait juste au-delà. Un rapport que son seul lecteur ne peut pas atteindre
# ne rapporte rien.
echo
echo "===== SYNTHÈSE ====="
for nom in "${noms[@]}"; do
    manques=${manques_de[$nom]}
    if [ -n "${lecture_de[$nom]}" ]; then
        printf '%-14s ILLISIBLE\n' "$nom"
    elif [ "$manques" -eq "${attendu[$nom]}" ]; then
        printf '%-14s %4s = plafond\n' "$nom" "$manques"
    elif [ "$manques" -gt "${attendu[$nom]}" ]; then
        printf '%-14s %4s > plafond %s  HAUSSE\n' "$nom" "$manques" "${attendu[$nom]}"
    else
        printf '%-14s %4s < plafond %s  resserrer\n' "$nom" "$manques" "${attendu[$nom]}"
    fi
done
echo "total $total_survivants"
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
