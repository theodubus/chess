# Menace déjà présente, laissée sans réponse

Le détecteur initial demandait surtout un changement créé par le coup : nouvelle
attaque, défense disparue, ligne ouverte ou retraite fermée. Il ne décrivait pas
une pièce déjà attaquée que le joueur laisse prendre.

`ignoredThreat` réutilise les relations légales du modèle. La première réponse
visible capture une pièce restée sur la même case, avec le même attaquant et les
mêmes reprises locales qu'avant le coup. Avant le coup, le trait adverse est une
sonde géométrique explicitement limitée ; après, c'est le trait réel. Une victime
déplacée, une nouvelle attaque ou un défenseur retiré relèvent d'autres mécanismes.

`IgnoredThreatVerification` analyse librement trois positions à chacun des deux
budgets : avant la décision, après le coup joué, après une défense trouvée avant
le coup. Pas de MultiPV ni searchmoves. Les recherches doivent confirmer la même
menace et le même bilan négatif court ; une même défense doit préserver la pièce
dans ses réponses libres aux deux budgets. Une capture compensée, une suite
tronquée, une autre menace, un mat ou une comparaison contradictoire n'est pas
transformé en raison.

La comparaison vérifie le sens de préférence (marge minimale 100 CP aux deux
budgets), pas une variation maximale du nombre CP. Le premier prototype exigeait
aussi des scores distants d'au plus 100 CP : il rejetait des échanges identiques
dont l'évaluation grandissait vers un gain théorique. Le contrat actuel distingue
stabilité des faits matériels et stabilité de la préférence ; aucun nombre CP
n'est attribué au mécanisme. Une préférence inversée reste un refus. Les premiers
rapports sont conservés dans `dev/ignored-threat-first-data.json` ; ce sont des
essais de développement, pas un contrôle indépendant ni une preuve de progrès.

`ignoredThreatDraftWork` recalcule menace, questions, préservation et bilan avant
de produire les mots et images. « Montrer pourquoi » commence après le coup joué
et conserve les reprises et réponses aux échecs nécessaires. La défense comparée
est citée sans l'imposer dans le défilage et sans la qualifier d'unique. La portée
reste une perte visible évitable dans ces variantes, pas toutes les réponses,
la totalité de la baisse d'évaluation ou une compensation positionnelle éloignée.

Quatre exemples exécutés puis interrogés réellement avec ShallowRed et Stockfish
16, deux camps inclus. Les deux captures de tours ont une conséquence soutenue
par les deux moteurs ; l'historique complet et la compensation gardent leurs
abstentions. Questions, SHA des binaires, réponses et raisons conservés dans
`dev/ignored-threat-data.json`. Aperçu : `/dev/pedagogy-review.html?sample=ignored`.
Relecture pédagogique indépendante et validation visuelle restent ouvertes.
