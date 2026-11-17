<!-- socle: couche=decisions zone=publique -->
# ADR-0035 — Le tri des mutants survivants : corriger ce qui garde les règles et les invariants, noter le reste

> statut : acceptée · date : 2026-09-15 · lu : decisions@a4b199fd

## Contexte

Décision de Théo sur le tri des survivants du balayage par mutation, prise au premier passage complet, quand 619 mutants sur 1 233 survivaient, et consignée au carnet (J-2026-09-15-C@9b039bb0). Portée jusqu'au 17 nov. 2026 par la section « Ce qui tourne tout seul » de `CLAUDE.md`, elle est posée ici quand cette section a été réduite à ses règles, au cinquième lot du déplacement du carnet (J-2026-11-17-Q@7509c51a).

## Décision

Théo, 15 sept. 2026, tel que le carnet le rapporte : un survivant qui touche aux règles du jeu ou aux invariants de recherche se corrige au fil ; le reste se note. Le carnet n'en garde pas la citation mot pour mot.

La raison donnée alors pour le reste, un survivant qui porte sur la force de jeu (une valeur d'évaluation, une marge d'élagage, l'ordre des coups), était que le SPRT en juge déjà et qu'aucun test unitaire ne tranche à sa place. Cette raison s'est révélée trop large depuis, et la conséquence ci-dessous la corrige.

## Conséquences

Ce qui ne se corrige pas se note dans le plafond de `.github/mutation-baseline.txt`, avec sa raison, jamais dans une liste de tâches : un rapport de mutation vieillit vite, ses numéros de ligne dérivent au premier commit.

Le SPRT juge si un réglage rend le moteur plus fort, mais un réglage change aussi l'arbre, et un arbre se compte : quatre-vingt-dix-huit survivants d'`eval.rs`, notés comme affaire de SPRT, s'attrapaient par un simple nombre de nœuds (`CLAUDE.md`, « Pièges de mesure »). Avant de noter un survivant « de réglage », chercher donc ce qui dépend de lui de façon déterministe ; seul ce qu'aucun test déterministe n'atteint se note comme affaire de SPRT.
