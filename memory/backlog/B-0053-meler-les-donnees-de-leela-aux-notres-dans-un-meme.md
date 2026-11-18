<!-- socle: couche=backlog zone=publique -->
# B-0053 — Mêler les données de Leela aux nôtres dans un même entraînement

> statut : ouvert · origine : J-2026-11-17-AF · après : B-0065 · priorité : basse · lu : backlog@c40befb4

Idée non décidée de la longue traîne : sa première étape est la décision
de la tester ou de l'abandonner (B-0065, D-0020, D-0021). L'agent ne s'y met pas avant.

Entraîner depuis zéro sur nos données et le binpack de Leela Chess Zero
dans le même entraînement (`--melange`, écrit le 19 oct. 2026), admis par
ADR-0030 ; ligne (b) de la file. Théo, 20 oct. : derrière la séance B et
la composition. L'attendu a baissé : le réglage fin sur Leela a régressé
(−11,42 ± 3,73). Les suites que la file lui prévoyait : ses gagnants dans
la composition suivante, une variante d'architecture nourrie du mélange,
d'autres fichiers de Leela que T60 et T74. Un réseau qui en apprend porte
la mention d'attribution du `README.md`.

## Fait quand

- [ ] l'agent a décidé de la tester ou de l'abandonner, marge contre coût (D-0021)
- [ ] si testée : le mélange mesuré contre le réseau qui joue, et ses suites décidées sur ce verdict
