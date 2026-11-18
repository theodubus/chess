<!-- socle: couche=backlog zone=publique -->
# B-0065 — Trancher les idées non décidées : les tester ou les abandonner

> statut : ouvert · origine : D-0020 · après : B-0044 · priorité : basse · lu : backlog@bc169f2b

Les idées non décidées sont au backlog (D-0020, réponse
`idees-au-backlog`), B-0053 à B-0064 et B-0066 ; chacune attend ce sujet,
et n'est donc jamais « prête » avant d'avoir été tranchée. C'est le
verrou que l'état calcule, sans s'afficher à chaque récap comme le ferait
un sujet `pour : humain`.

Quand ce sujet devient prêt, après la mise à jour du socle, l'agent pose
une seule demande qui les présente toutes, chacune avec sa marge estimée
et son coût ; selon la réponse, une idée retenue perd ce sujet de ses
`après`, une idée écartée est abandonnée avec sa référence. Qui tranche :
Théo, tel que D-0020 a été consigné ; il a été interrogé le 18 nov. sur
la lecture inverse (l'agent tranche, marge contre coût, et ne lui demande
que ce qui l'engage, ADR-0032), sans réponse encore.

## Fait quand

- [ ] chaque idée est retenue ou abandonnée, avec sa référence
