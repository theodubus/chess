<!-- socle: couche=backlog zone=publique -->
# B-0077 — Copier sur un disque dur les données d'entraînement qui servent encore, avant le 18 janv. 2027

> statut : ouvert · origine : D-0025 · priorité : haute · pour : humain · lu : backlog@328e7364

Théo, le 23 nov. 2026 : « Pour les donnees d'entraînement qui servent
encore (et uniquement celles ci, on garde pas les donnees par plaisir de
les garder), je les stockerai sur un disque dur, rappelle le moi plus
tard » (D-0025, `disque`). L'agent le lui rappelle à chaque récap, et par
un message programmé au 4 janv. 2027.

Ce qui sert encore (J-2026-11-23-Q), et seulement cela, les tailles des
artefacts compressés lues dans les registres :

| génération | registre | artefacts | taille | expire chez GitHub |
|---|---|---|---|---|
| n° 20 | `tools/n20-jobs.tsv` | 95 | 9,33 Go | 18 janv. 2027 |
| n° 20 (e) | `tools/n20e-jobs.tsv` | 81 | 4,15 Go | 19 janv. |
| n° 21 | `tools/n21-jobs.tsv` | 87 | 9,32 Go | 24 janv. |
| n° 22 | `tools/n22-jobs.tsv` | 335 | 52,04 Go | 29 janv. |

Soit 598 artefacts et 74,85 Go compressés ; décompressées, ~1,2 fois
plus, au rapport relevé en septembre (J-2026-11-18-BD). Ce qui manque sur
la machine de Théo se télécharge de GitHub avant sa date ; ce qu'elle a
déjà se recopie, les comptes du registre (parties, positions) servant à
vérifier la copie. Le n° 20 et (e) ne servent que jusqu'à l'embarquement
du réseau suivant (B-0013) : embarqué avant la copie, ils n'y vont pas.

## Satisfait quand

- [ ] chaque génération qui sert encore est sur le disque dur de Théo, ses comptes vérifiés contre son registre
