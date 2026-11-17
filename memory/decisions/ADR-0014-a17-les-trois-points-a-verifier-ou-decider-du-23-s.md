<!-- socle: couche=decisions zone=publique -->
# ADR-0014 — A17 : Les trois points « à vérifier ou décider » du 23 sept. (Tranchés par les règles du projet)

> statut : acceptée · date : 2026-09-23 · lu : decisions@64dc7db2

## Contexte

Arbitrage A17 du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet.

## Décision

**Délégation.** **[Décision utilisateur]** Théo, 23 sept. au soir : *« vérifie ce qu'il y a à vérifier, arbitre ce qui peut s'arbitrer avec les règles du projet (on fait et mesure ce qui est bon pour le long terme), et sinon explique-moi le reste »*.

**La routine hors dépôt.** **[Fait vérifié]** Aucune des quatre issues « mutation » ne venait d'elle. Le 22 sept., seul mardi où le cliquet a cassé sur `main`, GitHub a lancé le cron de 00:00 avec **3 h 48 de retard** : la routine de 03:00 a lu l'exécution précédente et s'est tue. **[Décision]** Supprimée, par la règle « une alerte vit dans le dépôt et s'observe ». Sa seule fonction propre — dire que le balayage ne tourne plus, ce que GitHub provoque sur un dépôt public après soixante jours sans activité — est entrée dans la CI, testée, et vérifiée contre l'API réelle (PR #63).

**L'élagage delta érodé.** **[Décision]** **Il reste** — la règle était déjà écrite : un acquis se retire par un verdict, comme il est entré. Un effet de −1,5 Elo demanderait ~40 000 parties, une quinzaine de jobs pour quelques Elo au plus ; le temps machine va à la calibration et à B6. D5 est clos. Je l'avais présenté comme ouvert : c'était faux.

**Le vol de CPU du ponder.** **[Mesure]** Le dépôt écrivait déjà « à mesurer avant tout autre match `candidat` ». Mesuré par la sonde de `match.yml` sur runner, avec une règle de lecture écrite avant : rapport ponder / témoin ≥ 0,93, le verdict tient ; < 0,85, cœur partagé, remesurer en épinglant les moteurs. Le rapport porte un confondant de quelques pour cent, mesuré en conteneur et écrit. **Rendu à 23 h 58 : r = 0,948, le verdict tient.** La topologie trouve plus grand : **2 cœurs physiques pour 4 processeurs logiques** (AMD EPYC 7763) ; vol chiffré à 3 à 5 % de vitesse, 3 à 10 Elo des +67,63, qui se citent désormais avec cette réserve (PR #66).

## Conséquences

Le carnet n'en écrivait pas.
