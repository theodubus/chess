<!-- socle: couche=canonique zone=publique -->
# Mémoire canonique

L'état vérifié du projet : un fait par entrée, avec son statut et sa preuve.
Un fait ne change qu'avec une référence de preuve nouvelle ; réfuté, il est
barré et conservé. Lue à chaque session : elle reste sous son budget, et ce
qui n'a plus à être lu à chaque fois s'archive dans le journal.

## F-0001 — Le projet se construit avec cargo (Rust)

> statut : mesuré · preuve : fichier:Cargo.toml · source : audit d'initialisation · date : 2026-11-11

## F-0002 — Le dépôt a 392 fonction(s) de test, dans 21 fichier(s), dont `engine/src/bench.rs`

> statut : mesuré · preuve : fichier:engine/src/bench.rs · source : audit d'initialisation · date : 2026-11-11

## F-0003 — Workflows GitHub du projet, qui jugent un push de branche ou une pull request : 4 (`ci.yml`, `nnue-train.yml`, `pages.yml`, `ui.yml`) ; autres (à la main, planifiés, autre événement) : 7 (`classes.yml`, `force.yml`, `match.yml`, `mutation.yml`, `nnue-datagen.yml`, `nnue-validation.yml`, `spsa.yml`)

> statut : mesuré · preuve : fichier:.github/workflows/ci.yml · source : audit d'initialisation · date : 2026-11-11

## F-0004 — Le dépôt a un README

> statut : mesuré · preuve : fichier:README.md · source : audit d'initialisation · date : 2026-11-11

## F-0005 — Les données d'entraînement gardées par GitHub expirent du 24 déc. 2026 au 29 janv. 2027

> statut : mesuré · preuve : J-2026-11-17-AG · source : relevé à l'API de GitHub le 17 nov. 2026, workflow `nnue-datagen.yml` · date : 2026-11-17

Par génération, la date du dernier artefact : la première vague d'A21
le 24 déc. 2026, la vague au réseau du 29 sept. le 28 déc., le n° 13 le
5 janv. 2027, puis le n° 18 le 14 janv., le n° 20 le 18, sa suite le 19,
le n° 21 le 24, le n° 22 le 29. Passé ces dates, la machine de Théo porte
la seule copie. Dire avant chacune ce qui sert encore et ce qui se copie
est le sujet B-0026 ; il attend la mise à jour du socle, sauf si son
échéance approche (D-0016). Le relevé du 6 nov. ne comptait que les
générations n° 18 à n° 22 (J-2026-11-17-AG).

## F-0006 — Les six positions perft de référence ont été vérifiées deux fois indépendamment, et engine/tests/perft.rs les exige

> statut : mesuré · preuve : fichier:engine/tests/perft.rs · source : état canonique du carnet, « Acquis solide unique », et sa rubrique perft (J-2026-11-17-B) · date : 2026-09-12

Le 12 sept. 2026, les six positions perft de référence ont été vérifiées
deux fois, indépendamment : 26 valeurs par python-chess 1.10.0, avec un
aller-retour exact de chaque FEN, puis les profondeurs 5 et 6 par
`cozy-chess`. Aucune divergence avec les valeurs publiées. Le test
`engine/tests/perft.rs` exige ces valeurs, avec l'aller-retour des six
FEN ; c'est le seul juge de la génération de coups.

## F-0007 — L'évaluation qui joue est le réseau embarqué N9w50s800, depuis le 22 oct. 2026

> statut : mesuré · preuve : fichier:engine/src/nnue.rs · source : `CLAUDE.md`, « Décisions structurantes », jusqu'au 17 nov. 2026 · date : 2026-10-22

Le binaire embarque `reseaux/n9w50s800-768x4hm-256-s8-800.bin` (constante
`EMBEDDED` d'`engine/src/nnue.rs`) : `(768 × 4 → 256) × 2 → 1`, quatre
seaux de roi en miroir, huit seaux de sortie, appris sur 3,71 G positions
étiquetées par N6r4. Il a battu N8tw50s800 de +5,18 ± 3,29 Elo sur
11 200 parties à `8+0,08` (`tools/README.md`, n° 20, séance C1).
L'évaluation faite main reste (`EvalFile <none>`) : c'est elle
qu'évaluent le banc et les tests de recherche, pas celle qui joue. Les
réseaux qui l'ont précédé sont au journal, avec les quatre premières
sections de `CLAUDE.md` d'avant le 17 nov. (J-2026-11-17-N).

## F-0008 — Le facteur des marges du réseau qui joue vaut 2,85

> statut : mesuré · preuve : fichier:engine/src/search.rs, J-2026-11-17-X · source : `CLAUDE.md`, « Invariants du moteur » et « Décisions structurantes » · date : 2026-10-14

L'aspiration et l'élagage delta passent par `scaled_margin`, multipliés
par `NETWORK_MARGIN_PERCENT` / 100 quand un réseau joue : 285, soit 2,85,
depuis N5l (14 oct. 2026). La futilité et la marge singulière, mesurées au
réseau, passent par `network_margin` ; la futilité inverse ne passe par
aucune des deux. Le facteur
appartient au réseau : N6r4, N7p4 et N8tw50s800 l'ont sondé dans la
plage. La sonde de N9w50s800 n'a pu être lue que contre N8tw50s800, les
journaux de la faite main de référence étant perdus : il ne s'y montre
pas plus fautif à aucune marge (`tools/README.md`, « La sonde de B8 de
N9w50s800 »). La faite main garde ses marges au bit près.

## F-0009 — Les réglages ouverts du réseau : chaque valeur, sa borne mesurée, sa marge, son prochain test

> statut : mesuré · preuve : J-2026-11-18-B · source : la section « Les réglages ouverts » de `tools/README.md`, les verdicts du 21 oct. au 10 nov. 2026 · date : 2026-11-18

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
| étiqueteur | N9w50s800, 2 500 nœuds | 2 500 contre 5 000 +5,77 ± 3,34 ; 10 000 −7,38 à temps égal | jusqu'à ~+9 au doublement | 1 250 nœuds (B-0023) |
| largeur | 256 ; 512 au candidat | 384 +24,86, 512 +32,57 contre 256 (± 3,3) | +3 à +8 au pas suivant | B-0012, puis B-0022 |
| seaux de roi | 4 ; 10 au candidat | 10 contre 4 +14,77 ± 3,27 à 11,35 G | +5 à +10 vers 16 | B-0020 |
| seaux de sortie | 8, selon le matériel | 1 contre 8 seulement | inconnue | B-0066 |
| couches cachées | aucune | jamais | inconnue | B-0021 |
| ouvertures du générateur | 8 à 11 demi-coups au hasard | jamais | inconnue | B-0059 |
| seuil des ouvertures | 1 000 (`OPENING_MAX_SCORE`) | jamais en force ; son taux suit l'étiqueteur, 21 % sous N9w50s800 | inconnue | avec B-0059 ; jamais en cours de tranche |

## F-0010 — Les réglages ouverts de la recherche : chaque valeur, sa borne mesurée, sa marge, son prochain test

> statut : mesuré · preuve : J-2026-11-18-B, J-2026-11-18-H, J-2026-11-18-X, J-2026-11-18-Y · source : la section « Les réglages ouverts » de `tools/README.md`, les verdicts du n° 23, du 2 au 5 nov. 2026, et ceux du temps, C21 à C26, en septembre · date : 2026-11-18

Mêmes conventions que F-0009, sauf la cadence nommée. Le facteur des
marges du réseau : F-0008. Les verdicts du temps, de C21 à C26, sont au
journal (J-2026-11-18-H, J-2026-11-18-X, J-2026-11-18-Y).

| réglage | valeur | ce qui la borne | marge | ensuite |
|---|---|---|---|---|
| marges et constantes | à la main, au facteur du réseau | une par une, à leur verdict | +30 à +134 publiés ailleurs, auto-déclarés | SPSA (B-0017), refait à chaque réseau |
| diviseur de la note de la LMR | 6 000 | 4 000 −2,57, 9 000 −7,20 ; le décalage ± 2 000 plat (± 3,0) | ~0 à +2 | le diviseur par profondeur, le papillon double, à l'écran ; puis SPSA |
| bonus de la LMR aux nœuds de coupure | 2 plis | contre la base sans bonus, 1 pli +3,29, 2 plis +5,06 ; 3 plis contre 2 −0,09 (± 3,1) | ~0 à +2 | SPSA |
| relâchement de la LMR en variante principale | aucun | quatre formes sans gain démontré : la plus haute +2,79 ± 3,09 (C65) ; sur la base actuelle +1,61 ± 2,23 (C74) | ~0 à +2 | déprioritisé |
| historique de correction | poids de Stockfish 17.1 | × 1,5 −5,96 ± 3,09 ; mi-poids +11,26 contre +14,22 au plein | ~0 à +2 | × 0,75 et × 1,25 ; chaque table retirée ; SPSA |
| gravité de l'historique | plafonds 7 183 et 29 952, bonus `clamp(336·d − 547, 1, 1561)` | bonus × 0,5 −5,03, × 2 +2,48 (± 3,0) | quelques Elo | SPSA avec le diviseur ; papillon contre continuations |
| diviseur de la pendule (`MOVES_TO_GO_DEFAUT`) | 12 | 30 → 12 +19,13 ± 6,31 (C21) ; 12 sature une allocation plate, 10 alloue moins | ~0 : saturé | une allocation inégale, pas un autre diviseur |
| douces par stabilité du coup (`SOFT_PERMILLE`) | 1 825, 885, 513, 257 ‰ | la règle +7,87 ± 6,08 contre C24 (C25) ; échelle calibrée au temps moyen de C24 | inconnue | SPSA |
| réserve avant un contrôle (`CONTROL_RESERVE_PERCENT`) | 50 % | correctif entré au titre de la règle : +2,43 ± 6,01, à `40/8` (C26) | inconnue | aucun test décidé |

## F-0011 — La force absolue estimée du moteur : ~3 190 ± 24 au 9 nov. 2026, le sommet de l'échelle de Stockfish bridé

> statut : mesuré · preuve : J-2026-11-18-D · source : `force.yml`, run 42536770738, 300 parties à 60+0,6 contre Stockfish 16 bridé à 3100, relevées le 9 nov. 2026 (`tools/README.md`, C13, « La phase 4 ») · date : 2026-11-09

~3 190 ± 24 sur l'échelle `UCI_Elo` de Stockfish 16, ancrée à l'Elo CCRL
et ajustée à 60+0,6 : 62,7 % contre le niveau 3100, avec N9w50s800 et la
recherche du n° 23, binaire AVX2, sur un runner à deux cœurs physiques,
trois parties à la fois. Une estimation, pas un classement : l'adversaire
se trompe exprès, et cette échelle écrase les écarts (un changement se
mesure contre notre jumeau, jamais contre elle). 3 190 est son sommet :
reste une série au niveau 3190 (`force.yml`), puis la mesure se fait
contre des moteurs classés par la CCRL (`classes.yml`), au prochain
réseau embarqué (B-0014). Chaque série relevée met ce fait à jour, plus le
`README.md`. Les séries d'avant, depuis l'évaluation faite
main (~2 630 ± 40), sont au journal avec le `README.md` d'alors
(J-2026-11-18-D).
