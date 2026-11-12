<!-- socle: couche=actif zone=publique -->
# Chantier actif

Réécrit au fil du travail et borné. Ce qui en sort s'archive dans le journal.

## En cours

L'adoption du socle, entière, avant tout travail sur le moteur : Théo, le
12 nov. 2026 (D-0006, D-0008). Le jalon B-0031 dit ce que « finie » veut
dire.

Reprise le 12 nov. au soir, sur le signal de Théo (J-2026-11-12-M). La
branche de développement porte la sortie du mode adoption (B-0001) et la
conversion à blanc du carnet (B-0005), la revue de son script traitée
(J-2026-11-12-N) : ce lot part en pull request, fusionnée à CI verte.

## Prochaines étapes

Dans l'ordre :

1. Fusionner la pull request du lot, puis clore B-0001 et B-0005.
2. Mettre à jour le socle, par le prompt que la session du socle a écrit
   et que Théo a donné (J-2026-11-12-M, son texte entier), sur la branche
   repartie de la branche par défaut. Sa demande sur les fichiers
   protégés attendra Théo.
3. Faire le changement de D-0009, que Théo a validée dans la conversation
   (J-2026-11-12-M) : sa réponse se consigne par la commande du socle
   dans le même push que le changement, pas avant ; et Théo attend de
   l'agent les commandes à lancer sur son ordinateur. B-0002 et B-0004 en
   dépendent.
4. Poser le journal du carnet (B-0006), public sans tri (D-0007), en
   refaisant les essais des contrôles sur les fichiers posés ; puis ses
   autres rubriques (B-0007) et `CLAUDE.md` en trois lots (B-0008 à
   B-0010).

Le registre des réglages ouverts n'est écrit que dans `tools/README.md`,
sous-section « La file ». Les données d'entraînement expirent chez GitHub
à partir du 14 janv. 2027 (F-0005, B-0026).

Livraison, confirmée par Théo : une branche de développement, une seule
pull request ouverte à la fois, fusionnée par l'agent à CI verte, tous
les contrôles finis, par la méthode « merge ».
