<!-- socle: couche=backlog zone=publique -->
# B-0062 — Dépenser selon l'écart des deux pendules

> statut : ouvert · origine : J-2026-11-17-AI · après : B-0065 · priorité : basse · lu : backlog@c40befb4

Idée non décidée de la longue traîne : sa première étape est la décision
de la tester ou de l'abandonner (B-0065, D-0020, D-0021). L'agent ne s'y met pas avant.

Dépenser le temps selon l'écart des deux pendules. Écran passé :
petit, signe inconnu, l'écart dépasse 20 % sur 1,6 % des coups. Même
famille que l'allocation inégale, autre signal, et un signal que
l'auto-jeu annule (l'écart signé y est nul) : il se mesure contre le
parent de `ebe93ad`, jamais contre soi-même.

## Fait quand

- [ ] l'agent a décidé de la tester ou de l'abandonner, marge contre coût (D-0021)
- [ ] si testée : le match conditionnel, jamais contre soi-même
