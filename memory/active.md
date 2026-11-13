<!-- socle: couche=actif zone=publique -->
# Chantier actif

Réécrit au fil du travail et borné. Ce qui en sort s'archive dans le journal.

## En cours

L'adoption du socle, entière, avant tout travail sur le moteur : Théo, le
12 nov. 2026 (D-0006, D-0008). Le jalon B-0031 dit ce que « finie » veut
dire.

La mise à jour du socle (J-2026-11-13-A) : Théo a validé D-0010 le
13 nov. (J-2026-11-13-B), sa réponse est poussée avec elle, et la porte
du prompt passe. La pull request de la branche de développement attend
sa CI : à CI verte, tous les contrôles finis, l'agent la fusionne par la
méthode « merge », le SHA de tête lu par git, puis la branche repart de
la branche par défaut. Théo a demandé de se préparer à un compactage :
rien d'autre n'est lancé.

## Prochaines étapes

Dans l'ordre :

1. Fusionner la pull request de la mise à jour à CI verte.
2. Faire le changement de D-0009, que Théo a validée dans la conversation
   (J-2026-11-12-M) : alléger `tools/etat.sh`, remplacer l'ancienne
   feuille de route de `tools/README.md` par un renvoi, ajouter les tests
   d'intégration aux chemins de code des garde-fous, faire suivre
   `tools/verify-hooks.sh`. Sa réponse se consigne par la commande du
   socle dans le même push que ce changement. Puis donner à Théo les
   commandes à lancer sur son ordinateur : retirer de
   `.claude/settings.json` le premier bloc de `SessionStart` et le
   premier de `Stop`, approuver le fichier, commiter, pousser. Cela clôt
   B-0002 et B-0004.
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
