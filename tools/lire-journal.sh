#!/usr/bin/env bash
#
# Deux écrans tirés d'un journal d'arbitre, sans toucher au moteur.
#
#   tools/lire-journal.sh <journal>
#
# Le journal se produit en ajoutant à n'importe quel match fastchess :
#
#   -log file=<journal> level=trace engine=true
#
# Ce que ça rend, et pourquoi ces deux-là ensemble :
#
#   1. LE TAUX DE SUCCÈS DU PONDER. Le moteur imprime déjà sa variante
#      principale entière, donc le DEUXIÈME coup de la PV est exactement sa
#      prédiction de la réponse adverse. Il n'y a rien à instrumenter : on
#      compare ce coup à ce que l'adversaire a réellement joué, lu dans le
#      `position ... moves ...` suivant. C'est « mesurer le mécanisme avant
#      d'en mesurer l'effet » pour le prix d'un drapeau.
#
#   2. L'ÉCART ENTRE LES DEUX PENDULES, qui est l'entrée de tout mécanisme
#      qui voudrait lire la pendule adverse. `wtime` et `btime` nous sont
#      envoyés à chaque coup ; ils sont dans le même journal.
#
# Le découpage par couleur n'est pas un ornement. Quand les noirs ont le
# trait, les blancs ont joué un coup de PLUS, donc leur pendule est plus
# basse par construction : un écart signé moyen positif en sort tout seul,
# sans qu'aucun moteur ne gère son temps différemment. Mesurer l'écart sans
# séparer les deux cas, c'est mesurer un artefact de comptage de coups et le
# prendre pour de l'information. La colonne « trait aux blancs » est la seule
# où les deux camps ont joué autant de coups l'un que l'autre.
#
# Python en document-ci-inclus, comme timing.sh : la logique tient en une
# page et n'a pas à devenir une dépendance.
set -euo pipefail

JOURNAL="${1:-}"
[[ -n "$JOURNAL" && -r "$JOURNAL" ]] || {
  echo "usage : tools/lire-journal.sh <journal fastchess produit avec -log ... engine=true>" >&2
  exit 1
}

python3 - "$JOURNAL" <<'PY'
import re, sys, statistics
from collections import defaultdict

ENG = re.compile(r'^\[Engine\] \[[^\]]+\] <\s*(\d+)>\s+(\S+) (<---|--->) (.*)$')

pv      = defaultdict(list)   # (fil, moteur) -> variante de la dernière ligne info
attente = {}                  # (fil, moteur) -> coup prédit, ou None si pas de PV
hits = miss = sans_pv = hors_jeu = lignes = 0
etat = {}                     # (fil, moteur) -> (trait de la FEN, nb de coups joués)
ecart = {'w': [], 'b': []}
rel   = {'w': [], 'b': []}

def trait(fen_stm, n):
    return fen_stm if n % 2 == 0 else ('b' if fen_stm == 'w' else 'w')

for ligne in open(sys.argv[1], encoding='utf-8', errors='replace'):
    m = ENG.match(ligne.rstrip('\n'))
    if not m:
        continue
    lignes += 1
    fil, moteur, sens, corps = m.groups()
    cle = (fil, moteur)

    if sens == '--->':
        if corps.startswith('info ') and ' pv ' in corps:
            pv[cle] = corps.split(' pv ', 1)[1].split()
        elif corps.startswith('bestmove'):
            p = pv[cle]
            attente[cle] = p[1] if len(p) >= 2 else None
            pv[cle] = []
        continue

    if corps.startswith('ucinewgame'):
        if attente.pop(cle, 'absent') != 'absent':
            hors_jeu += 1        # dernière recherche d'une partie : pas de réponse
        pv[cle] = []
    elif corps.startswith('position '):
        mots = corps.split()
        coups = corps.split(' moves ', 1)[1].split() if ' moves ' in corps else []
        etat[cle] = (mots[3] if mots[1] == 'fen' else 'w', len(coups))
        if cle in attente:
            pred = attente.pop(cle)
            if not coups:
                hors_jeu += 1    # nouvelle partie sans ucinewgame
            elif pred is None:
                sans_pv += 1
            elif coups[-1] == pred:
                hits += 1
            else:
                miss += 1
    elif corps.startswith('go ') and 'wtime' in corps:
        t = corps.split()
        w, b = int(t[t.index('wtime') + 1]), int(t[t.index('btime') + 1])
        f, n = etat.get(cle, ('w', 0))
        c = trait(f, n)
        nous, eux = (w, b) if c == 'w' else (b, w)
        ecart[c].append(nous - eux)
        rel[c].append(abs(nous - eux) / max(nous, eux, 1))

if lignes == 0:
    sys.exit("aucune ligne [Engine] : le journal a-t-il été produit avec engine=true ?")

denom = hits + miss + sans_pv
if denom == 0:
    sys.exit("aucune prédiction comparable : journal trop court ?")

print("=== 1. ponder : le deuxième coup de notre PV contre la réponse jouée ===")
print(f"recherches suivies d'une réponse adverse : {denom}")
print(f"  succès                                 : {hits}")
print(f"  échecs                                 : {miss}")
print(f"  sans prédiction (PV de moins de 2 coups) : {sans_pv}"
      f"  ({sans_pv / denom * 100:.2f} %)")
print(f"  écartées, dernière recherche d'une partie : {hors_jeu}")
print()
print(f"p sur les coups où une prédiction existe : {hits / (hits + miss):.4f}")
print(f"p sur TOUS les coups                     : {hits / denom:.4f}"
      "   <- le bon dénominateur")
print(f"  converti par la constante du projet : {hits / denom:.4f} x 1,36 ="
      f" {hits / denom * 1.36:.2f} pli")
print()
print("=== 2. pendules : écart entre la nôtre et celle de l'adversaire ===")
for c, nom in (('w', "trait aux blancs — les deux camps ont joué autant de coups"),
               ('b', "trait aux noirs  — l'adversaire a joué un coup de plus (artefact)")):
    e, r = ecart[c], rel[c]
    if len(r) < 20:
        print(f"{nom} : {len(r)} coups, trop peu")
        continue
    q = statistics.quantiles(r, n=100)
    print(f"{nom} — {len(e)} coups")
    print(f"   écart signé (ms)  : médiane {statistics.median(e):+.0f}"
          f"   moyenne {statistics.mean(e):+.0f}"
          f"   étendue [{min(e)}, {max(e)}]")
    print(f"   |écart| / la plus grande des deux : médiane"
          f" {statistics.median(r) * 100:.2f} %   p90 {q[89] * 100:.2f} %"
          f"   p99 {q[98] * 100:.2f} %")
    for s in (0.05, 0.10, 0.20):
        print(f"      dépasse {int(s * 100):>2} % : "
              f"{sum(1 for x in r if x >= s) / len(r) * 100:5.2f} % des coups")
PY
