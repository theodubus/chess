<!-- socle: couche=decisions zone=publique -->
# ADR-0021 — A13 : La toolchain Rust figée à une version exacte

> statut : acceptée · date : 2026-09-13 · lu : decisions@707b6735

## Contexte

Arbitrage A13 du carnet de bord, porté par la liste des décisions structurantes de son état canonique (rubrique « 01 — État canonique ») et absent de sa rubrique des arbitrages : recopié tel quel dans la mémoire. Entrée de la mémoire lue pour le dater : J-2026-09-13-C@44e7e779.

## Décision

**A13 — la toolchain Rust est figée à une version exacte** dans `rust-toolchain.toml`, jamais au canal `stable`. Avec un canal flottant, une nouvelle version de Rust ajoute un lint, `clippy -D warnings` le transforme en erreur, et la CI devient rouge sans qu'aucune ligne n'ait changé. Un job indicatif en `continue-on-error` signale les lints de la dernière stable sans bloquer.

## Conséquences

Le carnet n'en écrivait pas à part : elles sont dans la décision.
