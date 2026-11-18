<!-- socle: couche=backlog zone=publique -->
# B-0054 — Rendre l'évaluation statique depuis la table de transposition

> statut : ouvert · origine : J-2026-11-17-AF · après : B-0065 · priorité : basse · lu : backlog@c40befb4

Idée non décidée de la longue traîne : sa première étape est la décision
de la tester ou de l'abandonner (B-0065, D-0020, D-0021). L'agent ne s'y met pas avant.

Une entrée de la table de transposition trouvée rend aussi l'évaluation
statique de sa position, sans la recalculer (file, phase 2). Pur seulement
si l'entrée garde sa taille : sinon la capacité change, et l'arbre avec,
et c'est un match plutôt que `tools/timing.sh`. Sa vitesse se mesure sur
l'évaluation qui joue, le réseau, que le banc ne mesure pas encore
(B-0055).

## Fait quand

- [ ] l'agent a décidé de la tester ou de l'abandonner, marge contre coût (D-0021)
- [ ] si testée : le gain mesuré au réseau, à arbre identique, ou un match si l'entrée change de taille
