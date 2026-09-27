#!/usr/bin/env bash
#
# Les plis qu'un changement gagne VRAIMENT en partie, appariés par partie.
#
#   tools/plis.sh <journal>
#
# Le journal est la sortie de cutechess-cli avec `-debug all`, sur un match
# entre deux moteurs nommés `candidat` et `reference`, UNE PARTIE À LA FOIS :
#
#   QT_QPA_PLATFORM=offscreen tools/arbiters/cutechess-cli -debug all \
#     -engine cmd=<candidat> name=candidat proto=uci [ponder] \
#     -engine cmd=<reference> name=reference proto=uci \
#     -each tc=8+0.08 -openings file=tools/book.epd format=epd order=random \
#     -srand <graine> -games 2 -repeat -rounds 10 -concurrency 1 \
#     -draw movenumber=40 movecount=8 score=10 \
#     -resign movecount=4 score=600 twosided=true > <journal> 2>&1
#
# Mêmes options que `match.yml`. Vingt parties, huit minutes de conteneur.
# `-debug all` et pas `-debug` seul : l'épinglage de cutechess refuse l'option
# sans valeur (« Empty value for option »), et `all` n'ajoute qu'un
# `debug on` que le moteur ignore.
#
# Pourquoi apparier PAR PARTIE
#
# Une profondeur moyenne dépend de la phase de jeu : une finale se cherche
# bien plus profond qu'un milieu de partie. Comparer deux matchs, c'est
# comparer deux mélanges de phases — la faute de `CLAUDE.md`, « une
# comparaison entre réglages qui changent le déroulement n'est pas
# appariée ». Dans UNE partie, les deux camps cherchent des positions voisines
# d'un demi-coup : l'écart des deux moyennes de la partie annule le mélange,
# et c'est la dispersion de ces écarts entre parties qui donne l'intervalle.
#
# Ce que ça a tranché, le 23 sept. 2026 : le ponder gagnait les 0,90 pli
# prévus (+0,94 ± 0,20), et C21 n'en gagnait que 0,41 ± 0,20 — pas les 0,54
# à 0,70 estimés par son budget, qui servaient à convertir des plis en Elo.
# Un témoin sans aucune différence rend −0,00 ± 0,13.
#
# Ce que ça compte
#
# - La profondeur d'un coup est celle de la DERNIÈRE ligne `info` avant son
#   `bestmove` : une itération interrompue est jetée par le moteur, donc cette
#   ligne est celle de la dernière itération close.
# - Une recherche de ponder terminée par `stop` n'est pas un coup joué : elle
#   est comptée dans le taux de succès, jamais dans les profondeurs.
# - « pendule » court depuis le `go` ou le `ponderhit` ; « recherche » depuis
#   le `go`, donc temps de ponder compris.
# - Le rapport des n/s ne prend que les coups partis d'un `go` ORDINAIRE. Sur
#   un tel coup, le camp qui pondère cherche seul — l'autre vient de jouer et
#   ne pondère pas —, alors que la référence cherche PENDANT que le candidat
#   pondère. Même binaire, même machine, mêmes parties : le rapport dit ce que
#   le ponder vole à l'adversaire, sans comparer deux runners dont la vitesse
#   varie de 22 à 58 %. Un coup joué sur `ponderhit` mêle les deux régimes et
#   en est exclu. Sans ponder, le rapport est un témoin : il doit valoir ~1.
#   **Il porte un confondant de quelques pour cent**, et il faut le savoir
#   avant de le lire : chez le camp qui pondère, les coups partis d'un `go`
#   sont ceux qui suivent un ponder MANQUÉ — table chaude d'une autre ligne.
#   Rejoué sur les journaux de conteneur du 23 sept. : témoin 1,010, ponder
#   0,976, quand les n/s de la référence d'un run à l'autre, même machine,
#   ne bougeaient que de −0,8 %. Il sépare donc un vol MASSIF — deux fils
#   d'un même cœur physique — d'une absence de vol ; pas 2 % de 0 %.
# - L'intervalle suit Student à n − 1 degrés de liberté, pas 1,96 : à vingt
#   parties, 1,96 le rendait 7 % trop étroit, et à quatre, de 38 %.
#
# Python en document-ci-inclus, comme `lire-journal.sh` et `timing.sh`.
set -euo pipefail

JOURNAL="${1:-}"
[[ -n "$JOURNAL" && -r "$JOURNAL" ]] || {
  echo "usage : tools/plis.sh <journal cutechess produit avec -debug all>" >&2
  exit 1
}

python3 - "$JOURNAL" <<'PY'
import re, sys, statistics as st

LIGNE = re.compile(r'^(\d+) ([<>])(\w+)\((\d+)\): (.*)$')
MOTEURS = ('candidat', 'reference')

parties = {}   # moteur -> numéro de la partie en cours (compté par ucinewgame)
encours = {}   # (moteur, id) -> recherche en cours
joues = []     # coups joués : (partie, moteur, profondeur, pendule, recherche, nœuds, temps)
ponder = {m: [0, 0, 0] for m in MOTEURS}   # go ponder, ponderhit, stop

for brut in open(sys.argv[1], errors='replace'):
    m = LIGNE.match(brut.rstrip('\n'))
    if not m or m[3] not in MOTEURS:
        continue
    t, sens, moteur, cle, msg = int(m[1]), m[2], m[3], (m[3], m[4]), m[5]
    if sens == '>':
        if msg == 'ucinewgame':
            parties[moteur] = parties.get(moteur, 0) + 1
        elif msg.startswith('go'):
            p = re.search(r'\bponder\b', msg) is not None
            encours[cle] = dict(ponder=p, succes=None, prof=0, noeuds=0, temps=0, t0=t, tpendule=t)
            if p:
                ponder[moteur][0] += 1
        elif msg == 'ponderhit' and cle in encours:
            encours[cle]['succes'] = True
            encours[cle]['tpendule'] = t
            ponder[moteur][1] += 1
        elif msg == 'stop' and cle in encours and encours[cle]['ponder'] and encours[cle]['succes'] is None:
            encours[cle]['succes'] = False
            ponder[moteur][2] += 1
    elif cle in encours:
        if msg.startswith('info') and re.search(r'\bdepth \d+', msg) and re.search(r'\bnodes \d+', msg):
            r = encours[cle]
            r['prof'] = int(re.search(r'\bdepth (\d+)', msg)[1])
            r['noeuds'] = int(re.search(r'\bnodes (\d+)', msg)[1])
            tm = re.search(r'\btime (\d+)', msg)
            r['temps'] = int(tm[1]) if tm else r['temps']
        elif msg.startswith('bestmove'):
            r = encours.pop(cle)
            if r['ponder'] and not r['succes']:
                continue   # ponder jeté : pas un coup joué
            joues.append((parties.get(moteur, 0), moteur, r['prof'], t - r['tpendule'],
                          t - r['t0'], r['noeuds'], r['temps'], not r['ponder']))

par_moteur = {m: [j for j in joues if j[1] == m] for m in MOTEURS}
if not all(par_moteur.values()):
    print("refus : il faut des coups joués par `candidat` ET par `reference`", file=sys.stderr)
    sys.exit(1)

print(f"{'moteur':10s} {'coups':>6s} {'prof. moy.':>11s} {'pendule/coup':>13s} {'recherche/coup':>15s} {'n/s':>11s}")
for m, J in par_moteur.items():
    noeuds, temps = sum(j[5] for j in J), sum(j[6] for j in J)
    nps = f"{round(noeuds * 1000 / temps)}" if temps else "—"
    print(f"{m:10s} {len(J):6d} {st.mean(j[2] for j in J):11.2f} "
          f"{st.mean(j[3] for j in J):10.1f} ms {st.mean(j[4] for j in J):12.1f} ms {nps:>11s}")
for m in MOTEURS:
    go, hit, stop = ponder[m]
    if go:
        print(f"ponder de {m} : {go} go ponder, {hit} ponderhit, {stop} stop — taux {hit / go:.3f}")
nps_go = {}
for m, J in par_moteur.items():
    noeuds, temps = sum(j[5] for j in J if j[7]), sum(j[6] for j in J if j[7])
    nps_go[m] = noeuds * 1000 / temps if temps else 0
if all(nps_go.values()):
    print(f"n/s des coups partis d'un go : candidat {round(nps_go['candidat'])}, "
          f"reference {round(nps_go['reference'])} — "
          f"reference / candidat = {nps_go['reference'] / nps_go['candidat']:.3f}")

ecarts = []
for g in sorted({j[0] for j in joues}):
    c = [j[2] for j in par_moteur['candidat'] if j[0] == g]
    r = [j[2] for j in par_moteur['reference'] if j[0] == g]
    if c and r:
        ecarts.append(st.mean(c) - st.mean(r))
if len(ecarts) < 2:
    print("refus : moins de deux parties jouées par les deux moteurs, pas d'intervalle", file=sys.stderr)
    sys.exit(1)
rapport = st.mean(j[4] for j in par_moteur['candidat']) / st.mean(j[4] for j in par_moteur['reference'])
# Quantile 0,975 de Student ; au-delà de trente degrés, 1,96 + 2,5 / ddl colle
# à la table au millième près (40 : 2,021 ; 120 : 1,980).
T975 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
        2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086,
        2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042]
ddl = len(ecarts) - 1
t975 = T975[ddl - 1] if ddl <= len(T975) else 1.96 + 2.5 / ddl
demi = t975 * st.stdev(ecarts) / len(ecarts) ** 0.5
print(f"rapport des temps de recherche : x {rapport:.2f}")
print(f"écart apparié : {st.mean(ecarts):+.2f} ± {demi:.2f} pli sur {len(ecarts)} parties (IC 95 %)")
PY
