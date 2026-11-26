<!-- socle: couche=backlog zone=publique -->
# T-0004 — Passer CLAUDE.md dans AGENTS.md, budget à 65 000, les trois tests adaptés

> statut : ouvert · origine : J-2026-11-26-E · besoin : B-0082 · lu : backlog@b1503ac2

Un commit : le contenu de `CLAUDE.md` déplacé dans `AGENTS.md` par
`git mv`, pour garder son histoire ; `CLAUDE.md` réduit à l'import ; le
budget porté à 65 000 dans `.socle/guardrails.toml` (D-0029) ; les trois
tests et chaque renvoi du dépôt qui désigne les instructions par
`CLAUDE.md` mis à jour, `grep` faisant la liste.

## Fait quand

- [ ] `tools/verify.sh` passe, les trois tests lisant AGENTS.md
- [ ] `python3 .socle/socle check` passe, le budget d'AGENTS.md à 65 000
- [ ] une session neuve de Claude Code reçoit les instructions par l'import
