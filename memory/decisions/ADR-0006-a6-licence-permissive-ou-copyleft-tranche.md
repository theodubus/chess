<!-- socle: couche=decisions zone=publique -->
# ADR-0006 — A6 : Licence : permissive ou copyleft ? (Tranché)

> statut : acceptée · date : 2026-09-12 · lu : decisions@e94fb7ef

## Contexte

Arbitrage A6 du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet.

**Enjeu.** Le choix contamine tout ce qui suit et doit être fait au premier commit. Il détermine surtout quelles bibliothèques sont utilisables — c'est la vraie contrainte, pas une formalité.

**Options.**

- **Copyleft GPL-3.0** — donne accès à `chessground` (l'échiquier de Lichess, le plus abouti) et `shakmaty` (générateur Rust mûr). L'œuvre combinée doit alors être sous GPL.
- **Permissive (MIT)** — `react-chessboard` + `chess.js` côté UI, `cozy-chess` côté Rust. Toutes les options restent ouvertes, avec un échiquier un peu moins riche.

## Décision

**Décision.** **[Décision utilisateur]** **12 sept. 2026 — copyleft, famille GPL-3.0.**

## Conséquences

**Irréversibilité.** **Le retour au permissif devient impossible** dès qu'une dépendance GPL-3.0 est incorporée : on ne peut pas relicencier le code d'autrui, même en étant seul auteur du reste. C'est la seule irréversibilité dure du projet, et elle est acceptée.

**Cascade.** `chessground` et `shakmaty` deviennent utilisables. A9 est résolu. A7 gagne une option supplémentaire côté bibliothèque.

**Reste ouvert.** GPL-3.0 ou AGPL-3.0 — voir A6b.

**Note historique.** Le brief laissait la question ouverte dans sa section « Licences » mais écrivait `Licence : MIT` dans son prompt de démarrage. Cette contradiction est résolue : le prompt n'était pas une décision.
