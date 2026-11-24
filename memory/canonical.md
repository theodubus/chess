<!-- socle: couche=canonique zone=publique -->
# Mémoire canonique

L'état vérifié du projet : un fait par entrée, avec son statut et sa preuve.
Un fait ne change qu'avec une référence de preuve nouvelle ; réfuté, il est
barré et conservé. Lue à chaque session : elle reste sous son budget, et ce
qui n'a plus à être lu à chaque fois s'archive dans le journal.

## F-0005 — Les données d'entraînement gardées par GitHub expirent du 24 déc. 2026 au 29 janv. 2027

> statut : mesuré · preuve : J-2026-11-17-AG, J-2026-11-23-O · source : relevé à l'API de GitHub le 17 nov. 2026, workflow `nnue-datagen.yml` · date : 2026-11-17

Par génération, la date du dernier artefact : la première vague d'A21
le 24 déc. 2026, la vague au réseau du 29 sept. le 28 déc., le n° 13 le
5 janv. 2027, puis le n° 18 le 14 janv., le n° 20 le 18, sa suite le 19,
le n° 21 le 24, le n° 22 le 29. Passé ces dates, la machine de Théo porte
la seule copie. Dire avant chacune ce qui sert encore et ce qui se copie
est le sujet B-0026, ouvert le 23 nov., la mise à jour du socle étant
remise (D-0024). Le relevé du 6 nov. ne comptait que les
générations n° 18 à n° 22 (J-2026-11-17-AG).

## F-0007 — L'évaluation qui joue est le réseau embarqué N9w50s800, depuis le 22 oct. 2026

> statut : mesuré · preuve : fichier:engine/src/nnue.rs, J-2026-11-18-CL · source : `CLAUDE.md`, « Décisions structurantes », jusqu'au 17 nov. 2026 · date : 2026-10-22

Le binaire embarque `reseaux/n9w50s800-768x4hm-256-s8-800.bin` (constante
`EMBEDDED` d'`engine/src/nnue.rs`) : `(768 × 4 → 256) × 2 → 1`, quatre
seaux de roi en miroir, huit seaux de sortie, appris sur 3,71 G positions
étiquetées par N6r4. Il a battu N8tw50s800 de +5,18 ± 3,29 Elo sur
11 200 parties à `8+0,08` (J-2026-11-18-CL).
L'évaluation faite main reste (`EvalFile <none>`) : c'est elle
qu'évaluent le banc et les tests de recherche, pas celle qui joue. Les
réseaux qui l'ont précédé sont au journal, avec les quatre premières
sections de `CLAUDE.md` d'avant le 17 nov. (J-2026-11-17-N).

## F-0008 — Le facteur des marges du réseau qui joue vaut 2,85

> statut : mesuré · preuve : fichier:engine/src/search.rs, J-2026-11-17-X, J-2026-11-18-CL · source : `CLAUDE.md`, « Invariants du moteur » et « Décisions structurantes » · date : 2026-10-14

L'aspiration et l'élagage delta passent par `scaled_margin`, multipliés
par `NETWORK_MARGIN_PERCENT` / 100 quand un réseau joue : 285, soit 2,85,
depuis N5l (14 oct. 2026). La futilité et la marge singulière, mesurées au
réseau, passent par `network_margin` ; la futilité inverse ne passe par
aucune des deux. Le facteur
appartient au réseau : N6r4, N7p4 et N8tw50s800 l'ont sondé dans la
plage. La sonde de N9w50s800 n'a pu être lue que contre N8tw50s800, les
journaux de la faite main de référence étant perdus : il ne s'y montre
pas plus fautif à aucune marge (J-2026-11-18-CL). La faite main garde ses
marges au bit près.

## F-0009 — Les réglages ouverts du réseau : chaque valeur, sa borne mesurée, sa marge, son prochain test

> statut : mesuré · preuve : J-2026-11-18-B, J-2026-11-18-BE, J-2026-11-18-DD · source : la section « Les réglages ouverts » de `tools/README.md`, les verdicts du 21 oct. au 10 nov. 2026 · date : 2026-11-18

Aucun n'est résolu : une valeur validée est une borne basse (ADR-0032).
Matchs à `8+0,08`, ± à 95 % ; marges estimées, confiance faible sauf (m),
moyenne. L'histoire de chaque mesure : J-2026-11-18-B.

| réglage | valeur | ce qui la borne | marge | ensuite |
|---|---|---|---|---|
| superlots | 800 | 400 → 800 +5,43 ± 3,34 à 4,63 G | +2 à +5 au doublement | 1 600, en dernier (B-0028) |
| poids du résultat | 0,5 | 0,625 −1,86, 0,75 −2,95 (± 3,3) | rien au-dessus (m) | 0,375 ; rouvert si passes ou données changent |
| pas initial | 0,001 | à 100 superlots seulement : × 2 −4,90 ± 3,41 ; × 0,5 −0,12 | quelques Elo | rouvert avec le lot ou la largeur |
| pas final | × 0,3⁵, cosinus | × 0,1 +1,40, × 10 −13,13 (± 3,4) | fine (m) | entre × 0,1 et × 1 ; la forme, jamais touchée |
| perte | écart au carré | exposant 2,5 +0,84 ± 3,28 | ~0 ± 3 (m) | rouvert si les données changent |
| taille de lot | 16 384 | 8 192 −5,43, 32 768 +2,30 (± 3,3) | 0 à +3 vers les grands | 32 768 avec son pas |
| filtre des positions | ply ≥ 16 | 8 −3,78, 24 −4,37 (± 3,3) | fine (m) | 12 et 20 |
| poids variable | constant | 0,25 → 0,75 −1,99 ± 3,32 | ~0 ± 3 (m) | une autre pente |
| volume | 3,71 G vues au réseau qui joue | doubler +7,38 ± 3,40 ; à étiquette égale +8,94 ± 3,32 | ~+7 au doublement | chaque séance ; B-0024 |
| étiqueteur | N9w50s800, 2 500 nœuds | 2 500 contre 5 000 +5,77 ± 3,34 ; 10 000 −7,38 à temps égal ; le meilleur réseau, ~+40 sur le précédent, +10,15 ± 3,33 à volume égal (tour de boucle) | jusqu'à ~+9 au doublement | 1 250 nœuds (B-0023) |
| largeur | 256 ; 512 au candidat | 384 +24,86, 512 +32,57 contre 256 (± 3,3) | +3 à +8 au pas suivant | B-0012, puis B-0022 |
| seaux de roi | 4 ; 10 au candidat | 10 contre 4 +14,77 ± 3,27 à 11,35 G | +5 à +10 vers 16 | B-0020 |
| seaux de sortie | 8, selon le matériel | 1 contre 8 seulement | inconnue | B-0066 |
| couches cachées | aucune | jamais | inconnue | B-0021 |
| ouvertures du générateur | 8 à 11 demi-coups au hasard | jamais | inconnue | B-0059 |
| seuil des ouvertures | 1 000 (`OPENING_MAX_SCORE`) | jamais en force ; son taux suit l'étiqueteur, 21 % sous N9w50s800 | inconnue | avec B-0059 ; jamais en cours de tranche |
| adjudication du générateur | gain à 2 000 tenu huit demi-coups (`WIN_ADJ_SCORE`), nulle à 400 demi-coups | au réseau N0 seulement : 0,50 % des adjugées finissaient autrement, jouées au bout (n° 7) ; l'échelle a changé depuis (F-0008) | inconnue | à resonder avant la génération suivante (B-0024) |

## F-0010 — Les réglages ouverts de la recherche : chaque valeur, sa borne mesurée, sa marge, son prochain test

> statut : mesuré · preuve : J-2026-11-23-S, J-2026-11-18-B, J-2026-11-18-H, J-2026-11-18-X, J-2026-11-18-Y, J-2026-11-18-AH, J-2026-11-18-AI, J-2026-11-18-AJ, J-2026-11-18-R, J-2026-11-18-BM, J-2026-11-18-BO · source : la section « Les réglages ouverts » de `tools/README.md`, les verdicts du n° 23, du 2 au 5 nov. 2026, ceux du temps, C21 à C26, et ceux de la table et du ponder, en septembre · date : 2026-11-18

Mêmes conventions que F-0009, sauf la cadence nommée. Le facteur des
marges du réseau : F-0008. Chaque verdict est au journal, sous les
preuves de ce fait.

| réglage | valeur | ce qui la borne | marge | ensuite |
|---|---|---|---|---|
| marges et constantes | à la main, au facteur du réseau | une par une, à leur verdict | +30 à +134 publiés ailleurs, auto-déclarés | SPSA (B-0017), refait à chaque réseau |
| seuil de l'élagage par compte (`LMP_BASE`) | `6 + d²` | 6 : +22,85 ± 9,88 (C17, H1) ; 12 : +17,24 ± 8,51, H1 non retenu (sept. 2026, base d'avant le réseau) | inconnue | un changement d'une constante ; SPSA |
| diviseur de la note de la LMR | 6 000 | 4 000 −2,57, 9 000 −7,20 ; le décalage ± 2 000 plat (± 3,0) | ~0 à +2 | le diviseur par profondeur, le papillon double, à l'écran ; puis SPSA |
| bonus de la LMR aux nœuds de coupure | 2 plis | contre la base sans bonus, 1 pli +3,29, 2 plis +5,06 ; 3 plis contre 2 −0,09 (± 3,1) | ~0 à +2 | SPSA |
| relâchement de la LMR en variante principale | aucun | quatre formes sans gain démontré : la plus haute +2,79 ± 3,09 (C65) ; sur la base actuelle +1,61 ± 2,23 (C74) | ~0 à +2 | déprioritisé |
| marge singulière (`SINGULAR_MARGIN`) | 10·d, dès la profondeur 8 | sans extension contre 10·d +10,66 ± 3,43 (C41) et 20·d +1,13 (C41b), soit 20·d ~−9,5 ; 5·d contre 10·d +2,69 ± 3,41 (C44) ; livre de 500, N2L | ~0 à +3 vers 5·d | rouvrable au livre de 15 000 ; SPSA |
| historique de correction | poids de Stockfish 17.1 | × 1,5 −5,96 ± 3,09 ; mi-poids +11,26 contre +14,22 au plein | ~0 à +2 | × 0,75 et × 1,25 ; chaque table retirée ; SPSA |
| gravité de l'historique | plafonds 7 183 et 29 952, bonus `clamp(336·d − 547, 1, 1561)` | bonus × 0,5 −5,03, × 2 +2,48 (± 3,0) | quelques Elo | SPSA avec le diviseur ; papillon contre continuations |
| diviseur de la pendule (`MOVES_TO_GO_DEFAUT`) | 12 | 30 → 12 +19,13 ± 6,31 (C21) ; 12 sature une allocation plate, 10 alloue moins | ~0 : saturé | une allocation inégale, pas un autre diviseur |
| douces par stabilité du coup (`SOFT_PERMILLE`) | 1 825, 885, 513, 257 ‰ | la règle +7,87 ± 6,08 contre C24 (C25) ; échelle calibrée au temps moyen de C24 | inconnue | SPSA |
| réserve avant un contrôle (`CONTROL_RESERVE_PERCENT`) | 50 % | correctif entré au titre de la règle : +2,43 ± 6,01, à `40/8` (C26) | inconnue | aucun test décidé |
| table (`DEFAULT_SIZE_MB`, seaux) | 64 Mio ; seaux de quatre, la moins utile cède (profondeur − 8 × âge) | la pression de 60+0,6, reproduite à 2 Mio, −19,42 ± 5,78 (C28) ; 16 → 64 Mio +2,90 ± 5,72 (C30) ; les seaux +30,13 ± 5,60 sous cette pression, +1,85 ± 5,51 au défaut (C29) | ~0 à `8+0,08` ; 40/15 reste sous pression | aucun test décidé |
| temps quand `Ponder` est permis | rien de plus | ponder d'un camp +67,63 ± 9,19 contre le jumeau, p = 0,659 ; il finissait à `2+0,02` avec 604 ms contre 283 | 16 à 28 Elo | B-0067 |

## F-0011 — La force absolue estimée du moteur : ~3 190 ± 24 au 9 nov. 2026, le sommet de l'échelle de Stockfish bridé

> statut : mesuré · preuve : J-2026-11-18-D, J-2026-11-18-AE · source : `force.yml`, run 42536770738, 300 parties à 60+0,6 contre Stockfish 16 bridé à 3100, relevées le 9 nov. 2026 (C13, « La phase 4 », au journal) · date : 2026-11-09

~3 190 ± 24 sur l'échelle `UCI_Elo` de Stockfish 16, ancrée à l'Elo CCRL
et ajustée à 60+0,6 : 62,7 % contre le niveau 3100, avec N9w50s800 et la
recherche du n° 23, binaire AVX2, sur un runner à deux cœurs physiques,
trois parties à la fois. Une estimation, pas un classement : l'adversaire
se trompe exprès, et cette échelle écrase les écarts (un changement se
mesure contre notre jumeau, jamais contre elle). 3 190 est son sommet :
reste une série au niveau 3190 (`force.yml`), puis la mesure se fait
contre des moteurs classés par la CCRL (`classes.yml`), au prochain
réseau embarqué (B-0014), par le skill `situer-le-moteur`. Chaque série
relevée met ce fait à jour, et le `README.md` n'en porte plus le chiffre.
Ce que cette échelle fait d'un écart : F-0012. Les séries d'avant, depuis l'évaluation faite
main (~2 630 ± 40), sont au journal, avec le `README.md` d'alors
(J-2026-11-18-D) et le protocole C13 qui les relevait (J-2026-11-18-AE).

## F-0012 — L'échelle de Stockfish bridé écrase les écarts : elle situe le moteur, elle ne mesure aucun changement

> statut : mesuré · preuve : J-2026-11-18-AE · source : les séries de `force.yml` du 29 sept. au 9 nov. 2026 (C13), et `src/search.cpp` de Stockfish 16 au tag `sf_16` · date : 2026-11-09

Stockfish bridé (`UCI_LimitStrength`) choisit son coup à profondeur fixe,
`1 + level` (8 à `UCI_Elo` 2600, 12 à 2850, 17 à 3100), puis joue par
moments un coup sous-optimal tiré au hasard : sa force ne dépend ni de la
cadence ni de la machine, la nôtre si, et un runner lent nous
sous-estime. Ce qu'il rend d'un écart mesuré contre notre jumeau, au
point : de 0,44 à 1,6 pour quatre réseaux, et deux autres sous le bruit
d'une série (−0,6 et ~5) ; 0,52 et 0,70 ± 0,66 pour deux gains de
recherche ou de vitesse ; de 0,13 à 1,2 pour trois mélanges ; et
+40 ± 42 pour six fois plus de temps, là où l'auto-jeu en promet ~250.
Aucun de ces points ne se sépare des autres : le facteur n'est pas
mesuré. Deux ponts entre les niveaux 2850 et 3100
s'accordent (+52 ± 48, −16 ± 45) : les séries se comparent d'un niveau à
l'autre. Une série de 300 parties tient ± 20 à ± 40 : elle situe le
moteur, elle ne départage pas deux réseaux voisins. D'où la règle de
`CLAUDE.md` : un changement se mesure contre notre jumeau.

## F-0013 — La quiescence ne teste pas la nulle après une parade tranquille : le correctif est écrit, arrêté par son critère

> statut : mesuré · preuve : J-2026-11-18-AG, J-2026-11-18-BU · source : C31, deux matchs de 3 000 parties à `8+0,08`, relevés le 30 sept. 2026 · date : 2026-09-30

`negamax` teste la nulle par règle à chaque nœud ; la quiescence ne la
teste pas, et une parade tranquille, en échec, peut atteindre le centième
demi-coup ou répéter une position du chemin : l'enfant est évalué comme
si la partie continuait. Signature : les avertissements « PV continues
after fifty-move rule » et « … after threefold repetition » côté
ShallowRed, environ un pour 1 000 parties à `8+0,08`. Le correctif, trois
tests et sept défauts injectés, est la rustine
`tools/attic/c31-nulle-quiescence.patch` : −2,43 ± 5,36 en commun, mais la
borne haute d'un des deux matchs à −0,27, d'où l'arrêt par le critère d'un
correctif de règle. Il n'est pas démontré coûteux. Le remesurer demande
un fait technique neuf, jamais une seconde chance. Les échecs tranquilles
en quiescence (C51, −10,77 ± 3,40) traversaient ces nulles, treize fois
plus d'avertissements que la référence ; leur régression vient de l'arbre
(+30,7 %), ce que la cécité leur coûte n'est pas mesuré, et ils ne se
rouvrent qu'avec la nulle en quiescence, mesurés ensemble.

## F-0014 — La relation de budget : parties × Elo ≈ 59 256 sur dix-huit SPRT, et elle tient aux deux cadences mesurées

> statut : mesuré · preuve : J-2026-11-18-AV · source : les dix-huit SPRT du projet jusqu'au 22 sept. 2026, `parties × Elo` de chacun · date : 2026-09-22

`parties × Elo` vaut 59 256 en médiane sur dix-huit SPRT, de 45 933 à
80 178 : un budget estimé se lit à ± 50 %. Elle ne suit pas la cadence,
à `1+0,01` et `8+0,08` : quatre techniques mesurées aux deux rendent des
rapports de 0,85 à 1,12, quand leur Elo change d'un facteur 2,5 et
parfois de signe. Réserve : seule l'une des quatre paires, le retrait de
l'aspiration (1,04), est un contrôle apparié, les autres changeant de base
entre les deux mesures ; et deux cadences ne disent rien d'une
troisième. Elle dimensionne un match par l'Elo attendu à SA
cadence ; tiré d'un verdict à `1+0,01`, ce budget n'est qu'un majorant.
Elle ne vaut pas pour un SPRT coupé par le plafond, dont l'effectif n'est
pas choisi par l'effet.

## F-0015 — Doubler le temps vaut +107,7 ± 8,2 Elo et +1,38 ± 0,28 pli à 8+0,08 : un pli vaut 60 à 105 Elo

> statut : mesuré · preuve : J-2026-11-18-T, J-2026-09-22-F · source : l'étalon du 24 sept. 2026, `16+0,16` contre `8+0,08`, deux matchs sur runner et une sonde des plis ; `CLAUDE.md`, « Ce qui compte comme preuve », jusqu'au 23 nov. 2026 · date : 2026-09-24

L'unité commune des chantiers est le pli : un gain de vitesse ou de temps
s'y convertit, 1,36 pli par doublement de temps en conteneur, stable sur
quatre doublements (J-2026-09-22-F). L'étalon les convertit en Elo :
`16+0,16` contre `8+0,08`, exactement un doublement, rend +107,7 ± 8,2 Elo
et +1,38 ± 0,28 pli, soit 60 à 105 Elo par pli, bornes croisées.
L'incertitude vient presque toute des plis (± 20 %). Le binaire de base et
le livre de 500 d'alors : un étalon d'avant le 6 oct. 2026 (ADR-0031).

## F-0016 — Ce qu'un job de match.yml tient selon la cadence

> statut : mesuré · preuve : J-2026-11-24-A, J-2026-11-23-E, J-2026-11-23-H, fichier:.github/workflows/match.yml · source : `tools/README.md` jusqu'au 24 nov. 2026, les verdicts du n° 23 · date : 2026-11-06

À `8+0,08`, concurrence 3, depuis C21 : 6,4 à 7,25 s par partie, 2 900 à
3 200 parties sous le plafond de 350 minutes. À longueur fixe, un job rend
± 6 à 8 Elo, quatre jobs (11 200 parties) ± 3,1 à 4,0, en 1/√n ; un SPRT
d'un job tranche ~20 Elo et plus (F-0014). À `30+0,3`, en demander 700
(~740 à 830, déduit, jamais remesuré). `force.yml` : 300 parties à
60+0,6. Profondeur médiane d'une recherche à froid sur douze positions de
parties, binaire de septembre : 8,5, 12,5 et 17 à `1+0,01`, `8+0,08` et
`30+0,3` ; en partie, elle se mesure par la sonde.

## F-0017 — Les runners changent de modèle d'un job à l'autre

> statut : mesuré · preuve : J-2026-11-23-J, J-2026-11-23-H, J-2026-11-18-J, J-2026-11-18-AE · source : les étalonnages de `match.yml` et `force.yml`, sept. à nov. 2026 · date : 2026-11-06

EPYC 7763, 9V74 et 9V45, Xeon 8370C et 6973P-C ; deux cœurs physiques,
deux fils par cœur. Au binaire de septembre, sans réseau : 2,02 à 4,06 M
n/s au banc la même nuit, profondeur 10 à 12 en 250 ms. Avec le réseau,
octobre et novembre : 1,57 à 3,04 M n/s, profondeur 13 à 16. Un match sur
un seul modèle peut s'écarter (N5l : +43 sur un 9V45, +26 sur trois 7763).
Des n/s ne se comparent qu'au même binaire.

## F-0018 — Le livre de 15 000 ouvertures tient jusqu'à soixante jobs

> statut : mesuré · preuve : J-2026-10-06-F, J-2026-11-23-J · source : `tools/README.md` jusqu'au 24 nov. 2026 · date : 2026-10-06

`tools/book.epd` (n° 11) : 15 000 positions, 8 demi-coups, ≤ 80
centièmes, tirées au code d'`ab44f2a`. Un job en tire 1 500 distinctes ;
la variance d'une mise en commun reste sous ~× 1,15 jusqu'à soixante jobs
(× 6,4 avec le livre de 500) : la condition d'ADR-0034. Au-delà, un livre
plus grand.

## F-0019 — Le balayage de search.rs : 264 minutes sur 350 le 17 nov. 2026

> statut : mesuré · preuve : J-2026-11-23-J, run 42767998423, run 44035126032 · source : les jobs « Mutation — search.rs », lus à l'API le 24 nov. 2026 · date : 2026-11-17

107 minutes le 6 oct., coupé à 180 le 12, la limite d'alors, passée depuis
à 350 ; 218 le 10 nov., 264 le 17. Il monte avec le fichier, sans alerte :
un job coupé rend un verdict illisible. Au-delà de ~300, le découper par
`cargo mutants --shard` (B-0075, que Théo applique).

## F-0020 — La machine qui entraîne : celle de Théo, RTX 3050, CUDA plafonné à 13.2

> statut : mesuré · preuve : J-2026-09-28-B, J-2026-10-22-B, fichier:tools/seance-c3.sh · source : `tools/README.md`, « Entraîner un réseau », jusqu'au 24 nov. 2026 · date : 2026-09-28

Ubuntu, une RTX 3050 pour portable de 4 Go, pilote 595.91.07 : CUDA 13.2
au plus, que `nvidia-smi` rend. Un toolkit 13.4 était installé ; le 13.2,
posé à côté, a suffi. Bullet compile ses noyaux en PTX, que le pilote
recompile : qu'un pilote refuse un PTX plus récent que lui est la règle de
CUDA, non éprouvée ici. Un portable : le chargeur peut être débranché, et
le blocage de veille d'une séance ne couvre pas le capot rabattu, que
logind ignore par défaut (`LidSwitchIgnoreInhibited=yes`, lu, non
éprouvé). Tout sous `~/shallowred/` (consigne de Théo, 22 oct.) :
`chess/`, `donnees/<génération>`, `seances/<nom>`.

## F-0021 — La dispersion du rejeu : 4,7 % par tour apparié ; cent vingt tours séparent ~1 %

> statut : mesuré · preuve : J-2026-10-20-D, J-2026-10-20-E · source : `tools/README.md`, « Vérifier, et mesurer un temps », jusqu'au 24 nov. 2026 · date : 2026-10-20

Au rejeu (`tools/sonde-inference/rejeu.py`), dans le conteneur de
session, l'écart de temps entre deux binaires au même arbre varie de
4,7 % d'un tour apparié à l'autre : vingt tours ne résolvent que ~3 %.
Cent vingt rendent ± 0,9 à 1,0 % : le produit en AVX2, −5,09 %, IC −6,07
à −4,11 ; le cache des recalculs, +0,46 %, IC −0,42 à +1,34. Une autre
machine ou un autre réseau se remesure.
