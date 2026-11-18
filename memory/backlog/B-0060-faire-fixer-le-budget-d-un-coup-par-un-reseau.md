<!-- socle: couche=backlog zone=publique -->
# B-0060 — Faire fixer le budget d'un coup par un réseau

> statut : ouvert · origine : J-2026-11-17-AF · après : B-0065 · priorité : basse · lu : backlog@c40befb4

Idée non décidée de la longue traîne : sa première étape est la décision
de la tester ou de l'abandonner (B-0065, D-0020, D-0021). L'agent ne s'y met pas avant.

Un réseau qui fixe le budget d'un coup selon la pendule et la position :
question de Théo, 6 oct. 2026. Avis de l'agent, pas une décision : petit
à `8+0,08`. L'écran du 24 sept. a trouvé le signal dans la dynamique de
la recherche (la stabilité du coup), pas dans la position. Le geste
d'abord : rejouer la sonde d'allocation
(`tools/attic/c24-sonde-allocation.patch`) sur le moteur d'aujourd'hui,
et chiffrer le plafond.

## Fait quand

- [ ] l'agent a décidé de la tester ou de l'abandonner, marge contre coût (D-0021)
- [ ] si testée : le plafond chiffré par la sonde, et la suite décidée sur ce chiffre
