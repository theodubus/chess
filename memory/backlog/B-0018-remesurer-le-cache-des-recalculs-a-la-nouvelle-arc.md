<!-- socle: couche=backlog zone=publique -->
# B-0018 — Remesurer le cache des recalculs à la nouvelle architecture

> statut : ouvert · origine : J-2026-11-12-B · après : B-0013 · lu : backlog@a20df334

Le cache des accumulateurs, qui évite un recalcul complet quand le roi
change de seau, a été écarté le 20 oct. 2026 : +0,46 % de temps, rien de
démontré, sur un réseau à 256 unités et quatre seaux. À 512 unités et dix
seaux, le roi change de seau plus souvent et chaque recalcul coûte le
double : sa prémisse a changé. Inférence de l'agent, confiance faible à
moyenne. Sa rustine est à l'attic (`tools/attic/f2-cache-des-recalculs.patch`).
Une optimisation pure : même arbre, mesurée par le temps au rejeu, sans
match.

## Fait quand

- [ ] la rustine s'applique et se construit sur le `main` qui porte le nouveau réseau
- [ ] le temps à arbre identique est mesuré sur 120 tours, la puissance écrite avant
- [ ] le verdict est écrit : fusionnée si le gain est démontré, sinon l'attic dit pourquoi elle y reste
