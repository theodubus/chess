<!-- socle: couche=backlog zone=publique -->
# B-0024 — Reprendre la génération, étiquetée par le réseau embarqué

> statut : ouvert · origine : D-0004 · après : B-0023 · priorité : basse · lu : backlog@575bbb05

La génération est en pause depuis le 31 oct. 2026 : le stock dépasse ce
que la carte consomme. Elle reste en pause tant que c'est vrai, et les
runners ne portent jamais plus de seize travaux à la fois : hypothèse de l'agent validée par Théo le 12 nov. 2026 (D-0004), notée « supposée ».
Elle reprend par une tranche de taille écrite d'avance, au budget que le
test à 1 250 nœuds aura désigné, quand un entraînement prévu demande plus
de positions que le stock n'en porte. Elle s'étiquette par le réseau qui
joue parce que le tour de boucle paie : à volume, budget et recette
égaux, les données d'un étiqueteur ~+40 plus fort ont rendu +10,15 ±
3,33 au réseau (J-2026-11-18-DD) ; les données d'un vieil étiqueteur se
remplacent avant de s'empiler.

Avant la tranche, l'adjudication du générateur se resonde à l'échelle de
l'étiqueteur du jour : elle n'a été mesurée qu'au réseau N0 (F-0009), par
la rustine `tools/attic/n7-sonde-adjudication.patch` (relecture de
B-0049).

## Fait quand

- [ ] l'adjudication du générateur est resondée à l'échelle de l'étiqueteur
- [ ] la taille de la tranche et sa raison sont écrites avant de lancer
- [ ] la tranche est close, chaque vague dans ses attendus
