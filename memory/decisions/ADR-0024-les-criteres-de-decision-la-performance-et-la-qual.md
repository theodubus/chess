<!-- socle: couche=decisions zone=publique -->
# ADR-0024 — Les critères de décision : la performance et la qualité à long terme ; Claude écrit le code, Théo arbitre

> statut : acceptée · date : 2026-09-12 · lu : decisions@91f51b6e

## Contexte

Décision de Théo portée par l'état canonique du carnet de bord (rubrique « 01 — État canonique »), recopiée telle quelle dans la mémoire.

## Décision

**[Décision utilisateur]** 12 sept. 2026 — **les critères de décision sont la performance et la qualité à long terme.** Ni la rapidité de livraison, ni l'apprentissage de Rust. **Claude écrit le code**, Théo arbitre.

**Ce que cela implique concrètement :**

- Un arbitrage se tranche sur le plafond de performance et la maintenabilité, jamais sur « c'est plus rapide à faire ».
- La qualité à long terme signifie ici **maintenabilité par une session future** : invariants documentés, techniques non évidentes (magic bitboards, encodage des coups) expliquées en commentaire, tests écrits en même temps que le code. Ce n'est plus de la pédagogie, c'est de la survie du projet aux compactages.
- Aucune architecture ne doit fermer la porte à NNUE ni au multithread, même si ni l'un ni l'autre n'est implémenté avant longtemps.

## Conséquences

Le carnet n'en écrivait pas à part : elles sont dans la décision.
