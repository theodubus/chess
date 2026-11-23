<!-- socle: couche=backlog zone=publique -->
# B-0075 — Faire retoucher deux workflows protégés : la notice de durée de match.yml, le découpage du balayage de mutation

> statut : ouvert · origine : J-2026-11-23-J · après : B-0044 · priorité : basse · pour : humain · lu : backlog@32157239

Deux points de l'ancienne liste « Ce qu'il faut surveiller »
(J-2026-11-23-J) demandent de changer des fichiers de `.github/`, que
l'agent n'écrit pas : l'agent prépare chaque changement, Théo l'applique.

- **La notice de `.github/workflows/match.yml`** dit encore que « les deux
  matchs historiques ont fait 25 % de plus » que l'estimation ; c'est faux
  depuis que les deux moteurs usent leur pendule (C21) : le même fichier
  écrit lui-même 0,97, ~7,25 s par partie. Un changement de texte, sans
  effet sur les matchs.
- **Le découpage du balayage de `engine/src/search.rs`** par
  `cargo mutants --shard` quand son job approchera ~300 minutes de la
  limite de 350 (`CLAUDE.md`, « Sa durée ») : ni `.github/workflows/mutation.yml`
  ni `.github/mutation-verdict.sh`, qui lit un résumé par fichier, ne le
  savent faire. Un job coupé rend un résumé incomplet et un verdict
  illisible, pas une alerte. À écrire avant, éprouvé par
  `.github/mutation-verdict-test.sh`.

## Fait quand

- [ ] la notice de durée de `match.yml` dit ce que le fichier mesure
- [ ] le balayage sait découper un fichier en morceaux et sommer leurs survivants, éprouvé par l'auto-test du verdict
