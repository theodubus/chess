<!-- socle: couche=decisions zone=publique -->
# ADR-0018 — A21 : Après A20, sur quoi travailler ? (Tranché — NNUE, la génération des données d'abord)

> statut : acceptée · date : 2026-09-25 · lu : decisions@448ee8e8

## Contexte

Arbitrage A21 du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet. Entrées de la mémoire lues pour le faire : J-2026-09-28-C@4bad2e7a.

**La recommandation.** **[Recommandation]** NNUE (B4) : la seule piste ouverte pour l'évaluation — la complétion faite main est faite, son réglage bloqué faute de corpus, que la génération produira justement ; toutes conditions de jeu ; le matériel est connu. Autres candidats présentés : le remboursement du ponder (16 à 28 Elo, seulement là où le ponder est permis), B8 à re-spécifier. Et un désaccord de cadre, signalé : C13 était écrit comme préalable des grandes allocations, alors que B6 s'est décidé sans lui.

## Décision

**Décision.** **[Décision utilisateur]** Théo, 25 sept. 2026 après-midi : « *Est ce que pour NNUE on aurait besoin de mon GPU dès maintenant ? Je n'ai pas accès a mon PC avant qq jours. Mais si on peut juste lancer la génération de parties sans GPU et que c'est long ça peut le faire* ». Lu comme le feu vert de NNUE, génération d'abord — lecture dite dans la réponse, pour qu'il la corrige au besoin.

## Conséquences

**La réponse.** **[Fait vérifié]** Non : le GPU ne sert qu'à l'entraînement (bullet, lu au source). La génération et l'inférence dans le moteur sont du CPU. **[Réfuté]** <s>« plusieurs jours de runners »</s>, dit de tête : la mesure en conteneur donne 2 044 positions/s, et 100 millions de positions — cible provisoire — tiennent en trois ou quatre jobs de runner.

**Le verdict.** **[Mesure]** Le réseau embarqué vaut **+330,61 ± 19,21 Elo** à `8+0,08` contre la faite main, et il est l'évaluation par défaut depuis le 28 sept. (PR #95) — journal J-2026-09-28-C.

**Plus de calcul, plus tard.** **[Décision utilisateur]** Théo, 28 sept. 2026 au soir, en rapportant le premier entraînement (713 s) : « *Si plus tard pour vraiment pousser la perf on a besoin de faire tourner plus on pourra (si c'est vraiment pertinent de le faire)* », précisé le même soir : « *entrainement plus long ou sur plus de données, je voulais surtout dire s'il faut ressolliciter mon GPU, c'est possible* ». Sa carte peut être resollicitée — **sur une raison mesurée**. **[Inférence]** confiance faible : la courbe plafonne à mi-parcours, donc la première question sera ce qui limite — les 128 unités ou les données —, pas le nombre de superlots.

**Où c'est écrit au dépôt.** `tools/README.md` : la décision en tête de « Ce qui reste à faire », la ligne B4, et la section A21 (commit `3aa5986`) — depuis le 28 sept., ses sous-sections « Étape 2 » (l'inférence), « Étape 3 » (la procédure d'entraînement, pas à pas), « Étape 3 — RELEVÉE » (le réseau, la décision de Théo, l'échelle) et « Étape 4 » (écrite avant de mesurer). Le réseau et sa sortie d'entraînement : `reseaux/`.
