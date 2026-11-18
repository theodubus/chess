---
name: rendre-un-verdict
description: Relever les jobs d'un match de mesure (match.yml) et en rendre le verdict, dans l'ordre qui ne laisse rien passer, puis fusionner ou non le candidat et inscrire le verdict. À utiliser quand les jobs d'un match entre deux commits sont finis, avant d'en dire le moindre chiffre.
---

# Rendre le verdict d'un match

Un verdict se rend sur un critère écrit **avant** de lancer, et dans cet
ordre : chaque étape peut invalider la suivante. Les règles qui le
fondent sont dans `CLAUDE.md` (« Ce qui compte comme preuve », « Pièges de
mesure ») ; ce skill en est la procédure, vérifiée à chaque relève de
septembre à novembre 2026 (le journal en garde les récits).

## 1. Lire chaque job avant de les réunir

- **Son étalonnage**, en tête du résumé de `match.yml` : nœuds par
  seconde et profondeur atteinte en 250 ms. Deux runners peuvent différer
  de plus de moitié ; un verdict reste valide en interne, mais deux runs ne
  se comparent pas sans regarder leurs étalonnages.
- **Ses pertes au temps**, avant l'Elo : une seule est un défaut à
  expliquer.
- **Ses avertissements, par moteur**, recopiés en fin de journal par
  `match.yml` : un avertissement d'arbitre est une mesure, il se relève
  comme un score. Un correctif doit faire disparaître les siens chez le
  candidat et les laisser chez la référence.
- **Son score final** : la dernière ligne `Ptnml`, jamais la première ;
  l'arbitre imprime un score courant après chaque partie.

## 2. Réunir, puis appliquer le critère

- Plusieurs jobs à longueur fixe se réunissent par
  `tools/mettre-en-commun.sh`, qui refuse des matchs qui se contredisent ;
  jamais plusieurs SPRT lus au premier qui franchit sa borne.
- Le critère écrit avant s'applique tel quel, **sans le déplacer après
  avoir vu le chiffre**. Un SPRT expiré n'est ni un verdict ni à
  reprendre : il dimensionne le match suivant.
- Le verdict se dit avec son effectif, ses bornes et **sa cadence**, et
  contre quelle base.
- Contrôler la vraisemblance avant de l'inscrire : un rapport rond, nul ou
  démesuré dit un protocole cassé.

## 3. Si le critère autorise la fusion

Le candidat a été mesuré sur un commit révoqué aussitôt, fusionné en
`merge` pour que son SHA reste atteignable.

1. Révoquer la révocation, **sur la base du moment** ; un conflit avec ce
   qui a fusionné entre-temps se résout en gardant les deux.
2. Si l'arbre change, recopier la nouvelle référence du banc là où
   `engine/tests/bench_reference.rs` la vérifie ; le message d'échec du
   test nomme chaque fichier.
3. `tools/verify.sh` en entier, son code de sortie lu dans un fichier,
   jamais à travers un tube.
4. La table de l'attic (`tools/attic/README.md`) : une rustine dont le
   code vient d'entrer cesse de s'appliquer ; sa ligne passe à « non » avec
   sa raison. `engine/tests/rustines_attic.rs` le vérifie, hors de la
   vérification rapide : le lancer avant de pousser.
5. Pull request, fusionnée à CI verte par la méthode « merge ».
6. Un balayage de mutation à la demande (`workflow_dispatch` de
   `mutation.yml`) sur les fichiers que le changement touche : un changement
   d'arbre déplace le plafond, jusque dans des fichiers qu'il ne touche pas.

## 4. Inscrire le verdict, fusionné ou non

- Au journal, une entrée datée : le critère, les jobs avec leurs runs, le
  verdict avec effectif, bornes et cadence, et ce qu'il décide.
- Un réglage mesuré met à jour sa ligne des réglages ouverts (F-0009,
  F-0010) : sa valeur, la mesure qui la borne, sa marge, son prochain test.
  Aucun réglage n'est résolu (ADR-0032).
- Le sujet du backlog qui portait la mesure se clôt avec cette entrée pour
  référence, ou attend le match suivant que le verdict dimensionne.
