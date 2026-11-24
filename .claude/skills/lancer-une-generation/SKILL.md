---
name: lancer-une-generation
description: Lancer, relever et inscrire une génération de données d'entraînement NNUE sur les runners (nnue-datagen.yml), par vagues — la recette et la règle de fin écrites avant, la sonde de vingt minutes, chaque vague attendue puis relevée, le registre des jobs. À utiliser chaque fois que des positions doivent être générées ou étiquetées pour un réseau, avant de lancer le premier job.
---

# Lancer une génération de données

Une génération occupe les runners pendant des jours et ne se rejoue pas :
elle s'écrit entière d'avance, et chaque vague se juge à ses attendus
avant la suivante. Ce que fait le générateur, et ce qu'aucune entrée du
workflow ne dit, est dans `tools/README.md`, « Générer les données NNUE » ;
ce skill est la procédure des générations de septembre à novembre 2026
(A21, n° 7, n° 13, n° 18, n° 20, n° 21, n° 22), dont le journal garde les
récits.

## 1. Écrire avant de lancer

- **La recette, écrite entière** : le commit de l'étiqueteur, nommé, son
  réseau embarqué (`<embedded>`), le budget de nœuds, la graine « auto »,
  un fil par processeur logique, la durée, le binaire AVX2. Un étiqueteur
  ou un budget qui change sans avoir été écrit avant mêle deux générations
  dans une seule. Ce qui varie exprès se dit d'avance : deux budgets
  comparés dans la même tranche s'alternent dans chaque vague, pour tirer
  le même parc de runners, et le registre porte le budget de chaque job ;
  un changement de budget en cours de route s'écrit avec la condition qui
  le déclenche. `git log` sur `engine/src` dit ce que l'étiqueteur change
  au générateur.
- **Le volume visé, et la règle de fin** : la génération s'arrête à la
  vague dont le cumul atteint le volume — la vague entière —, ou la
  dernière vague se dimensionne au reste plus 10 %. Rien ne s'y choisit au
  vu d'un résultat.
- **Le job tenu à l'écart** : le PREMIER job lancé de la vague 1 — de
  chaque budget, s'il y en a plusieurs —, désigné avant d'en voir le
  compte ; il ne s'entraîne jamais et sert à la perte tenue à l'écart
  (`nnue-validation.yml`).
- **Les témoins** d'une comparaison se tirent, quand ils le peuvent, d'une
  génération déjà faite au même étiqueteur — à temps de runner égal (les
  J premiers jobs) et à volume égal : ils ne coûtent rien.
- **La date d'expiration des artefacts** (F-0005), avant celle de la séance
  qui les emploiera ; et, avant une nouvelle tranche, ce que B-0024 demande
  de resonder.

## 2. La sonde de vingt minutes

- Un job court sur un processeur nommé, quand le générateur change d'une
  façon que la génération précédente ne prédit pas : un budget jamais
  employé, une architecture d'étiqueteur nouvelle. Un étiqueteur neuf de
  même architecture et au même budget peut s'en passer, et le dire : les
  attendus de la vague 1 en tiennent lieu, et un écart y coûte une vague
  de diagnostic, aucune donnée gardée. **Les attendus de la sonde, écrits
  avant**, chacun contre la sonde précédente sur le MÊME modèle de
  processeur : positions par seconde, parties écartées par le filtre
  d'ouverture, nulles, positions par partie.
- **Les écartées se rapportent aux parties GARDÉES** : le résumé compte les
  deux à part.
- Hors fourchette, on diagnostique avant la vague. Un attendu dérivé d'un
  échantillon porte au moins l'incertitude de cet échantillon : une
  fourchette plus étroite que la sonde qui la fonde se fera franchir par
  le bruit. **Un attendu se tire du même axe** : ce qu'a fait un budget
  plus long ne dit pas ce que fera un réseau plus fort.
- **Un seuil en unités d'évaluation suit l'échelle de l'étiqueteur** — le
  seuil d'ouverture, l'adjudication. Le taux d'écartées qui bouge à
  l'étiqueteur neuf se diagnostique dans le conteneur, `nnue-datagen` à
  graine fixe sur les MÊMES ouvertures, seul le réseau changé ;
  l'adjudication, que les compteurs du générateur ne séparent pas du mat,
  demande la rustine `tools/attic/n7-sonde-adjudication.patch` (B-0024).

## 3. Les vagues

- **Seize jobs à la fois au plus sur tout le compte** (D-0004) : la
  génération partage ce plafond avec les matchs, SPSA et le balayage de
  mutation du mardi, et une vague se dimensionne à ce qui tourne déjà.
  Chaque vague s'écrit avant de partir, et part après le relevé de la
  précédente : un chiffre hors de sa fourchette se diagnostique avant la
  suivante. Une fois le régime stable sur plusieurs vagues, la suivante
  peut partir dès que la précédente est FINIE, avant son relevé, son
  cumul attendu écrit en écart à celui qu'on relèvera.
- **Chaque vague s'écrit avant** : positions, gardées, écartées, nulles,
  débit sur le processeur le plus courant, cumul — pour seize jobs, et à
  proportion s'il en manque.
- **La relève** : chaque résumé nomme le commit et le budget ; les cinq
  chiffres contre leurs attendus ; l'image du runner, lue dans le journal
  d'un job ; le reste à générer, divisé par le rendement du jour, donne les
  vagues restantes. Une borne que la dispersion des runners franchit se
  descend pour la première vague dont l'attendu n'est pas encore écrit,
  avec sa raison, et
  jamais au-delà de ce qu'elle doit garder (un binaire sans AVX2, par
  exemple).
- **Le débit appartient à l'hôte, pas au nom du processeur** : un même
  modèle peut rendre d'un quart à un tiers de plus d'un runner à l'autre. À
  nœuds fixés, le processeur ne change que le volume, jamais les parties ;
  un débit hors fourchette avec des taux dans les leurs n'est pas une faute
  du générateur.
- **Un runner perdu** ne laisse pas d'artefact : il ne se relance pas, le
  volume se rattrape à la vague suivante, et la relève le nomme.

## 4. Le registre et l'inscription

- **`tools/<génération>-jobs.tsv`** : une ligne par job — run, artefact,
  vague, rôle (`appris` ou `tenu`), budget s'il varie, parties gardées,
  positions, gardées par le filtre, octets —, lus dans le journal de
  chaque job et à l'API ; ses sommes recontrôlées contre la relève. C'est
  la seule source des listes et des comptes `--attendu` des séances.
- **Au journal**, une entrée par vague ou par génération : les attendus,
  les runs, le relevé, ce qui en sort.
- La génération close : son expiration va à F-0005 ; si elle sert encore,
  elle entre dans la liste de copie de B-0077, avec son volume.
