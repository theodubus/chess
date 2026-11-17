<!-- socle: couche=decisions zone=publique -->
# ADR-0002 — A2 : Monorepo ou deux dépôts séparés ? (Tranché — monorepo)

> statut : acceptée · date : 2026-09-12 · lu : decisions@f65b9383

## Contexte

Arbitrage A2 du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet.

**Argument.** Le découplage vient du protocole UCI, pas de la frontière de dépôt. Deux dépôts ne réduisent pas le couplage — ils compliquent le build : l'UI a besoin du binaire ou du `.wasm` à l'exécution. Monorepo → une étape de build. Deux dépôts → publier une release, télécharger un artefact, synchroniser les versions.

**L'asymétrie qui tranche.** Séparer plus tard coûte un `git subtree split`, historique préservé. Fusionner deux historiques plus tard coûte cher. La décision est réversible dans un sens et pas dans l'autre — **donc monorepo par défaut, en cas de doute**.

**Effet de A6.** Un monorepo = un seul `LICENSE` et une seule question de compatibilité à gérer. Si l'on voulait licencier `engine/` et `ui/` différemment, deux dépôts seraient plus lisibles — à signaler si c'est un souhait.

**Ce qui reste à arbitrer.** Publier le moteur comme crate indépendante sur crates.io ? Même dans ce cas, un monorepo peut publier depuis un sous-dossier ; ce n'est donc pas un argument décisif.

## Décision

**Décision.** **[Décision utilisateur]** **12 sept. 2026 — monorepo** : `engine/`, `ui/`, `tools/` dans `theodubus/chess`.

## Conséquences

**Réouvrir si.** Le moteur devenait un produit distribué séparément avec son propre cycle de release. Coût de la sortie : un `git subtree split`.
