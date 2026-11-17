<!-- socle: couche=decisions zone=publique -->
# ADR-0008 — A7 : Écrire le générateur de coups, ou prendre une bibliothèque ? (Tranché — cozy-chess)

> statut : acceptée · date : 2026-09-13 · lu : decisions@d983c4f0

## Contexte

Arbitrage A7 du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet. Entrées de la mémoire lues pour le faire : J-2026-09-12-E@27b55bef.

**Pourquoi c'est ici.** Le brief ne tranche pas et se contredit implicitement : sa roadmap consacre trois étapes sur huit à écrire un générateur, tandis que son tableau de licences présente `shakmaty` et `cozy-chess` comme des dépendances candidates. Les deux chemins n'ont pas le même projet au bout. C'est le seul arbitrage du projet qui ne soit pas quasi-évident.

**Critères applicables.** **Performance et qualité à long terme, Claude écrivant le code.** Ni rapidité de livraison, ni apprentissage — ces deux arguments sont morts (J-2026-09-12-E). Il ne reste qu'une question : **une bibliothèque plafonne-t-elle la performance à long terme ?**

**Arguments réfutés par la mesure.** Trois « portes fermées » avaient été avancées le 12 sept. 2026 sur la foi du raisonnement seul. La sonde exécutée le même jour (`cozy-chess 0.3.4`, `shakmaty 0.30.0`, lecture des sources + exécution) les a confrontées :

| Argument avancé | Verdict | Preuve |
| --- | --- | --- |
| Ferme le point d'accroche NNUE | **Dégradé** | `unmake` absent des deux bibliothèques, champs de `Board` privés → copy-make forcé. **Mais NNUE reste possible** : pile d'accumulateurs par ply, delta dérivé de `(board, mv)` par l'API publique. |
| Interdit la génération par étapes | **Réfuté** | `generate_moves_for(mask, listener)` existe, le listener renvoie `bool` pour arrêt anticipé, `PieceMoves.to` est un `BitBoard` public → filtrer les captures coûte **un AND par pièce**. Mesuré : kiwipete, 48 coups → 8 captures. |
| Impose un type de coup trop gros | **Réfuté** | `cozy_chess::Move` = **3 octets** ; `shakmaty::Move` = 5. Non-problème. |

**Le chiffre qui tranche.** **[Mesure]** `cozy-chess` soutient **47 M nœuds/s** en perft copy-make (chaque feuille réellement jouée), soit ~21 ns par nœud, sur un Xeon 2,8 GHz en `--release` sans `target-cpu=native` ni feature `pext`. **[Inférence]** Un nœud de recherche complet (sonde TT, ordonnancement, évaluation) coûte 200 ns à 1 µs, soit 1 à 5 M nœuds/s par thread. **Le générateur pèse donc 2 à 10 % du coût d'un nœud.** Un générateur maison deux fois plus rapide — improbable, `cozy-chess` implémente déjà les magic bitboards à décalage fixe avec variante PEXT — achèterait 1 à 5 % du temps de recherche. **L'argument de performance ne survit pas.**

**Recommandation.** **[Recommandation]** **`cozy-chess` comme dépendance du moteur.** Renversement de la recommandation précédente, motivé par la mesure et non par un changement d'avis. **Confiance : élevée** sur le volet performance (mesuré), **moyenne** sur l'appel global — la qualité à long terme reste en partie un jugement.

**Ce que ça coûte.**

- **A5 doit être amendé** — copy-make est forcé. Voir A5.
- **Roque en notation roi-prend-tour** — vérifié empiriquement : `cozy-chess` produit `e1h1`/`e1a1`, pas `e1g1`/`e1c1` (support Chess960). Conversion obligatoire à la frontière UCI ; `cozy_chess::util` fournit les helpers. Source classique de bug si oublié.
- **Tables d'attaque cavalier, roi et pion non publiques** — seuls `get_rook_moves(sq, blockers)` et `get_bishop_moves(sq, blockers)` le sont. La partie chère (magiques à glissement avec blockers, ce dont SEE et la mobilité ont besoin) est exposée ; restent ~60 lignes de tables `const` triviales à écrire.
- **Delta NNUE calculé à l'extérieur** du `make`, donc travail dupliqué dans la boucle chaude. Coût estimé faible, et **~2500 Elo ne demande pas NNUE** : une évaluation écrite à la main dépasse largement cette cible.

**Ce qui n'est PAS retenu.** La variante « écrire la recherche contre l'API puis substituer son propre générateur derrière un trait d'abstraction » reste écartée. On utilise `cozy-chess` **directement**, sans couche. Si un remplacement devient nécessaire, ce sera un vrai refactor — accepté, et borné par perft.

## Décision

**Décision.** **[Décision utilisateur]** **13 sept. 2026 — `cozy-chess`**, en dépendance directe du moteur. C4, C5 et C6 deviennent sans objet ; A5 est amendé en copy-make ; A10 perd son objet.

## Conséquences

**Appliqué.** Commit `1ca6b7d`. La conversion du roque est faite à la frontière UCI et verrouillée par un test d'intégration dans les deux sens. Les tables d'attaque cavalier, roi et pion restent à écrire le jour où l'évaluation en aura besoin — `get_rook_moves` et `get_bishop_moves`, la partie chère, sont publiques.

**Réouvrir si.** **[Décision utilisateur]** **Réexamen programmé à B4** (Théo, 13 sept. 2026) : mesurer alors si le delta NNUE calculé à l'extérieur du `make` et le copy-make coûtent plus que quelques pourcents du temps de recherche. **Avec un benchmark, pas un argument** — c'est la seule condition de réouverture.
