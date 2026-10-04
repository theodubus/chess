# Pièce déplacée vers une capture — conséquence courte vérifiée

`movedPieceExposure` suit l'identité de la pièce jouée, y compris un pion promu.
La première réponse visible la capture réellement ; la relation est légale avec
le trait adverse réel. La prise en passant distingue la case de la victime de
la case d'arrivée de l'attaquant. Ce fait seul ne classe pas le coup et ne produit
aucune explication à lui seul dans l'UI.

`captureEpisode` isole le premier épisode de capture avec les mêmes identités et
les choix de reprise de `captureReplies`. Une capture compensatrice jouée au lieu
de la reprise reste dans cet épisode. Les réponses aux échecs ne sont pas omises.
Son bilan repart **avant la décision** pour inclure la capture que celle-ci avait
faite et son éventuelle promotion. Une reprise ou un échec non résolu garde
l'épisode ouvert. Une perte ultérieure d'une autre pièce ne rend pas ce premier
épisode défavorable rétroactivement.

La contre-prise adverse sur une autre cible est exclue, même si une reprise
restait disponible : le clouage/détournement Qd5/Qxd5/Rxd5/Bxa5 ne rend pas la
perte de la dame responsable du gain de la tour. La contre-prise du camp étudié
qui compense sa perte reste incluse. Si l'arrêt laisse un échec ouvert, aucune
perte locale clôturée n'est annoncée. La revue ne lance pas ce vérificateur
simple quand sa PV montre déjà un premier échange neutre ou favorable ; les
autres mécanismes restent examinables dans leurs limites.

Exemples exécutés avant les tests : une tour déplacée et prise (deux camps), dame
prenant une tour puis reprise par un pion (−4 points), même échange contre une
dame (0), destination défendue (0), prise en passant (−1), promotion prise (−1,
pas −9). Le détournement Qd5/Qxd5/Rxd5/Bxa1 garde un premier échange de 0 malgré
la perte totale d'une tour ; ce motif appartient à la famille du défenseur détourné.

`CaptureLossVerification` partage avec la menace ignorée arrêt, budgets,
cache, recherches libres et génération revalidée du texte. Chaque témoin valide
l'identité capturée, l'épisode local négatif clôturé ET le bilan négatif total,
puis une réponse comparée conservant la pièce sans perdre du matériel. Les deux
budgets doivent retrouver le même autre coup. Ce contraste écarte une prise
manifestement compensée ; il ne prouve ni une défense unique, ni le classement
global du coup, ni l'absence de compensation positionnelle lointaine.

La préférence de score distingue deux CP (écart d'au moins 100 dans le sens du
joueur) des issues de mat. Un mat favorable contre un score CP ou un mat adverse,
ou un mat adverse contre un CP au moins égal, peut confirmer le sens de la
comparaison. Deux mats du même camp ne justifient pas une cause matérielle par
leur distance. Aucun score de mat n'est converti en points. Une alternative déjà
terminale est vérifiée par les règles et ne lance pas de recherche moteur.

La revue peut proposer cette conséquence pour un verdict négatif. Un mat adverse
plus long que l'horizon de preuve légale ne masque plus un échange court vérifié,
mais le texte ne prétend pas expliquer ou prouver ce mat. Les annonces courtes
gardent leur parcours de preuve couvrant toutes les réponses légales. Le repère
commence après le coup joué et ne montre que l'épisode utile, reprises comprises.

Les captures compensées, les pertes d'autres pièces après un premier échange
neutre et les réponses divergentes gardent l'abstention. Les cas de développement
sont construits, exécutés avec chess.js avant les tests. Les instantanés réels
conservent les questions, binaires et abstentions ; ils ne constituent pas une
validation pédagogique indépendante.

## Essais réels de développement

`dev/moved-piece-first-data.json` garde les 16 premiers essais (six sorties
soutenues), avant comparaison qualitative des issues de mat.
`dev/moved-piece-data.json` en garde 18 (dix soutenues), avec le cas où Qg5 laisse
prendre la dame alors que Qh4 mate immédiatement. Les deux moteurs conservent
les abstentions sur échange égal, destination défendue, première capture neutre
et en passant lorsque leur réponse est différente. Les lignes Stockfish qui
annoncent un mat ne sont plus rejetées uniquement à cause du domaine du score.
Ce sont des essais sur nos propres positions de développement, pas une mesure
de généralisation. Les questions et empreintes des binaires restent consultables.

Reproduction depuis `ui/` :

```bash
npm run pedagogy:review -- --stockfish /chemin/stockfish --cases moved-white,moved-black,moved-capture,moved-even,moved-defended,moved-ep,moved-promotion,moved-non-local-loss,moved-terminal-defence --output dev/moved-piece-data.json
```

Ne pas régénérer pendant les tests de lecture. Avec `npm run dev`, l'aperçu est
`/dev/pedagogy-review.html?sample=exposure`. Les repères soutenus contiennent deux
ou trois positions, après le coup joué ; les réponses aux échecs sont conservées.
