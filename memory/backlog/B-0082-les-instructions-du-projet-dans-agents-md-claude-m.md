<!-- socle: couche=backlog zone=publique -->
# B-0082 — Les instructions du projet dans AGENTS.md, CLAUDE.md réduit à son import

> statut : ouvert · origine : J-2026-11-26-E · lu : backlog@b1503ac2

Théo a validé D-0029 le 26 nov. 2026 : les instructions de travail du
projet passent dans un `AGENTS.md`, lu par tout agent, et `CLAUDE.md` ne
garde que son import ; le budget d'AGENTS.md (`.socle/guardrails.toml`)
passe de 16 000 à 65 000 octets, et les trois tests qui lisent
`CLAUDE.md` par son nom (`engine/tests/bench_reference.rs`,
`engine/tests/pieges_fermes.rs`, `engine/tests/outillage_documente.rs`)
s'adaptent.

## Modèle de menace

Écrit le 26 nov. 2026 avec T-0004, après le code mais avant sa revue.

- **Le budget d'AGENTS.md (65 000 octets)** arrête la croissance des
  instructions au-delà de ce que Théo a validé, chaque octet se relisant
  à chaque session ; il laisse passer tout ce qui tient dessous, et ne dit
  rien de la qualité. Avec 64 788 octets au passage, la marge est de
  212 : une règle nouvelle en appelle une ancienne archivée au journal.
- **Le budget de `CLAUDE.md` (64 octets, baissé de 65 000)** arrête qu'une
  copie des instructions y revienne ; `instructions.source-unique` du
  socle l'arrête déjà, plus strictement (la seule ligne `@AGENTS.md`).
- **Les trois tests** arrêtent que le fichier d'instructions manque sans
  bruit : chacun des trois fichiers a un test qui tombe sans `AGENTS.md`
  (le parcours de la documentation l'exige, et le renvoi vers l'archive
  des pièges s'y lit ; la référence du banc et le nom de chaque
  dispositif se cherchent dans tous les documents du dépôt).
  `le_parcours_trouve_la_documentation_du_depot` exige aussi `CLAUDE.md` :
  c'est le seul test qui tombe s'il disparaît, ce que
  `instructions.source-unique` ne voit pas. Ils laissent passer un
  `CLAUDE.md` qui n'importerait plus `AGENTS.md` (le contrôle du socle le
  garde) et l'agent qui n'en chargerait aucun (rien ne le garde dans le
  dépôt : la session neuve le constate).
- **Relevé le 26 nov. 2026 à la revue de L-0002** (J-2026-11-26-M) :
  Codex lit par défaut 32 Kio d'instructions au plus, tous fichiers
  ensemble (`project_doc_max_bytes`, documentation d'OpenAI) ; le premier
  critère ne tient pour lui qu'avec `project_doc_max_bytes` à 65 536.
  Claude Code ne suit un import que sous le dossier où la session
  démarre : une session lancée dans `ui/` ou `engine/` ne reçoit plus
  `AGENTS.md` (lu dans le code de Claude Code 2.1.332 par le relecteur,
  jamais vu).

## Satisfait quand

- [ ] un agent qui ne lit qu'AGENTS.md y trouve toutes les instructions du projet, et Claude Code les charge toujours par `CLAUDE.md`
- [x] les garde-fous qui lisaient les instructions les lisent là où elles sont, et le prouvent par un test qui échoue si elles n'y sont plus (J-2026-11-26-K)
