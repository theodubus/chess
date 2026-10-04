# Pièce déplacée vers une capture — fondation, pas encore raccordée à la revue

`movedPieceExposure` suit l'identité de la pièce jouée, y compris un pion promu.
La première réponse visible la capture réellement ; la relation est légale avec
le trait adverse réel. La prise en passant distingue la case de la victime de
la case d'arrivée de l'attaquant. Ce fait seul ne classe pas le coup et ne produit
aucune explication dans l'UI.

`captureEpisode` isole le premier épisode de capture avec les mêmes identités et
les choix de reprise de `captureReplies`. Une capture compensatrice jouée au lieu
de la reprise reste dans cet épisode. Les réponses aux échecs ne sont pas omises.
Son bilan repart **avant la décision** pour inclure la capture que celle-ci avait
faite et son éventuelle promotion. Une reprise ou un échec non résolu garde
l'épisode ouvert. Une perte ultérieure d'une autre pièce ne rend pas ce premier
épisode défavorable rétroactivement.

Exemples exécutés avant les tests : une tour déplacée et prise (deux camps), dame
prenant une tour puis reprise par un pion (−4 points), même échange contre une
dame (0), destination défendue (0), prise en passant (−1), promotion prise (−1,
pas −9). Le détournement Qd5/Qxd5/Rxd5/Bxa1 garde un premier échange de 0 malgré
la perte totale d'une tour ; ce motif appartient à la famille du défenseur détourné.

Suite : factoriser le vérificateur de perte directe pour réutiliser arrêt,
budgets, cache, recherches libres et génération du brouillon. Chaque témoin doit
valider l'identité capturée, l'épisode local négatif clôturé ET le bilan négatif
total, puis une réponse comparée. Ni ces tests ni ces faits ne prouvent encore
une nouvelle couverture du moteur ou une pertinence pédagogique.
