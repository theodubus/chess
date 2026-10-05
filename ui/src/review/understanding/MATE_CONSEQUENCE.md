# Mat court permis — contrat du 4 octobre 2026

`MateConsequenceVerification` et `mateConsequenceDraft` expliquent un mat contre
le camp qui vient de jouer, sans coup de remplacement. Ce chemin est distinct
de la déviation positive comparée ; il ne classe pas les autres coups.

- Verdict adverse, score exact de mat adverse en un à trois coups, PV et meilleur
  coup légaux. Les coups déjà terminaux restent gérés par la revue ordinaire.
- Recherches libres avant/après aux deux budgets 300/900 ms. Un mat adverse déjà
  annoncé avant la décision empêche de l'attribuer à ce coup.
- Après le coup, les deux recherches annoncent le même gagnant et leur premier
  coup appartient à une stratégie courte prouvée par les règles.
- Vérification bornée à cinq demi-coups et 1 200 nœuds. Toutes les réponses du
  défenseur sont couvertes, y compris coups calmes, interpositions, prises et
  promotions. L'attaquant doit avoir un mat après chacune. La PV sert seulement
  à ordonner les coups ; elle ne constitue pas une preuve à elle seule.
- Historique UCI complet : une nulle par répétition ou règle des cinquante coups
  empêche la preuve. Limite de calcul atteinte = inconnu, jamais « mat forcé ».
- Stratégie sérialisée contrôlée avant le texte : commande/FEN/trait, couverture
  des réponses, distance, mat final et origine du témoin. Une branche retirée ou
  un rapport d'une autre décision sont refusés.

Ce vérificateur de mat annoncé ne calcule aucun score de position et ne remplace
pas la recherche stratégique du moteur. Il partage le délai de 12 s, les arrêts
et les caches des autres contrôles. Le calcul cède entre primitives ; une
primitive indivisible peut dépasser la tranche cible.

L'illustration part après la décision, puis montre une seule branche jusqu'au
mat : au plus six positions. Toutes les défenses sont vérifiées, mais pas toutes
défilées. Un coup absent de la PV est marqué `rules`, pas attribué au moteur.
Le dernier repère montre l'échec et les sorties contrôlées du roi ; les cases
occupées par ses pièces sont expliquées dans le texte.

Cette preuve établit un mat court après le coup. Elle ne démontre pas une cause
positionnelle antérieure ni que chaque autre décision éviterait le mat. Un mat
plus long, non confirmé, préexistant ou trop coûteux reste sans nouvelle raison.
Aucun mat n'est converti en gain matériel : prendre une dame et se faire mater
n'est pas raconté comme un échange favorable.

Cas exécutés avec chess.js avant les tests : mat du fou dans les deux camps,
préparation calme, deux défenses dont un coup de pion, piège de Légal après prise
de dame, fausse annonce permettant de prendre la dame. Tests de borne, historique,
cache, annulation, rapport périmé, rendu statique et UCI réel. Les essais avec
ShallowRed et Stockfish 16 passent ; ces régressions et scores simulés ne sont
pas une relecture pédagogique indépendante.
