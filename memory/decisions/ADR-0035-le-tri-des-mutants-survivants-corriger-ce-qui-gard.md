<!-- socle: couche=decisions zone=publique -->
# ADR-0035 — Le tri des mutants survivants : corriger ce qui garde les règles et les invariants, noter le reste

> statut : acceptée · date : 2026-09-15 · lu : decisions@a4b199fd

## Contexte

Décision de Théo sur le tri des survivants du balayage par mutation, prise au premier passage complet, quand 619 mutants sur 1 233 survivaient, et consignée au carnet (J-2026-09-15-C@9b039bb0). Portée jusqu'au 17 nov. 2026 par la section « Ce qui tourne tout seul » de `CLAUDE.md`, elle est posée ici quand cette section a été réduite à ses règles, au cinquième lot du déplacement du carnet (J-2026-11-17-Q@7509c51a).

## Décision

Théo, 15 sept. 2026, tel que le carnet le rapporte : un survivant qui touche aux règles du jeu ou aux invariants de recherche se corrige au fil. Un survivant qui porte sur la force de jeu (une valeur d'évaluation, une marge d'élagage, l'ordre des coups) ne se corrige pas : le SPRT en juge déjà, et aucun test unitaire ne tranche à sa place. Le carnet n'en garde pas la citation mot pour mot.

## Conséquences

Ce qui ne se corrige pas se note dans le plafond de `.github/mutation-baseline.txt`, avec sa raison, jamais dans une liste de tâches : un rapport de mutation vieillit vite, ses numéros de ligne dérivent au premier commit.

Une nuance est venue depuis, sans rouvrir le tri : un survivant « de réglage » n'échappe aux tests que si rien de déterministe ne dépend du réglage. Un nombre de nœuds en dépend souvent, et quatre-vingt-dix-huit mutants d'`eval.rs` s'attrapaient ainsi (`CLAUDE.md`, « Pièges de mesure »).
