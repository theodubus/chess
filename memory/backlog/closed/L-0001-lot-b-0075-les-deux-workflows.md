<!-- socle: couche=backlog zone=publique -->
# L-0001 — Lot B-0075 : les deux workflows

> statut : fait · origine : J-2026-11-26-E · ref : J-2026-11-26-H · après : T-0002, T-0003 · lu : backlog@b1503ac2

Les deux retouches de `.github/` que B-0075 réunit : un texte périmé de
`.github/workflows/match.yml`, et le découpage du balayage de mutation,
qui touche `.github/workflows/mutation.yml`, `.github/mutation-verdict.sh`,
son auto-test et `engine/tests/couverture_mutation.rs`. Le second change
le garde-fou du cliquet de mutation : relecture sans contexte avant le
push.

## Revues

### Passe 1 — 2026-11-26

Commits : 70b365d..71046d2

- Ouvre : rien
