<!-- socle: couche=decisions zone=publique -->
# ADR-0011 — A9 : Quelle bibliothèque d'échiquier côté UI ? (Résolu par cascade)

> statut : acceptée · date : 2026-09-12 · lu : decisions@86ad2223

## Contexte

Arbitrage A9 du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet.

**Résolution.** A6 ayant retenu le copyleft GPL-3.0, la contrainte qui écartait `chessground` disparaît. **[Recommandation]** **`chessground`** — c'est l'échiquier de Lichess, le plus abouti, et il n'y a plus de raison de s'en priver. `react-chessboard` reste un repli si l'intégration s'avère pénible hors écosystème Lichess.

**Reste à confirmer.** **[Limite connue]** La licence de `chessground` provient du brief et n'a pas été re-vérifiée à la source. Sans risque pour la décision : GPL-3.0 accommode toutes les licences du tableau §9. À confirmer mécaniquement au moment d'ajouter la dépendance (métadonnées npm).

**Contexte.** Le rendu, le drag & drop, la surbrillance des coups légaux, les prémouvements, le dialogue de promotion et les thèmes sont un problème déjà résolu — l'écrire soi-même n'apporte rien au projet. Les règles côté client (`chess.js`, BSD-2-Clause) restent nécessaires pour surligner et refuser un coup illégal sans aller-retour vers le moteur : cette duplication des règles est volontaire et correcte.

## Décision

**Décision.** **[Décision utilisateur]** **12 sept. 2026 — `chessground`**, par ratification de la cascade de A6. `chess.js` pour les règles côté client. Le choix du framework UI lui-même (React ou autre) reste à faire au moment d'attaquer `ui/`.

## Conséquences

Le carnet n'en écrivait pas.
