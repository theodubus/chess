<!-- socle: couche=backlog zone=publique -->
# B-0017 — Jouer la première campagne SPSA sur le réseau embarqué

> statut : ouvert · origine : D-0004 · après : B-0013 · lu : backlog@c7f77d74

SPSA règle ensemble les marges de la recherche par paires de moteurs
perturbés. Son outillage est prêt depuis le 14 oct. 2026
(`.github/workflows/spsa.yml`, `tools/spsa/n19.txt`) et n'a joué qu'un
essai de chaîne. Il attendait un réseau « stabilisé » ; il se joue dès le
réseau de la séance embarqué, sur les runners pendant que la carte
entraîne : hypothèse de l'agent validée par Théo le 12 nov. 2026 (D-0004), notée « supposée ». Les réglages de la phase 4 laissés à leur plateau
(le bonus aux nœuds de coupure, le poids de la correction, la mémoire de
l'historique) y entrent.

Jamais mesurés : son coût en parties, et ce qu'un réglage garde d'un
réseau au suivant. Cette campagne les mesure.

## Fait quand

- [ ] la liste des paramètres et leurs plages sont écrites avant de lancer
- [ ] la campagne est jouée, son coût en parties et en heures de runner relevé
- [ ] le réglage final est mesuré en match contre `main`, comme un candidat, et son verdict écrit
- [ ] la règle de reprise à chaque réseau embarqué est écrite d'après ce coût
