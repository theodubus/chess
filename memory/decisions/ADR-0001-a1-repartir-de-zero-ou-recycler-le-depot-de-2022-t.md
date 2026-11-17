<!-- socle: couche=decisions zone=publique -->
# ADR-0001 — A1 : Repartir de zéro ou recycler le dépôt de 2022 ? (Tranché — nouveau code)

> statut : acceptée · date : 2026-09-12 · lu : decisions@e3b0c442

## Contexte

Arbitrage A1 du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet.

**Options.**

- **Nouveau dépôt** — `theodubus/chess`, archiver `theodubus/echecs`.
- **Migrer progressivement** l'ancien code.

**Argument.** Le goulot du moteur 2022 est la représentation (`dict["e4"] → Piece`), et elle est présente dans chaque fonction qui touche au plateau. **Il n'existe pas de chemin de migration incrémental** : changer de représentation revient à réécrire. Recycler fabriquerait en plus un historique où du Python de débutant se retrouve sous du Rust.

**Ce qui se transporte.** Pas du code — la connaissance des cas tordus (prise en passant combinée à un clouage, roque à travers une case attaquée, effets de bord de la promotion). Déjà convertie en invariants au §8, donc l'ancien dépôt n'est plus nécessaire à cette fin.

**Ce qui reste à arbitrer.** Rien de technique. Seulement l'hygiène : archiver `theodubus/echecs` sur GitHub (*Settings → Archive this repository*, plus une ligne au README pointant vers le nouveau projet) ou le laisser en l'état.

## Décision

**Décision.** **[Décision utilisateur]** **12 sept. 2026 — nouveau code.** Le moteur de 2022 n'est pas recyclé.

## Conséquences

**Reste à faire.** Archiver `theodubus/echecs` sur GitHub et y ajouter une ligne de README pointant vers le nouveau projet. Non fait à ce jour.

**Réouvrir si.** Un module de 2022 s'avérait réutilisable tel quel — improbable vu le diagnostic.
