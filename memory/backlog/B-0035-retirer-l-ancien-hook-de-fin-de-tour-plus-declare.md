<!-- socle: couche=backlog zone=publique -->
# B-0035 — Retirer l'ancien hook de fin de tour, plus déclaré

> statut : ouvert · origine : J-2026-11-13-C · priorité : basse · après : B-0034 · lu : backlog@8b95067e

Après le geste de Théo (B-0034), `.claude/hooks/verify-on-stop.sh` n'est
plus déclaré : le hook de fin de tour du socle lance les mêmes étapes. Le
script reste, et `tools/verify-hooks.sh` l'éprouve encore. Le retirer
change deux cas de ce test, qui vérifient que les scripts de hook sont
exécutables et que leur syntaxe est correcte, et en retire un : celui qui
vérifie que le hook se tait, ou agit, selon les `.rs` modifiés. Retirer
un test demande l'accord de Théo (politique, point 2) : D-0009 ne couvre
que les deux blocs de `.claude/settings.json` et les cas qui en dépendent.

## Fait quand

- [ ] Théo a dit s'il retire le script
- [ ] le script et ses cas sont retirés, ou le sujet est abandonné sur sa réponse
