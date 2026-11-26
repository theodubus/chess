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

## Satisfait quand

- [ ] un agent qui ne lit qu'AGENTS.md y trouve toutes les instructions du projet, et Claude Code les charge toujours par `CLAUDE.md`
- [ ] les garde-fous qui lisaient les instructions les lisent là où elles sont, et le prouvent par un test qui échoue si elles n'y sont plus
