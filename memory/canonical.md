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
