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

## F-0005 — Les données d'entraînement gardées par GitHub expirent du 14 au 29 janv. 2027

> statut : mesuré · preuve : fichier:tools/README.md · source : relevé à l'API de GitHub le 6 nov. 2026, section « Ce qu'il faut surveiller » · date : 2026-11-06

Par génération, la date du dernier artefact : n° 18 le 14 janv., n° 20 le
18, sa suite le 19, n° 21 le 24, n° 22 le 29. Passé ces dates, la machine
de Théo porte la seule copie. Dire avant le 14 janv. ce qui sert encore
et ce qui se copie est le sujet B-0026 ; il attend l'adoption du socle,
mais se fait quoi qu'il en soit à partir du 15 déc. 2026.

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

> statut : mesuré · preuve : fichier:engine/src/search.rs · source : `CLAUDE.md`, « Invariants du moteur » et « Décisions structurantes » · date : 2026-10-14

Les marges de la recherche écrites en unités d'évaluation passent par
`scaled_margin`, multipliées par `NETWORK_MARGIN_PERCENT` / 100 quand un
réseau joue : 285, soit 2,85, depuis N5l (14 oct. 2026). Le facteur
appartient au réseau : N6r4, N7p4 et N8tw50s800 l'ont sondé dans la
plage. La sonde de N9w50s800 n'a pu être lue que contre N8tw50s800, les
journaux de la faite main de référence étant perdus : il ne s'y montre
pas plus fautif à aucune marge (`tools/README.md`, « La sonde de B8 de
N9w50s800 »). La faite main garde ses marges au bit près.
