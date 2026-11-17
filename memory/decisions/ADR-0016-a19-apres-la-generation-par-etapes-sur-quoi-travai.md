<!-- socle: couche=decisions zone=publique -->
# ADR-0016 — A19 : Après la génération par étapes, sur quoi travailler ? (Tranché — l'allocation inégale)

> statut : acceptée · date : 2026-09-24 · lu : decisions@1b7185f8

## Contexte

Arbitrage A19 du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet.

## Décision

**Décision.** **[Décision utilisateur]** Théo, 24 sept. 2026 vers 09 h, entre quatre candidats chiffrés — allocation inégale, raffinements d'ordonnancement sur les étages, NNUE, remboursement du ponder : *« Ok pour 1, on oublie pas le reste mais d'abord 1 »*. Les trois autres gardent leur place au backlog.

## Conséquences

**Pourquoi elle.** **[Recommandation]** suivie : elle se chiffre vite, par un écran de son mécanisme, avant tout engagement, et elle sert dans toutes les conditions de jeu. NNUE était présenté comme le vrai levier à long terme, qui demande un accord explicite sur son ampleur.

**Une précision qui doit survivre.** **[Décision utilisateur]** **Un autre agent, Codex, travaille sur l'interface en parallèle**, sur ses propres branches (`codex/…`) et leurs PR : c'est normal, ça ne touche qu'à `ui/`. Ne pas les prendre pour des anomalies, ni les fusionner ou les nettoyer. Inscrit dans `CLAUDE.md`, section Structure.

**Où c'est écrit au dépôt.** En tête de « Ce qui reste à faire, par ordre mesuré » de `tools/README.md` (commit `7fc5959`), et sur la ligne du chantier.
