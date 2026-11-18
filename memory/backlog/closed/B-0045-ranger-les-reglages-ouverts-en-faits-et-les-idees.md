<!-- socle: couche=backlog zone=publique -->
# B-0045 — Ranger les réglages ouverts en faits, et les idées non décidées au backlog

> statut : fait · origine : D-0020 · ref : J-2026-11-18-B · lu : backlog@285016e5

Premier lot de la transition (D-0020). Les réglages ouverts, aujourd'hui
dans `tools/README.md`, deviennent deux faits de `memory/canonical.md`
(réseau, recherche), une ligne par réglage : sa valeur, la mesure qui la
borne, sa marge, son prochain test ; l'histoire de chaque mesure va au
journal. La règle tient : aucun réglage n'est résolu (ADR-0032).

Les idées non décidées de la longue traîne (J-2026-11-17-AF,
J-2026-11-17-AI) deviennent chacune un sujet du backlog de priorité basse,
que le sujet B-0065 retient jusqu'à leur décision, après la mise à jour
du socle : l'agent ne s'y met pas avant.
`CLAUDE.md` renvoie aux faits au lieu de la section.

## Fait quand

- [x] les réglages ouverts sont deux faits, et leur section a quitté `tools/README.md`, son texte au journal
- [x] chaque idée de la longue traîne est un sujet, sa décision en première case
- [x] `CLAUDE.md` et les renvois aux réglages pointent les faits
