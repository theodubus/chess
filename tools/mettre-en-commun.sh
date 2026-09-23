#!/usr/bin/env bash
#
# Met en commun plusieurs matchs à LONGUEUR FIXE, exactement.
#
#   tools/mettre-en-commun.sh "97,284,766,332,141" "100,290,750,340,150"
#   tools/mettre-en-commun.sh journal-a.log journal-b.log
#
# Chaque argument est soit un vecteur `Ptnml(0-2)`, soit un journal d'arbitre
# dont on extrait la DERNIÈRE ligne `Ptnml` — jamais la première : les arbitres
# impriment un score courant après chaque partie.
#
# Pourquoi ce script existe
#
# **On ne parallélise PAS un SPRT.** Un test séquentiel tire ses taux d'erreur
# d'une règle d'arrêt unique appliquée à un flux unique. Lancer N SPRT et
# s'arrêter dès que l'un franchit sa borne multiplie le risque de première
# espèce par ~N ; recoller leurs parties après coup ne rend pas un test
# séquentiel, mais un échantillon de taille choisie après avoir vu les données,
# ce qui est pire. La règle du dépôt — *jamais reprendre un SPRT expiré* — est
# le cas particulier d'un principe plus large.
#
# **On parallélise des matchs à LONGUEUR FIXE, et ceux-là se mettent en commun
# sans rien casser** : chacun rend une estimation non biaisée d'effectif connu
# d'avance, et la somme de leurs comptes est l'estimation de l'ensemble. C'est
# ce que fait ce script.
#
# **Il somme les comptes PENTANOMIAUX, il ne moyenne pas des Elo.** L'Elo est
# une fonction non linéaire du score : en moyenner deux est une approximation,
# alors que sommer les paires est exact. La formule est confrontée à fastchess
# sur un cas réel dans `tools/mettre-en-commun-test.sh` — elle retombe à
# 0,003 Elo près.
#
# **Et il refuse de conclure en silence quand les matchs se contredisent.**
# Deux runners GitHub varient de 58 % en vitesse, donc de ~un demi-pli en
# profondeur atteinte — et ce dépôt a mesuré qu'un pli peut INVERSER un
# verdict. Mettre en commun deux matchs joués à des points de fonctionnement
# différents moyenne deux régimes ; le script le dit au lieu de le cacher.
set -uo pipefail

if [ $# -lt 2 ]; then
  echo "usage: tools/mettre-en-commun.sh <ptnml|journal> <ptnml|journal> [...]" >&2
  echo "       au moins deux matchs — mettre un seul match en commun n'a pas de sens." >&2
  exit 1
fi

# Extrait un vecteur de cinq entiers d'un argument : vecteur direct, ou
# dernière ligne `Ptnml` d'un journal.
vecteur() {
  local arg="$1" ligne
  if [ -f "$arg" ]; then
    ligne=$(grep -oE 'Ptnml\(0-2\): \[[^]]*\]' "$arg" | tail -1)
    if [ -z "$ligne" ]; then
      echo "aucune ligne Ptnml dans $arg" >&2
      return 1
    fi
    echo "$ligne" | grep -oE '[0-9]+(, *[0-9]+){4}' | tr -d ' '
  else
    echo "$arg" | tr -d ' '
  fi
}

VECTEURS=()
for arg in "$@"; do
  v=$(vecteur "$arg") || exit 1
  if ! echo "$v" | grep -qE '^[0-9]+(,[0-9]+){4}$'; then
    echo "« $arg » ne donne pas cinq entiers séparés par des virgules : « $v »" >&2
    exit 1
  fi
  VECTEURS+=("$v")
done

# Deux matchs bit à bit identiques ne sont pas deux matchs.
#
# Le moteur est déterministe : mêmes binaires plus même graine donnent les
# mêmes parties, coup pour coup, donc le même vecteur pentanomial. La
# probabilité que deux matchs INDÉPENDANTS de plusieurs milliers de parties
# rendent cinq comptes identiques est négligeable — un vecteur répété veut dire
# une graine répétée, et les additionner double l'effectif sur le papier sans
# que l'information bouge.
#
# C'est le seul endroit où la règle « les graines doivent différer » peut être
# imposée par un code de sortie plutôt que rappelée : ici on tient les données,
# alors qu'au lancement on ne tient qu'une intention.
for ((i = 0; i < ${#VECTEURS[@]}; i++)); do
  for ((j = i + 1; j < ${#VECTEURS[@]}; j++)); do
    if [[ "${VECTEURS[i]}" == "${VECTEURS[j]}" && "${VECTEURS[i]}" != "0,0,0,0,0" ]]; then
      echo "les matchs $((i+1)) et $((j+1)) sont IDENTIQUES : ${VECTEURS[i]}" >&2
      echo >&2
      echo "Le moteur est déterministe — mêmes binaires et même graine donnent les" >&2
      echo "mêmes parties coup pour coup. Deux matchs indépendants de cette taille" >&2
      echo "ne peuvent pas rendre cinq comptes égaux." >&2
      echo >&2
      echo "Les additionner doublerait l'effectif sans ajouter d'information." >&2
      echo "Relancer avec des graines DIFFÉRENTES (entrée « graine » de match.yml)." >&2
      exit 3
    fi
  done
done

printf '%s\n' "${VECTEURS[@]}" | awk -F, '
function elo(mu)   { return (mu <= 0 || mu >= 1) ? 0 : -400 * log(1/mu - 1) / log(10) }
function pente(mu) { return 400 / (log(10) * mu * (1 - mu)) }

function rendre(n0, n1, n2, n3, n4, nom,    N, mu, var, se, e, ic, i, c, s) {
  N = n0 + n1 + n2 + n3 + n4
  if (N == 0) { printf "%-12s aucun résultat\n", nom; return }
  mu = (0*n0 + 0.25*n1 + 0.5*n2 + 0.75*n3 + 1*n4) / N
  var = (n0*(0-mu)^2 + n1*(0.25-mu)^2 + n2*(0.5-mu)^2 + n3*(0.75-mu)^2 + n4*(1-mu)^2) / N
  se = sqrt(var / N)
  e = elo(mu); ic = 1.959963985 * se * pente(mu)
  printf "%-12s %6d paires  %6d parties   Elo %+7.2f ± %5.2f   score %5.2f %%\n", nom, N, 2*N, e, ic, 100*mu
  # Conservés pour la mise en commun et le controle d homogeneite.
  ELO[nom] = e; SE[nom] = ic / 1.959963985
}

{
  m++
  for (i = 1; i <= 5; i++) { n[m, i] = $i; t[i] += $i }
  rendre($1, $2, $3, $4, $5, "match " m)
}

END {
  if (m < 2) { print "il faut au moins deux matchs"; exit 1 }
  print ""
  rendre(t[1], t[2], t[3], t[4], t[5], "EN COMMUN")

  # Controle d homogeneite, par paires. Un z de plus de 2 veut dire que les
  # matchs mesurent des choses differentes : les moyenner cacherait l ecart
  # au lieu de le rendre.
  print ""
  pire = 0
  for (a = 1; a <= m; a++) for (b = a+1; b <= m; b++) {
    na = "match " a; nb = "match " b
    d = ELO[na] - ELO[nb]
    s = sqrt(SE[na]^2 + SE[nb]^2)
    z = (s > 0) ? d / s : 0
    if (z < 0) az = -z; else az = z
    if (az > pire) pire = az
    printf "homogeneite  %s contre %s : ecart %+6.2f Elo, z = %5.2f\n", na, nb, d, z
  }
  print ""
  if (pire > 2) {
    print "ATTENTION — les matchs ne mesurent pas le meme effet (z > 2)."
    print "Mettre en commun MOYENNE deux regimes au lieu den mesurer un seul."
    print "Lire letalonnage de chaque run : deux runners varient de 58 % en"
    print "vitesse, soit ~un demi-pli, et un pli peut INVERSER un verdict sur"
    print "ce moteur. Rapporter les matchs separement, ou expliquer lecart."
    exit 2
  }
  print "homogenes (z < 2) : la mise en commun mesure bien un seul effet."
}
'
