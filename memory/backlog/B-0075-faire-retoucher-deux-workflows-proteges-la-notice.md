<!-- socle: couche=backlog zone=publique -->
# B-0075 — Retoucher deux workflows : la notice de durée de match.yml, le découpage du balayage de mutation

> statut : ouvert · origine : J-2026-11-23-J · priorité : haute · lu : backlog@32157239

Deux points de l'ancienne liste « Ce qu'il faut surveiller »
(J-2026-11-23-J) demandent de changer des fichiers de `.github/`. Ce
sujet les disait à faire par Théo, l'agent « n'écrivant pas » dans
`.github/` : c'était faux. Seuls `.github/workflows/socle.yml` et
`.github/CODEOWNERS` sont protégés (`.socle/policy.toml`, qui nomme aussi
un socle-mutation.yml absent du dépôt), et l'agent a modifié `match.yml` et
`mutation.yml` jusqu'au 2 nov. 2026 (J-2026-11-24-L). Le sujet revient à
l'agent.

- **La notice de `.github/workflows/match.yml`** dit encore que « les deux
  matchs historiques ont fait 25 % de plus » que l'estimation ; c'est faux
  depuis que les deux moteurs usent leur pendule (C21) : le même fichier
  écrit lui-même 0,97, ~7,25 s par partie. Au passage, le commentaire de
  sa sonde dit la vitesse des runners « de 22 à 58 % » : elle va du simple
  au double (F-0017). Deux changements de texte, sans effet sur les
  matchs.
- **Le découpage du balayage de `engine/src/search.rs`** par
  `cargo mutants --shard` quand son job approchera ~300 minutes de la
  limite de 350 — 264 minutes le 17 nov. 2026, 218 le 10 (F-0019) : c'est
  proche, d'où la priorité haute et la fin de l'attente de B-0044 (`CLAUDE.md`, « Sa durée ») : ni `.github/workflows/mutation.yml`
  ni `.github/mutation-verdict.sh`, qui lit un résumé par fichier, ne le
  savent faire. Un job coupé rend un résumé incomplet et un verdict
  illisible, pas une alerte. À écrire avant, éprouvé par
  `.github/mutation-verdict-test.sh`.

## Satisfait quand

- [ ] la notice de durée de `match.yml` dit ce que le fichier mesure, et le commentaire de sa sonde renvoie à F-0017
- [ ] le balayage sait découper un fichier en morceaux et sommer leurs survivants, éprouvé par l'auto-test du verdict
