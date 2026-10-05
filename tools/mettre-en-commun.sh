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
# Le seuil porte sur la PROBABILITÉ du plus grand écart, pas sur un `z` fixe :
# à quatre matchs il y a six paires, et un `z` fixe y crierait au loup.
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

function phi(x) { return exp(-x * x / 2) / 2.506628274631 }
# Fonction de répartition de la loi normale — awk n a pas de erf :
# Abramowitz et Stegun 26.2.17, erreur absolue sous 7,5e-8.
function Phi(x,    t, y) {
  if (x < 0) return 1 - Phi(-x)
  t = 1 / (1 + 0.2316419 * x)
  y = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return 1 - phi(x) * y
}
# Probabilité que le plus grand des k(k-1)/2 écarts par paires dépasse z
# quand les k matchs mesurent UN SEUL effet : la loi de l étendue
# studentisée à k groupes et ddl infini, prise en q = z × racine de 2,
#   P(Q <= q) = k × intégrale de phi(x) [Phi(x) - Phi(x - q)]^(k-1) dx,
# par Simpson sur [-8, 8]. À k = 2, elle rend 2 (1 - Phi(z)) : le test
# bilatéral ordinaire. Elle suppose des erreurs standard égales ; celles
# de matchs de même effectif diffèrent de quelques pour cent, et c est
# toute l approximation.
function p_etendue(k, z,    q, a, b, n, h, s, i, x, w) {
  q = z * sqrt(2); a = -8; b = 8; n = 3200; h = (b - a) / n; s = 0
  for (i = 0; i <= n; i++) {
    x = a + i * h
    w = (i == 0 || i == n) ? 1 : ((i % 2) ? 4 : 2)
    s += w * phi(x) * (Phi(x) - Phi(x - q)) ^ (k - 1)
  }
  return 1 - k * s * h / 3
}

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

  # Controle d homogeneite, par paires. Un écart trop grand veut dire que les
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
  # Le plus grand z ne se lit pas seul. Entre deux matchs, z > 2 n arrive
  # qu une fois sur vingt-deux sous un seul effet ; entre QUATRE, il y a six
  # paires, et le plus grand de six z dépasse 2 près d une fois sur cinq —
  # le seuil fixe criait au loup sur C34, C36 et C38 le 5 oct. 2026, et un
  # avertissement qui crie au loup cesse d être lu. Le seuil porte donc sur
  # la PROBABILITÉ du plus grand écart, au niveau qu avait z > 2 entre deux
  # matchs : 4,55 %. À deux matchs, la décision est celle d avant.
  p = p_etendue(m, pire)
  seuil = p_etendue(2, 2)
  printf "plus grand ecart : z = %.2f sur %d paire(s) ; sous un seul effet, p = %.3f (seuil %.4f)\n", pire, m * (m - 1) / 2, p, seuil
  if (p < seuil) {
    print "ATTENTION — les matchs ne mesurent pas le meme effet."
    print "Mettre en commun MOYENNE deux regimes au lieu den mesurer un seul."
    print "Lire letalonnage de chaque run : deux runners varient de 58 % en"
    print "vitesse, soit ~un demi-pli, et un pli peut INVERSER un verdict sur"
    print "ce moteur. Rapporter les matchs separement, ou expliquer lecart."
    exit 2
  }
  print "homogenes : la mise en commun mesure bien un seul effet."
}
'
