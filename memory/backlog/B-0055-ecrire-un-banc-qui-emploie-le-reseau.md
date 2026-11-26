<!-- socle: couche=backlog zone=publique -->
# B-0055 — Écrire un banc qui emploie le réseau

> statut : ouvert · origine : J-2026-11-17-AF · après : B-0065 · priorité : basse · lu : backlog@c40befb4

Idée non décidée de la longue traîne : sa première étape est la décision
de la tester ou de l'abandonner (B-0065, D-0020, D-0021). L'agent ne s'y met pas avant.

Le banc et `tools/timing.sh` évaluent à la main, le moteur joue avec le
réseau (`CLAUDE.md`, « c'est plus rapide ») : proposé le 29 sept. 2026,
c'est le préalable à toute mesure de vitesse de l'inférence et à tout
écran en nœuds sur l'arbre qu'on joue. Il déplace la référence du banc,
ses tests et le crible de `engine/src/eval.rs` : il se conçoit, il ne se
bricole pas.

## Satisfait quand

- [ ] l'agent a décidé de la tester ou de l'abandonner, marge contre coût (D-0021)
- [ ] si décidé : un banc mesure la vitesse de l'évaluation qui joue, et `CLAUDE.md` le dit
