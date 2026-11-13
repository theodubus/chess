<!-- socle: couche=actif zone=publique -->
# Chantier actif

Réécrit au fil du travail et borné. Ce qui en sort s'archive dans le journal.

## En cours

L'adoption du socle, entière, avant tout travail sur le moteur : Théo, le
12 nov. 2026 (D-0006, D-0008). Le jalon B-0031 dit ce que « finie » veut
dire.

La mise à jour du socle est fusionnée (pull request 292, J-2026-11-13-C).
En cours : le changement de D-0009, que Théo a validée. Sa réponse et la
part de l'agent partent ensemble sur la branche de développement :
`tools/etat.sh` allégé, l'ancienne feuille de route remplacée par un
renvoi, `tools/verify-hooks.sh` qui passe avant le geste de Théo comme
après, sauf deux cas qui exigent l'absence des anciens hooks : la CI est
rouge jusqu'au geste de Théo, exprès. **Théo fera son geste ce soir,
13 nov.** (son message de 8 h 10, J-2026-11-13-C) : les commandes sont au
sujet B-0034.

## Prochaines étapes

Dans l'ordre :

1. Pousser la part de l'agent, ouvrir la pull request, donner à Théo le
   lien de B-0034. Sa CI est rouge jusqu'au commit de Théo : c'est voulu.
2. Quand Théo a poussé : vérifier que son commit ne retire que les deux
   blocs et porte son approbation ; clore B-0002, B-0004 et B-0034,
   cocher leur case de B-0031 ; fusionner à CI verte. S'il a répondu sur
   B-0035, le faire dans le même lot.
3. Poser le journal du carnet (B-0006), public sans tri (D-0007), en
   refaisant les essais des contrôles sur les fichiers posés ; puis ses
   autres rubriques, le bandeau compris (B-0007) ; puis `CLAUDE.md` en
   trois lots (B-0008 à B-0010), le budget baissé à chaque lot.

Le skill de reprise s'applique : deux réveils par tour qui agit, retirés
à la fin du tour. Le registre des réglages ouverts n'est écrit que dans
`tools/README.md`, sous-section « La file ». Les données d'entraînement
expirent chez GitHub à partir du 14 janv. 2027 (F-0005, B-0026).

Livraison, confirmée par Théo : une branche de développement, une seule
pull request ouverte à la fois, fusionnée par l'agent à CI verte, tous
les contrôles finis, par la méthode « merge ».
