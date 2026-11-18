<!-- socle: couche=backlog zone=publique -->
# B-0064 — Faire varier le jeu du moteur face aux mêmes coups

> statut : ouvert · origine : J-2026-11-17-AI · après : B-0065 · priorité : basse · lu : backlog@c40befb4

Idée non décidée de la longue traîne : sa première étape est la décision
de la tester ou de l'abandonner (B-0065, D-0020). L'agent ne s'y met pas avant.

Question de Théo, 28 oct. 2026 : « face à des mêmes coups, le bot joue
la même chose, donc il suffit d'apprendre des parties depuis le start où
le bot perd ». Une fonction de jeu, pas de force : à un fil, table vidée
par `ucinewgame`, à profondeur fixée, le moteur rejoue la même partie ;
sous pendule, les aléas de la machine l'atténuent. En liste CCRL, sans
effet : son livre impose les ouvertures. Notée « à décider par Théo »,
jamais posée.

## Fait quand

- [ ] Théo a décidé de la tester, ou de l'abandonner
- [ ] si décidée : le moyen de varier choisi, et l'arbre à un fil inchangé quand il est éteint
