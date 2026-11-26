<!-- socle: couche=backlog zone=publique -->
# B-0067 — Dépenser le temps que le ponder rembourse

> statut : ouvert · origine : J-2026-11-18-R · après : B-0044 · lu : backlog@6a468181

Un chantier que Théo a gardé au backlog : « on oublie pas le reste »
(24 sept. 2026, ADR-0016), puis le remboursement du ponder « garde sa
place » (25 sept., ADR-0017). Ce n'est donc pas une idée en attente de
décision.

Quand `Ponder` est activé, une prévision juste rend au moteur le temps de
réflexion déjà passé sur le coup adverse ; le budget, proportionnel à ce
qui reste, ne le dépense pas avant la fin de partie. Le réglage se cherche
d'abord à la sonde (le supplément qui ramène la pendule dépensée par coup
à celle de la référence), puis par un match en `les-deux`. Marge
estimée par l'étalonnage du 24 sept. : 16 à 28 Elo (ADR-0015), mais
seulement là où le ponder est permis ; la CCRL le désactive en blitz.

## Satisfait quand

- [ ] le supplément réglé à la sonde, puis un match en `les-deux`, son verdict rendu
