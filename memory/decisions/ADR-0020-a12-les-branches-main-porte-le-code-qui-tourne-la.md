<!-- socle: couche=decisions zone=publique -->
# ADR-0020 — A12 : Les branches, main porte le code qui tourne, la fusion passe par une pull request à CI verte

> statut : acceptée · date : 2026-09-14 · lu : decisions@5fdfd716

## Contexte

Arbitrage A12 du carnet de bord, porté par la liste des décisions structurantes de son état canonique (rubrique « 01 — État canonique ») et absent de sa rubrique des arbitrages : recopié tel quel dans la mémoire. Entrée de la mémoire lue pour le dater : J-2026-09-13-B@bd0ca5db.

## Décision

**A12 — branches : `main` porte le code qui tourne**, le développement se fait sur des branches à côté et y est fusionné une fois vert. `main` est la branche par défaut du dépôt depuis le 13 sept. 2026. **Amendé le 14 sept. 2026** : Théo a posé un ruleset sur `main`, et il est **[Fait vérifié]** **vérifié au contact** — un push direct est refusé par GitHub (`Changes must be made through a pull request.`). **La fusion passe donc par une PR à CI verte** : pousser la branche, ouvrir la PR, attendre le run sur *la tête de la branche*, fusionner. Une session future qui verrait ce refus ne doit pas le prendre pour une panne.

## Conséquences

Le carnet n'en écrivait pas à part : elles sont dans la décision.
