<!-- socle: couche=backlog zone=publique -->
# B-0065 — Trancher les idées non décidées : les tester ou les abandonner

> statut : ouvert · origine : D-0020 · après : B-0044 · priorité : basse · lu : backlog@bc169f2b

Les idées non décidées sont au backlog (D-0020, réponse
`idees-au-backlog`), B-0053 à B-0064, B-0066 et B-0067 ; chacune attend ce sujet,
et n'est donc jamais « prête » avant d'avoir été tranchée. C'est le
verrou que l'état calcule, sans s'afficher à chaque récap comme le ferait
un sujet `pour : humain`.

Quand ce sujet devient prêt, après la mise à jour du socle, l'agent
tranche chaque idée lui-même, comme tout test (Théo, 18 nov. 2026,
D-0021) : elle vaut d'être testée si sa marge estimée vaut son coût
(ADR-0032) ; il ne demande à Théo que ce qui l'engage, sa carte, une
machine, une dépense, ou ce qui rouvrirait une décision structurante.
Une idée retenue perd ce sujet de ses `après` et prend son rang ; une idée
écartée est abandonnée, avec sa raison.

## Fait quand

- [ ] chaque idée est retenue ou abandonnée, avec sa raison
