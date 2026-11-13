<!-- socle: couche=actif zone=publique -->
# Chantier actif

Réécrit au fil du travail et borné. Ce qui en sort s'archive dans le journal.

## En cours

L'adoption du socle, entière, avant tout travail sur le moteur : Théo, le
12 nov. 2026 (D-0006, D-0008). Le jalon B-0031 dit ce que « finie » veut
dire.

Reprise le 12 nov. au soir, sur le signal de Théo (J-2026-11-12-M). Le
deuxième lot est fusionné, B-0001 et B-0005 clos (J-2026-11-12-O). En
cours : la mise à jour du socle (J-2026-11-13-A). Elle est installée,
commitée et poussée, dans la pull request de la branche de développement ;
la CI du socle y refuse ses 26 fichiers protégés tant que Théo n'a pas
répondu à D-0010. À sa validation : consigner sa réponse par la commande
du socle et au journal, repasser la porte du prompt en relançant les
étapes rapides, donner les trois durées, fusionner à CI verte sauf s'il
veut fusionner lui-même, puis rendre le compte rendu pour la session du
socle. Le skill de reprise à jour s'applique : deux réveils par tour qui
agit, retirés à la fin du tour.

## Prochaines étapes

Dans l'ordre :

1. Fait : le lot fusionné, B-0001 et B-0005 clos.
2. En cours : la mise à jour du socle, par le prompt que la session du
   socle a écrit et que Théo a donné (J-2026-11-12-M, son texte entier).
   Elle attend la réponse de Théo à D-0010.
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
