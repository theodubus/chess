<!-- socle: couche=backlog zone=publique -->
# T-0004 — Passer CLAUDE.md dans AGENTS.md, budget à 65 000, les trois tests adaptés

> statut : ouvert · origine : J-2026-11-26-E · besoin : B-0082 · lu : backlog@b1503ac2

Un commit : le contenu de `CLAUDE.md` déplacé dans `AGENTS.md` par
`git mv`, pour garder son histoire ; `CLAUDE.md` réduit à l'import ; le
budget porté à 65 000 dans `.socle/guardrails.toml` (D-0029) ; les trois
tests et chaque renvoi du dépôt qui désigne les instructions par
`CLAUDE.md` mis à jour, `grep` faisant la liste.

**Relevé du 26 nov. 2026** (J-2026-11-26-J), à vérifier avant de s'y fier :

- **Le socle sait ce passage.** Son installeur renomme `CLAUDE.md` en
  `AGENTS.md` quand aucun fichier du projet ne nomme `CLAUDE.md`, et
  réduit `CLAUDE.md` à la seule ligne `@AGENTS.md` ; le contrôle
  `instructions.source-unique` l'exige alors, et le budget de démarrage
  relit `AGENTS.md`. Voir `.socle/engine/socle/installer.py`, fonction
  `_instructions`, et `.socle/engine/socle/checks_memory.py`.
- **Cent quarante fichiers nomment `CLAUDE.md`** hors du journal et de
  `ui/` (`git grep -l`). Ne changent pas : les rustines de `tools/attic/`
  (leur `git apply --check` est gardé par `engine/tests/rustines_attic.rs`),
  les décisions, les demandes, le journal, les entrées closes du backlog,
  les faits de `memory/canonical.md` (ajout seul), le moteur du socle, ni
  `ui/CLAUDE.md`, propre à `ui/`. Changent : les trois tests, les
  commentaires de `engine/src/` et de `tools/`, `tools/README.md`,
  `tools/pieges-fermes.md`, `tools/attic/README.md`, `README.md`, les
  workflows et `.github/mutation-baseline.txt`, les skills du projet (pas
  ceux du socle, protégés), `Cargo.toml`, `.gitignore`, les entrées
  ouvertes du backlog, et les renvois internes du fichier lui-même.
- Le budget de `CLAUDE.md` dans `.socle/guardrails.toml` devient sans
  objet : le baisser est libre, le retirer se juge d'abord par
  `python3 .socle/socle check`.

## Fait quand

- [ ] `tools/verify.sh` passe, les trois tests lisant AGENTS.md
- [ ] `python3 .socle/socle check` passe, le budget d'AGENTS.md à 65 000
- [ ] une session neuve de Claude Code reçoit les instructions par l'import
