<!-- socle: couche=decisions zone=publique -->
# ADR-0013 — A16 : Sur quoi travailler après les relèves du 23 sept. ? (Tranché — calibration FAITE (60 à 105 Elo par pli), B6 écrit et en mesure)

> statut : acceptée · date : 2026-09-23 · lu : decisions@d75146b5

## Contexte

Arbitrage A16 du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet.

## Décision

**Décision.** **[Décision utilisateur]** Théo, 23 sept. 2026 au soir, à la proposition « la calibration d'abord, puis B6 » : *« Oui ça me va »*. Ordre : (1) finir les relèves en vol — C22 sur C23, balayage de mutation ; (2) **calibrer l'Elo par pli** par un match à handicap de temps, même binaire, `16+0,16` contre `8+0,08` ; (3) **B6 — Lazy SMP**, en commençant par apprendre les fils à `match.yml`.

## Conséquences

**Pourquoi cet ordre.** **[Mesure]** Deux points d'Elo par pli, 21 à 116 et 52 à 102 : trop large pour classer les chantiers de vitesse et de temps. La calibration coûte un job et rend l'étalon des autres. B6 est le plus gros levier chiffré (1,0 à 1,8 pli), et B9, son prérequis côté table, est fusionné.

**Où c'est écrit au dépôt.** En tête de « Ce qui reste à faire, par ordre mesuré » de `tools/README.md`. Au-delà de ces deux chantiers, « ce sur quoi travailler » reste une question à poser.

**Recalculé le soir même.** **[Mesure]** Les deux intervalles d'Elo par pli deviennent **21 à 119** et **51 à 104** : `plis.sh` prenait 1,96 au lieu du quantile de Student, et le « 116 » venait d'une demi-largeur arrondie. L'ordre ne change pas.
