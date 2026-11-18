---
name: rendre-un-verdict
description: Relever les jobs d'un match de mesure entre deux commits du moteur (match.yml) et en rendre le verdict, dans l'ordre qui ne laisse rien passer, puis fusionner ou non le candidat et inscrire le verdict. À utiliser quand les jobs d'un tel match sont finis, avant d'en dire le moindre chiffre. Pas pour embarquer un réseau, qui a sa propre procédure (B-0015).
---

# Rendre le verdict d'un match

Un verdict se rend sur un critère écrit **avant** de lancer, et dans cet
ordre : chaque étape peut invalider la suivante. Les règles qui le
fondent sont dans `CLAUDE.md` (« Ce qui compte comme preuve », « Pièges de
mesure ») ; ce skill en est la procédure, celle des relèves de septembre
à novembre 2026, dont le journal garde les récits.

## 1. Lire chaque job avant de les réunir

- **Son étalonnage**, en tête du résumé de `match.yml` : nœuds par
  seconde et profondeur atteinte en 250 ms. Deux runners peuvent différer
  de plus de moitié ; un verdict reste valide en interne, mais deux runs ne
  se comparent pas sans regarder leurs étalonnages.
- **Ses anomalies**, recensées en fin de journal par `match.yml` : pertes
  au temps, coups illégaux, moteur perdu, nulles par déconnexion ou par
  blocage. **Le verdict ne vaut rien tant que ce nombre n'est pas zéro** :
  une anomalie s'explique et se corrige avant toute lecture de l'Elo.
- **Ses avertissements, par moteur** : un avertissement d'arbitre est une
  mesure, il se relève comme un score. Un correctif doit faire disparaître
  les siens chez le candidat et les laisser chez la référence. cutechess,
  qui joue le ponder et les sondes, n'en émet pas : là, leur absence ne dit
  rien.
- **Son score final** : la dernière ligne `Ptnml`, jamais la première ;
  l'arbitre imprime un score courant après chaque partie.

## 2. Réunir, puis appliquer le critère

- Plusieurs jobs à longueur fixe se réunissent par
  `tools/mettre-en-commun.sh`, qui refuse des matchs qui se contredisent ;
  jamais plusieurs SPRT lus au premier qui franchit sa borne.
- **Un groupe non homogène** : son amplitude n'est plus un nombre, et le
  critère se lit job par job autant que sur l'ensemble — il tient si
  l'ensemble le passe et qu'aucun job ne le contredit, un job contredisant
  un gain quand sa borne haute est sous zéro (une régression, quand sa
  borne basse est au-dessus). L'écart se cherche
  (le runner, son étalonnage) et se dit inexpliqué s'il l'est. **Un job ne
  se retire jamais après avoir vu son score** ; un groupe trop serré se
  contrôle aussi, graines et vecteurs distincts.
- **Un job perdu** (runner perdu, sans résumé) se relance à la même graine
  si le plan en écrivait N, rien n'en ayant été compté ; avant, calculer
  si ce qui manque peut encore changer la décision, et le dire.
- Le critère écrit avant s'applique tel quel, **sans le déplacer après
  avoir vu le chiffre**. Un SPRT expiré n'est ni un verdict ni à
  reprendre : il dimensionne le match suivant.
- Le verdict se dit avec son effectif, ses bornes et **sa cadence**, et
  contre quelle base.
- **Deux candidats mesurés contre la même base** ne se départagent pas par
  la différence de leurs écarts, ni par une chaîne de matchs : leur match
  direct, apparié, fait foi, et celui qui n'est pas en tête au point doit y
  démontrer pour passer devant. Trois matchs qui bouclent un triangle se
  contrôlent : leur somme orientée tombe à zéro, à l'incertitude composée
  près.
- Contrôler la vraisemblance avant de l'inscrire : un rapport rond, nul ou
  démesuré dit un protocole cassé.

## 3. Si le critère autorise la fusion

Le candidat a été mesuré sur un commit révoqué aussitôt, fusionné en
`merge` pour que son SHA reste atteignable.

- **Plusieurs gagnants contre la même base** ne s'additionnent pas sur le
  papier : ils se remesurent ensemble, par une composition, avant
  d'entrer ; sa procédure est celle du skill `passer-a-l-ecran`.
- **Un conflit** avec ce qui a fusionné entre-temps ne se résout pas en
  gardant tout par défaut : si les deux changements touchent la même
  décision de recherche, leur somme n'a jamais été mesurée, et elle se
  mesure avant d'entrer.

Puis, dans l'ordre :

1. Révoquer la révocation, sur la base du moment.
2. Si l'arbre change, recopier la nouvelle référence du banc là où
   `engine/tests/bench_reference.rs` la vérifie ; le message d'échec du
   test nomme chaque fichier.
3. La table de l'attic (`tools/attic/README.md`) **avant** de vérifier :
   une rustine dont le code vient d'entrer cesse de s'appliquer, et
   d'autres du même voisinage avec elle ; chaque ligne qui bascule passe à
   « non », avec sa raison. `engine/tests/rustines_attic.rs` le juge.
4. `tools/verify.sh` en entier, son code de sortie lu dans un fichier,
   jamais à travers un tube : il lance aussi le test des rustines.
5. Pull request, fusionnée à CI verte par la méthode « merge ».
6. Un balayage de mutation : `workflow_dispatch` de `mutation.yml`, qui
   balaie chaque fichier de sa matrice sur la tête de `main` (l'entrée
   `commit` balaie un candidat sans ouvrir d'issue). Écrire avant ce qu'il
   devrait rendre ; un changement d'arbre déplace le plafond, jusque dans
   des fichiers qu'il ne touche pas. Un verdict rouge se traite selon
   ADR-0035 : corriger ce qui touche aux règles du jeu et aux invariants,
   noter le reste au plafond, avec sa raison.

## 4. Inscrire le verdict, fusionné ou non

- Au journal, une entrée datée : le critère, les jobs avec leurs runs, le
  verdict avec effectif, bornes et cadence, et ce qu'il décide.
- Tant que `tools/README.md` garde son tableau « Mesures de référence »,
  une ligne y entre aussi.
- Un réglage mesuré met à jour sa ligne des réglages ouverts (F-0009,
  F-0010), ou en ouvre une : sa valeur, la mesure qui la borne, sa marge,
  son prochain test. Aucun réglage n'est résolu (ADR-0032).
- Le sujet du backlog qui portait la mesure se clôt avec cette entrée pour
  référence, ou attend le match suivant que le verdict dimensionne.
