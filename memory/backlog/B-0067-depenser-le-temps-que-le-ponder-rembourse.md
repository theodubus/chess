<!-- socle: couche=backlog zone=publique -->
# B-0067 — Dépenser le temps que le ponder rembourse

> statut : ouvert · origine : J-2026-11-18-F · après : B-0065 · priorité : basse · lu : backlog@6a468181

Idée non décidée : sa première étape est la décision de la tester ou de
l'abandonner (B-0065, D-0020). L'agent ne s'y met pas avant.

Quand `Ponder` est activé, une prévision juste rend au moteur le temps de
réflexion déjà passé sur le coup adverse ; le budget, proportionnel à ce
qui reste, ne le dépense pas avant la fin de partie. Le réglage se cherche
d'abord à la sonde (le supplément qui ramène la pendule dépensée par coup
à celle de la référence), puis par un match en `les-deux`. Ordre de
grandeur écrit le 23 sept. 2026, confiance faible : ~0,27 pli, soit 6 à
32 Elo. Il ne sert que là où le ponder est permis : la CCRL le désactive
en blitz. Relevé dans les récits du ponder, au rangement de septembre
(B-0047).

## Fait quand

- [ ] Théo a décidé de la tester, ou de l'abandonner
- [ ] si testée : le supplément réglé à la sonde, puis un match en `les-deux`
