<!-- socle: couche=actif zone=publique -->
# Chantier actif

Réécrit au fil du travail et borné. Ce qui en sort s'archive dans le journal.

## En cours

L'installation du socle 0.2.0 sur chess (J-2026-11-11-A, J-2026-11-11-B), dans
une pull request que Théo fusionne après avoir lu l'adaptateur
(`.socle/adapter.toml`) et écrit lui-même ses deux lignes de politique
(`.socle/policy.toml`, décisions 3 et 6 de D-0002).

Hors du socle, une seule chose est en vol : l'entraînement du mode `c` de la
séance C3 (le réseau N10r10h512) tourne sur la carte de Théo. Il se relève
quand Théo le signale ; le protocole, l'attendu écrit avant et le critère
sont dans `tools/README.md`, feuille de route, point 4, et section « C3 ».

## Prochaines étapes

1. Dans une session neuve, une fois la pull request fusionnée : les questions
   de départ (D-0001), auxquelles Théo répond dans la conversation.
2. Poser la feuille de route dans la mémoire, avec Théo : elle vit encore
   dans `tools/README.md`, en tête de « Ce qui reste à faire », et
   `tools/etat.sh` l'imprime au démarrage. Rien ne s'y rouvre sans lui.
3. Le premier sujet de chess (D-0002, décision 4) : déplacer le carnet de
   bord vers la mémoire, pour que `CLAUDE.md` ne garde que les règles de
   travail.
