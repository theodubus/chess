<!-- socle: couche=backlog zone=publique -->
# B-0021 — Entraîner un réseau à couches cachées

> statut : ouvert · origine : D-0004 · après : B-0020 · lu : backlog@8a5a3c25

Deuxième axe d'architecture. L'inférence multicouche est écrite dans le
moteur depuis le 2 nov. 2026 et n'a jamais été confrontée à l'entraîneur :
aucun réseau de cette forme n'existe. Marge inconnue.

## Fait quand

- [ ] le programme d'entraînement produit un réseau à couches cachées
- [ ] l'inférence du moteur est confrontée à l'entraîneur sur ce réseau, au critère des autres : écart médian de 15 centièmes au plus, maximal de 50
- [ ] le réseau est mesuré contre le réseau embarqué, son verdict écrit
- [ ] embarqué si sa borne basse est au-dessus de zéro, sinon l'axe s'arrête
